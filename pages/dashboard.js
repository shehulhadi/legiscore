/**
 * LegisCore — pages/dashboard.js
 * Dashboard view. Reads real data from Supabase via LegisCoreApi.rest.
 * Exposes window.LegisCoreDashboard.render(container).
 *
 * Four stat cards + three panels. Each block owns its loading /
 * success / empty / error state so one slow query does not blank the page.
 */

(function(window) {
    'use strict';

    const api   = window.LegisCoreApi;
    const state = window.LegisCoreState;

    if (!api || !state) {
        console.error('[LegisCoreDashboard] api and state must load first.');
        return;
    }

    // ---- helpers ------------------------------------------------------

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function daysFromNow(n) {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return d.toISOString();
    }

    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    function daysUntil(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        const ms = d.getTime() - Date.now();
        return Math.ceil(ms / (1000 * 60 * 60 * 24));
    }

    function deadlineBadge(iso) {
        const days = daysUntil(iso);
        if (days === null) return '';
        if (days < 0)  return '<span class="badge badge-danger">Overdue</span>';
        if (days === 0) return '<span class="badge badge-danger">Today</span>';
        if (days <= 3) return '<span class="badge badge-warning">' + days + 'd</span>';
        if (days <= 14) return '<span class="badge badge-info">' + days + 'd</span>';
        return '<span class="badge badge-muted">' + days + 'd</span>';
    }

    function statCard(label, value, meta) {
        return (
            '<div class="stat-card">' +
                '<div class="stat-label">' + esc(label) + '</div>' +
                '<div class="stat-value">' + esc(value) + '</div>' +
                (meta ? '<div class="stat-meta">' + esc(meta) + '</div>' : '') +
            '</div>'
        );
    }

    function statCardLoading(label) {
        return (
            '<div class="stat-card">' +
                '<div class="stat-label">' + esc(label) + '</div>' +
                '<div class="stat-value" style="color:var(--text-faint)">—</div>' +
            '</div>'
        );
    }

    function panel(id, title, body, actions) {
        return (
            '<div class="card" style="margin-bottom:var(--space-5)">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">' + esc(title) + '</h3>' +
                    (actions || '') +
                '</div>' +
                '<div class="card-body" id="' + id + '">' + body + '</div>' +
            '</div>'
        );
    }

    function panelLoading() {
        return (
            '<div class="view-loading">' +
                '<div class="spinner"></div>' +
                '<p class="text-sm">Loading&hellip;</p>' +
            '</div>'
        );
    }

    function panelEmpty(msg) {
        return (
            '<div class="empty-state" style="padding:var(--space-5) var(--space-3)">' +
                '<p class="empty-state-desc">' + esc(msg) + '</p>' +
            '</div>'
        );
    }

    function panelError(msg) {
        return '<div class="alert alert-error" style="margin:0">' + esc(msg) + '</div>';
    }

    // ---- queries ------------------------------------------------------

    function orgFilter() {
        const orgId = state.get('orgId');
        if (!orgId) return null;
        return 'organization_id=eq.' + encodeURIComponent(orgId);
    }

    async function fetchActiveMatters() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        const rows = await api.rest(
            '/lc_matters?' + org + '&status=eq.active&select=id'
        );
        return Array.isArray(rows) ? rows.length : 0;
    }

    async function fetchDocsThisWeek() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        const since = daysFromNow(-7);
        const rows = await api.rest(
            '/lc_documents?' + org +
            '&created_at=gte.' + encodeURIComponent(since) +
            '&select=id'
        );
        return Array.isArray(rows) ? rows.length : 0;
    }

    async function fetchAwaitingScan() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        const rows = await api.rest(
            '/lc_physical_files?' + org +
            '&status=eq.' + encodeURIComponent('Awaiting Scan') +
            '&select=id'
        );
        return Array.isArray(rows) ? rows.length : 0;
    }

    async function fetchUpcomingDeadlines() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        const now = new Date().toISOString();
        const soon = daysFromNow(30);
        return api.rest(
            '/lc_deadlines?' + org +
            '&status=eq.pending' +
            '&due_at=gte.' + encodeURIComponent(now) +
            '&due_at=lte.' + encodeURIComponent(soon) +
            '&order=due_at.asc&limit=20&select=*'
        );
    }

    async function fetchAwaitingScanList() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        return api.rest(
            '/lc_physical_files?' + org +
            '&status=eq.' + encodeURIComponent('Awaiting Scan') +
            '&order=created_at.desc&limit=10' +
            '&select=id,file_number,client_id,matter_id,category,cabinet,shelf'
        );
    }

    async function fetchRecentActivity() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        return api.rest(
            '/lc_activities?' + org +
            '&order=created_at.desc&limit=10' +
            '&select=id,icon,text,who,ref_type,ref_id,created_at'
        );
    }

    // ---- renderers ----------------------------------------------------

    function renderDeadlines(rows) {
        if (!rows || rows.length === 0) {
            return panelEmpty('No deadlines in the next 30 days.');
        }
        const items = rows.map(function(r) {
            return (
                '<li style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px solid var(--border-soft)">' +
                    '<div style="min-width:0">' +
                        '<div class="font-weight-medium">' + esc(r.title) + '</div>' +
                        '<div class="text-xs text-muted">Due ' + esc(fmtDate(r.due_at)) + '</div>' +
                    '</div>' +
                    deadlineBadge(r.due_at) +
                '</li>'
            );
        }).join('');
        return '<ul style="margin:0">' + items + '</ul>';
    }

    function renderAwaitingScanList(rows) {
        if (!rows || rows.length === 0) {
            return panelEmpty('No paper files waiting to be scanned.');
        }
        const items = rows.map(function(r) {
            const loc = [r.cabinet, r.shelf].filter(Boolean).join(' / ') || 'unfiled';
            return (
                '<li style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px solid var(--border-soft)">' +
                    '<div style="min-width:0">' +
                        '<div class="font-weight-medium">' + esc(r.file_number || r.id) + '</div>' +
                        '<div class="text-xs text-muted">' + esc(r.category || 'Uncategorised') + ' &middot; ' + esc(loc) + '</div>' +
                    '</div>' +
                    '<span class="badge badge-warning">Scan</span>' +
                '</li>'
            );
        }).join('');
        return '<ul style="margin:0">' + items + '</ul>';
    }

    function renderActivity(rows) {
        if (!rows || rows.length === 0) {
            return panelEmpty('No recent activity.');
        }
        const items = rows.map(function(r) {
            const when = r.created_at ? fmtDate(r.created_at) : '';
            return (
                '<li style="display:flex;gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px solid var(--border-soft)">' +
                    '<div style="flex:1;min-width:0">' +
                        '<div>' + esc(r.text) + '</div>' +
                        '<div class="text-xs text-muted">' +
                            esc(r.who || 'system') + ' &middot; ' + esc(when) +
                        '</div>' +
                    '</div>' +
                '</li>'
            );
        }).join('');
        return '<ul style="margin:0">' + items + '</ul>';
    }

    // ---- main render --------------------------------------------------

    async function render(container) {
        if (!container) return;

        const orgId = state.get('orgId');
        if (!orgId) {
            container.innerHTML =
                '<div class="alert alert-error">Your profile is not linked to an organization.</div>';
            return;
        }

        container.innerHTML =
            '<div class="page-header">' +
                '<div>' +
                    '<h1>Dashboard</h1>' +
                    '<p class="page-subtitle">Firm overview at a glance.</p>' +
                '</div>' +
                '<div class="page-actions">' +
                    '<a class="btn btn-primary btn-sm" href="#/documents">Open documents</a>' +
                    '<a class="btn btn-secondary btn-sm" href="#/physical-files">Physical files</a>' +
                '</div>' +
            '</div>' +
            '<div class="stat-grid" id="dash-stats">' +
                statCardLoading('Active matters') +
                statCardLoading('Docs added (7d)') +
                statCardLoading('Awaiting digitisation') +
                statCardLoading('Deadlines (30d)') +
            '</div>' +
            panel('dash-deadlines', 'Upcoming deadlines', panelLoading(),
                '<a class="text-sm" href="#/matters">View matters</a>') +
            panel('dash-scan', 'Awaiting digitisation', panelLoading(),
                '<a class="text-sm" href="#/physical-files">View files</a>') +
            panel('dash-activity', 'Recent activity', panelLoading(), '');

        const statsEl    = container.querySelector('#dash-stats');
        const deadlinesEl = container.querySelector('#dash-deadlines');
        const scanEl     = container.querySelector('#dash-scan');
        const activityEl = container.querySelector('#dash-activity');

        // Kick off all queries in parallel. Never let one failure blank the page.
        const [
            mattersRes, docsRes, scanCountRes,
            deadlinesRes, scanListRes, activityRes,
        ] = await Promise.allSettled([
            fetchActiveMatters(),
            fetchDocsThisWeek(),
            fetchAwaitingScan(),
            fetchUpcomingDeadlines(),
            fetchAwaitingScanList(),
            fetchRecentActivity(),
        ]);

        // Stats
        const matterCount = mattersRes.status === 'fulfilled' ? mattersRes.value : null;
        const docsCount   = docsRes.status === 'fulfilled'    ? docsRes.value    : null;
        const scanCount   = scanCountRes.status === 'fulfilled' ? scanCountRes.value : null;
        const deadlineCount = deadlinesRes.status === 'fulfilled' && Array.isArray(deadlinesRes.value)
            ? deadlinesRes.value.length : null;

        statsEl.innerHTML =
            statCard('Active matters',
                matterCount === null ? '—' : matterCount,
                matterCount === null ? 'could not load' : '') +
            statCard('Docs added (7d)',
                docsCount === null ? '—' : docsCount,
                docsCount === null ? 'could not load' : '') +
            statCard('Awaiting digitisation',
                scanCount === null ? '—' : scanCount,
                scanCount === null ? 'could not load' : '') +
            statCard('Deadlines (30d)',
                deadlineCount === null ? '—' : deadlineCount,
                deadlineCount === null ? 'could not load' : '');

        // Panels
        deadlinesEl.innerHTML = deadlinesRes.status === 'fulfilled'
            ? renderDeadlines(deadlinesRes.value)
            : panelError('Could not load deadlines.');

        scanEl.innerHTML = scanListRes.status === 'fulfilled'
            ? renderAwaitingScanList(scanListRes.value)
            : panelError('Could not load physical files.');

        activityEl.innerHTML = activityRes.status === 'fulfilled'
            ? renderActivity(activityRes.value)
            : panelError('Could not load activity.');
    }

    window.LegisCoreDashboard = { render: render };

})(window);
