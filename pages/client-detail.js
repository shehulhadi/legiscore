/**
 * LegisCore — pages/client-detail.js
 * Client profile: header, matters list, new/edit modal.
 * Exposes window.LegisCoreClientDetail.
 *
 * Routes:  #/client?id=<clientId>  -> render(container, params)
 *          openNew(onDone)         -> modal for creating a fresh client
 */

(function(window) {
    'use strict';

    const clientsApi = window.LegisCoreClientsApi;
    const mattersApi = window.LegisCoreMattersApi;
    const api        = window.LegisCoreApi;
    const state      = window.LegisCoreState;

    if (!clientsApi || !mattersApi || !api || !state) {
        console.error('[LegisCoreClientDetail] api modules must load first.');
        return;
    }

    const CLIENT_TYPES = [
        { v: 'individual', label: 'Individual' },
        { v: 'company',    label: 'Company' },
        { v: 'government', label: 'Government' },
    ];

    let currentClient = null;
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

    function initials(name) {
        if (!name) return '?';
        return name.split(/\s+/).slice(0, 2)
            .map(function(p) { return (p[0] || '').toUpperCase(); })
            .join('') || '?';
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString(undefined, {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    function typeBadge(type) {
        const t = String(type || '').toLowerCase();
        if (t === 'company')    return '<span class="badge badge-info">Company</span>';
        if (t === 'government') return '<span class="badge badge-warning">Government</span>';
        if (t === 'individual') return '<span class="badge badge-muted">Individual</span>';
        return '<span class="badge badge-muted">' + esc(type || '—') + '</span>';
    }

    function statusBadge(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'active')   return '<span class="badge badge-success">Active</span>';
        if (s === 'closed')   return '<span class="badge badge-muted">Closed</span>';
        if (s === 'archived') return '<span class="badge badge-muted">Archived</span>';
        return '<span class="badge badge-muted">' + esc(status || '—') + '</span>';
    }

    function isAdministrator() {
        const u = state.get('user');
        return !!(u && u.role === 'administrator');
    }

    // ---- queries ------------------------------------------------------

    async function fetchClientMatters(clientId) {
        const rows = await api.rest(
            '/lc_matters?client_id=eq.' + encodeURIComponent(clientId) +
            '&order=created_at.desc&limit=100&select=*'
        );
        return Array.isArray(rows) ? rows : [];
    }

    // ---- main view ----------------------------------------------------

    function headerHtml(c) {
        const contact = [];
        if (c.phone) contact.push('<span>' + esc(c.phone) + '</span>');
        if (c.email) contact.push('<span>' + esc(c.email) + '</span>');

        return (
            '<div class="page-header" style="flex-wrap:wrap">' +
                '<div style="display:flex;align-items:flex-start;gap:var(--s-4);min-width:0">' +
                    '<div class="user-avatar" style="width:56px;height:56px;font-size:18px">' +
                        esc(initials(c.name)) +
                    '</div>' +
                    '<div style="min-width:0">' +
                        '<div class="uppercase">Client</div>' +
                        '<h1 style="margin:var(--s-1) 0 0">' + esc(c.name) + '</h1>' +
                        '<div style="display:flex;gap:var(--s-2);margin-top:var(--s-3);flex-wrap:wrap;align-items:center">' +
                            typeBadge(c.client_type) +
                            (contact.length
                                ? contact.map(function(x, i) {
                                    return (i > 0 ? '<span class="dot-sep" style="width:3px;height:3px;border-radius:50%;background:var(--text-faint);display:inline-block"></span>' : '') + x;
                                  }).join(' ')
                                : '') +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="page-actions">' +
                    '<a href="#/clients" class="btn btn-ghost btn-sm">&larr; All clients</a>' +
                    '<button class="btn btn-secondary btn-sm" id="client-edit">Edit</button>' +
                    '<button class="btn btn-secondary btn-sm" id="client-add-doc">Add document</button>' +
                    '<button class="btn btn-primary btn-sm" id="client-new-matter">New matter</button>' +
                '</div>' +
            '</div>' +
            (c.address
                ? '<div class="card" style="margin-bottom:var(--s-4)">' +
                    '<div class="uppercase" style="margin-bottom:var(--s-2)">Address</div>' +
                    '<div class="text-sm">' + esc(c.address) + '</div>' +
                  '</div>'
                : '')
        );
    }

    function mattersSectionHtml(matters) {
        if (!matters || matters.length === 0) {
            return (
                '<div class="empty-state" style="padding:var(--s-6) var(--s-3)">' +
                    '<div class="empty-state-icon">&#128188;</div>' +
                    '<div class="empty-state-title" style="font-size:var(--fs-body)">No matters yet</div>' +
                    '<p class="empty-state-desc">Open a matter under this client to start filing documents.</p>' +
                    '<button class="btn btn-primary btn-sm" id="client-empty-new-matter">New matter</button>' +
                '</div>'
            );
        }
        const rowsHtml = matters.map(function(m) {
            return (
                '<div class="doc-row" data-matter-id="' + esc(m.id) + '">' +
                    '<div class="doc-icon">&#128193;</div>' +
                    '<div class="doc-meta">' +
                        '<div class="doc-name">' + esc(m.title) + '</div>' +
                        '<div class="doc-sub">' +
                            '<span>' + esc(m.matter_number || 'no number') + '</span>' +
                            '<span class="dot-sep"></span>' +
                            '<span>' + esc(m.type || '—') + '</span>' +
                            '<span class="dot-sep"></span>' +
                            '<span>' + esc(fmtDate(m.created_at)) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:var(--s-2)">' +
                        statusBadge(m.status) +
                        '<svg class="doc-action" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
                    '</div>' +
                '</div>'
            );
        }).join('');
        return '<div style="padding:var(--s-2)">' + rowsHtml + '</div>';
    }

    function wireActions(client, matters) {
        const edit = document.getElementById('client-edit');
        if (edit) edit.addEventListener('click', function() { openEdit(client); });

        const addDoc = document.getElementById('client-add-doc');
        if (addDoc) addDoc.addEventListener('click', function() {
            if (window.LegisCoreDocumentsModal && window.LegisCoreDocumentsModal.openNew) {
                window.LegisCoreDocumentsModal.openNew(function() {
                    const container = document.querySelector('.app-main');
                    if (container) render(container, { id: client.id });
                }, { clientId: client.id });
            }
        });

        const newMatter = document.getElementById('client-new-matter');
        if (newMatter) newMatter.addEventListener('click', function() {
            openNewMatter(client, function() {
                const container = document.querySelector('.app-main');
                if (container) render(container, { id: client.id });
            });
        });

        const emptyNewMatter = document.getElementById('client-empty-new-matter');
        if (emptyNewMatter) emptyNewMatter.addEventListener('click', function() {
            openNewMatter(client, function() {
                const container = document.querySelector('.app-main');
                if (container) render(container, { id: client.id });
            });
        });

        document.querySelectorAll('[data-matter-id]').forEach(function(el) {
            el.addEventListener('click', function() {
                window.location.hash = '#/matter?id=' + encodeURIComponent(el.getAttribute('data-matter-id'));
            });
        });
    }

    // ---- modal (client new/edit) --------------------------------------

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
                    '<button class="topbar-icon-btn" id="cd-close" aria-label="Close">' +
                        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                    '</button>' +
                '</div>' +
                '<div class="modal-body">' + bodyHtml + '</div>' +
                '<div class="modal-footer">' + footerHtml + '</div>' +
            '</div>';
        bd.querySelector('#cd-close').addEventListener('click', function() { if (!busy) closeModal(); });
    }

    function typeOpts(selected) {
        return CLIENT_TYPES.map(function(t) {
            return '<option value="' + esc(t.v) + '"' + (t.v === selected ? ' selected' : '') + '>' + esc(t.label) + '</option>';
        }).join('');
    }

    function clientFormHtml(c) {
        return (
            '<div class="form-group">' +
                '<label for="cd-name">Client name</label>' +
                '<input type="text" id="cd-name" class="form-control" value="' + esc(c.name || '') + '" required>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="cd-type">Type</label>' +
                '<select id="cd-type" class="form-control">' + typeOpts(c.client_type || 'individual') + '</select>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="cd-phone">Phone</label>' +
                    '<input type="tel" id="cd-phone" class="form-control" value="' + esc(c.phone || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="cd-email">Email</label>' +
                    '<input type="email" id="cd-email" class="form-control" value="' + esc(c.email || '') + '">' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="cd-address">Address <span class="text-muted text-xs">(optional)</span></label>' +
                '<textarea id="cd-address" class="form-control" rows="2">' + esc(c.address || '') + '</textarea>' +
            '</div>'
        );
    }

    function readClientForm() {
        const get = function(id) {
            const el = document.getElementById(id);
            return el ? el.value.trim() : '';
        };
        return {
            name: get('cd-name'),
            client_type: get('cd-type') || 'individual',
            phone: get('cd-phone') || null,
            email: get('cd-email') || null,
            address: get('cd-address') || null,
        };
    }

    function openEdit(client) {
        renderModal('Edit client', clientFormHtml(client),
            (isAdministrator()
                ? '<button class="btn btn-danger-ghost" id="cd-delete" style="margin-right:auto">Delete</button>'
                : '') +
            '<button class="btn btn-secondary" id="cd-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="cd-save">Save</button>'
        );
        document.getElementById('cd-cancel').addEventListener('click', function() { if (!busy) closeModal(); });
        document.getElementById('cd-save').addEventListener('click', async function() {
            const patch = readClientForm();
            if (!patch.name) { alert('Client name is required.'); return; }
            busy = true;
            try {
                await clientsApi.update(client.id, patch);
                closeModal();
                const container = document.querySelector('.app-main');
                if (container) render(container, { id: client.id });
            } catch (err) {
                alert('Could not save: ' + (err.message || 'unknown error'));
            } finally {
                busy = false;
            }
        });
        const delBtn = document.getElementById('cd-delete');
        if (delBtn) delBtn.addEventListener('click', doDelete);
    }

    function openNew(onDone) {
        onDoneCb = onDone || null;
        renderModal('New client', clientFormHtml({ client_type: 'individual' }),
            '<button class="btn btn-secondary" id="cd-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="cd-create">Create</button>'
        );
        document.getElementById('cd-cancel').addEventListener('click', function() { if (!busy) closeModal(); });
        document.getElementById('cd-create').addEventListener('click', async function() {
            const row = readClientForm();
            if (!row.name) { alert('Client name is required.'); return; }
            busy = true;
            try {
                const created = await clientsApi.create(row);
                closeModal();
                if (onDoneCb) onDoneCb();
                if (created && created.id) {
                    window.location.hash = '#/client?id=' + encodeURIComponent(created.id);
                }
            } catch (err) {
                alert('Could not create: ' + (err.message || 'unknown error'));
            } finally {
                busy = false;
            }
        });
    }

    async function doDelete() {
        if (!currentClient) return;
        if (!confirm('Delete this client? Their matters will remain but lose the client link.')) return;
        busy = true;
        try {
            await clientsApi.remove(currentClient.id);
            closeModal();
            window.location.hash = '#/clients';
        } catch (err) {
            alert('Could not delete: ' + (err.message || 'unknown error'));
        } finally {
            busy = false;
        }
    }

    // ---- new matter from client page ----------------------------------

    function openNewMatter(client, onDone) {
        const draftMatter = { client_id: client.id, status: 'active' };
        const MATTER_TYPES = ['Litigation', 'Corporate', 'Real Estate', 'Probate', 'Trusts', 'Other'];

        const body =
            '<div class="form-group">' +
                '<label for="nm-number">Matter number <span class="text-muted text-xs">(optional)</span></label>' +
                '<input type="text" id="nm-number" class="form-control" placeholder="e.g. TB/2026/001">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="nm-title">Title</label>' +
                '<input type="text" id="nm-title" class="form-control" placeholder="e.g. Ahmed Yusuf v. XYZ Ltd" required>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="nm-type">Type</label>' +
                '<select id="nm-type" class="form-control"><option value="">— Select —</option>' +
                    MATTER_TYPES.map(function(t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('') +
                '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="nm-desc">Description <span class="text-muted text-xs">(optional)</span></label>' +
                '<textarea id="nm-desc" class="form-control" rows="2"></textarea>' +
            '</div>' +
            '<div class="form-hint">Client: <strong>' + esc(client.name) + '</strong></div>';

        renderModal('New matter', body,
            '<button class="btn btn-secondary" id="cd-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="nm-create">Create</button>'
        );
        document.getElementById('cd-cancel').addEventListener('click', function() { if (!busy) closeModal(); });
        document.getElementById('nm-create').addEventListener('click', async function() {
            const title = (document.getElementById('nm-title').value || '').trim();
            if (!title) { alert('Title is required.'); return; }
            busy = true;
            try {
                await mattersApi.create({
                    matter_number: (document.getElementById('nm-number').value || '').trim() || null,
                    title: title,
                    type: document.getElementById('nm-type').value || null,
                    status: 'active',
                    client_id: client.id,
                    description: (document.getElementById('nm-desc').value || '').trim() || null,
                });
                closeModal();
                if (onDone) onDone();
            } catch (err) {
                alert('Could not create matter: ' + (err.message || 'unknown error'));
            } finally {
                busy = false;
            }
        });
    }

    // ---- main render --------------------------------------------------

    async function render(container, params) {
        if (!container) return;

        const clientId = params && params.id;
        if (!clientId) {
            container.innerHTML = '<div class="alert alert-error">No client id provided.</div>';
            return;
        }

        container.innerHTML =
            '<div class="view-loading"><div class="spinner"></div><p class="text-sm">Loading client&hellip;</p></div>';

        try {
            const client = await clientsApi.get(clientId);
            currentClient = client;
            const matters = await fetchClientMatters(client.id);

            container.innerHTML =
                headerHtml(client) +
                '<div class="card">' +
                    '<div class="card-header">' +
                        '<h3 class="card-title">Matters (' + matters.length + ')</h3>' +
                    '</div>' +
                    '<div class="card-body">' + mattersSectionHtml(matters) + '</div>' +
                '</div>';

            wireActions(client, matters);
        } catch (err) {
            console.error('[LegisCoreClientDetail] load failed:', err);
            container.innerHTML =
                '<div class="alert alert-error">' + esc(err.message || 'Could not load client.') + '</div>' +
                '<a href="#/clients" class="btn btn-secondary">Back to clients</a>';
        }
    }

    window.LegisCoreClientDetail = {
        render: render,
        openNew: openNew,
    };

})(window);
