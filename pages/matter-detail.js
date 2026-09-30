/**
 * LegisCore — pages/matter-detail.js
 * Matter workspace. Exposes window.LegisCoreMatterDetail.
 *
 * Routes:  #/matter?id=<matterId>   -> render(container, params)
 *          openNew(onDone)          -> modal for creating a fresh matter
 *
 * Tabs: Documents | Deadlines | Activity
 */

(function(window) {
    'use strict';

    const mattersApi = window.LegisCoreMattersApi;
    const api        = window.LegisCoreApi;
    const state      = window.LegisCoreState;

    if (!mattersApi || !api || !state) {
        console.error('[LegisCoreMatterDetail] api modules must load first.');
        return;
    }

    const MATTER_TYPES = [
        'Litigation', 'Corporate', 'Real Estate', 'Probate', 'Trusts', 'Other',
    ];
    const MATTER_STATUSES = [
        { v: 'active',   label: 'Active' },
        { v: 'closed',   label: 'Closed' },
        { v: 'archived', label: 'Archived' },
    ];

    let currentMatter = null;
    let currentTab = 'documents';
    let backdropEl = null;
    let onDoneCb = null;
    let busy = false;

    // ---- helpers ------------------------------------------------------

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtDate(iso, withTime) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        const opts = { day: 'numeric', month: 'short', year: 'numeric' };
        if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
        return d.toLocaleDateString(undefined, opts);
    }

    function daysUntil(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }

    function deadlineBadge(iso) {
        const days = daysUntil(iso);
        if (days === null) return '';
        if (days < 0)   return '<span class="badge badge-danger">Overdue</span>';
        if (days === 0) return '<span class="badge badge-danger">Today</span>';
        if (days <= 3)  return '<span class="badge badge-warning">' + days + 'd</span>';
        if (days <= 14) return '<span class="badge badge-info">' + days + 'd</span>';
        return '<span class="badge badge-muted">' + days + 'd</span>';
    }

    function statusBadge(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'active')   return '<span class="badge badge-success">Active</span>';
        if (s === 'closed')   return '<span class="badge badge-muted">Closed</span>';
        if (s === 'archived') return '<span class="badge badge-muted">Archived</span>';
        if (s === 'verified')     return '<span class="badge badge-success">Verified</span>';
        if (s === 'needs_review') return '<span class="badge badge-warning">Needs review</span>';
        if (s === 'expiring')     return '<span class="badge badge-danger">Expiring</span>';
        if (s === 'pending')      return '<span class="badge badge-info">Pending</span>';
        if (s === 'done')         return '<span class="badge badge-success">Done</span>';
        if (s === 'missed')       return '<span class="badge badge-danger">Missed</span>';
        return '<span class="badge badge-muted">' + esc(status || '—') + '</span>';
    }

    function userInitialsFromText(text) {
        if (!text) return '?';
        return text.split(/\s+|@/).slice(0, 2).map(function(p) {
            return (p[0] || '').toUpperCase();
        }).join('') || '?';
    }

    // ---- queries ------------------------------------------------------

    async function fetchDocuments(matterId) {
        const rows = await api.rest(
            '/lc_documents?matter_id=eq.' + encodeURIComponent(matterId) +
            '&order=created_at.desc&limit=100' +
            '&select=id,name,document_type,status,created_at,storage_key,file_size'
        );
        return Array.isArray(rows) ? rows : [];
    }

    async function fetchDeadlines(matterId) {
        const rows = await api.rest(
            '/lc_deadlines?matter_id=eq.' + encodeURIComponent(matterId) +
            '&order=due_at.asc&limit=100&select=*'
        );
        return Array.isArray(rows) ? rows : [];
    }

    async function fetchActivity(refIds) {
        if (!refIds || refIds.length === 0) return [];
        const inList = refIds.map(encodeURIComponent).join(',');
        const rows = await api.rest(
            '/lc_activities?ref_id=in.(' + inList + ')' +
            '&order=created_at.desc&limit=50&select=*'
        );
        return Array.isArray(rows) ? rows : [];
    }

    // ---- tab renderers ------------------------------------------------

    function renderDocumentsTab(docs) {
        if (!docs || docs.length === 0) {
            return (
                '<div class="empty-state" style="padding:var(--space-6) var(--space-3)">' +
                    '<div class="empty-state-icon">&#128193;</div>' +
                    '<p class="empty-state-desc">No documents filed under this matter yet.</p>' +
                    '<button class="btn btn-primary btn-sm" id="matter-new-doc">New document</button>' +
                '</div>'
            );
        }
        const rows = docs.map(function(d) {
            return (
                '<tr data-doc-id="' + esc(d.id) + '" style="cursor:pointer">' +
                    '<td><div class="font-weight-medium">' + esc(d.name) + '</div>' +
                        '<div class="text-xs text-muted">' + esc(d.document_type || 'Uncategorised') + '</div></td>' +
                    '<td>' + statusBadge(d.status) + '</td>' +
                    '<td class="text-sm text-muted">' + esc(fmtDate(d.created_at)) + '</td>' +
                '</tr>'
            );
        }).join('');
        return (
            '<div class="table-wrap">' +
                '<table class="table">' +
                    '<thead><tr><th>Document</th><th>Status</th><th>Added</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>'
        );
    }

    function renderDeadlinesTab(deadlines) {
        if (!deadlines || deadlines.length === 0) {
            return (
                '<div class="empty-state" style="padding:var(--space-6) var(--space-3)">' +
                    '<div class="empty-state-icon">&#128197;</div>' +
                    '<p class="empty-state-desc">No deadlines set for this matter.</p>' +
                    '<button class="btn btn-primary btn-sm" id="matter-new-deadline">Add deadline</button>' +
                '</div>'
            );
        }
        return deadlines.map(function(dl) {
            return (
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px solid var(--border-soft)">' +
                    '<div style="min-width:0">' +
                        '<div class="font-weight-medium">' + esc(dl.title) + '</div>' +
                        '<div class="text-xs text-muted">Due ' + esc(fmtDate(dl.due_at)) + ' &middot; ' + esc(dl.status || '') + '</div>' +
                    '</div>' +
                    deadlineBadge(dl.due_at) +
                '</div>'
            );
        }).join('');
    }

    function renderActivityTab(activities) {
        if (!activities || activities.length === 0) {
            return (
                '<div class="empty-state" style="padding:var(--space-6) var(--space-3)">' +
                    '<div class="empty-state-icon">&#128220;</div>' +
                    '<p class="empty-state-desc">No activity logged for this matter yet.</p>' +
                '</div>'
            );
        }
        return activities.map(function(a) {
            return (
                '<div style="display:flex;gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px solid var(--border-soft)">' +
                    '<div style="flex:1;min-width:0">' +
                        '<div>' + esc(a.text) + '</div>' +
                        '<div class="text-xs text-muted">' +
                            esc(a.who || 'system') + ' &middot; ' + esc(fmtDate(a.created_at, true)) +
                        '</div>' +
                    '</div>' +
                '</div>'
            );
        }).join('');
    }

    // ---- main view ----------------------------------------------------

    function headerHtml(m) {
        const client = m.lc_clients ? m.lc_clients.name : null;
        return (
            '<div class="page-header" style="flex-wrap:wrap">' +
                '<div style="min-width:0">' +
                    '<div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:var(--space-1)">' +
                        esc(m.matter_number || 'No number') +
                    '</div>' +
                    '<h1 style="margin:0">' + esc(m.title) + '</h1>' +
                    '<div style="display:flex;gap:var(--space-2);margin-top:var(--space-3);flex-wrap:wrap">' +
                        statusBadge(m.status) +
                        (m.type ? '<span class="badge badge-muted">' + esc(m.type) + '</span>' : '') +
                        (client ? '<span class="badge badge-primary">' + esc(client) + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div class="page-actions" style="flex-wrap:wrap">' +
                    '<a href="#/matters" class="btn btn-ghost btn-sm">&larr; All matters</a>' +
                    '<button class="btn btn-secondary btn-sm" id="matter-edit">Edit</button>' +
                    '<button class="btn btn-secondary btn-sm" id="matter-new-deadline-top">Add deadline</button>' +
                    '<button class="btn btn-primary btn-sm" id="matter-new-doc-top">New document</button>' +
                '</div>' +
            '</div>' +
            (m.description
                ? '<div class="card" style="margin-bottom:var(--space-4)"><div class="text-sm">' + esc(m.description) + '</div></div>'
                : '')
        );
    }

    function tabsHtml(active) {
        const tabs = [
            { id: 'documents', label: 'Documents' },
            { id: 'deadlines', label: 'Deadlines' },
            { id: 'activity',  label: 'Activity'  },
        ];
        return (
            '<div style="display:flex;gap:var(--space-2);border-bottom:1px solid var(--border-soft);margin-bottom:var(--space-4)">' +
                tabs.map(function(t) {
                    const cls = 'btn btn-ghost btn-sm' + (t.id === active ? ' active' : '');
                    const style = t.id === active
                        ? 'border-bottom:2px solid var(--primary);border-radius:0;color:var(--primary)'
                        : 'border-radius:0';
                    return '<button class="' + cls + '" data-tab="' + t.id + '" style="' + style + '">' + t.label + '</button>';
                }).join('') +
            '</div>'
        );
    }

    async function loadTabData(matterId, tab) {
        const bodyEl = document.getElementById('matter-tab-body');
        if (!bodyEl) return;
        bodyEl.innerHTML = '<div class="view-loading"><div class="spinner"></div><p class="text-sm">Loading&hellip;</p></div>';

        try {
            if (tab === 'documents') {
                const docs = await fetchDocuments(matterId);
                bodyEl.innerHTML = renderDocumentsTab(docs);
                wireDocRows();
            } else if (tab === 'deadlines') {
                const deadlines = await fetchDeadlines(matterId);
                bodyEl.innerHTML = renderDeadlinesTab(deadlines);
            } else if (tab === 'activity') {
                const [docs, deadlines] = await Promise.all([
                    fetchDocuments(matterId),
                    fetchDeadlines(matterId),
                ]);
                const refIds = [matterId]
                    .concat(docs.map(function(d) { return d.id; }))
                    .concat(deadlines.map(function(d) { return d.id; }));
                const activities = await fetchActivity(refIds);
                bodyEl.innerHTML = renderActivityTab(activities);
            }
        } catch (err) {
            console.error('[LegisCoreMatterDetail] tab load failed:', err);
            bodyEl.innerHTML =
                '<div class="alert alert-error" style="margin:0">' +
                    esc(err.message || 'Could not load this tab.') +
                '</div>';
        }
    }

    function wireDocRows() {
        document.querySelectorAll('#matter-tab-body tr[data-doc-id]').forEach(function(tr) {
            tr.addEventListener('click', function() {
                const id = tr.getAttribute('data-doc-id');
                if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.open) {
                    window.LegisCoreDocumentsModal.open(id, function() {
                        loadTabData(currentMatter.id, 'documents');
                    });
                }
            });
        });
    }

    function wireTabs() {
        document.querySelectorAll('[data-tab]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const tab = btn.getAttribute('data-tab');
                if (tab === currentTab) return;
                currentTab = tab;
                document.querySelectorAll('[data-tab]').forEach(function(b) {
                    const isActive = b.getAttribute('data-tab') === tab;
                    b.style.borderBottom = isActive ? '2px solid var(--primary)' : 'none';
                    b.style.color = isActive ? 'var(--primary)' : '';
                });
                loadTabData(currentMatter.id, tab);
            });
        });
    }

    function wireActions() {
        const edit = document.getElementById('matter-edit');
        if (edit) edit.addEventListener('click', function() { openEdit(currentMatter); });

        const newDocTop = document.getElementById('matter-new-doc-top');
        const newDocTab = document.getElementById('matter-new-doc');
        [newDocTop, newDocTab].forEach(function(b) {
            if (!b) return;
            b.addEventListener('click', function() {
                if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.openNew) {
                    window.LegisCoreDocumentsModal.openNew(function() {
                        currentTab = 'documents';
                        loadTabData(currentMatter.id, 'documents');
                    });
                }
            });
        });

        const newDlTop = document.getElementById('matter-new-deadline-top');
        const newDlTab = document.getElementById('matter-new-deadline');
        [newDlTop, newDlTab].forEach(function(b) {
            if (!b) return;
            b.addEventListener('click', function() {
                openNewDeadline(currentMatter);
            });
        });
    }

    // ---- edit / new matter modal --------------------------------------

    function ensureBackdrop() {
        if (backdropEl) return backdropEl;
        backdropEl = document.createElement('div');
        backdropEl.className = 'modal-backdrop';
        backdropEl.addEventListener('click', function(e) {
            if (e.target === backdropEl && !busy) closeModal();
        });
        document.body.appendChild(backdropEl);
        return backdropEl;
    }

    function closeModal() {
        if (backdropEl && backdropEl.parentNode) backdropEl.parentNode.removeChild(backdropEl);
        backdropEl = null;
        busy = false;
    }

    function renderModal(title, bodyHtml, footerHtml) {
        const bd = ensureBackdrop();
        bd.innerHTML =
            '<div class="modal" role="dialog" aria-modal="true">' +
                '<div class="modal-header">' +
                    '<h2 class="modal-title">' + esc(title) + '</h2>' +
                    '<button class="topbar-icon-btn" id="mm-close" aria-label="Close">' +
                        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                    '</button>' +
                '</div>' +
                '<div class="modal-body">' + bodyHtml + '</div>' +
                '<div class="modal-footer">' + footerHtml + '</div>' +
            '</div>';
        bd.querySelector('#mm-close').addEventListener('click', function() { if (!busy) closeModal(); });
    }

    function typeOpts(sel) {
        return ['<option value="">— Select —</option>'].concat(MATTER_TYPES.map(function(t) {
            return '<option value="' + esc(t) + '"' + (t === sel ? ' selected' : '') + '>' + esc(t) + '</option>';
        })).join('');
    }

    function statusOpts(sel) {
        return MATTER_STATUSES.map(function(s) {
            return '<option value="' + esc(s.v) + '"' + (s.v === sel ? ' selected' : '') + '>' + esc(s.label) + '</option>';
        }).join('');
    }

    function matterFormHtml(m) {
        return (
            '<div class="form-group">' +
                '<label for="mm-number">Matter number <span class="text-muted text-xs">(optional)</span></label>' +
                '<input type="text" id="mm-number" class="form-control" value="' + esc(m.matter_number || '') + '" placeholder="e.g. TB/2026/001">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="mm-title">Title</label>' +
                '<input type="text" id="mm-title" class="form-control" value="' + esc(m.title || '') + '" required>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="mm-type">Type</label>' +
                    '<select id="mm-type" class="form-control">' + typeOpts(m.type) + '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="mm-status">Status</label>' +
                    '<select id="mm-status" class="form-control">' + statusOpts(m.status || 'active') + '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="mm-client">Client ID <span class="text-muted text-xs">(optional, e.g. cli_001)</span></label>' +
                '<input type="text" id="mm-client" class="form-control" value="' + esc(m.client_id || '') + '">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="mm-desc">Description <span class="text-muted text-xs">(optional)</span></label>' +
                '<textarea id="mm-desc" class="form-control" rows="3">' + esc(m.description || '') + '</textarea>' +
            '</div>'
        );
    }

    function readMatterForm() {
        const get = function(id) {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };
        return {
            matter_number: get('mm-number').trim() || null,
            title: get('mm-title').trim(),
            type: get('mm-type') || null,
            status: get('mm-status') || 'active',
            client_id: get('mm-client').trim() || null,
            description: get('mm-desc').trim() || null,
        };
    }

    function openEdit(matter) {
        renderModal('Edit matter', matterFormHtml(matter),
            '<button class="btn btn-secondary" id="mm-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="mm-save">Save</button>'
        );
        document.getElementById('mm-cancel').addEventListener('click', function() { if (!busy) closeModal(); });
        document.getElementById('mm-save').addEventListener('click', async function() {
            const patch = readMatterForm();
            if (!patch.title) { alert('Title is required.'); return; }
            busy = true;
            try {
                const updated = await mattersApi.update(matter.id, patch);
                closeModal();
                // Reload the whole view with fresh data
                const container = document.querySelector('.app-main');
                if (container) render(container, { id: matter.id });
            } catch (err) {
                alert('Could not save: ' + (err.message || 'unknown error'));
            } finally {
                busy = false;
            }
        });
    }

    function openNew(onDone) {
        onDoneCb = onDone || null;
        renderModal('New matter', matterFormHtml({}),
            '<button class="btn btn-secondary" id="mm-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="mm-create">Create</button>'
        );
        document.getElementById('mm-cancel').addEventListener('click', function() { if (!busy) closeModal(); });
        document.getElementById('mm-create').addEventListener('click', async function() {
            const row = readMatterForm();
            if (!row.title) { alert('Title is required.'); return; }
            busy = true;
            try {
                const created = await mattersApi.create(row);
                closeModal();
                if (onDoneCb) onDoneCb();
                // If we're on the list view, stay there. If on a detail view, we still navigate to the new matter.
                if (created && created.id && window.location.hash.indexOf('#/matters') === 0) {
                    // leave list as-is, it will refresh
                } else if (created && created.id) {
                    window.location.hash = '#/matter?id=' + encodeURIComponent(created.id);
                }
            } catch (err) {
                alert('Could not create: ' + (err.message || 'unknown error'));
            } finally {
                busy = false;
            }
        });
    }

    // ---- new deadline modal -------------------------------------------

    function openNewDeadline(matter) {
        const today = new Date();
        const todayIso = today.toISOString().slice(0, 10);

        renderModal('New deadline',
            '<div class="form-group">' +
                '<label for="dl-title">Title</label>' +
                '<input type="text" id="dl-title" class="form-control" placeholder="e.g. File reply to defence" required>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="dl-due">Due date</label>' +
                '<input type="date" id="dl-due" class="form-control" value="' + esc(todayIso) + '" required>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="dl-notes">Notes <span class="text-muted text-xs">(optional)</span></label>' +
                '<textarea id="dl-notes" class="form-control" rows="2"></textarea>' +
            '</div>',
            '<button class="btn btn-secondary" id="mm-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="dl-create">Create</button>'
        );
        document.getElementById('mm-cancel').addEventListener('click', function() { if (!busy) closeModal(); });
        document.getElementById('dl-create').addEventListener('click', async function() {
            const title = (document.getElementById('dl-title').value || '').trim();
            const due = document.getElementById('dl-due').value || '';
            const notes = (document.getElementById('dl-notes').value || '').trim();
            if (!title) { alert('Title is required.'); return; }
            if (!due)   { alert('Due date is required.'); return; }

            const user = state.get('user');
            const id = 'dl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
            const body = [{
                id: id,
                organization_id: state.get('orgId'),
                matter_id: matter.id,
                title: title,
                due_at: new Date(due + 'T00:00:00Z').toISOString(),
                status: 'pending',
                notes: notes || null,
                created_by: user ? user.id : null,
            }];

            busy = true;
            try {
                await api.rest('/lc_deadlines', {
                    method: 'POST',
                    headers: { 'Prefer': 'return=representation' },
                    body: JSON.stringify(body),
                });
                closeModal();
                currentTab = 'deadlines';
                loadTabData(matter.id, 'deadlines');
                // Also refresh tab highlight
                document.querySelectorAll('[data-tab]').forEach(function(b) {
                    const isActive = b.getAttribute('data-tab') === 'deadlines';
                    b.style.borderBottom = isActive ? '2px solid var(--primary)' : 'none';
                    b.style.color = isActive ? 'var(--primary)' : '';
                });
            } catch (err) {
                alert('Could not create deadline: ' + (err.message || 'unknown error'));
            } finally {
                busy = false;
            }
        });
    }

    // ---- main render --------------------------------------------------

    async function render(container, params) {
        if (!container) return;

        const matterId = params && params.id;
        if (!matterId) {
            container.innerHTML = '<div class="alert alert-error">No matter id provided.</div>';
            return;
        }

        container.innerHTML =
            '<div class="view-loading"><div class="spinner"></div><p class="text-sm">Loading matter&hellip;</p></div>';

        try {
            const matter = await mattersApi.get(matterId);
            currentMatter = matter;
            currentTab = 'documents';

            container.innerHTML =
                headerHtml(matter) +
                tabsHtml('documents') +
                '<div id="matter-tab-body"></div>';

            wireTabs();
            wireActions();
            loadTabData(matter.id, 'documents');
        } catch (err) {
            console.error('[LegisCoreMatterDetail] load failed:', err);
            container.innerHTML =
                '<div class="alert alert-error">' +
                    esc(err.message || 'Could not load matter.') +
                '</div>' +
                '<a href="#/matters" class="btn btn-secondary">Back to matters</a>';
        }
    }

    window.LegisCoreMatterDetail = {
        render: render,
        openNew: openNew,
    };

})(window);
