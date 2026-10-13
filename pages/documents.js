/**
 * LegisCore — pages/documents.js
 * Documents list view. Exposes window.LegisCoreDocuments.render(container).
 *
 * Filter by document type via chips, search across name/type, browse by
 * status select. Row click opens the modal in pages/documents-modal.js.
 */

(function(window) {
    'use strict';

    const docsApi = window.LegisCoreDocumentsApi;
    const state   = window.LegisCoreState;

    if (!docsApi || !state) {
        console.error('[LegisCoreDocuments] api and state must load first.');
        return;
    }

    const PAGE_SIZE = 20;

    const DOCUMENT_TYPES = [
        'Affidavit', 'Contract', 'Court Order', 'Receipt', 'Letter',
        'Power of Attorney', 'Client ID', 'Agreement', 'Will',
        'Motion', 'Brief', 'Notice', 'Other'
    ];

    const STATUSES = [
        { v: '',             label: 'All statuses' },
        { v: 'verified',     label: 'Verified' },
        { v: 'needs_review', label: 'Needs review' },
        { v: 'expiring',     label: 'Expiring' },
        { v: 'archived',     label: 'Archived' },
    ];

    // ---- helpers ------------------------------------------------------

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    function statusBadge(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'verified')     return '<span class="badge badge-success">Verified</span>';
        if (s === 'needs_review') return '<span class="badge badge-warning">Needs review</span>';
        if (s === 'expiring')     return '<span class="badge badge-danger">Expiring</span>';
        if (s === 'archived')     return '<span class="badge badge-muted">Archived</span>';
        return '<span class="badge badge-muted">' + esc(status || '—') + '</span>';
    }

    function iconClassFor(row) {
        const name = (row.name || '').toLowerCase();
        const mime = (row.mime_type || '').toLowerCase();
        if (mime.includes('pdf') || name.endsWith('.pdf')) return 'icon-pdf';
        if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return 'icon-word';
        if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic)$/.test(name)) return 'icon-image';
        return 'icon-other';
    }

    function iconLabelFor(row) {
        const name = (row.name || '').toLowerCase();
        const mime = (row.mime_type || '').toLowerCase();
        if (mime.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
        if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return 'DOC';
        if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic)$/.test(name)) return 'IMG';
        return 'FILE';
    }

    function debounce(fn, ms) {
        let t = null;
        return function() {
            const args = arguments;
            clearTimeout(t);
            t = setTimeout(function() { fn.apply(null, args); }, ms);
        };
    }

    // ---- view state ---------------------------------------------------

    let filters = { q: '', document_type: '', status: '' };
    let rows = [];
    let hasMore = false;
    let loading = false;

    // ---- queries ------------------------------------------------------

    async function load(reset) {
        if (loading) return;
        loading = true;

        const listEl = document.getElementById('docs-list');
        const moreEl = document.getElementById('docs-more');

        if (reset) {
            rows = [];
            if (listEl) listEl.innerHTML = renderSkeleton();
        }
        if (moreEl) moreEl.innerHTML = reset ? '' : '<div class="view-loading"><div class="spinner"></div></div>';

        const query = Object.assign({}, filters, {
            limit: PAGE_SIZE,
            offset: reset ? 0 : rows.length,
        });

        try {
            const fetched = await docsApi.list(query);
            if (reset) rows = fetched;
            else rows = rows.concat(fetched);
            hasMore = fetched.length === PAGE_SIZE;
            renderRows();
        } catch (err) {
            console.error('[LegisCoreDocuments] load failed:', err);
            if (listEl) listEl.innerHTML = renderError(err.message || 'Could not load documents.');
            if (moreEl) moreEl.innerHTML = '';
            hasMore = false;
        } finally {
            loading = false;
            renderMore();
        }
    }

    // ---- renderers ----------------------------------------------------

    function renderSkeleton() {
        let s = '';
        for (let i = 0; i < 5; i++) {
            s +=
                '<div class="doc-row" style="pointer-events:none">' +
                    '<div class="skeleton skeleton-circle" style="width:40px;height:40px"></div>' +
                    '<div class="doc-meta">' +
                        '<div class="skeleton skeleton-line medium"></div>' +
                        '<div class="skeleton skeleton-line short" style="margin-top:6px"></div>' +
                    '</div>' +
                '</div>';
        }
        return '<div class="card" style="padding:var(--s-2)">' + s + '</div>';
    }

    function renderError(msg) {
        return (
            '<div style="padding:var(--s-5)">' +
                '<div class="alert alert-error" style="margin:0">' + esc(msg) + '</div>' +
            '</div>'
        );
    }

    function renderEmpty() {
        const hasFilter = filters.q || filters.document_type || filters.status;
        return (
            '<div class="empty-state">' +
                '<div class="empty-state-icon">&#128193;</div>' +
                '<h2 class="empty-state-title">' +
                    (hasFilter ? 'Nothing matches' : 'No documents yet') +
                '</h2>' +
                '<p class="empty-state-desc">' +
                    (hasFilter
                        ? 'Try clearing the search or filters.'
                        : 'Add your first document to get started.') +
                '</p>' +
                (hasFilter
                    ? '<button class="btn btn-secondary btn-sm" id="docs-clear-filters">Clear filters</button>'
                    : '<button class="btn btn-primary btn-sm" id="docs-empty-new">New document</button>') +
            '</div>'
        );
    }

    function renderRow(r) {
        const matter = r.lc_matters ? (r.lc_matters.matter_number || r.lc_matters.title) : '';
        const client = r.lc_clients ? r.lc_clients.name : '';
        const meta = [];
        if (matter) meta.push(matter);
        if (client) meta.push(client);

        const metaLine = meta.length
            ? '<div class="doc-sub">' +
                meta.map(function(m) { return '<span>' + esc(m) + '</span>'; }).join('<span class="dot-sep"></span>') +
                '<span class="dot-sep"></span>' +
                '<span>' + esc(fmtDate(r.created_at)) + '</span>' +
              '</div>'
            : '<div class="doc-sub"><span>' + esc(fmtDate(r.created_at)) + '</span></div>';

        return (
            '<div class="doc-row" data-doc-id="' + esc(r.id) + '">' +
                '<div class="doc-icon ' + iconClassFor(r) + '">' + iconLabelFor(r) + '</div>' +
                '<div class="doc-meta">' +
                    '<div class="doc-name">' + esc(r.name) + '</div>' +
                    metaLine +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:var(--s-2);flex-shrink:0">' +
                    statusBadge(r.status) +
                    '<svg class="doc-action" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
                '</div>' +
            '</div>'
        );
    }

    function renderRows() {
        const listEl = document.getElementById('docs-list');
        if (!listEl) return;

        if (rows.length === 0) {
            listEl.innerHTML = renderEmpty();
            wireEmptyActions();
            return;
        }

        const body = rows.map(renderRow).join('');
        listEl.innerHTML = '<div class="card" style="padding:var(--s-2)">' + body + '</div>';

        listEl.querySelectorAll('[data-doc-id]').forEach(function(el) {
            el.addEventListener('click', function() {
                const id = el.getAttribute('data-doc-id');
                if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.open) {
                    window.LegisCoreDocumentsModal.open(id, function() {
                        load(true);
                    });
                }
            });
        });
    }

    function wireEmptyActions() {
        const clearBtn = document.getElementById('docs-clear-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                filters = { q: '', document_type: '', status: '' };
                renderFilterUI();
                load(true);
            });
        }
        const newBtn = document.getElementById('docs-empty-new');
        if (newBtn) {
            newBtn.addEventListener('click', function() {
                if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.openNew) {
                    window.LegisCoreDocumentsModal.openNew(function() { load(true); });
                }
            });
        }
    }

    function renderMore() {
        const moreEl = document.getElementById('docs-more');
        if (!moreEl) return;
        if (!hasMore || rows.length === 0) {
            moreEl.innerHTML = '';
            return;
        }
        moreEl.innerHTML =
            '<div style="text-align:center;padding:var(--s-4) 0">' +
                '<button class="btn btn-secondary btn-sm" id="docs-load-more">Load more</button>' +
            '</div>';
        const btn = document.getElementById('docs-load-more');
        if (btn) btn.addEventListener('click', function() { load(false); });
    }

    function renderChips() {
        const allChip =
            '<button class="chip' + (filters.document_type === '' ? ' active' : '') + '" data-type="">' +
                'All types' +
            '</button>';
        const typeChips = DOCUMENT_TYPES.map(function(t) {
            const active = filters.document_type === t ? ' active' : '';
            return '<button class="chip' + active + '" data-type="' + esc(t) + '">' + esc(t) + '</button>';
        }).join('');
        return '<div class="chip-row" id="docs-chips">' + allChip + typeChips + '</div>';
    }

    function renderFilterUI() {
        const chipsEl = document.getElementById('docs-chips-wrap');
        const searchEl = document.getElementById('docs-search');
        const statusEl = document.getElementById('docs-status');
        if (chipsEl) chipsEl.innerHTML = renderChips();
        if (searchEl) searchEl.value = filters.q;
        if (statusEl) statusEl.value = filters.status;
        wireChips();
    }

    function wireChips() {
        const chips = document.getElementById('docs-chips');
        if (!chips) return;
        chips.querySelectorAll('.chip').forEach(function(c) {
            c.addEventListener('click', function() {
                filters.document_type = c.getAttribute('data-type');
                renderFilterUI();
                load(true);
            });
        });
    }

    function wireFilters() {
        const search = document.getElementById('docs-search');
        const status = document.getElementById('docs-status');

        if (search) {
            search.value = filters.q;
            search.addEventListener('input', debounce(function() {
                filters.q = search.value;
                load(true);
            }, 300));
        }
        if (status) {
            status.value = filters.status;
            status.addEventListener('change', function() {
                filters.status = status.value;
                load(true);
            });
        }

        const newBtn = document.getElementById('docs-new-btn');
        if (newBtn) {
            newBtn.addEventListener('click', function() {
                if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.openNew) {
                    window.LegisCoreDocumentsModal.openNew(function() {
                        load(true);
                    });
                }
            });
        }
    }

    // ---- main render --------------------------------------------------

    function render(container) {
        if (!container) return;

        const orgId = state.get('orgId');
        if (!orgId) {
            container.innerHTML =
                '<div class="alert alert-error">Your profile is not linked to an organization.</div>';
            return;
        }

        filters = { q: '', document_type: '', status: '' };
        rows = [];
        hasMore = false;

        const statusOpts = STATUSES.map(function(s) {
            return '<option value="' + esc(s.v) + '">' + esc(s.label) + '</option>';
        }).join('');

        container.innerHTML =
            '<div class="page-header">' +
                '<div>' +
                    '<div class="uppercase">Filing room</div>' +
                    '<h1>Documents</h1>' +
                    '<p class="page-subtitle">Every file for your firm, in one place.</p>' +
                '</div>' +
                '<div class="page-actions">' +
                    '<button class="btn btn-primary" id="docs-new-btn">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                        'New document' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="card" style="padding:var(--s-4);margin-bottom:var(--s-4)">' +
                '<div style="display:grid;grid-template-columns:2fr 1fr;gap:var(--s-3)" class="docs-search-row">' +
                    '<input type="search" id="docs-search" class="form-control" placeholder="Find a document by name or type..." autocomplete="off">' +
                    '<select id="docs-status" class="form-control">' + statusOpts + '</select>' +
                '</div>' +
                '<div id="docs-chips-wrap" style="margin-top:var(--s-3)">' + renderChips() + '</div>' +
            '</div>' +
            '<div id="docs-list">' + renderSkeleton() + '</div>' +
            '<div id="docs-more"></div>';

        wireFilters();
        wireChips();
        load(true);
    }

    window.LegisCoreDocuments = { render: render };

})(window);
