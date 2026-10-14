/**
 * LegisCore — pages/matters.js
 * Matters list view. Exposes window.LegisCoreMatters.render(container).
 *
 * Card rows, not a table — works on 360px phone and 1280px desktop.
 * Row click navigates to #/matter?id=<id> handled by matter-detail.js.
 */

(function(window) {
    'use strict';

    const mattersApi = window.LegisCoreMattersApi;
    const state      = window.LegisCoreState;

    if (!mattersApi || !state) {
        console.error('[LegisCoreMatters] api and state must load first.');
        return;
    }

    const PAGE_SIZE = 30;

    const MATTER_TYPES = [
        'Litigation', 'Corporate', 'Real Estate', 'Probate', 'Trusts', 'Other'
    ];

    const STATUSES = [
        { v: '',         label: 'All' },
        { v: 'active',   label: 'Active' },
        { v: 'closed',   label: 'Closed' },
        { v: 'archived', label: 'Archived' },
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
        if (s === 'active')   return '<span class="badge badge-success">Active</span>';
        if (s === 'closed')   return '<span class="badge badge-muted">Closed</span>';
        if (s === 'archived') return '<span class="badge badge-muted">Archived</span>';
        return '<span class="badge badge-muted">' + esc(status || '—') + '</span>';
    }

    function typeIconBg(type) {
        const t = String(type || '').toLowerCase();
        if (t === 'litigation')  return 'style="background:var(--danger-100);color:var(--danger-700)"';
        if (t === 'corporate')   return 'style="background:var(--info-100);color:var(--info-700)"';
        if (t === 'real estate') return 'style="background:var(--success-100);color:var(--success-700)"';
        if (t === 'probate')     return 'style="background:var(--warning-100);color:var(--warning-700)"';
        if (t === 'trusts')      return 'style="background:var(--brass-100);color:var(--brass-600)"';
        return 'style="background:var(--surface-muted);color:var(--text-muted)"';
    }

    function typeInitials(type) {
        const t = String(type || '').trim();
        if (!t) return 'MAT';
        const words = t.split(/\s+/);
        if (words.length === 1) return t.slice(0, 3).toUpperCase();
        return words.map(function(w) { return w[0]; }).join('').slice(0, 3).toUpperCase();
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

    let filters = { q: '', type: '', status: '' };
    let rows = [];
    let loading = false;

    // ---- queries ------------------------------------------------------

    async function load() {
        if (loading) return;
        loading = true;

        const listEl = document.getElementById('matters-list');
        if (listEl) listEl.innerHTML = renderSkeleton();

        const query = Object.assign({}, filters, { limit: PAGE_SIZE });

        try {
            rows = await mattersApi.list(query);
            renderRows();
        } catch (err) {
            console.error('[LegisCoreMatters] load failed:', err);
            if (listEl) listEl.innerHTML = renderError(err.message || 'Could not load matters.');
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
        const hasFilter = filters.q || filters.type || filters.status;
        return (
            '<div class="empty-state">' +
                '<div class="empty-state-icon">&#128188;</div>' +
                '<h2 class="empty-state-title">' +
                    (hasFilter ? 'Nothing matches' : 'No matters yet') +
                '</h2>' +
                '<p class="empty-state-desc">' +
                    (hasFilter
                        ? 'Try clearing the search or filters.'
                        : 'Open a matter to start filing documents.') +
                '</p>' +
            '</div>'
        );
    }

    // Two-line card row: name + matter number on top, client + type + date below.
    // Badge floated to the right of the name.
    function renderRow(m) {
        const client = m.lc_clients ? m.lc_clients.name : '';
        const metaParts = [];
        if (client) metaParts.push(client);
        if (m.type) metaParts.push(m.type);
        metaParts.push(fmtDate(m.created_at));

        return (
            '<div class="doc-row" data-matter-id="' + esc(m.id) + '">' +
                '<div class="doc-icon" ' + typeIconBg(m.type) + '>' + esc(typeInitials(m.type)) + '</div>' +
                '<div class="doc-meta">' +
                    '<div style="display:flex;align-items:center;gap:var(--s-2);min-width:0">' +
                        '<div class="doc-name" style="flex:1;min-width:0">' + esc(m.title) + '</div>' +
                        statusBadge(m.status) +
                    '</div>' +
                    '<div class="doc-sub">' +
                        (m.matter_number
                            ? '<span class="text-muted" style="font-family:var(--font-mono);font-size:11px">' + esc(m.matter_number) + '</span>' +
                              '<span class="dot-sep"></span>'
                            : '') +
                        metaParts.map(function(p) { return '<span>' + esc(p) + '</span>'; })
                            .join('<span class="dot-sep"></span>') +
                    '</div>' +
                '</div>' +
                '<svg class="doc-action" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
            '</div>'
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
        listEl.innerHTML = '<div class="card" style="padding:var(--s-2)">' + body + '</div>';

        listEl.querySelectorAll('[data-matter-id]').forEach(function(el) {
            el.addEventListener('click', function() {
                window.location.hash = '#/matter?id=' + encodeURIComponent(el.getAttribute('data-matter-id'));
            });
        });
    }

    function renderChips() {
        const parts = STATUSES.map(function(s) {
            const active = filters.status === s.v ? ' active' : '';
            return '<button class="chip' + active + '" data-status="' + esc(s.v) + '">' + esc(s.label) + '</button>';
        });
        const typeChips = MATTER_TYPES.map(function(t) {
            const active = filters.type === t ? ' active' : '';
            return '<button class="chip' + active + '" data-type="' + esc(t) + '">' + esc(t) + '</button>';
        });
        return (
            '<div class="chip-row" id="matters-status-chips">' + parts.join('') + '</div>' +
            '<div class="chip-row" id="matters-type-chips">' + typeChips.join('') + '</div>'
        );
    }

    function wireChips() {
        const sc = document.getElementById('matters-status-chips');
        if (sc) {
            sc.querySelectorAll('.chip').forEach(function(c) {
                c.addEventListener('click', function() {
                    filters.status = c.getAttribute('data-status');
                    refreshChips();
                    load();
                });
            });
        }
        const tc = document.getElementById('matters-type-chips');
        if (tc) {
            tc.querySelectorAll('.chip').forEach(function(c) {
                c.addEventListener('click', function() {
                    const t = c.getAttribute('data-type');
                    filters.type = (filters.type === t) ? '' : t;
                    refreshChips();
                    load();
                });
            });
        }
    }

    function refreshChips() {
        const wrap = document.getElementById('matters-chips-wrap');
        if (wrap) wrap.innerHTML = renderChips();
        wireChips();
    }

    function wireFilters() {
        const search = document.getElementById('matters-search');
        if (search) {
            search.value = filters.q;
            search.addEventListener('input', debounce(function() {
                filters.q = search.value;
                load();
            }, 300));
        }

        const newBtn = document.getElementById('matters-new-btn');
        if (newBtn) {
            newBtn.addEventListener('click', function() {
                if (window.LegisCoreMatterDetail && window.LegisCoreMatterDetail.openNew) {
                    window.LegisCoreMatterDetail.openNew(function() { load(); });
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

        filters = { q: '', type: '', status: '' };
        rows = [];

        container.innerHTML =
            '<div class="page-header">' +
                '<div>' +
                    '<div class="uppercase">Firm work</div>' +
                    '<h1>Matters</h1>' +
                    '<p class="page-subtitle">Every case your firm is handling.</p>' +
                '</div>' +
                '<div class="page-actions">' +
                    '<button class="btn btn-primary" id="matters-new-btn">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                        'New matter' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="card" style="padding:var(--s-4);margin-bottom:var(--s-4)">' +
                '<input type="search" id="matters-search" class="form-control" placeholder="Find a matter by title or number..." autocomplete="off">' +
                '<div id="matters-chips-wrap" style="margin-top:var(--s-3)">' + renderChips() + '</div>' +
            '</div>' +
            '<div id="matters-list">' + renderSkeleton() + '</div>';

        wireFilters();
        wireChips();
        load();
    }

    window.LegisCoreMatters = { render: render };

})(window);
