/**
 * LegisCore — pages/documents-modal.js
 * Document modal — view, edit, new.
 *
 * Destination model:
 *   Firm    — client_id null, matter_id null
 *   Client  — client_id set,  matter_id null
 *   Matter  — client_id set,  matter_id set
 *
 * The destination is context-driven — set by the page that opened the
 * modal, or by the document being edited. It appears read-only. A small
 * "Change" link reveals the picker for edge cases.
 *
 * Exposes window.LegisCoreDocumentsModal.
 */

(function(window) {
    'use strict';

    const docsApi    = window.LegisCoreDocumentsApi;
    const storageApi = window.LegisCoreStorageApi;
    const clientsApi = window.LegisCoreClientsApi;
    const mattersApi = window.LegisCoreMattersApi;
    const state      = window.LegisCoreState;

    if (!docsApi || !storageApi || !state) {
        console.error('[LegisCoreDocumentsModal] required api modules must load first.');
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
    let pickedSource = null;   // 'upload' | 'photo' | null
    let busy = false;

    // Current destination — set on open, drives readForm().
    let destination = {
        type: 'firm',
        clientId: '',
        matterId: '',
        clientName: '',
        matterName: '',
    };

    let pickerOpen = false;
    let clientsCache = null;
    let mattersCache = {};

    // ---- helpers ------------------------------------------------------

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

    function statusBadge(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'verified')     return '<span class="badge badge-success">Verified</span>';
        if (s === 'needs_review') return '<span class="badge badge-warning">Needs review</span>';
        if (s === 'expiring')     return '<span class="badge badge-danger">Expiring</span>';
        if (s === 'archived')     return '<span class="badge badge-muted">Archived</span>';
        return '<span class="badge badge-muted">' + esc(status || '—') + '</span>';
    }

    function allowedExtension(name) {
        const lower = String(name || '').toLowerCase();
        const ok = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.txt'];
        return ok.some(function(ext) { return lower.endsWith(ext); });
    }

    function destinationLine(dest) {
        dest = dest || destination;
        if (dest.type === 'matter') {
            return 'Matter · ' + (dest.matterName || dest.matterId || 'unknown');
        }
        if (dest.type === 'client') {
            return 'Client · ' + (dest.clientName || dest.clientId || 'unknown');
        }
        return 'Firm document';
    }

    // ---- modal plumbing -----------------------------------------------

    function close() {
        if (backdropEl && backdropEl.parentNode) backdropEl.parentNode.removeChild(backdropEl);
        backdropEl = null;
        currentId = null;
        currentRow = null;
        pickedFile = null;
        pickedSource = null;
        busy = false;
        pickerOpen = false;
    }

    function ensureBackdrop() {
        if (backdropEl) return backdropEl;
        backdropEl = document.createElement('div');
        backdropEl.className = 'modal-backdrop';
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
                    '<button class="topbar-icon-btn" id="dm-close" aria-label="Close">' +
                        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                    '</button>' +
                '</div>' +
                '<div class="modal-body">' + bodyHtml + '</div>' +
                (footerHtml ? '<div class="modal-footer">' + footerHtml + '</div>' : '') +
            '</div>';
        bd.querySelector('#dm-close').addEventListener('click', function() {
            if (!busy) close();
        });
    }

    function showLoading(label) {
        renderShell(label || 'Document',
            '<div class="view-loading"><div class="spinner"></div><p class="text-sm">' +
            esc(label || 'Loading...') + '</p></div>', '');
    }

    function showError(msg) {
        busy = false;
        renderShell('Error',
            '<div class="alert alert-error" style="margin:0">' + esc(msg) + '</div>',
            '<button class="btn btn-secondary" id="dm-cancel">Close</button>'
        );
        backdropEl.querySelector('#dm-cancel').addEventListener('click', close);
    }

    // ================================================================
    // VIEW MODE
    // ================================================================

    function fileBlockHtml(row) {
        if (row.storage_key) {
            return (
                '<div style="border:1px solid var(--border);border-radius:var(--r);padding:var(--s-3);background:var(--surface)">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--s-3);flex-wrap:wrap">' +
                        '<div style="min-width:0;flex:1">' +
                            '<div class="text-sm fw-500 truncate">' + esc(row.name || 'file') + '</div>' +
                            '<div class="text-xs text-muted">' +
                                (row.mime_type ? esc(row.mime_type) + ' &middot; ' : '') +
                                (row.file_size ? esc(humanSize(row.file_size)) : '') +
                            '</div>' +
                        '</div>' +
                        '<div style="display:flex;gap:var(--s-2);flex-wrap:wrap">' +
                            '<button type="button" class="btn btn-primary btn-sm" id="dm-download">Download</button>' +
                            '<button type="button" class="btn btn-secondary btn-sm" id="dm-share">Share</button>' +
                        '</div>' +
                    '</div>' +
                    '<div id="dm-preview-box" style="margin-top:var(--s-3)"></div>' +
                '</div>'
            );
        }
        return (
            '<div style="border:1px dashed var(--border);border-radius:var(--r);padding:var(--s-4);background:var(--surface-muted);text-align:center">' +
                '<div class="text-sm text-muted">No file attached yet.</div>' +
                '<div class="text-xs text-muted" style="margin-top:var(--s-1)">Click Edit to attach one.</div>' +
            '</div>'
        );
    }

    function metaRow(label, value) {
        return (
            '<div style="display:grid;grid-template-columns:110px 1fr;gap:var(--s-3);padding:var(--s-2) 0;border-bottom:1px solid var(--border-soft)">' +
                '<div class="uppercase" style="padding-top:3px">' + esc(label) + '</div>' +
                '<div class="text-sm">' + (value || '—') + '</div>' +
            '</div>'
        );
    }

    function renderDetailsView(row) {
        const headerBlock =
            '<div style="margin-bottom:var(--s-4)">' +
                '<div style="font-size:var(--fs-h3);font-weight:600;line-height:1.3">' + esc(row.name) + '</div>' +
                '<div style="display:flex;gap:var(--s-2);margin-top:var(--s-2);flex-wrap:wrap">' +
                    '<span class="badge badge-muted">' + esc(row.document_type || 'Uncategorised') + '</span>' +
                    statusBadge(row.status) +
                    (row.source === 'scanned' ? '<span class="badge badge-brass">Scanned</span>' : '') +
                '</div>' +
            '</div>';

        const fileSection =
            '<div style="margin-bottom:var(--s-4)">' +
                '<div class="uppercase" style="margin-bottom:var(--s-2)">File</div>' +
                fileBlockHtml(row) +
            '</div>';

        const detailsSection =
            '<div>' +
                '<div class="uppercase" style="margin-bottom:var(--s-2)">Where it lives</div>' +
                metaRow('Filed under', esc(destinationLine())) +
                metaRow('Added', esc(fmtDate(row.created_at, true))) +
                metaRow('Updated', esc(fmtDate(row.updated_at, true))) +
                metaRow('Expires', row.expires_at ? esc(fmtDate(row.expires_at)) : 'No expiry set') +
            '</div>';

        const footer =
            (isAdmin ? '<button class="btn btn-danger-ghost btn-sm" id="dm-delete">Delete</button>' : '') +
            '<div style="flex:1"></div>' +
            '<button class="btn btn-secondary" id="dm-close2">Close</button>' +
            '<button class="btn btn-primary" id="dm-edit">Edit</button>';

        renderShell('Document details', headerBlock + fileSection + detailsSection, footer);

        if (row.storage_key) {
            const modal = backdropEl.querySelector('.modal');
            if (modal) modal.style.maxWidth = '860px';
            loadPreview(row);
        }

        backdropEl.querySelector('#dm-close2').addEventListener('click', function() { if (!busy) close(); });
        backdropEl.querySelector('#dm-edit').addEventListener('click', function() {
            prepareEditState(currentRow);
            renderEditView(currentRow);
        });

        const delBtn = backdropEl.querySelector('#dm-delete');
        if (delBtn) delBtn.addEventListener('click', doDelete);

        const dlBtn = backdropEl.querySelector('#dm-download');
        if (dlBtn) dlBtn.addEventListener('click', function() {
            dlBtn.disabled = true;
            dlBtn.textContent = 'Opening...';
            storageApi.getSignedUrl(row.storage_key, 3600)
                .then(function(url) { window.open(url, '_blank'); })
                .catch(function(err) { alert('Could not open file: ' + (err.message || 'unknown error')); })
                .finally(function() { dlBtn.disabled = false; dlBtn.textContent = 'Download'; });
        });

        const shBtn = backdropEl.querySelector('#dm-share');
        if (shBtn) shBtn.addEventListener('click', function() {
            shareDocument(row, shBtn);
        });
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                return ok;
            } catch (e) {
                return false;
            }
        }
    }

    async function shareDocument(row, btn) {
        if (!row || !row.storage_key) return;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Preparing...';

        try {
            const url = await storageApi.getSignedUrl(row.storage_key, 3600);
            const title = row.name || 'LegisCore document';
            const text = 'LegisCore document: ' + title;

            if (navigator.share) {
                try {
                    await navigator.share({ title: title, text: text, url: url });
                } catch (shareErr) {
                    // User cancelled the share sheet — silent, no error
                    if (shareErr && shareErr.name !== 'AbortError') throw shareErr;
                }
            } else {
                const ok = await copyToClipboard(url);
                alert(ok
                    ? 'Link copied to clipboard.\n\nIt expires in 1 hour.'
                    : 'Could not share automatically. Please use Download instead.');
            }
        } catch (err) {
            console.error('[documents-modal] share failed:', err);
            alert('Could not prepare the link: ' + (err.message || 'unknown error'));
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    async function loadPreview(row) {
        const box = document.getElementById('dm-preview-box');
        if (!box || !row || !row.storage_key) return;

        box.innerHTML = '<div style="padding:var(--s-4);text-align:center"><div class="spinner" style="margin:0 auto"></div></div>';

        try {
            const url = await storageApi.getSignedUrl(row.storage_key, 3600);
            const mime = String(row.mime_type || '').toLowerCase();
            const name = String(row.name || '').toLowerCase();
            const isPdf = mime.includes('pdf') || name.endsWith('.pdf');
            const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic)$/.test(name);

            if (isPdf) {
                box.innerHTML =
                    '<iframe src="' + esc(url) + '" ' +
                    'style="width:100%;height:min(70vh,720px);border:1px solid var(--border);border-radius:var(--r);background:#fff;display:block"></iframe>' +
                    '<div style="margin-top:var(--s-2);text-align:right">' +
                        '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="text-xs text-muted">Open in new tab</a>' +
                    '</div>';
            } else if (isImage) {
                box.innerHTML =
                    '<img src="' + esc(url) + '" alt="' + esc(row.name) + '" ' +
                    'style="max-width:100%;max-height:70vh;border-radius:var(--r);display:block;margin:0 auto;border:1px solid var(--border)">';
            } else {
                box.innerHTML =
                    '<div style="padding:var(--s-4);text-align:center;background:var(--surface-muted);border-radius:var(--r)">' +
                        '<div class="text-sm text-muted">No preview for this file type. Download to open it.</div>' +
                    '</div>';
            }
        } catch (err) {
            box.innerHTML =
                '<div class="alert alert-error" style="margin:0">Could not load preview.</div>';
        }
    }

    // ================================================================
    // DESTINATION STATE
    // ================================================================

    function resetDestination() {
        destination = { type: 'firm', clientId: '', matterId: '', clientName: '', matterName: '' };
        pickerOpen = false;
    }

    async function setDestinationFromPreset(preset) {
        preset = preset || {};
        if (preset.matterId) {
            destination.type = 'matter';
            destination.matterId = preset.matterId;
            destination.clientId = preset.clientId || '';
        } else if (preset.clientId) {
            destination.type = 'client';
            destination.clientId = preset.clientId;
            destination.matterId = '';
        } else {
            destination.type = 'firm';
            destination.clientId = '';
            destination.matterId = '';
        }
        await hydrateNames();
    }

    async function hydrateNames() {
        // Matter name
        if (destination.matterId && !destination.matterName) {
            try {
                const m = await mattersApi.get(destination.matterId);
                destination.matterName = m.title || m.matter_number || destination.matterId;
                if (m.client_id && !destination.clientId) {
                    destination.clientId = m.client_id;
                }
            } catch (_) { destination.matterName = destination.matterId; }
        }
        // Client name
        if (destination.clientId && !destination.clientName) {
            try {
                const c = await clientsApi.get(destination.clientId);
                destination.clientName = c.name || destination.clientId;
            } catch (_) { destination.clientName = destination.clientId; }
        }
    }

    function prepareEditState(row) {
        pickedFile = null;
        pickedSource = row.source === 'scanned' ? 'photo' : (row.storage_key ? 'upload' : null);

        // Backfill client_id from embedded matter if the doc has a matter
        // but no explicit client (older docs created before destinations).
        const resolvedClientId = row.client_id
            || (row.lc_matters && row.lc_matters.client_id)
            || '';

        if (row.matter_id) {
            destination = {
                type: 'matter',
                clientId: resolvedClientId,
                matterId: row.matter_id,
                clientName: (row.lc_clients && row.lc_clients.name) || '',
                matterName: (row.lc_matters && row.lc_matters.title) || '',
            };
        } else if (row.client_id) {
            destination = {
                type: 'client',
                clientId: row.client_id,
                matterId: '',
                clientName: (row.lc_clients && row.lc_clients.name) || '',
                matterName: '',
            };
        } else {
            resetDestination();
        }
        pickerOpen = false;
    }

    // ================================================================
    // FORM MARKUP
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
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function sourcePickerHtml(row, isNew) {
        const hasFile = row && row.storage_key;
        if (hasFile && !isNew) {
            return (
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--s-3);padding:var(--s-3);background:var(--surface-muted);border-radius:var(--r)">' +
                    '<div style="min-width:0">' +
                        '<div class="text-sm fw-500">Current file</div>' +
                        '<div class="text-xs text-muted">' +
                            (row.mime_type ? esc(row.mime_type) + ' &middot; ' : '') +
                            (row.file_size ? esc(humanSize(row.file_size)) : '') +
                        '</div>' +
                    '</div>' +
                    '<button type="button" class="btn btn-secondary btn-sm" id="dm-replace">Replace</button>' +
                '</div>' +
                '<div id="dm-source-wrap" style="display:none;margin-top:var(--s-3)">' +
                    sourceButtonsHtml() +
                '</div>'
            );
        }
        return '<div id="dm-source-wrap">' + sourceButtonsHtml() + '</div>';
    }

    function sourceButtonsHtml() {
        return (
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s-3)">' +
                '<button type="button" class="btn btn-secondary" id="dm-src-upload" style="height:56px;justify-content:flex-start;padding:0 var(--s-4)">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
                    '<span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;margin-left:var(--s-2)">' +
                        '<span class="fw-500">Upload a file</span>' +
                        '<span class="text-xs text-muted">PDF, Word, image</span>' +
                    '</span>' +
                '</button>' +
                '<button type="button" class="btn btn-secondary" id="dm-src-photo" style="height:56px;justify-content:flex-start;padding:0 var(--s-4)">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
                    '<span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;margin-left:var(--s-2)">' +
                        '<span class="fw-500">Take a photo</span>' +
                        '<span class="text-xs text-muted">Opens your camera</span>' +
                    '</span>' +
                '</button>' +
            '</div>' +
            '<input type="file" id="dm-file" style="display:none">' +
            '<div id="dm-picked" class="text-sm text-muted" style="margin-top:var(--s-2)"></div>'
        );
    }

    function destinationBlockHtml() {
        return (
            '<div class="form-group">' +
                '<div class="uppercase" style="margin-bottom:var(--s-2)">Where it lives</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--s-3);padding:var(--s-3) var(--s-4);background:var(--surface-muted);border-radius:var(--r)">' +
                    '<div style="display:flex;align-items:center;gap:var(--s-2);min-width:0">' +
                        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--text-muted)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                        '<span class="text-sm fw-500 truncate" id="dm-dest-line">' + esc(destinationLine()) + '</span>' +
                    '</div>' +
                    '<button type="button" class="btn btn-ghost btn-sm" id="dm-dest-change" style="flex-shrink:0">Change</button>' +
                '</div>' +
                '<div id="dm-dest-picker" style="display:none;margin-top:var(--s-3)">' + pickerHtml() + '</div>' +
            '</div>'
        );
    }

    function pickerHtml() {
        const isMatter = destination.type === 'matter';
        const isClient = destination.type === 'client';
        const isFirm   = destination.type === 'firm';

        return (
            '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:var(--s-2)" id="dm-dest-toggle">' +
                '<button type="button" class="btn btn-sm' + (isFirm ? ' btn-primary' : ' btn-secondary') + '" data-dest="firm">Firm</button>' +
                '<button type="button" class="btn btn-sm' + (isClient ? ' btn-primary' : ' btn-secondary') + '" data-dest="client">Client</button>' +
                '<button type="button" class="btn btn-sm' + (isMatter ? ' btn-primary' : ' btn-secondary') + '" data-dest="matter">Matter</button>' +
            '</div>' +
            '<div style="margin-top:var(--s-3);display:' + (isFirm ? 'none' : 'block') + '" id="dm-client-wrap">' +
                '<label for="dm-client" class="text-sm fw-500" style="display:block;margin-bottom:var(--s-1)">Client</label>' +
                '<select id="dm-client" class="form-control"><option value="">Loading clients...</option></select>' +
            '</div>' +
            '<div style="margin-top:var(--s-3);display:' + (isMatter ? 'block' : 'none') + '" id="dm-matter-wrap">' +
                '<label for="dm-matter" class="text-sm fw-500" style="display:block;margin-bottom:var(--s-1)">Matter</label>' +
                '<select id="dm-matter" class="form-control"><option value="">Pick a client first</option></select>' +
            '</div>'
        );
    }

    function formHtml(row, opts) {
        opts = opts || {};
        const isNew = !!opts.isNew;

        return (
            '<div class="form-group">' +
                '<label>Source</label>' +
                sourcePickerHtml(row, isNew) +
            '</div>' +
            '<hr class="form-divider">' +
            destinationBlockHtml() +
            '<hr class="form-divider">' +
            '<div class="form-group">' +
                '<label for="dm-name">Document name</label>' +
                '<input type="text" id="dm-name" class="form-control" value="' + esc(row.name || '') + '" maxlength="200" required>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label for="dm-type">Type</label>' +
                    '<select id="dm-type" class="form-control">' + typeOptions(row.document_type) + '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label for="dm-status">Status</label>' +
                    '<select id="dm-status" class="form-control">' + statusOptions(row.status || 'verified') + '</select>' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="dm-expires">Expiry date <span class="text-muted text-xs">(optional)</span></label>' +
                '<input type="date" id="dm-expires" class="form-control" value="' + esc(toDateInput(row.expires_at)) + '">' +
            '</div>'
        );
    }

    function readForm() {
        const val = function(id) {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };
        const exp = val('dm-expires');

        let clientId = null;
        let matterId = null;
        if (destination.type === 'client') {
            clientId = destination.clientId || null;
        } else if (destination.type === 'matter') {
            clientId = destination.clientId || null;
            matterId = destination.matterId || null;
        }

        return {
            name: val('dm-name').trim(),
            document_type: val('dm-type') || null,
            status: val('dm-status') || 'verified',
            expires_at: exp ? new Date(exp + 'T00:00:00Z').toISOString() : null,
            client_id: clientId,
            matter_id: matterId,
        };
    }

    // ================================================================
    // PICKER WIRING (only runs when Change is expanded)
    // ================================================================

    async function loadClients() {
        if (clientsCache) return clientsCache;
        try {
            clientsCache = await clientsApi.list({ limit: 200 });
        } catch (e) {
            console.warn('[documents-modal] could not load clients:', e);
            clientsCache = [];
        }
        return clientsCache;
    }

    async function loadMattersForClient(clientId) {
        if (mattersCache[clientId]) return mattersCache[clientId];
        try {
            mattersCache[clientId] = await mattersApi.list({ client_id: clientId, limit: 200 });
        } catch (e) {
            mattersCache[clientId] = [];
        }
        return mattersCache[clientId];
    }

    function fillClientSelect() {
        const sel = document.getElementById('dm-client');
        if (!sel) return;
        const list = clientsCache || [];
        sel.innerHTML = '<option value="">— Pick a client —</option>' +
            list.map(function(c) {
                return '<option value="' + esc(c.id) + '"' + (c.id === destination.clientId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
            }).join('');
    }

    async function fillMatterSelect() {
        const sel = document.getElementById('dm-matter');
        if (!sel) return;
        if (!destination.clientId) {
            sel.innerHTML = '<option value="">Pick a client first</option>';
            return;
        }
        sel.innerHTML = '<option value="">Loading matters...</option>';
        const list = await loadMattersForClient(destination.clientId);
        sel.innerHTML = '<option value="">— Pick a matter —</option>' +
            list.map(function(m) {
                const label = (m.matter_number ? m.matter_number + ' · ' : '') + m.title;
                return '<option value="' + esc(m.id) + '"' + (m.id === destination.matterId ? ' selected' : '') + '>' + esc(label) + '</option>';
            }).join('');
    }

    async function showPicker() {
        pickerOpen = true;
        const wrap = document.getElementById('dm-dest-picker');
        if (wrap) wrap.style.display = 'block';
        await loadClients();
        fillClientSelect();
        if (destination.type === 'matter') await fillMatterSelect();
        wirePickerEvents();
    }

    function updateDestinationLine() {
        const line = document.getElementById('dm-dest-line');
        if (line) line.textContent = destinationLine();
    }

    function refreshPickerToggle() {
        const toggle = document.getElementById('dm-dest-toggle');
        if (!toggle) return;
        toggle.querySelectorAll('button').forEach(function(b) {
            const active = b.getAttribute('data-dest') === destination.type;
            b.className = 'btn btn-sm ' + (active ? 'btn-primary' : 'btn-secondary');
        });
        const cw = document.getElementById('dm-client-wrap');
        const mw = document.getElementById('dm-matter-wrap');
        if (cw) cw.style.display = destination.type === 'firm' ? 'none' : 'block';
        if (mw) mw.style.display = destination.type === 'matter' ? 'block' : 'none';
    }

    function wirePickerEvents() {
        const toggle = document.getElementById('dm-dest-toggle');
        if (toggle) {
            toggle.querySelectorAll('button').forEach(function(b) {
                b.addEventListener('click', async function() {
                    destination.type = b.getAttribute('data-dest');
                    if (destination.type === 'firm') {
                        destination.clientId = '';
                        destination.matterId = '';
                        destination.clientName = '';
                        destination.matterName = '';
                    } else if (destination.type === 'client') {
                        destination.matterId = '';
                        destination.matterName = '';
                    }
                    refreshPickerToggle();
                    if (destination.type === 'matter') await fillMatterSelect();
                    updateDestinationLine();
                });
            });
        }

        const clientSel = document.getElementById('dm-client');
        if (clientSel) {
            clientSel.addEventListener('change', async function() {
                destination.clientId = clientSel.value;
                const opt = clientSel.options[clientSel.selectedIndex];
                destination.clientName = opt ? opt.textContent.replace(/^—\s*|\s*—$/g, '') : '';
                destination.matterId = '';
                destination.matterName = '';
                if (destination.type === 'matter') await fillMatterSelect();
                updateDestinationLine();
            });
        }

        const matterSel = document.getElementById('dm-matter');
        if (matterSel) {
            matterSel.addEventListener('change', function() {
                destination.matterId = matterSel.value;
                const opt = matterSel.options[matterSel.selectedIndex];
                destination.matterName = opt ? opt.textContent : '';
                updateDestinationLine();
            });
        }
    }

    // ================================================================
    // SOURCE WIRING
    // ================================================================

    function wireSource() {
        const srcUpload = document.getElementById('dm-src-upload');
        const srcPhoto  = document.getElementById('dm-src-photo');
        const fileInput = document.getElementById('dm-file');
        const pickedEl  = document.getElementById('dm-picked');
        const replaceBtn = document.getElementById('dm-replace');
        const sourceWrap = document.getElementById('dm-source-wrap');

        if (replaceBtn && sourceWrap) {
            replaceBtn.addEventListener('click', function() {
                sourceWrap.style.display = 'block';
                replaceBtn.style.display = 'none';
            });
        }

        function pickFile(mode) {
            pickedSource = mode;
            if (mode === 'photo') {
                fileInput.setAttribute('accept', 'image/*');
                fileInput.setAttribute('capture', 'environment');
            } else {
                fileInput.removeAttribute('accept');
                fileInput.removeAttribute('capture');
            }
            fileInput.click();
        }

        if (srcUpload) srcUpload.addEventListener('click', function() { pickFile('upload'); });
        if (srcPhoto)  srcPhoto.addEventListener('click',  function() { pickFile('photo'); });

        if (fileInput) {
            fileInput.addEventListener('change', function() {
                const f = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
                if (f && !allowedExtension(f.name)) {
                    alert('Only PDF, Word (.doc/.docx), image, or .txt files are allowed.');
                    fileInput.value = '';
                    pickedFile = null;
                    if (pickedEl) pickedEl.textContent = '';
                    return;
                }
                pickedFile = f;
                if (pickedEl) {
                    pickedEl.textContent = f ? f.name + ' — ' + humanSize(f.size) : '';
                }
            });
        }
    }

    // ================================================================
    // EDIT / NEW VIEWS
    // ================================================================

    async function renderEditView(row) {
        renderShell('Edit document', formHtml(row, { isNew: false }),
            '<button class="btn btn-secondary" id="dm-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="dm-save">Save</button>'
        );
        wireSource();

        const changeBtn = document.getElementById('dm-dest-change');
        if (changeBtn) changeBtn.addEventListener('click', function() {
            if (pickerOpen) return;
            showPicker();
        });

        backdropEl.querySelector('#dm-cancel').addEventListener('click', function() {
            if (!busy) renderDetailsView(currentRow);
        });
        backdropEl.querySelector('#dm-save').addEventListener('click', saveExisting);
    }

    async function renderNewView() {
        const draft = { name: '', document_type: '', status: 'verified', expires_at: null };
        renderShell('Add document', formHtml(draft, { isNew: true }),
            '<button class="btn btn-secondary" id="dm-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="dm-create">Add document</button>'
        );
        wireSource();

        const changeBtn = document.getElementById('dm-dest-change');
        if (changeBtn) changeBtn.addEventListener('click', function() {
            if (pickerOpen) return;
            showPicker();
        });

        backdropEl.querySelector('#dm-cancel').addEventListener('click', function() {
            if (!busy) close();
        });
        backdropEl.querySelector('#dm-create').addEventListener('click', saveNew);
    }

    // ================================================================
    // SAVE HANDLERS
    // ================================================================

    async function saveExisting() {
        const patch = readForm();
        if (!patch.name) { alert('Name is required.'); return; }

        busy = true;
        const saveBtn = document.getElementById('dm-save');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        try {
            if (pickedFile) {
                showLoading('Uploading file...');
                busy = false;
                const meta = await storageApi.uploadDocument(currentId, pickedFile);
                patch.storage_key = meta.storage_key;
                patch.mime_type   = meta.mime_type;
                patch.file_size   = meta.file_size;
                if (pickedSource === 'photo') patch.source = 'scanned';
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
        const createBtn = document.getElementById('dm-create');
        if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating...'; }

        const newId = docsApi.genId();

        try {
            let fileMeta = null;
            if (pickedFile) {
                showLoading('Uploading file...');
                busy = false;
                fileMeta = await storageApi.uploadDocument(newId, pickedFile);
                busy = true;
                showLoading('Adding document...');
            }
            const row = Object.assign({}, patch, {
                id: newId,
                source: pickedSource === 'photo' ? 'scanned' : 'uploaded',
            }, fileMeta || {});
            await docsApi.create(row);
            if (onDoneCb) onDoneCb();
            close();
        } catch (err) {
            showError(err.message || 'Could not add document.');
        }
    }

    async function doDelete() {
        if (!currentId) return;
        if (!confirm('Delete this document permanently?')) return;
        busy = true;
        try {
            if (currentRow && currentRow.storage_key) {
                try { await storageApi.removeDocument(currentRow.storage_key); }
                catch (e) { console.warn('[documents-modal] storage delete failed:', e); }
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
        pickedSource = null;
        clientsCache = null;
        mattersCache = {};
        isAdmin = isAdministrator();
        showLoading('Loading...');
        try {
            const row = await docsApi.get(id);
            // Backfill client_id from embedded matter when the doc has a
            // matter but no explicit client link (legacy rows).
            if (row && row.matter_id && !row.client_id
                && row.lc_matters && row.lc_matters.client_id) {
                row.client_id = row.lc_matters.client_id;
            }
            currentRow = row;
            prepareEditState(row);
            await hydrateNames();
            renderDetailsView(row);
        } catch (err) {
            showError(err.message || 'Could not load document.');
        }
    }

    async function openNew(onDone, preset) {
        onDoneCb = onDone || null;
        currentId = null;
        currentRow = null;
        pickedFile = null;
        pickedSource = null;
        clientsCache = null;
        mattersCache = {};
        resetDestination();
        isAdmin = isAdministrator();
        renderNewView();
        try {
            await setDestinationFromPreset(preset || {});
            updateDestinationLine();
        } catch (e) {
            console.warn('[documents-modal] preset failed:', e);
        }
    }

    window.LegisCoreDocumentsModal = {
        open: open,
        openNew: openNew,
    };

})(window);
