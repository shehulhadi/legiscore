/**
 * LegisCore — pages/clients.js
 * Clients list view. Exposes window.LegisCoreClients.render(container).
 *
 * Chips filter by client type. Row click navigates to #/client?id=<id>,
 * which pages/client-detail.js handles.
 */

(function(window) {
    'use strict';

    const clientsApi = window.LegisCoreClientsApi;
    const state      = window.LegisCoreState;

    if (!clientsApi || !state) {
        console.error('[LegisCoreClients] api and state must load first.');
        return;
    }

    const PAGE_SIZE = 30;

    const CLIENT_TYPES = [
        { v: '',           label: 'All' },
        { v: 'individual', label: 'Individuals' },
        { v: 'company',    label: 'Companies' },
        { v: 'government', label: 'Government' },
    ];

    // ---- helpers ------------------------------------------------------

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function initials(name) {
        if (!name) return '?';
        return name
            .split(/\s+/)
            .slice(0, 2)
            .map(function(p) { return (p[0] || '').toUpperCase(); })
            .join('') || '?';
    }

    function typeBadge(type) {
        const t = String(type || '').toLowerCase();
        if (t === 'company')    return '<span class="badge badge-info">Company</span>';
        if (t === 'government') return '<span class="badge badge-warning">Government</span>';
        if (t === 'individual') return '<span class="badge badge-muted">Individual</span>';
        return '<span class="badge badge-muted">' + esc(type || '—') + '</span>';
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

    let filters = { q: '', client_type: '' };
    let rows = [];
    let matterCountMap = {};
    let loading = false;

    // ---- queries ------------------------------------------------------

    async function load() {
        if (loading) return;
        loading = true;

        const listEl = document.getElementById('clients-list');
        if (listEl) listEl.innerHTML = renderSkeleton();

        try {
            const results = await Promise.all([
                clientsApi.list(Object.assign({}, filters, { limit: PAGE_SIZE })),
                clientsApi.matterCounts(),
            ]);
            rows = results[0] || [];
            matterCountMap = results[1] || {};
            renderRows();
        } catch (err) {
            console.error('[LegisCoreClients] load failed:', err);
            if (listEl) listEl.innerHTML = renderError(err.message || 'Could not load clients.');
        } finally {
            loading = false;
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
        const hasFilter = filters.q || filters.client_type;
        return (
            '<div class="empty-state">' +
                '<div class="empty-state-icon">&#128101;</div>' +
                '<h2 class="empty-state-title">' +
                    (hasFilter ? 'No clients match' : 'No clients yet') +
                '</h2>' +
                '<p class="empty-state-desc">' +
                    (hasFilter
                        ? 'Try a different search or type filter.'
                        : 'Add your first client to get started.') +
                '</p>' +
                (hasFilter
                    ? '<button class="btn btn-secondary btn-sm" id="clients-clear">Clear filters</button>'
                    : '<button class="btn btn-primary btn-sm" id="clients-empty-new">New client</button>') +
            '</div>'
        );
    }

    function renderRow(c) {
        const matterCount = matterCountMap[c.id] || 0;
        const subParts = [];
        if (c.phone) subParts.push(c.phone);
        if (c.email) subParts.push(c.email);
        if (matterCount > 0) subParts.push(matterCount + (matterCount === 1 ? ' matter' : ' matters'));

        const sub = subParts.length
            ? '<div class="doc-sub">' +
                subParts.map(function(p) { return '<span>' + esc(p) + '</span>'; }).join('<span class="dot-sep"></span>') +
              '</div>'
            : '<div class="doc-sub"><span class="text-faint">No contact details</span></div>';

        return (
            '<div class="doc-row" data-client-id="' + esc(c.id) + '">' +
                '<div class="user-avatar">' + esc(initials(c.name)) + '</div>' +
                '<div class="doc-meta">' +
                    '<div class="doc-name">' + esc(c.name) + '</div>' +
                    sub +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:var(--s-2);flex-shrink:0">' +
                    typeBadge(c.client_type) +
                    '<svg class="doc-action" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
                '</div>' +
            '</div>'
        );
    }

    function renderRows() {
        const listEl = document.getElementById('clients-list');
        if (!listEl) return;

        if (rows.length === 0) {
            listEl.innerHTML = renderEmpty();
            wireEmptyActions();
            return;
        }

        const body = rows.map(renderRow).join('');
        listEl.innerHTML = '<div class="card" style="padding:var(--s-2)">' + body + '</div>';

        listEl.querySelectorAll('[data-client-id]').forEach(function(el) {
            el.addEventListener('click', function() {
                window.location.hash = '#/client?id=' + encodeURIComponent(el.getAttribute('data-client-id'));
            });
        });
    }

    function wireEmptyActions() {
        const clearBtn = document.getElementById('clients-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                filters = { q: '', client_type: '' };
                renderFilterUI();
                load();
            });
        }
        const newBtn = document.getElementById('clients-empty-new');
        if (newBtn) {
            newBtn.addEventListener('click', function() {
                if (window.LegisCoreClientDetail && window.LegisCoreClientDetail.openNew) {
                    window.LegisCoreClientDetail.openNew(function() { load(); });
                }
            });
        }
    }

    function renderChips() {
        return '<div class="chip-row" id="clients-chips">' +
            CLIENT_TYPES.map(function(t) {
                const active = filters.client_type === t.v ? ' active' : '';
                return '<button class="chip' + active + '" data-type="' + esc(t.v) + '">' + esc(t.label) + '</button>';
            }).join('') +
        '</div>';
    }

    function renderFilterUI() {
        const wrap = document.getElementById('clients-chips-wrap');
        const search = document.getElementById('clients-search');
        if (wrap) wrap.innerHTML = renderChips();
        if (search) search.value = filters.q;
        wireChips();
    }

    function wireChips() {
        const chips = document.getElementById('clients-chips');
        if (!chips) return;
        chips.querySelectorAll('.chip').forEach(function(c) {
            c.addEventListener('click', function() {
                filters.client_type = c.getAttribute('data-type');
                renderFilterUI();
                load();
            });
        });
    }

    function wireFilters() {
        const search = document.getElementById('clients-search');
        if (search) {
            search.value = filters.q;
            search.addEventListener('input', debounce(function() {
                filters.q = search.value;
                load();
            }, 300));
        }

        const newBtn = document.getElementById('clients-new-btn');
        if (newBtn) {
            newBtn.addEventListener('click', function() {
                if (window.LegisCoreClientDetail && window.LegisCoreClientDetail.openNew) {
                    window.LegisCoreClientDetail.openNew(function() { load(); });
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

        filters = { q: '', client_type: '' };
        rows = [];
        matterCountMap = {};

        container.innerHTML =
            '<div class="page-header">' +
                '<div>' +
                    '<div class="uppercase">Directory</div>' +
                    '<h1>Clients</h1>' +
                    '<p class="page-subtitle">Everyone your firm works for.</p>' +
                '</div>' +
                '<div class="page-actions">' +
                    '<button class="btn btn-primary" id="clients-new-btn">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                        'New client' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="card" style="padding:var(--s-4);margin-bottom:var(--s-4)">' +
                '<input type="search" id="clients-search" class="form-control" placeholder="Find a client by name, phone or email..." autocomplete="off">' +
                '<div id="clients-chips-wrap" style="margin-top:var(--s-3)">' + renderChips() + '</div>' +
            '</div>' +
            '<div id="clients-list">' + renderSkeleton() + '</div>';

        wireFilters();
        wireChips();
        load();
    }

    window.LegisCoreClients = { render: render };

})(window);
