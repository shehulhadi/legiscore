/**
 * LegisCore — pages/documents-modal.js
 * Document modal with three modes:
 *   view  — read-only details + actions (Download, Edit, Delete)
 *   edit  — editable form (also handles replace-file upload)
 *   new   — create a fresh document (optionally with a file)
 *
 * Entry points:
 *   open(id, onDone)   -> starts in view mode
 *   openNew(onDone)    -> create mode
 *
 * Exposes window.LegisCoreDocumentsModal.
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
    let pickedFile = null;
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

    function fmtDate(iso, withTime) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        const opts = { day: 'numeric', month: 'short', year: 'numeric' };
        if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
        return d.toLocaleDateString(undefined, opts);
    }

    function typeLabel(t) {
        return t || 'Uncategorised';
    }

    function statusBadge(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'verified')     return '<span class="badge badge-success">Verified</span>';
        if (s === 'needs_review') return '<span class="badge badge-warning">Needs review</span>';
        if (s === 'expiring')     return '<span class="badge badge-danger">Expiring</span>';
        if (s === 'archived')     return '<span class="badge badge-muted">Archived</span>';
        return '<span class="badge badge-muted">' + esc(status || '—') + '</span>';
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
                (footerHtml ? '<div class="modal-footer">' + footerHtml + '</div>' : '') +
            '</div>';

        const closeBtn = bd.querySelector('#doc-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', function() {
            if (!busy) close();
        });
    }

    function showLoading(label) {
        renderShell(label || 'Document',
            '<div class="view-loading"><div class="spinner"></div><p class="text-sm">' +
            esc(label || 'Loading...') + '</p></div>',
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

    // ================================================================
    // VIEW MODE
    // ================================================================

    function fileBlockHtml(row) {
        if (row.storage_key) {
            return (
                '<div style="border:1px solid var(--border-soft);border-radius:var(--radius);padding:var(--space-3);background:var(--surface)">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);flex-wrap:wrap">' +
                        '<div style="min-width:0;flex:1">' +
                            '<div class="text-sm font-weight-medium" style="overflow:hidden;text-overflow:ellipsis">' +
                                esc(row.name || 'file') +
                            '</div>' +
                            '<div class="text-xs text-muted">' +
                                (row.mime_type ? esc(row.mime_type) + ' &middot; ' : '') +
                                (row.file_size ? esc(humanSize(row.file_size)) : '') +
                            '</div>' +
                        '</div>' +
                        '<button type="button" class="btn btn-primary btn-sm" id="doc-download">Download</button>' +
                    '</div>' +
                '</div>'
            );
        }
        return (
            '<div style="border:1px dashed var(--border);border-radius:var(--radius);padding:var(--space-4);background:var(--surface-muted);text-align:center">' +
                '<div class="text-sm text-muted">No file attached yet.</div>' +
                '<div class="text-xs text-muted" style="margin-top:var(--space-1)">Click Edit to attach one.</div>' +
            '</div>'
        );
    }

    function metaRow(label, value) {
        return (
            '<div style="display:grid;grid-template-columns:120px 1fr;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--border-soft)">' +
                '<div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.05em;font-weight:600;padding-top:2px">' + esc(label) + '</div>' +
                '<div class="text-sm">' + (value || '—') + '</div>' +
            '</div>'
        );
    }

    function renderDetailsView(row) {
        const matter = row.lc_matters
            ? (row.lc_matters.matter_number
                ? row.lc_matters.matter_number + ' — ' + row.lc_matters.title
                : row.lc_matters.title)
            : null;
        const client = row.lc_clients ? row.lc_clients.name : null;

        const headerBlock =
            '<div style="margin-bottom:var(--space-4)">' +
                '<div style="font-size:var(--fs-lg);font-weight:600;line-height:1.3">' + esc(row.name) + '</div>' +
                '<div style="display:flex;gap:var(--space-2);margin-top:var(--space-2);flex-wrap:wrap">' +
                    '<span class="badge badge-muted">' + esc(typeLabel(row.document_type)) + '</span>' +
                    statusBadge(row.status) +
                '</div>' +
            '</div>';

        const fileSection =
            '<div style="margin-bottom:var(--space-4)">' +
                '<div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:var(--space-2)">File</div>' +
                fileBlockHtml(row) +
            '</div>';

        const detailsSection =
            '<div style="margin-bottom:var(--space-2)">' +
                '<div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.05em;font-weight:600;margin-bottom:var(--space-2)">Details</div>' +
                metaRow('Matter', matter ? esc(matter) : null) +
                metaRow('Client', client ? esc(client) : null) +
                metaRow('Source',  row.source ? esc(row.source) : null) +
                (row.page_count ? metaRow('Pages', esc(row.page_count)) : '') +
                metaRow('Created', fmtDate(row.created_at, true)) +
                metaRow('Updated', fmtDate(row.updated_at, true)) +
                metaRow('Expires', row.expires_at ? fmtDate(row.expires_at) : 'No expiry set') +
            '</div>';

        const footer =
            (isAdmin ? '<button class="btn btn-ghost btn-sm" id="doc-delete" style="color:var(--danger)">Delete</button>' : '') +
            '<div style="flex:1"></div>' +
            '<button class="btn btn-secondary" id="doc-close">Close</button>' +
            '<button class="btn btn-primary" id="doc-edit">Edit</button>';

        renderShell('Document details', headerBlock + fileSection + detailsSection, footer);

        const closeBtn = backdropEl.querySelector('#doc-close');
        if (closeBtn) closeBtn.addEventListener('click', function() { if (!busy) close(); });

        const editBtn = backdropEl.querySelector('#doc-edit');
        if (editBtn) editBtn.addEventListener('click', function() { renderEditView(currentRow); });

        const delBtn = backdropEl.querySelector('#doc-delete');
        if (delBtn) delBtn.addEventListener('click', doDelete);

        const dlBtn = backdropEl.querySelector('#doc-download');
        if (dlBtn) dlBtn.addEventListener('click', function() {
            dlBtn.disabled = true;
            dlBtn.textContent = 'Opening...';
            storageApi.getSignedUrl(row.storage_key, 3600).then(function(url) {
                window.open(url, '_blank');
            }).catch(function(err) {
                alert('Could not open file: ' + (err.message || 'unknown error'));
            }).finally(function() {
                dlBtn.disabled = false;
                dlBtn.textContent = 'Download';
            });
        });
    }

    // ================================================================
    // EDIT MODE
    // ================================================================

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

    function editFileSectionHtml(row) {
        const hasStored = row && row.storage_key;
        let html = '';
        if (hasStored) {
            html +=
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--surface-muted);border-radius:var(--radius)">' +
                    '<div style="min-width:0">' +
                        '<div class="text-sm font-weight-medium">Current file</div>' +
                        '<div class="text-xs text-muted">' +
                            (row.mime_type ? esc(row.mime_type) + ' &middot; ' : '') +
                            (row.file_size ? esc(humanSize(row.file_size)) : '') +
                        '</div>' +
                    '</div>' +
                    '<button type="button" class="btn btn-secondary btn-sm" id="doc-replace-toggle">Replace</button>' +
                '</div>';
        }
        html +=
            '<div id="doc-file-picker-wrap" style="' + (hasStored ? 'display:none;margin-top:var(--space-2)' : '') + '">' +
                '<input type="file" id="doc-file-input" class="form-control" ' +
                    'accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" style="padding:var(--space-2)">' +
                '<div class="form-hint">Max ' + storageApi.MAX_FILE_MB + ' MB. PDF, DOCX, images, or text.</div>' +
                '<div id="doc-file-picked" class="text-sm text-muted" style="margin-top:var(--space-2)"></div>' +
            '</div>';
        return html;
    }

    function editFormHtml(row) {
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
                '<label>File</label>' +
                editFileSectionHtml(row) +
            '</div>'
        );
    }

    function wireEditFilePicker() {
        const input    = document.getElementById('doc-file-input');
        const pickedEl = document.getElementById('doc-file-picked');
        const wrap     = document.getElementById('doc-file-picker-wrap');
        const toggle   = document.getElementById('doc-replace-toggle');

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
    }

    function readForm() {
        const name   = (document.getElementById('doc-name')   || {}).value || '';
        const type   = (document.getElementById('doc-type')   || {}).value || '';
        const status = (document.getElementById('doc-status') || {}).value || 'verified';
        const exp    = (document.getElementById('doc-expires')|| {}).value || '';
        return {
            name: name.trim(),
            document_type: type || null,
            status: status,
            expires_at: exp ? new Date(exp + 'T00:00:00Z').toISOString() : null,
        };
    }

    function renderEditView(row) {
        renderShell('Edit document', editFormHtml(row),
            '<button class="btn btn-secondary" id="doc-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="doc-save">Save</button>'
        );
        wireEditFilePicker();

        const saveBtn = backdropEl.querySelector('#doc-save');
        if (saveBtn) saveBtn.addEventListener('click', saveExisting);

        const cancelBtn = backdropEl.querySelector('#doc-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', function() {
            if (!busy) renderDetailsView(currentRow);  // back to view
        });
    }

    // ================================================================
    // NEW MODE
    // ================================================================

    function renderNewView() {
        const draft = { name: '', document_type: '', status: 'verified', expires_at: null };
        renderShell('New document', editFormHtml(draft),
            '<button class="btn btn-secondary" id="doc-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="doc-create">Create</button>'
        );
        wireEditFilePicker();

        const cancelBtn = backdropEl.querySelector('#doc-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', function() { if (!busy) close(); });
        const createBtn = backdropEl.querySelector('#doc-create');
        if (createBtn) createBtn.addEventListener('click', saveNew);
    }

    // ================================================================
    // ACTIONS
    // ================================================================

    async function saveExisting() {
        const patch = readForm();
        if (!patch.name) { alert('Name is required.'); return; }

        busy = true;
        const saveBtn = document.getElementById('doc-save');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        try {
            if (pickedFile) {
                showLoading('Uploading file...');
                busy = false;
                const meta = await storageApi.uploadDocument(currentId, pickedFile);
                patch.storage_key = meta.storage_key;
                patch.mime_type   = meta.mime_type;
                patch.file_size   = meta.file_size;
                busy = true;
                showLoading('Saving...');
            }
            const updated = await docsApi.update(currentId, patch);
            currentRow = updated || Object.assign({}, currentRow, patch);
            pickedFile = null;
            busy = false;
            renderDetailsView(currentRow);
            if (onDoneCb) onDoneCb();
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
                showLoading('Uploading file...');
                busy = false;
                fileMeta = await storageApi.uploadDocument(newId, pickedFile);
                busy = true;
                showLoading('Creating document...');
            }
            const row = Object.assign({}, patch, { id: newId, source: 'uploaded' }, fileMeta || {});
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

    // ================================================================
    // ENTRY POINTS
    // ================================================================

    async function open(id, onDone) {
        if (!id) return;
        onDoneCb = onDone || null;
        currentId = id;
        pickedFile = null;
        isAdmin = isAdministrator();
        showLoading('Loading...');
        try {
            const row = await docsApi.get(id);
            currentRow = row;
            renderDetailsView(row);
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
        renderNewView();
    }

    window.LegisCoreDocumentsModal = {
        open: open,
        openNew: openNew,
    };

})(window);
