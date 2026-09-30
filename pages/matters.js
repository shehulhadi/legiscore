/**
 * LegisCore — pages/matters.js
 * Matters list view. Exposes window.LegisCoreMatters.render(container).
 *
 * Row click navigates to #/matter?id=<id> which pages/matter-detail.js
 * handles. Kept deliberately close in structure to pages/documents.js
 * so the two list views stay maintainable in parallel.
 */

(function(window) {
    'use strict';

    const mattersApi = window.LegisCoreMattersApi;
    const state      = window.LegisCoreState;

    if (!mattersApi || !state) {
        console.error('[LegisCoreMatters] api and state must load first.');
        return;
    }

    const PAGE_SIZE = 20;

    const MATTER_TYPES = [
        'Litigation', 'Corporate', 'Real Estate', 'Probate', 'Trusts', 'Other',
    ];

    const STATUSES = [
        { v: '',         label: 'All statuses' },
        { v: 'active',   label: 'Active' },
        { v: 'closed',   label: 'Closed' },
        { v: 'archived', label: 'Archived' },
    ];

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
        if (s === 'active')   return '<span class="badge badge-success">Active</span>';
        if (s === 'closed')   return '<span class="badge badge-muted">Closed</span>';
        if (s === 'archived') return '<span class="badge badge-muted">Archived</span>';
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

    let filters = { q: '', type: '', status: '' };
    let rows = [];
    let hasMore = false;
    let loading = false;

    async function load(reset) {
        if (loading) return;
        loading = true;

        const listEl = document.getElementById('matters-list');
        const moreEl = document.getElementById('matters-more');

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
            const fetched = await mattersApi.list(query);
            if (reset) rows = fetched;
            else rows = rows.concat(fetched);
            hasMore = fetched.length === PAGE_SIZE;
            renderRows();
        } catch (err) {
            console.error('[LegisCoreMatters] load failed:', err);
            if (listEl) listEl.innerHTML = renderError(err.message || 'Could not load matters.');
            if (moreEl) moreEl.innerHTML = '';
            hasMore = false;
        } finally {
            loading = false;
            renderMore();
        }
    }

    function renderLoading() {
        return (
            '<div class="view-loading">' +
                '<div class="spinner"></div>' +
                '<p class="text-sm">Loading matters&hellip;</p>' +
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
                '<div class="empty-state-icon">&#128188;</div>' +
                '<h2 class="empty-state-title">No matters</h2>' +
                '<p class="empty-state-desc">' +
                    (filters.q || filters.type || filters.status
                        ? 'Nothing matches the current filters.'
                        : 'Open a new matter to get started.') +
                '</p>' +
            '</div>'
        );
    }

    function renderRow(r) {
        const client = r.lc_clients ? r.lc_clients.name : '';
        return (
            '<tr data-matter-id="' + esc(r.id) + '" style="cursor:pointer">' +
                '<td>' +
                    '<div class="font-weight-medium">' + esc(r.title) + '</div>' +
                    '<div class="text-xs text-muted">' +
                        esc(r.matter_number || 'no number') +
                    '</div>' +
                '</td>' +
                '<td class="text-sm">' + esc(client || '—') + '</td>' +
                '<td class="text-sm">' + esc(r.type || '—') + '</td>' +
                '<td>' + statusBadge(r.status) + '</td>' +
                '<td class="text-sm text-muted">' + esc(fmtDate(r.created_at)) + '</td>' +
            '</tr>'
        );
    }

    function renderRows() {
        const listEl = document.getElementById('matters-list');
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
                        '<th>Matter</th>' +
                        '<th>Client</th>' +
                        '<th>Type</th>' +
                        '<th>Status</th>' +
                        '<th>Opened</th>' +
                    '</tr></thead>' +
                    '<tbody>' + body + '</tbody>' +
                '</table>' +
            '</div>';

        listEl.querySelectorAll('tr[data-matter-id]').forEach(function(tr) {
            tr.addEventListener('click', function() {
                const id = tr.getAttribute('data-matter-id');
                window.location.hash = '#/matter?id=' + encodeURIComponent(id);
            });
        });
    }

    function renderMore() {
        const moreEl = document.getElementById('matters-more');
        if (!moreEl) return;
        if (!hasMore || rows.length === 0) {
            moreEl.innerHTML = '';
            return;
        }
        moreEl.innerHTML =
            '<div style="text-align:center;padding:var(--space-4) 0">' +
                '<button class="btn btn-secondary btn-sm" id="matters-load-more">Load more</button>' +
            '</div>';
        const btn = document.getElementById('matters-load-more');
        if (btn) btn.addEventListener('click', function() { load(false); });
    }

    function renderFilters() {
        const typeOpts = ['<option value="">All types</option>']
            .concat(MATTER_TYPES.map(function(t) {
                return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
            })).join('');
        const statusOpts = STATUSES.map(function(s) {
            return '<option value="' + esc(s.v) + '">' + esc(s.label) + '</option>';
        }).join('');

        return (
            '<div class="card" style="margin-bottom:var(--space-4)">' +
                '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:var(--space-3)" class="matters-filters">' +
                    '<div>' +
                        '<input type="search" id="matters-search" class="form-control" ' +
                            'placeholder="Search by title or matter number..." ' +
                            'value="' + esc(filters.q) + '" autocomplete="off">' +
                    '</div>' +
                    '<div>' +
                        '<select id="matters-type" class="form-control">' + typeOpts + '</select>' +
                    '</div>' +
                    '<div>' +
                        '<select id="matters-status" class="form-control">' + statusOpts + '</select>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    function wireFilters() {
        const search = document.getElementById('matters-search');
        const type   = document.getElementById('matters-type');
        const status = document.getElementById('matters-status');

        if (search) {
            search.value = filters.q;
            search.addEventListener('input', debounce(function() {
                filters.q = search.value;
                load(true);
            }, 300));
        }
        if (type) {
            type.value = filters.type;
            type.addEventListener('change', function() {
                filters.type = type.value;
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

        const newBtn = document.getElementById('matters-new-btn');
        if (newBtn) {
            newBtn.addEventListener('click', function() {
                if (window.LegisCoreMatterDetail && window.LegisCoreMatterDetail.openNew) {
                    window.LegisCoreMatterDetail.openNew(function() {
                        load(true);
                    });
                }
            });
        }
    }

    function render(container) {
        if (!container) return;

        const orgId = state.get('orgId');
        if (!orgId) {
            container.innerHTML =
                '<div class="alert alert-error">Your profile is not linked to an organization.</div>';
            return;
        }

        filters = { q: '', type: '', status: '' };
        rows = [];
        hasMore = false;

        container.innerHTML =
            '<div class="page-header">' +
                '<div>' +
                    '<h1>Matters</h1>' +
                    '<p class="page-subtitle">All active and closed matters for your firm.</p>' +
                '</div>' +
                '<div class="page-actions">' +
                    '<button class="btn btn-primary btn-sm" id="matters-new-btn">New matter</button>' +
                '</div>' +
            '</div>' +
            renderFilters() +
            '<div id="matters-list">' + renderLoading() + '</div>' +
            '<div id="matters-more"></div>';

        wireFilters();
        load(true);
    }

    window.LegisCoreMatters = { render: render };

})(window);
