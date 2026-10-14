/**
 * LegisCore — pages/dashboard.js
 * Professional dashboard: urgency-first, two-column on desktop.
 * Exposes window.LegisCoreDashboard.render(container).
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
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        const days = Math.floor(hrs / 24);
        if (days < 7) return days + 'd ago';
        return fmtDate(iso);
    }

    function daysUntil(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        return Math.ceil((d.getTime() - Date.now()) / 86400000);
    }

    function todayDateLine() {
        return new Date().toLocaleDateString(undefined, {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function initials(name) {
        if (!name) return '?';
        return name.split(/\s+/).slice(0, 2)
            .map(function(p) { return (p[0] || '').toUpperCase(); })
            .join('') || '?';
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

    function ensureStyles() {
        if (document.getElementById('lc-dash-style')) return;
        const s = document.createElement('style');
        s.id = 'lc-dash-style';
        s.textContent =
            '.lc-dash-cols{display:grid;gap:var(--s-5);grid-template-columns:1fr;margin-bottom:var(--s-5)}' +
            '@media(min-width:980px){.lc-dash-cols{grid-template-columns:2fr 1fr;align-items:start}}' +
            '.lc-dash-col{display:flex;flex-direction:column;gap:var(--s-5);min-width:0}' +
            '.lc-attn-group{padding:var(--s-3) 0;border-bottom:1px solid var(--border-soft)}' +
            '.lc-attn-group:last-child{border-bottom:none;padding-bottom:0}' +
            '.lc-attn-head{display:flex;align-items:center;gap:var(--s-2);margin-bottom:var(--s-2)}' +
            '.lc-attn-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}' +
            '.lc-attn-dot.overdue{background:var(--danger-500)}' +
            '.lc-attn-dot.today{background:var(--warning-500)}' +
            '.lc-attn-dot.week{background:var(--navy-500)}' +
            '.lc-attn-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted)}' +
            '.lc-attn-count{font-size:11px;font-weight:600;color:var(--text-faint);margin-left:auto}' +
            '.lc-attn-item{display:flex;justify-content:space-between;align-items:center;gap:var(--s-3);padding:var(--s-2) 0}' +
            '.lc-attn-title{font-size:14px;font-weight:500;color:var(--text);line-height:1.35}' +
            '.lc-attn-meta{font-size:12px;color:var(--text-muted);margin-top:2px}' +
            '.lc-stat-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--s-3);margin-top:var(--s-4)}' +
            '.lc-stat-mini{padding:var(--s-3) var(--s-4);background:var(--surface);border:1px solid var(--border);border-radius:var(--r)}' +
            '.lc-stat-mini-num{font-size:24px;font-weight:700;letter-spacing:-0.03em;color:var(--text);line-height:1;font-variant-numeric:tabular-nums}' +
            '.lc-stat-mini-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-top:var(--s-2)}' +
            '.lc-mini-list{display:flex;flex-direction:column;gap:var(--s-2)}' +
            '.lc-mini-row{display:flex;align-items:center;gap:var(--s-3);padding:var(--s-2) 0}' +
            '.lc-mini-name{font-size:13px;font-weight:500;color:var(--text)}' +
            '.lc-mini-sub{font-size:11px;color:var(--text-muted)}';
        document.head.appendChild(s);
    }

    // ---- queries ------------------------------------------------------

    function orgFilter() {
        const orgId = state.get('orgId');
        if (!orgId) return null;
        return 'organization_id=eq.' + encodeURIComponent(orgId);
    }

    async function fetchPendingDeadlines() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        return api.rest(
            '/lc_deadlines?' + org +
            '&status=eq.pending' +
            '&order=due_at.asc&limit=40' +
            '&select=id,title,due_at,matter_id,lc_matters(id,title,matter_number,lc_clients(name))'
        );
    }

    async function fetchRecentDocs() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        return api.rest(
            '/lc_documents?' + org +
            '&order=created_at.desc&limit=5' +
            '&select=id,name,document_type,status,created_at,mime_type,storage_key,lc_matters(id,title,matter_number),lc_clients(id,name)'
        );
    }

    async function fetchRecentActivity() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        return api.rest(
            '/lc_activities?' + org +
            '&order=created_at.desc&limit=6' +
            '&select=id,text,who,ref_type,created_at'
        );
    }

    async function fetchRecentClients() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        return api.rest(
            '/lc_clients?' + org +
            '&order=created_at.desc&limit=3' +
            '&select=id,name,client_type,created_at'
        );
    }

    async function fetchStats() {
        const org = orgFilter();
        if (!org) throw new Error('No active organization.');
        const [matters, weekDocs, scannedMonth, clients] = await Promise.all([
            api.rest('/lc_matters?' + org + '&status=eq.active&select=id'),
            api.rest('/lc_documents?' + org + '&created_at=gte.' + encodeURIComponent(daysFromNow(-7)) + '&select=id'),
            api.rest('/lc_documents?' + org + '&source=eq.scanned&created_at=gte.' + encodeURIComponent(daysFromNow(-30)) + '&select=id'),
            api.rest('/lc_clients?' + org + '&select=id'),
        ]);
        return {
            matters: Array.isArray(matters) ? matters.length : 0,
            weekDocs: Array.isArray(weekDocs) ? weekDocs.length : 0,
            scannedMonth: Array.isArray(scannedMonth) ? scannedMonth.length : 0,
            clients: Array.isArray(clients) ? clients.length : 0,
        };
    }

    // ---- renderers ----------------------------------------------------

    function attentionCard(deadlines) {
        const now = deadlines || [];
        const overdue = [], today = [], week = [];
        now.forEach(function(d) {
            const days = daysUntil(d.due_at);
            if (days === null) return;
            if (days < 0) overdue.push(d);
            else if (days === 0) today.push(d);
            else if (days <= 7) week.push(d);
        });

        if (overdue.length === 0 && today.length === 0 && week.length === 0) {
            return (
                '<div class="card">' +
                    '<div class="card-header">' +
                        '<h3 class="card-title">Needs your attention</h3>' +
                        '<span class="badge badge-success">All clear</span>' +
                    '</div>' +
                    '<div class="card-body">' +
                        '<div class="empty-state" style="padding:var(--s-6) var(--s-3)">' +
                            '<div class="empty-state-icon" style="background:var(--success-100);color:var(--success-700)">&#10003;</div>' +
                            '<div class="empty-state-title" style="font-size:var(--fs-body)">Nothing due this week</div>' +
                            '<p class="empty-state-desc">You are on top of everything. New deadlines will appear here.</p>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );
        }

        function group(key, label, items) {
            if (items.length === 0) return '';
            const rows = items.slice(0, 4).map(function(d) {
                const matter = d.lc_matters || {};
                const client = matter.lc_clients ? matter.lc_clients.name : '';
                const matterLine = matter.title
                    ? (client ? matter.title + ' · ' + client : matter.title)
                    : 'No matter';
                const days = daysUntil(d.due_at);
                const whenText = days < 0
                    ? Math.abs(days) + (Math.abs(days) === 1 ? ' day late' : ' days late')
                    : days === 0 ? 'Due today'
                    : days === 1 ? 'Due tomorrow'
                    : 'Due in ' + days + ' days';
                const badgeClass = days < 0 ? 'badge-danger' : days === 0 ? 'badge-warning' : 'badge-info';
                return (
                    '<div class="lc-attn-item">' +
                        '<div style="min-width:0">' +
                            '<div class="lc-attn-title">' + esc(d.title) + '</div>' +
                            '<div class="lc-attn-meta">' + esc(matterLine) + '</div>' +
                        '</div>' +
                        '<span class="badge ' + badgeClass + '" style="flex-shrink:0">' + esc(whenText) + '</span>' +
                    '</div>'
                );
            }).join('');
            const remaining = items.length - 4;
            const moreLine = remaining > 0
                ? '<div class="text-xs text-muted" style="padding-top:var(--s-2)">and ' + remaining + ' more</div>'
                : '';
            return (
                '<div class="lc-attn-group">' +
                    '<div class="lc-attn-head">' +
                        '<span class="lc-attn-dot ' + key + '"></span>' +
                        '<span class="lc-attn-label">' + esc(label) + '</span>' +
                        '<span class="lc-attn-count">' + items.length + '</span>' +
                    '</div>' +
                    rows + moreLine +
                '</div>'
            );
        }

        const totalCount = overdue.length + today.length + week.length;

        return (
            '<div class="card">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">Needs your attention</h3>' +
                    '<span class="badge badge-muted">' + totalCount + ' item' + (totalCount === 1 ? '' : 's') + '</span>' +
                '</div>' +
                '<div class="card-body">' +
                    group('overdue', 'Overdue', overdue) +
                    group('today',   'Today',   today) +
                    group('week',    'This week', week) +
                '</div>' +
            '</div>'
        );
    }

    function recentDocsCard(docs) {
        if (!docs || docs.length === 0) {
            return (
                '<div class="card">' +
                    '<div class="card-header">' +
                        '<h3 class="card-title">Recent documents</h3>' +
                        '<a class="btn btn-ghost btn-sm" href="#/documents">View all</a>' +
                    '</div>' +
                    '<div class="card-body">' +
                        '<div class="empty-state" style="padding:var(--s-5) var(--s-3)">' +
                            '<div class="empty-state-icon">&#128193;</div>' +
                            '<div class="empty-state-title" style="font-size:var(--fs-body)">No documents yet</div>' +
                            '<p class="empty-state-desc">Add your first file to get started.</p>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );
        }

        const rows = docs.map(function(d) {
            const matter = d.lc_matters ? d.lc_matters.title : '';
            const client = d.lc_clients ? d.lc_clients.name : '';
            const metaParts = [];
            if (matter) metaParts.push(matter);
            else if (client) metaParts.push(client);
            else metaParts.push('Firm document');
            metaParts.push(fmtRelative(d.created_at));

            return (
                '<div class="doc-row" data-doc-id="' + esc(d.id) + '">' +
                    '<div class="doc-icon ' + iconClassFor(d) + '">' + iconLabelFor(d) + '</div>' +
                    '<div class="doc-meta">' +
                        '<div class="doc-name">' + esc(d.name) + '</div>' +
                        '<div class="doc-sub">' +
                            metaParts.map(function(p) { return '<span>' + esc(p) + '</span>'; }).join('<span class="dot-sep"></span>') +
                        '</div>' +
                    '</div>' +
                    '<svg class="doc-action" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
                '</div>'
            );
        }).join('');

        return (
            '<div class="card">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">Recent documents</h3>' +
                    '<a class="btn btn-ghost btn-sm" href="#/documents">View all</a>' +
                '</div>' +
                '<div class="card-body" style="padding:var(--s-1) var(--s-3)">' + rows + '</div>' +
            '</div>'
        );
    }

    function recentActivityCard(activities) {
        if (!activities || activities.length === 0) {
            return (
                '<div class="card">' +
                    '<div class="card-header"><h3 class="card-title">Activity</h3></div>' +
                    '<div class="card-body">' +
                        '<div class="empty-state" style="padding:var(--s-5) var(--s-3)">' +
                            '<div class="empty-state-icon">&#128220;</div>' +
                            '<p class="empty-state-desc">Quiet day. Activity will appear here.</p>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );
        }

        function dotClass(type) {
            if (type === 'document') return 'dot-brass';
            if (type === 'physical_file') return 'dot-warning';
            if (type === 'deadline') return 'dot-danger';
            if (type === 'client') return 'dot-success';
            return '';
        }

        const items = activities.map(function(a) {
            return (
                '<div class="timeline-item">' +
                    '<div class="timeline-dot ' + dotClass(a.ref_type) + '"></div>' +
                    '<div class="timeline-text" style="font-size:var(--fs-sm)">' + esc(a.text) + '</div>' +
                    '<div class="timeline-meta">' +
                        '<span>' + esc(a.who || 'system') + '</span>' +
                        '<span class="dot-sep"></span>' +
                        '<span>' + esc(fmtRelative(a.created_at)) + '</span>' +
                    '</div>' +
                '</div>'
            );
        }).join('');

        return (
            '<div class="card">' +
                '<div class="card-header"><h3 class="card-title">Activity</h3></div>' +
                '<div class="card-body">' +
                    '<div class="timeline">' + items + '</div>' +
                '</div>' +
            '</div>'
        );
    }

    function recentClientsCard(clients) {
        if (!clients || clients.length === 0) return '';

        function typeLabel(t) {
            const s = String(t || '').toLowerCase();
            if (s === 'company') return 'Company';
            if (s === 'government') return 'Government';
            return 'Individual';
        }

        const rows = clients.map(function(c) {
            return (
                '<div class="lc-mini-row" data-client-id="' + esc(c.id) + '" style="cursor:pointer">' +
                    '<div class="user-avatar-sm">' + esc(initials(c.name)) + '</div>' +
                    '<div style="min-width:0;flex:1">' +
                        '<div class="lc-mini-name truncate">' + esc(c.name) + '</div>' +
                        '<div class="lc-mini-sub">' + esc(typeLabel(c.client_type)) + '</div>' +
                    '</div>' +
                    '<svg class="doc-action" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
                '</div>'
            );
        }).join('');

        return (
            '<div class="card">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">New clients</h3>' +
                    '<a class="btn btn-ghost btn-sm" href="#/clients">View all</a>' +
                '</div>' +
                '<div class="card-body" style="padding:var(--s-1) var(--s-3)">' + rows + '</div>' +
            '</div>'
        );
    }

    function statStrip(stats) {
        if (!stats) return '';
        function mini(num, label) {
            return (
                '<div class="lc-stat-mini">' +
                    '<div class="lc-stat-mini-num">' + esc(num) + '</div>' +
                    '<div class="lc-stat-mini-label">' + esc(label) + '</div>' +
                '</div>'
            );
        }
        return (
            '<div class="lc-stat-strip">' +
                mini(stats.matters, 'Active matters') +
                mini(stats.weekDocs, 'Added this week') +
                mini(stats.scannedMonth, 'Scanned this month') +
                mini(stats.clients, 'Clients') +
            '</div>'
        );
    }

    function skeletonCard(title) {
        let body = '';
        for (let i = 0; i < 4; i++) {
            body +=
                '<div style="padding:var(--s-3) 0;border-bottom:1px solid var(--border-soft)">' +
                    '<div class="skeleton skeleton-line" style="width:65%"></div>' +
                    '<div class="skeleton skeleton-line short" style="margin-top:6px"></div>' +
                '</div>';
        }
        return (
            '<div class="card">' +
                '<div class="card-header"><h3 class="card-title">' + esc(title) + '</h3></div>' +
                '<div class="card-body">' + body + '</div>' +
            '</div>'
        );
    }

    // ---- main render --------------------------------------------------

    async function render(container) {
        if (!container) return;

        ensureStyles();

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
                    '<p class="page-subtitle">' + esc(todayDateLine()) + '</p>' +
                '</div>' +
                '<div class="page-actions">' +
                    '<a class="btn btn-secondary" href="#/clients">New client</a>' +
                    '<button class="btn btn-primary" id="dash-add-doc">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                        'Add document' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div id="dash-attention">' + skeletonCard('Needs your attention') + '</div>' +
            '<div class="lc-dash-cols">' +
                '<div class="lc-dash-col" id="dash-left">' +
                    skeletonCard('Recent documents') +
                '</div>' +
                '<div class="lc-dash-col" id="dash-right">' +
                    skeletonCard('Activity') +
                '</div>' +
            '</div>' +
            '<div id="dash-stats"></div>';

        // Wire Add document button
        const addDoc = container.querySelector('#dash-add-doc');
        if (addDoc) {
            addDoc.addEventListener('click', function() {
                if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.openNew) {
                    window.LegisCoreDocumentsModal.openNew(function() {
                        render(container);
                    });
                }
            });
        }

        // Fetch everything
        const results = await Promise.allSettled([
            fetchPendingDeadlines(),
            fetchRecentDocs(),
            fetchRecentActivity(),
            fetchRecentClients(),
            fetchStats(),
        ]);

        const [deadlinesRes, docsRes, activityRes, clientsRes, statsRes] = results;

        // Attention
        const attnEl = container.querySelector('#dash-attention');
        attnEl.innerHTML = deadlinesRes.status === 'fulfilled'
            ? attentionCard(deadlinesRes.value)
            : '<div class="card"><div class="card-body"><div class="alert alert-error" style="margin:0">Could not load deadlines.</div></div></div>';

        // Left column: recent docs
        const leftEl = container.querySelector('#dash-left');
        leftEl.innerHTML = docsRes.status === 'fulfilled'
            ? recentDocsCard(docsRes.value)
            : '<div class="card"><div class="card-body"><div class="alert alert-error" style="margin:0">Could not load documents.</div></div></div>';

        // Right column: activity + new clients
        const rightEl = container.querySelector('#dash-right');
        const activityHtml = activityRes.status === 'fulfilled'
            ? recentActivityCard(activityRes.value)
            : '<div class="card"><div class="card-body"><div class="alert alert-error" style="margin:0">Could not load activity.</div></div></div>';
        const clientsHtml = clientsRes.status === 'fulfilled'
            ? recentClientsCard(clientsRes.value)
            : '';
        rightEl.innerHTML = activityHtml + clientsHtml;

        // Stat strip
        const statsEl = container.querySelector('#dash-stats');
        statsEl.innerHTML = statsRes.status === 'fulfilled'
            ? statStrip(statsRes.value)
            : '';

        // Wire document rows → modal
        container.querySelectorAll('[data-doc-id]').forEach(function(el) {
            el.addEventListener('click', function() {
                const id = el.getAttribute('data-doc-id');
                if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.open) {
                    window.LegisCoreDocumentsModal.open(id, function() {
                        render(container);
                    });
                }
            });
        });

        // Wire client rows → client page
        container.querySelectorAll('[data-client-id]').forEach(function(el) {
            el.addEventListener('click', function() {
                window.location.hash = '#/client?id=' + encodeURIComponent(el.getAttribute('data-client-id'));
            });
        });
    }

    window.LegisCoreDashboard = { render: render };

})(window);
