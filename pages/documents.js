/**
 * LegisCore — pages/documents.js
 * Documents list view. Exposes window.LegisCoreDocuments.render(container).
 *
 * State here is local to the view (filters, rows, pagination). The
 * modal lives in pages/documents-modal.js and is invoked on row click.
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
        'Motion', 'Brief', 'Notice', 'Other',
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
            if (listEl) listEl.innerHTML = renderLoading();
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

    function renderLoading() {
        return (
            '<div class="view-loading">' +
                '<div class="spinner"></div>' +
                '<p class="text-sm">Loading documents&hellip;</p>' +
            '</div>'
        );
    }

    function renderError(msg) {
        return (
            '<div style="padding:var(--space-5)">' +
                '<div class="alert alert-error" style="margin:0">' + esc(msg) + '</div>' +
            '</div>'
        );
    }

    function renderEmpty() {
        return (
            '<div class="empty-state">' +
                '<div class="empty-state-icon">&#128193;</div>' +
                '<h2 class="empty-state-title">No documents</h2>' +
                '<p class="empty-state-desc">' +
                    (filters.q || filters.document_type || filters.status
                        ? 'Nothing matches the current filters.'
                        : 'Nothing here yet. Upload or scan a document to get started.') +
                '</p>' +
            '</div>'
        );
    }

    function renderRow(r) {
        const matter = r.lc_matters ? (r.lc_matters.matter_number || r.lc_matters.title) : '';
        const client = r.lc_clients ? r.lc_clients.name : '';
        return (
            '<tr data-doc-id="' + esc(r.id) + '" style="cursor:pointer">' +
                '<td>' +
                    '<div class="font-weight-medium">' + esc(r.name) + '</div>' +
                    '<div class="text-xs text-muted">' +
                        esc(r.document_type || 'Uncategorised') +
                    '</div>' +
                '</td>' +
                '<td class="text-sm">' + esc(matter || '—') + '</td>' +
                '<td class="text-sm">' + esc(client || '—') + '</td>' +
                '<td>' + statusBadge(r.status) + '</td>' +
                '<td class="text-sm text-muted">' + esc(fmtDate(r.created_at)) + '</td>' +
            '</tr>'
        );
    }

    function renderRows() {
        const listEl = document.getElementById('docs-list');
        if (!listEl) return;

        if (rows.length === 0) {
            listEl.innerHTML = renderEmpty();
            return;
        }

        const body = rows.map(renderRow).join('');
        listEl.innerHTML =
            '<div class="table-wrap">' +
                '<table class="table">' +
                    '<thead><tr>' +
                        '<th>Document</th>' +
                        '<th>Matter</th>' +
                        '<th>Client</th>' +
                        '<th>Status</th>' +
                        '<th>Added</th>' +
                    '</tr></thead>' +
                    '<tbody>' + body + '</tbody>' +
                '</table>' +
            '</div>';

        listEl.querySelectorAll('tr[data-doc-id]').forEach(function(tr) {
            tr.addEventListener('click', function() {
                const id = tr.getAttribute('data-doc-id');
                if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.open) {
                    window.LegisCoreDocumentsModal.open(id, function() {
                        load(true);
                    });
                } else {
                    console.warn('[LegisCoreDocuments] modal not loaded');
                }
            });
        });
    }

    function renderMore() {
        const moreEl = document.getElementById('docs-more');
        if (!moreEl) return;
        if (!hasMore || rows.length === 0) {
            moreEl.innerHTML = '';
            return;
        }
        moreEl.innerHTML =
            '<div style="text-align:center;padding:var(--space-4) 0">' +
                '<button class="btn btn-secondary btn-sm" id="docs-load-more">Load more</button>' +
            '</div>';
        const btn = document.getElementById('docs-load-more');
        if (btn) {
            btn.addEventListener('click', function() { load(false); });
        }
    }

    function renderFilters() {
        const typeOpts = ['<option value="">All types</option>']
            .concat(DOCUMENT_TYPES.map(function(t) {
                return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
            })).join('');
        const statusOpts = STATUSES.map(function(s) {
            return '<option value="' + esc(s.v) + '">' + esc(s.label) + '</option>';
        }).join('');

        return (
            '<div class="card" style="margin-bottom:var(--space-4)">' +
                '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:var(--space-3)" class="docs-filters">' +
                    '<div>' +
                        '<input type="search" id="docs-search" class="form-control" ' +
                            'placeholder="Search by name or type..." ' +
                            'value="' + esc(filters.q) + '" autocomplete="off">' +
                    '</div>' +
                    '<div>' +
                        '<select id="docs-type" class="form-control">' + typeOpts + '</select>' +
                    '</div>' +
                    '<div>' +
                        '<select id="docs-status" class="form-control">' + statusOpts + '</select>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    function wireFilters() {
        const search = document.getElementById('docs-search');
        const type   = document.getElementById('docs-type');
        const status = document.getElementById('docs-status');

        if (search) {
            search.value = filters.q;
            search.addEventListener('input', debounce(function() {
                filters.q = search.value;
                load(true);
            }, 300));
        }
        if (type) {
            type.value = filters.document_type;
            type.addEventListener('change', function() {
                filters.document_type = type.value;
                load(true);
            });
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

        container.innerHTML =
            '<div class="page-header">' +
                '<div>' +
                    '<h1>Documents</h1>' +
                    '<p class="page-subtitle">All files for your firm. Search, filter, and open a document.</p>' +
                '</div>' +
                '<div class="page-actions">' +
                    '<button class="btn btn-primary btn-sm" id="docs-new-btn">New document</button>' +
                '</div>' +
            '</div>' +
            renderFilters() +
            '<div id="docs-list">' + renderLoading() + '</div>' +
            '<div id="docs-more"></div>';

        wireFilters();
        load(true);
    }

    window.LegisCoreDocuments = { render: render };

})(window);
