/**
 * LegisCore — pages/documents-modal.js
 * Document modal with three modes:
 *   view  — read-only details + actions (Download, Edit, Delete)
 *   edit  — editable form with destination picker
 *   new   — create with source picker (upload / camera) + destination
 *
 * Exposes window.LegisCoreDocumentsModal.
 *
 * Destination model:
 *   Firm    — client_id null, matter_id null
 *   Client  — client_id set,  matter_id null
 *   Matter  — client_id set,  matter_id set
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
    let destinationType = 'firm';  // 'firm' | 'client' | 'matter'
    let selectedClientId = '';
    let selectedMatterId = '';
    let clientsCache = null;   // loaded lazily
    let mattersCache = null;
    let busy = false;

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

    function destinationLabel(row) {
        if (row.matter_id && row.lc_matters) {
            return 'Matter · ' + (row.lc_matters.title || row.lc_matters.matter_number || row.matter_id);
        }
        if (row.matter_id) return 'Matter · ' + row.matter_id;
        if (row.client_id && row.lc_clients) return 'Client · ' + row.lc_clients.name;
        if (row.client_id) return 'Client · ' + row.client_id;
        return 'Firm document';
    }

    function allowedExtension(name) {
        const lower = String(name || '').toLowerCase();
        const ok = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.txt'];
        return ok.some(function(ext) { return lower.endsWith(ext); });
    }

    // ---- modal plumbing -----------------------------------------------

    function close() {
        if (backdropEl && backdropEl.parentNode) backdropEl.parentNode.removeChild(backdropEl);
        backdropEl = null;
        currentId = null;
        currentRow = null;
        pickedFile = null;
        pickedSource = null;
        selectedClientId = '';
        selectedMatterId = '';
        destinationType = 'firm';
        busy = false;
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
                        '<button type="button" class="btn btn-primary btn-sm" id="dm-download">Download</button>' +
                    '</div>' +
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
                metaRow('Filed under', esc(destinationLabel(row))) +
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
    }

    // ================================================================
    // EDIT STATE
    // ================================================================

    function prepareEditState(row) {
        pickedFile = null;
        pickedSource = row.source === 'scanned' ? 'photo' : (row.storage_key ? 'upload' : null);
        if (row.matter_id) {
            destinationType = 'matter';
            selectedMatterId = row.matter_id;
            selectedClientId = row.client_id || '';
        } else if (row.client_id) {
            destinationType = 'client';
            selectedClientId = row.client_id;
            selectedMatterId = '';
        } else {
            destinationType = 'firm';
            selectedClientId = '';
            selectedMatterId = '';
        }
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

    function destinationPickerHtml() {
        const isMatter = destinationType === 'matter';
        const isClient = destinationType === 'client';
        const isFirm   = destinationType === 'firm';

        return (
            '<div class="uppercase" style="margin-bottom:var(--s-2)">Where it lives</div>' +
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
            '<div class="form-group">' +
                destinationPickerHtml() +
            '</div>' +
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
        if (destinationType === 'client') {
            clientId = selectedClientId || null;
        } else if (destinationType === 'matter') {
            clientId = selectedClientId || null;
            matterId = selectedMatterId || null;
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
    // WIRING
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
        if (!mattersCache) mattersCache = {};
        if (mattersCache[clientId]) return mattersCache[clientId];
        try {
            mattersCache[clientId] = await mattersApi.list({ client_id: clientId, limit: 200 });
        } catch (e) {
            console.warn('[documents-modal] could not load matters:', e);
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
                return '<option value="' + esc(c.id) + '"' + (c.id === selectedClientId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
            }).join('');
    }

    async function fillMatterSelect() {
        const sel = document.getElementById('dm-matter');
        if (!sel) return;
        if (!selectedClientId) {
            sel.innerHTML = '<option value="">Pick a client first</option>';
            return;
        }
        sel.innerHTML = '<option value="">Loading matters...</option>';
        const list = await loadMattersForClient(selectedClientId);
        sel.innerHTML = '<option value="">— Pick a matter —</option>' +
            list.map(function(m) {
                const label = (m.matter_number ? m.matter_number + ' · ' : '') + m.title;
                return '<option value="' + esc(m.id) + '"' + (m.id === selectedMatterId ? ' selected' : '') + '>' + esc(label) + '</option>';
            }).join('');
    }

    function refreshDestinationUI() {
        const toggle = document.getElementById('dm-dest-toggle');
        if (toggle) {
            toggle.querySelectorAll('button').forEach(function(b) {
                const active = b.getAttribute('data-dest') === destinationType;
                b.className = 'btn btn-sm ' + (active ? 'btn-primary' : 'btn-secondary');
            });
        }
        const cw = document.getElementById('dm-client-wrap');
        const mw = document.getElementById('dm-matter-wrap');
        if (cw) cw.style.display = destinationType === 'firm' ? 'none' : 'block';
        if (mw) mw.style.display = destinationType === 'matter' ? 'block' : 'none';

        if (destinationType === 'matter') fillMatterSelect();
    }

    async function wireForm(row, mode) {
        // Source buttons
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
                    pickedEl.textContent = f
                        ? f.name + ' — ' + humanSize(f.size)
                        : '';
                }
            });
        }

        // Destination toggle
        const toggle = document.getElementById('dm-dest-toggle');
        if (toggle) {
            toggle.querySelectorAll('button').forEach(function(b) {
                b.addEventListener('click', function() {
                    destinationType = b.getAttribute('data-dest');
                    if (destinationType === 'firm') {
                        selectedClientId = '';
                        selectedMatterId = '';
                    } else if (destinationType === 'client') {
                        selectedMatterId = '';
                    }
                    refreshDestinationUI();
                });
            });
        }

        const clientSel = document.getElementById('dm-client');
        if (clientSel) {
            clientSel.addEventListener('change', function() {
                selectedClientId = clientSel.value;
                selectedMatterId = '';
                if (destinationType === 'matter') fillMatterSelect();
            });
        }

        const matterSel = document.getElementById('dm-matter');
        if (matterSel) {
            matterSel.addEventListener('change', function() {
                selectedMatterId = matterSel.value;
            });
        }

        // Preload clients
        await loadClients();
        fillClientSelect();
        if (destinationType === 'matter') await fillMatterSelect();
    }

    // ================================================================
    // EDIT / NEW VIEWS
    // ================================================================

    async function renderEditView(row) {
        renderShell('Edit document', formHtml(row, { isNew: false }),
            '<button class="btn btn-secondary" id="dm-cancel">Cancel</button>' +
            '<button class="btn btn-primary" id="dm-save">Save</button>'
        );
        await wireForm(row, 'edit');
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
        await wireForm(draft, 'new');
        backdropEl.querySelector('#dm-cancel').addEventListener('click', function() {
            if (!busy) close();
        });
        backdropEl.querySelector('#dm-create').addEventListener('click', saveNew);
    }

    // ================================================================
    // SAVE HANDLERS
    // ================================================================

    function validateDestination() {
        if (destinationType === 'client' && !selectedClientId) {
            alert('Pick a client for this document.');
            return false;
        }
        if (destinationType === 'matter') {
            if (!selectedClientId) { alert('Pick a client first.'); return false; }
            if (!selectedMatterId) { alert('Pick a matter for this document.'); return false; }
        }
        return true;
    }

    async function saveExisting() {
        const patch = readForm();
        if (!patch.name) { alert('Name is required.'); return; }
        if (!validateDestination()) return;

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
        if (!validateDestination()) return;

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
                source: pickedSource === 'photo' ? 'scanned' : (pickedFile ? 'uploaded' : 'uploaded'),
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
        mattersCache = null;
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
        pickedSource = null;
        clientsCache = null;
        mattersCache = null;
        destinationType = 'firm';
        selectedClientId = '';
        selectedMatterId = '';
        isAdmin = isAdministrator();
        renderNewView();
    }

    window.LegisCoreDocumentsModal = {
        open: open,
        openNew: openNew,
    };

})(window);
