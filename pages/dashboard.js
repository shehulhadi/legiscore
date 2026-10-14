/**
 * LegisCore — pages/dashboard.js
 * Dashboard view. Reads real data from Supabase via LegisCoreApi.rest.
 * Exposes window.LegisCoreDashboard.render(container).
 *
 * Four stat cards + three panels. Each block owns its loading /
 * success / empty / error state so one slow query does not blank the page.
 * Styled against the v2 design system (tokens, timeline, doc-rows,
 * skeleton loaders).
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

    function fmtRelative(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const diff = Date.now() - d.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1)    return 'just now';
        if (mins < 60)   return mins + 'm ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24)    return hrs + 'h ago';
        const days = Math.floor(hrs / 24);
        if (days < 7)    return days + 'd ago';
        return fmtDate(iso);
    }

    function daysUntil(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        const ms = d.getTime() - Date.now();
        return Math.ceil(ms / (1000 * 60 * 60 * 24));
    }

    function deadlineChip(iso) {
        const days = daysUntil(iso);
        if (days === null) return '';
        if (days < 0)   return '<span class="badge badge-danger">Overdue</span>';
        if (days === 0) return '<span class="badge badge-danger">Today</span>';
        if (days <= 3)  return '<span class="badge badge-warning">' + days + 'd left</span>';
        if (days <= 14) return '<span class="badge badge-info">' + days + 'd left</span>';
        return '<span class="badge badge-muted">' + days + 'd left</span>';
    }

    function statCard(label, value, meta, accent) {
        return (
            '<div class="stat-card' + (accent ? ' accent-brass' : '') + '">' +
                '<div class="stat-label">' + esc(label) + '</div>' +
                '<div class="stat-value">' + esc(value) + '</div>' +
                (meta ? '<div class="stat-meta">' + esc(meta) + '</div>' : '') +
            '</div>'
        );
    }

    function statSkeleton(label) {
        return (
            '<div class="stat-card">' +
                '<div class="stat-label">' + esc(label) + '</div>' +
                '<div class="skeleton skeleton-title" style="margin-top:8px;height:34px;width:60%"></div>' +
            '</div>'
        );
    }

    function panelSkeleton() {
        let rows = '';
        for (let i = 0; i < 3; i++) {
            rows +=
                '<div style="padding:var(--s-3) 0;border-bottom:1px solid var(--border-soft)">' +
                    '<div class="skeleton skeleton-line" style="width:70%"></div>' +
                    '<div class="skeleton skeleton-line short" style="margin-top:6px"></div>' +
                '</div>';
        }
        return rows;
    }

    function panel(id, title, body, actions) {
        return (
            '<div class="card" style="margin-bottom:var(--s-5)">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">' + esc(title) + '</h3>' +
                    (actions ? '<div class="card-actions">' + actions + '</div>' : '') +
                '</div>' +
                '<div class="card-body" id="' + id + '">' + body + '</div>' +
            '</div>'
        );
    }

    function panelEmpty(icon, title, msg) {
        return (
            '<div class="empty-state" style="padding:var(--s-6) var(--s-3)">' +
                '<div class="empty-state-icon">' + icon + '</div>' +
                '<div class="empty-state-title" style="font-size:var(--fs-body)">' + esc(title) + '</div>' +
                '<p class="empty-state-desc">' + esc(msg) + '</p>' +
            '</div>'
        );
    }

    function panelError(msg) {
        return (
            '<div class="alert alert-error" style="margin:0">' +
                '<span>' + esc(msg) + '</span>' +
            '</div>'
        );
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
        const rows = await api.rest('/lc_matters?' + org + '&status=eq.active&select=id');
        return Array.isArray(rows) ? rows.length : 0;
    }

    async function fetchDocsThisWeek() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        const since = daysFromNow(-7);
        const rows = await api.rest(
            '/lc_documents?' + org + '&created_at=gte.' + encodeURIComponent(since) + '&select=id'
        );
        return Array.isArray(rows) ? rows.length : 0;
    }

    async function fetchScannedThisMonth() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        const since = daysFromNow(-30);
        const rows = await api.rest(
            '/lc_documents?' + org +
            '&source=eq.scanned' +
            '&created_at=gte.' + encodeURIComponent(since) +
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
            '&order=due_at.asc&limit=6&select=*'
        );
    }

    async function fetchRecentActivity() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        return api.rest(
            '/lc_activities?' + org +
            '&order=created_at.desc&limit=6' +
            '&select=id,icon,text,who,ref_type,ref_id,created_at'
        );
    }

    // ---- renderers ----------------------------------------------------

    function renderDeadlines(rows) {
        if (!rows || rows.length === 0) {
            return panelEmpty('&#128197;', 'Nothing due soon', 'No deadlines in the next 30 days.');
        }
        const items = rows.map(function(r) {
            const days = daysUntil(r.due_at);
            const dotClass = days !== null && days <= 3 ? 'dot-danger'
                : days !== null && days <= 14 ? 'dot-warning'
                : 'dot-brass';
            return (
                '<div class="timeline-item">' +
                    '<div class="timeline-dot ' + dotClass + '"></div>' +
                    '<div class="timeline-text">' + esc(r.title) + '</div>' +
                    '<div class="timeline-meta">' +
                        '<span>Due ' + esc(fmtDate(r.due_at)) + '</span>' +
                        '<span class="dot-sep"></span>' +
                        deadlineChip(r.due_at) +
                    '</div>' +
                '</div>'
            );
        }).join('');
        return '<div class="timeline">' + items + '</div>';
    }

    function activityDotClass(type) {
        if (type === 'document')      return 'dot-brass';
        if (type === 'physical_file') return 'dot-warning';
        if (type === 'deadline')      return 'dot-danger';
        if (type === 'client')        return 'dot-success';
        return '';
    }

    function renderActivity(rows) {
        if (!rows || rows.length === 0) {
            return panelEmpty('&#128220;', 'Quiet day', 'No recent activity.');
        }
        const items = rows.map(function(r) {
            return (
                '<div class="timeline-item">' +
                    '<div class="timeline-dot ' + activityDotClass(r.ref_type) + '"></div>' +
                    '<div class="timeline-text">' + esc(r.text) + '</div>' +
                    '<div class="timeline-meta">' +
                        '<span>' + esc(r.who || 'system') + '</span>' +
                        '<span class="dot-sep"></span>' +
                        '<span>' + esc(fmtRelative(r.created_at)) + '</span>' +
                    '</div>' +
                '</div>'
            );
        }).join('');
        return '<div class="timeline">' + items + '</div>';
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

        const user = state.get('user') || {};
        const firstName = (user.name || '').split(' ')[0] || 'there';
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

        container.innerHTML =
            '<div class="page-header">' +
                '<div>' +
                    '<div class="uppercase">' + esc(greeting) + '</div>' +
                    '<h1>' + esc(firstName) + '</h1>' +
                    '<p class="page-subtitle">Here is what is happening in your filing room today.</p>' +
                '</div>' +
                '<div class="page-actions">' +
                    '<a class="btn btn-secondary" href="#/physical-files">Physical files</a>' +
                    '<a class="btn btn-primary" href="#/documents">Open documents</a>' +
                '</div>' +
            '</div>' +
            '<div class="stat-grid" id="dash-stats">' +
                statSkeleton('Active matters') +
                statSkeleton('Added this week') +
                statSkeleton('Scanned this month') +
                statSkeleton('Deadlines in 30 days') +
            '</div>' +
            panel('dash-deadlines', 'Upcoming deadlines', panelSkeleton(),
                '<a class="btn btn-ghost btn-sm" href="#/matters">View matters</a>') +
            panel('dash-activity', 'Recent activity', panelSkeleton(), '');

        const statsEl    = container.querySelector('#dash-stats');
        const deadlinesEl = container.querySelector('#dash-deadlines');
        const activityEl = container.querySelector('#dash-activity');

        const results = await Promise.allSettled([
            fetchActiveMatters(),
            fetchDocsThisWeek(),
            fetchScannedThisMonth(),
            fetchUpcomingDeadlines(),
            fetchRecentActivity(),
        ]);

        const [mattersRes, docsRes, scanCountRes, deadlinesRes, activityRes] = results;

        const matterCount = mattersRes.status === 'fulfilled' ? mattersRes.value : null;
        const docsCount   = docsRes.status === 'fulfilled'    ? docsRes.value    : null;
        const scanCount   = scanCountRes.status === 'fulfilled' ? scanCountRes.value : null;
        const deadlineCount = deadlinesRes.status === 'fulfilled' && Array.isArray(deadlinesRes.value)
            ? deadlinesRes.value.length : null;

        statsEl.innerHTML =
            statCard('Active matters',
                matterCount === null ? '—' : matterCount,
                matterCount === null ? 'could not load' : 'currently open',
                false) +
            statCard('Added this week',
                docsCount === null ? '—' : docsCount,
                docsCount === null ? 'could not load' : 'last 7 days',
                false) +
            statCard('Scanned this month',
                scanCount === null ? '—' : scanCount,
                scanCount === null ? 'could not load' : 'added in last 30 days',
                true) +
            statCard('Deadlines in 30 days',
                deadlineCount === null ? '—' : deadlineCount,
                deadlineCount === null ? 'could not load' : 'next 30 days',
                false);

        deadlinesEl.innerHTML = deadlinesRes.status === 'fulfilled'
            ? renderDeadlines(deadlinesRes.value)
            : panelError('Could not load deadlines.');

        activityEl.innerHTML = activityRes.status === 'fulfilled'
            ? renderActivity(activityRes.value)
            : panelError('Could not load activity.');
    }

    window.LegisCoreDashboard = { render: render };

})(window);
