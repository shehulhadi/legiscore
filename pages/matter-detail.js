/**
 * LegisCore — pages/matter-detail.js
 * Matter workspace. Exposes window.LegisCoreMatterDetail.
 *
 * Route:  #/matter?id=<matterId>  -> render(container, params)
 * Also:   openNew(onDone)         -> modal for creating a fresh matter
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
        'Litigation', 'Corporate', 'Real Estate', 'Probate', 'Trusts', 'Other'
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

    function deadlineBadge(iso) {
        const days = daysUntil(iso);
        if (days === null) return '';
        if (days < 0)   return '<span class="badge badge-danger">Overdue</span>';
        if (days === 0) return '<span class="badge badge-danger">Today</span>';
        if (days === 3) return '<span class="badge badge-warning">' + days + 'd</span>';
        if (days <= 14) return '<span class="badge badge-info">' + days + 'd</span>';
        return '<span class="badge badge-muted">' + days + 'd</span>';
    }

    function statusBadge(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'active')       return '<span class="badge badge-success">Active</span>';
        if (s === 'closed')       return '<span class="badge badge-muted">Closed</span>';
        if (s === 'archived')     return '<span class="badge badge-muted">Archived</span>';
        if (s === 'verified')     return '<span class="badge badge-success">Verified</span>';
        if (s === 'needs_review') return '<span class="badge badge-warning">Needs review</span>';
        if (s === 'expiring')     return '<span class="badge badge-danger">Expiring</span>';
        if (s === 'pending')      return '<span class="badge badge-info">Pending</span>';
        if (s === 'done')         return '<span class="badge badge-success">Done</span>';
        if (s === 'missed')       return '<span class="badge badge-danger">Missed</span>';
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

    // ---- queries ------------------------------------------------------

    async function fetchDocuments(matterId) {
        const rows = await api.rest(
            '/lc_documents?matter_id=eq.' + encodeURIComponent(matterId) +
            '&order=created_at.desc&limit=100' +
            '&select=id,name,document_type,status,created_at,storage_key,file_size,mime_type'
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

    // ---- skeletons ----------------------------------------------------

    function skeletonRows(n) {
        let s = '';
        for (let i = 0; i < (n || 4); i++) {
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

    // ---- tab renderers ------------------------------------------------

    function renderDocumentsTab(docs) {
        if (!docs || docs.length === 0) {
            return (
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">&#128193;</div>' +
                    '<h2 class="empty-state-title">No documents yet</h2>' +
                    '<p class="empty-state-desc">Add the first file for this matter.</p>' +
                    '<button class="btn btn-primary btn-sm" id="matter-new-doc">Add document</button>' +
                '</div>'
            );
        }
        const rows = docs.map(function(d) {
            return (
                '<div class="doc-row" data-doc-id="' + esc(d.id) + '">' +
                    '<div class="doc-icon ' + iconClassFor(d) + '">' + iconLabelFor(d) + '</div>' +
                    '<div class="doc-meta">' +
                        '<div style="display:flex;align-items:center;gap:var(--s-2);min-width:0">' +
                            '<div class="doc-name" style="flex:1;min-width:0">' + esc(d.name) + '</div>' +
                            statusBadge(d.status) +
                        '</div>' +
                        '<div class="doc-sub">' +
                            '<span>' + esc(d.document_type || 'Uncategorised') + '</span>' +
                            '<span class="dot-sep"></span>' +
                            '<span>' + esc(fmtDate(d.created_at)) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<svg class="doc-action" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
                '</div>'
            );
        }).join('');

        return '<div class="card" style="padding:var(--s-2)">' + rows + '</div>';
    }

    function renderDeadlinesTab(deadlines) {
        if (!deadlines || deadlines.length === 0) {
            return (
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">&#128197;</div>' +
                    '<h2 class="empty-state-title">No deadlines set</h2>' +
                    '<p class="empty-state-desc">Track court dates, filings, and internal milestones here.</p>' +
                    '<button class="btn btn-primary btn-sm" id="matter-new-deadline">Add deadline</button>' +
                '</div>'
            );
        }
        const rows = deadlines.map(function(dl) {
            const days = daysUntil(dl.due_at);
            const dotClass = days === null ? '' :
                days < 0 ? 'dot-danger' :
                days <= 3 ? 'dot-danger' :
                days <= 14 ? 'dot-warning' :
                'dot-brass';
            return (
                '<div style="padding:var(--s-3) 0;border-bottom:1px solid var(--border-soft);display:flex;justify-content:space-between;align-items:flex-start;gap:var(--s-3)">' +
                    '<div style="min-width:0;flex:1">' +
                        '<div class="text-sm fw-500">' + esc(dl.title) + '</div>' +
                        '<div class="text-xs text-muted" style="margin-top:4px">' +
                            'Due ' + esc(fmtDate(dl.due_at)) +
                            (dl.notes ? ' &middot; ' + esc(dl.notes) : '') +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:var(--s-2);flex-shrink:0">' +
                        deadlineBadge(dl.due_at) +
                    '</div>' +
                '</div>'
            );
        }).join('');

        return (
            '<div class="card">' +
                '<div class="card-body">' + rows + '</div>' +
            '</div>'
        );
    }

    function renderActivityTab(activities) {
        if (!activities || activities.length === 0) {
            return (
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">&#128220;</div>' +
                    '<h2 class="empty-state-title">No activity yet</h2>' +
                    '<p class="empty-state-desc">Actions on this matter will be logged here.</p>' +
                '</div>'
            );
        }
        function dotClass(type) {
            if (type === 'document') return 'dot-brass';
            if (type === 'deadline') return 'dot-danger';
            if (type === 'matter')   return 'dot-success';
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
                '<div class="card-body">' +
                    '<div class="timeline">' + items + '</div>' +
                '</div>' +
            '</div>'
        );
    }

    // ---- header + tabs ------------------------------------------------

    function headerHtml(m) {
        const client = m.lc_clients ? m.lc_clients.name : null;
        const numLabel = m.matter_number || 'No number';
        const badges = [
            statusBadge(m.status),
            m.type ? '<span class="badge badge-muted">' + esc(m.type) + '</span>' : '',
            client ? '<span class="badge badge-primary">' + esc(client) + '</span>' : '',
        ].filter(Boolean).join('');

        return (
            '<div style="display:flex;align-items:flex-start;gap:var(--s-4);margin-bottom:var(--s-5);flex-wrap:wrap">' +
                '<div class="doc-icon" ' + typeIconBg(m.type) + ' style="width:56px;height:56px;font-size:15px;border-radius:var(--r-lg)">' +
                    esc(typeInitials(m.type)) +
                '</div>' +
                '<div style="min-width:0;flex:1">' +
                    '<div class="uppercase">' + esc(numLabel) + '</div>' +
                    '<h1 style="margin:var(--s-1) 0 0;font-size:var(--fs-display);letter-spacing:-0.03em;font-weight:700">' + esc(m.title) + '</h1>' +
                    '<div style="display:flex;gap:var(--s-2);margin-top:var(--s-3);flex-wrap:wrap">' + badges + '</div>' +
                '</div>' +
                '<div class="page-actions">' +
                    '<button class="btn btn-secondary btn-sm" id="matter-edit">Edit</button>' +
                    '<button class="btn btn-primary btn-sm" id="matter-new-doc-top">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                        'Add document' +
                    '</button>' +
                '</div>' +
            '</div>' +
            (m.description
                ? '<div class="card" style="margin-bottom:var(--s-5)">' +
                    '<div class="uppercase" style="margin-bottom:var(--s-2)">Description</div>' +
                    '<div class="text-sm">' + esc(m.description) + '</div>' +
                  '</div>'
                : '')
        );
    }

    function tabsHtml(active) {
        const tabs = [
            { id: 'documents', label: 'Documents' },
            { id: 'deadlines', label: 'Deadlines' },
            { id: 'activity',  label: 'Activity' },
        ];
        return '<div class="tabs">' +
            tabs.map(function(t) {
                return '<button class="tab' + (t.id === active ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
            }).join('') +
        '</div>';
    }

    // ---- tab loading --------------------------------------------------

    async function loadTabData(matterId, tab) {
        const bodyEl = document.getElementById('matter-tab-body');
        if (!bodyEl) return;
        bodyEl.innerHTML = skeletonRows(4);

        try {
            if (tab === 'documents') {
                const docs = await fetchDocuments(matterId);
                bodyEl.innerHTML = renderDocumentsTab(docs);
                wireDocRows();
                wireMatterNewDoc();
            } else if (tab === 'deadlines') {
                const deadlines = await fetchDeadlines(matterId);
                bodyEl.innerHTML = renderDeadlinesTab(deadlines);
                wireMatterNewDeadline();
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
        document.querySelectorAll('#matter-tab-body tr[data-doc-id], #matter-tab-body [data-doc-id]').forEach(function(el) {
            el.addEventListener('click', function() {
                const id = el.getAttribute('data-doc-id');
                if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.open) {
                    window.LegisCoreDocumentsModal.open(id, function() {
                        loadTabData(currentMatter.id, 'documents');
                    });
                }
            });
        });
    }

    function wireMatterNewDoc() {
        const btn = document.getElementById('matter-new-doc');
        if (!btn) return;
        btn.addEventListener('click', openNewDocumentForMatter);
    }

    function wireMatterNewDeadline() {
        const btn = document.getElementById('matter-new-deadline');
        if (!btn) return;
        btn.addEventListener('click', function() { openNewDeadline(currentMatter); });
    }

    function openNewDocumentForMatter() {
        if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.openNew) {
            window.LegisCoreDocumentsModal.openNew(function() {
                currentTab = 'documents';
                switchTab('documents');
                loadTabData(currentMatter.id, 'documents');
            }, {
                clientId: currentMatter.client_id || '',
                matterId: currentMatter.id,
            });
        }
    }

    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('[data-tab]').forEach(function(b) {
            const isActive = b.getAttribute('data-tab') === tab;
            b.classList.toggle('active', isActive);
        });
    }

    function wireTabs() {
        document.querySelectorAll('[data-tab]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const tab = btn.getAttribute('data-tab');
                if (tab === currentTab) return;
                switchTab(tab);
                loadTabData(currentMatter.id, tab);
            });
        });
    }

    function wireActions() {
        const edit = document.getElementById('matter-edit');
        if (edit) edit.addEventListener('click', function() { openEdit(currentMatter); });

        const newDocTop = document.getElementById('matter-new-doc-top');
        if (newDocTop) newDocTop.addEventListener('click', openNewDocumentForMatter);
    }

    // ---- modals -------------------------------------------------------

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
                '<label for="mm-client">Client ID <span class="text-muted text-xs">(optional)</span></label>' +
                '<input type="text" id="mm-client" class="form-control" value="' + esc(m.client_id || '') + '" placeholder="cli_...">' +
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
                await mattersApi.update(matter.id, patch);
                closeModal();
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
                if (created && created.id) {
                    window.location.hash = '#/matter?id=' + encodeURIComponent(created.id);
                }
            } catch (err) {
                alert('Could not create: ' + (err.message || 'unknown error'));
            } finally {
                busy = false;
            }
        });
    }

    function openNewDeadline(matter) {
        const today = new Date();
        const todayIso = today.toISOString().slice(0, 10);

        renderModal('Add deadline',
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
            '<button class="btn btn-primary" id="dl-create">Add deadline</button>'
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
                if (window.LegisCoreActivitiesApi && window.LegisCoreActivitiesApi.logActivity) {
                    window.LegisCoreActivitiesApi.logActivity({
                        text: "Set deadline '" + title + "'",
                        refType: 'deadline',
                        refId: id,
                    });
                }
                closeModal();
                switchTab('deadlines');
                loadTabData(matter.id, 'deadlines');
            } catch (err) {
                alert('Could not add deadline: ' + (err.message || 'unknown error'));
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

        container.innerHTML = skeletonRows(3);

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
