/**
 * LegisCore — pages/documents-modal.js
 * Metadata modal for a single document: view, edit, create, delete.
 * Exposes window.LegisCoreDocumentsModal.
 *
 * File attach (upload bytes to Supabase Storage) is deliberately NOT
 * here yet — the bucket exists (legiscore-documents) but api.js does
 * not yet support binary PUT. Attach lands in the next step.
 */

(function(window) {
    'use strict';

    const docsApi = window.LegisCoreDocumentsApi;
    const state   = window.LegisCoreState;

    if (!docsApi || !state) {
        console.error('[LegisCoreDocumentsModal] api and state must load first.');
        return;
    }

    const DOCUMENT_TYPES = [
        'Affidavit', 'Contract', 'Court Order', 'Receipt', 'Letter',
        'Power of Attorney', 'Client ID', 'Agreement', 'Will',
        'Motion', 'Brief', 'Notice', 'Other',
    ];

    const STATUSES = [
        { v: 'verified',     label: 'Verified' },
        { v: 'needs_review', label: 'Needs review' },
        { v: 'expiring',     label: 'Expiring' },
        { v: 'archived',     label: 'Archived' },
    ];

    let backdropEl = null;
    let onDoneCb = null;
    let currentId = null;
    let currentRow = null;
    let isAdmin = false;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function isAdministrator() {
        const u = state.get('user');
        return !!(u && u.role === 'administrator');
    }

    function close() {
        if (backdropEl && backdropEl.parentNode) {
            backdropEl.parentNode.removeChild(backdropEl);
        }
        backdropEl = null;
        currentId = null;
        currentRow = null;
    }

    function ensureBackdrop() {
        if (backdropEl) return backdropEl;
        backdropEl = document.createElement('div');
        backdropEl.className = 'modal-backdrop';
        backdropEl.setAttribute('role', 'presentation');
        backdropEl.addEventListener('click', function(e) {
            if (e.target === backdropEl) close();
        });
        document.body.appendChild(backdropEl);
        return backdropEl;
    }

    function renderShell(title, bodyHtml, footerHtml) {
        const bd = ensureBackdrop();
        bd.innerHTML =
            '<div class="modal" role="dialog" aria-modal="true">' +
                '<div class="modal-header">' +
                    '<h2 class="modal-title">' + esc(title) + '</h2>' +
                    '<button class="topbar-icon-btn" id="doc-modal-close" aria-label="Close">' +
                        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                    '</button>' +
                '</div>' +
                '<div class="modal-body">' + bodyHtml + '</div>' +
                '<div class="modal-footer">' + footerHtml + '</div>' +
            '</div>';

        const closeBtn = bd.querySelector('#doc-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
    }

    function showLoading() {
        renderShell('Document', '<div class="view-loading"><div class="spinner"></div><p class="text-sm">Loading&hellip;</p></div>', '');
    }

    function showError(msg) {
        renderShell(
            'Error',
            '<div class="alert alert-error" style="margin:0">' + esc(msg) + '</div>',
            '<button class="btn btn-secondary" id="doc-modal-cancel">Close</button>'
        );
        const c = backdropEl.querySelector('#doc-modal-cancel');
        if (c) c.addEventListener('click', close);
    }

    function typeOptions(selected) {
        return ['<option value="">— Select —</option>']
            .concat(DOCUMENT_TYPES.map(function(t) {
                return '<option value="' + esc(t) + '"' + (t === selected ? ' selected' : '') + '>' + esc(t) + '</option>';
            })).join('');
    }

    function statusOptions(selected) {
        return STATUSES.map(function(s) {
            return '<option value="' + esc(s.v) + '"' + (s.v === selected ? ' selected' : '') + '>' + esc(s.label) + '</option>';
        }).join('');
    }

    function toDateInput(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function formHtml(row, opts) {
        opts = opts || {};
        const readOnly = !!opts.readOnly;
        const ro = readOnly ? ' disabled' : '';
        return (
            '<div class="form-group">' +
                '<label for="doc-name">Document name</label>' +
                '<input type="text" id="doc-name" class="form-control" ' +
                    'value="' + esc(row.name || '') + '" maxlength="200" required' + ro + '>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="doc-type">Type</label>' +
                    '<select id="doc-type" class="form-control"' + ro + '>' + typeOptions(row.document_type) + '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="doc-status">Status</label>' +
                    '<select id="doc-status" class="form-control"' + ro + '>' + statusOptions(row.status || 'verified') + '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="doc-expires">Expiry date <span class="text-muted text-xs">(optional)</span></label>' +
                '<input type="date" id="doc-expires" class="form-control" value="' + esc(toDateInput(row.expires_at)) + '"' + ro + '>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Attached file</label>' +
                '<div class="text-sm text-muted" style="padding:var(--space-3);background:var(--surface-muted);border-radius:var(--radius);border:1px dashed var(--border)">' +
                    (row.storage_key
                        ? 'Stored: <code>' + esc(row.storage_key) + '</code>'
                        : 'No file attached yet. Upload lands in the next step.') +
                '</div>' +
            '</div>'
        );
    }

    function readForm() {
        const name = (document.getElementById('doc-name') || {}).value || '';
        const type = (document.getElementById('doc-type') || {}).value || '';
        const status = (document.getElementById('doc-status') || {}).value || 'verified';
        const exp = (document.getElementById('doc-expires') || {}).value || '';
        return {
            name: name.trim(),
            document_type: type || null,
            status: status,
            expires_at: exp ? new Date(exp + 'T00:00:00Z').toISOString() : null,
        };
    }

    async function saveExisting() {
        const patch = readForm();
        if (!patch.name) {
            alert('Name is required.');
            return;
        }
        try {
            await docsApi.update(currentId, patch);
            if (onDoneCb) onDoneCb();
            close();
        } catch (err) {
            showError(err.message || 'Could not save.');
        }
    }

    async function saveNew() {
        const patch = readForm();
        if (!patch.name) {
            alert('Name is required.');
            return;
        }
        try {
            await docsApi.create(Object.assign({}, patch, { source: 'uploaded' }));
            if (onDoneCb) onDoneCb();
            close();
        } catch (err) {
            showError(err.message || 'Could not create.');
        }
    }

    async function doDelete() {
        if (!currentId) return;
        if (!confirm('Delete this document permanently?')) return;
        try {
            await docsApi.remove(currentId);
            if (onDoneCb) onDoneCb();
            close();
        } catch (err) {
            showError(err.message || 'Could not delete.');
        }
    }

    function renderViewOrEdit(row) {
        const readOnly = !isAdmin && false; // placeholder for future viewer role; both roles can edit for now
        const body = formHtml(row, { readOnly: readOnly });
        const buttons = [];
        if (isAdmin) {
            buttons.push('<button class="btn btn-danger" id="doc-delete" style="margin-right:auto">Delete</button>');
        }
        buttons.push('<button class="btn btn-secondary" id="doc-cancel">Cancel</button>');
        buttons.push('<button class="btn btn-primary" id="doc-save">Save</button>');

        renderShell('Edit document', body, buttons.join(''));

        const saveBtn = backdropEl.querySelector('#doc-save');
        if (saveBtn) saveBtn.addEventListener('click', saveExisting);

        const cancelBtn = backdropEl.querySelector('#doc-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', close);

        const delBtn = backdropEl.querySelector('#doc-delete');
        if (delBtn) delBtn.addEventListener('click', doDelete);
    }

    function renderNew() {
        const draft = { name: '', document_type: '', status: 'verified', expires_at: null };
        renderShell(
            'New document',
            formHtml(draft, {}),
            '<button class="btn btn-secondary" id="doc-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="doc-create">Create</button>'
        );
        const cancelBtn = backdropEl.querySelector('#doc-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', close);
        const createBtn = backdropEl.querySelector('#doc-create');
        if (createBtn) createBtn.addEventListener('click', saveNew);
    }

    async function open(id, onDone) {
        if (!id) return;
        onDoneCb = onDone || null;
        currentId = id;
        isAdmin = isAdministrator();
        showLoading();
        try {
            const row = await docsApi.get(id);
            currentRow = row;
            renderViewOrEdit(row);
        } catch (err) {
            showError(err.message || 'Could not load document.');
        }
    }

    function openNew(onDone) {
        onDoneCb = onDone || null;
        currentId = null;
        isAdmin = isAdministrator();
        renderNew();
    }

    window.LegisCoreDocumentsModal = {
        open: open,
        openNew: openNew,
    };

})(window);
