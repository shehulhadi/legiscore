/**
 * LegisCore — pages/documents-modal.js
 * Metadata + file modal for a single document: view, edit, create,
 * delete, attach file, download.
 * Exposes window.LegisCoreDocumentsModal.
 *
 * Attach flow:
 *   - create: generate id -> upload bytes to storage -> insert row
 *   - edit:   if new file picked -> upload (upsert) -> update row
 *   - download: signed URL, expires in 1 hour
 */

(function(window) {
    'use strict';

    const docsApi    = window.LegisCoreDocumentsApi;
    const storageApi = window.LegisCoreStorageApi;
    const state      = window.LegisCoreState;

    if (!docsApi || !storageApi || !state) {
        console.error('[LegisCoreDocumentsModal] api, storage-api and state must load first.');
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
    let pickedFile = null;   // File object from the picker, or null
    let busy = false;

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

    function humanSize(bytes) {
        if (!bytes || typeof bytes !== 'number') return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function close() {
        if (backdropEl && backdropEl.parentNode) {
            backdropEl.parentNode.removeChild(backdropEl);
        }
        backdropEl = null;
        currentId = null;
        currentRow = null;
        pickedFile = null;
        busy = false;
    }

    function ensureBackdrop() {
        if (backdropEl) return backdropEl;
        backdropEl = document.createElement('div');
        backdropEl.className = 'modal-backdrop';
        backdropEl.setAttribute('role', 'presentation');
        backdropEl.addEventListener('click', function(e) {
            if (e.target === backdropEl && !busy) close();
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
        if (closeBtn) closeBtn.addEventListener('click', function() {
            if (!busy) close();
        });
    }

    function showLoading(label) {
        renderShell(label || 'Document',
            '<div class="view-loading"><div class="spinner"></div><p class="text-sm">' +
            esc(label ? label + '...' : 'Loading...') + '</p></div>',
            '');
    }

    function showError(msg) {
        busy = false;
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

    function fileSectionHtml(row) {
        const hasStored = row && row.storage_key;
        const lines = [];

        if (hasStored) {
            lines.push(
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--surface-muted);border-radius:var(--radius)">' +
                    '<div style="min-width:0">' +
                        '<div class="text-sm font-weight-medium" style="overflow:hidden;text-overflow:ellipsis">' +
                            esc(row.name || 'file') +
                        '</div>' +
                        '<div class="text-xs text-muted">' +
                            (row.mime_type ? esc(row.mime_type) + ' &middot; ' : '') +
                            esc(humanSize(row.file_size)) +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex;gap:var(--space-2)">' +
                        '<button type="button" class="btn btn-secondary btn-sm" id="doc-download">Download</button>' +
                        '<button type="button" class="btn btn-ghost btn-sm" id="doc-replace-toggle">Replace</button>' +
                    '</div>' +
                '</div>'
            );
        }

        lines.push(
            '<div id="doc-file-picker-wrap" style="' + (hasStored ? 'display:none;margin-top:var(--space-2)' : '') + '">' +
                '<input type="file" id="doc-file-input" class="form-control" ' +
                    'accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" ' +
                    'style="padding:var(--space-2)">' +
                '<div class="form-hint">Max ' + storageApi.MAX_FILE_MB + ' MB. PDF, DOCX, images, or text.</div>' +
                '<div id="doc-file-picked" class="text-sm text-muted" style="margin-top:var(--space-2)"></div>' +
            '</div>'
        );

        if (!hasStored) {
            lines.push('<div class="text-xs text-muted" style="margin-top:var(--space-2)">' +
                'No file attached yet. Pick one above and it will upload when you save.' +
            '</div>');
        }

        return lines.join('');
    }

    function formHtml(row, opts) {
        opts = opts || {};
        return (
            '<div class="form-group">' +
                '<label for="doc-name">Document name</label>' +
                '<input type="text" id="doc-name" class="form-control" ' +
                    'value="' + esc(row.name || '') + '" maxlength="200" required>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="doc-type">Type</label>' +
                    '<select id="doc-type" class="form-control">' + typeOptions(row.document_type) + '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="doc-status">Status</label>' +
                    '<select id="doc-status" class="form-control">' + statusOptions(row.status || 'verified') + '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="doc-expires">Expiry date <span class="text-muted text-xs">(optional)</span></label>' +
                '<input type="date" id="doc-expires" class="form-control" value="' + esc(toDateInput(row.expires_at)) + '">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Attached file</label>' +
                fileSectionHtml(row) +
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

    function wireFilePicker() {
        const input   = document.getElementById('doc-file-input');
        const pickedEl = document.getElementById('doc-file-picked');
        const wrap    = document.getElementById('doc-file-picker-wrap');
        const toggle  = document.getElementById('doc-replace-toggle');

        if (toggle && wrap) {
            toggle.addEventListener('click', function() {
                wrap.style.display = (wrap.style.display === 'none') ? 'block' : 'none';
            });
        }

        if (input) {
            input.addEventListener('change', function() {
                pickedFile = input.files && input.files[0] ? input.files[0] : null;
                if (pickedEl) {
                    pickedEl.textContent = pickedFile
                        ? pickedFile.name + ' — ' + humanSize(pickedFile.size)
                        : '';
                }
            });
        }

        const downloadBtn = document.getElementById('doc-download');
        if (downloadBtn && currentRow && currentRow.storage_key) {
            downloadBtn.addEventListener('click', async function() {
                downloadBtn.disabled = true;
                try {
                    const url = await storageApi.getSignedUrl(currentRow.storage_key, 3600);
                    window.open(url, '_blank');
                } catch (err) {
                    alert('Could not open file: ' + (err.message || 'unknown error'));
                } finally {
                    downloadBtn.disabled = false;
                }
            });
        }
    }

    async function saveExisting() {
        const patch = readForm();
        if (!patch.name) { alert('Name is required.'); return; }

        busy = true;
        const saveBtn = document.getElementById('doc-save');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        try {
            if (pickedFile) {
                showLoading('Uploading file');
                busy = false;
                const meta = await storageApi.uploadDocument(currentId, pickedFile);
                patch.storage_key = meta.storage_key;
                patch.mime_type   = meta.mime_type;
                patch.file_size   = meta.file_size;
                busy = true;
                showLoading('Saving');
            }
            await docsApi.update(currentId, patch);
            if (onDoneCb) onDoneCb();
            close();
        } catch (err) {
            showError(err.message || 'Could not save.');
        }
    }

    async function saveNew() {
        const patch = readForm();
        if (!patch.name) { alert('Name is required.'); return; }

        busy = true;
        const createBtn = document.getElementById('doc-create');
        if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating...'; }

        const newId = docsApi.genId();

        try {
            let fileMeta = null;
            if (pickedFile) {
                showLoading('Uploading file');
                busy = false;
                fileMeta = await storageApi.uploadDocument(newId, pickedFile);
                busy = true;
                showLoading('Creating document');
            }
            const row = Object.assign({}, patch, {
                id: newId,
                source: 'uploaded',
            }, fileMeta || {});
            await docsApi.create(row);
            if (onDoneCb) onDoneCb();
            close();
        } catch (err) {
            showError(err.message || 'Could not create.');
        }
    }

    async function doDelete() {
        if (!currentId) return;
        if (!confirm('Delete this document permanently?')) return;
        busy = true;
        try {
            if (currentRow && currentRow.storage_key) {
                try {
                    await storageApi.removeDocument(currentRow.storage_key);
                } catch (e) {
                    console.warn('[documents-modal] storage delete failed, continuing:', e);
                }
            }
            await docsApi.remove(currentId);
            if (onDoneCb) onDoneCb();
            close();
        } catch (err) {
            showError(err.message || 'Could not delete.');
        }
    }

    function renderViewOrEdit(row) {
        renderShell('Edit document', formHtml(row, {}),
            (isAdmin ? '<button class="btn btn-danger" id="doc-delete" style="margin-right:auto">Delete</button>' : '') +
            '<button class="btn btn-secondary" id="doc-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="doc-save">Save</button>'
        );
        wireFilePicker();

        const saveBtn = backdropEl.querySelector('#doc-save');
        if (saveBtn) saveBtn.addEventListener('click', saveExisting);

        const cancelBtn = backdropEl.querySelector('#doc-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', function() { if (!busy) close(); });

        const delBtn = backdropEl.querySelector('#doc-delete');
        if (delBtn) delBtn.addEventListener('click', doDelete);
    }

    function renderNew() {
        const draft = { name: '', document_type: '', status: 'verified', expires_at: null };
        renderShell('New document', formHtml(draft, {}),
            '<button class="btn btn-secondary" id="doc-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="doc-create">Create</button>'
        );
        wireFilePicker();

        const cancelBtn = backdropEl.querySelector('#doc-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', function() { if (!busy) close(); });
        const createBtn = backdropEl.querySelector('#doc-create');
        if (createBtn) createBtn.addEventListener('click', saveNew);
    }

    async function open(id, onDone) {
        if (!id) return;
        onDoneCb = onDone || null;
        currentId = id;
        pickedFile = null;
        isAdmin = isAdministrator();
        showLoading('Loading document');
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
        currentRow = null;
        pickedFile = null;
        isAdmin = isAdministrator();
        renderNew();
    }

    window.LegisCoreDocumentsModal = {
        open: open,
        openNew: openNew,
    };

})(window);
