// js/screens/documents.js — add, view, download, versions
(function (window) {
  'use strict';
  const shell = window.AppShell;
  if (!shell) return;
  const esc = shell.escapeHtml;

  const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

  const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
  const MIME_BY_EXT = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };

  function newId(prefix) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return prefix + '_' + hex;
  }

  function extOf(name) {
    const i = String(name).lastIndexOf('.');
    return i === -1 ? '' : String(name).slice(i + 1).toLowerCase();
  }

  async function sniffOk(file, ext) {
    const buf = await file.slice(0, 8).arrayBuffer();
    const b = new Uint8Array(buf);
    const hex = Array.from(b).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    if (ext === 'pdf') return hex.startsWith('25504446'); // %PDF
    if (ext === 'doc') return hex.startsWith('d0cf11e0a1b11ae1'); // OLE2
    if (ext === 'docx') return hex.startsWith('504b0304'); // ZIP
    if (ext === 'jpg' || ext === 'jpeg') return hex.startsWith('ffd8ff');
    if (ext === 'png') return hex.startsWith('89504e470d0a1a0a');
    return false;
  }

  function humanSize(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function fmtDate(s) {
    if (!s) return '';
    try { return new Date(s).toLocaleDateString(); } catch (e) { return s.slice(0, 10); }
  }

  async function formHtml(matterId) {
    const matters = await SB.rest('/lc_matters', {
      query: { id: 'eq.' + matterId, select: 'id,title,client_id' },
    });
    if (!matters || !matters[0]) {
      return '<div class="panel"><div class="empty">Matter not found, or you do not have access.</div></div>';
    }
    const m = matters[0];
    const labels = await SB.rest('/lc_folder_labels', {
      query: { select: 'id,name,sort_order', order: 'sort_order.asc' },
    });
    const labelOpts = (labels || []).map(function (l) {
      return '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>';
    }).join('');
    return '' +
      '<div class="crumbs"><a href="#/matters">Matters</a> › <a href="#/matters/' + esc(m.id) + '">' + esc(m.title) + '</a> › Add document</div>' +
      '<h1 class="page-title">Add document</h1>' +
      '<p class="page-sub">Choose a file and give it a short name.</p>' +
      '<form id="docForm" class="panel form">' +
        '<label for="f_name">Document name</label>' +
        '<input id="f_name" name="name" type="text" required placeholder="e.g. Tenancy agreement 2026">' +
        '<label for="f_folder">Folder</label>' +
        '<select id="f_folder" name="folder_label_id">' + labelOpts + '</select>' +
        '<label for="f_file">File</label>' +
        '<input id="f_file" name="file" type="file" required accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png">' +
        '<div class="hint">PDF, Word, JPG, or PNG. Up to 20 MB.</div>' +
        '<div id="formErr" class="err" hidden></div>' +
        '<div class="form-actions">' +
          '<button class="btn primary" type="submit" id="saveBtn">Add document</button>' +
          '<a class="btn" href="#/matters/' + esc(m.id) + '">Cancel</a>' +
        '</div>' +
      '</form>';
  }

  window.__LegisDocsHelpers = { newId: newId, extOf: extOf, sniffOk: sniffOk, humanSize: humanSize, fmtDate: fmtDate, MAX_BYTES: MAX_BYTES, ALLOWED_EXT: ALLOWED_EXT, MIME_BY_EXT: MIME_BY_EXT };
})(window);

(function (window) {
  'use strict';
  const shell = window.AppShell;
  if (!shell) return;
  const esc = shell.escapeHtml;
  const H = window.__LegisDocsHelpers;

  function mountForm(screenEl, matterId) {
    const form = screenEl.querySelector('#docForm');
    const err = screenEl.querySelector('#formErr');
    const saveBtn = screenEl.querySelector('#saveBtn');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      err.hidden = true;
      saveBtn.disabled = true;

      const fd = new FormData(form);
      const name = String(fd.get('name') || '').trim();
      const folderId = String(fd.get('folder_label_id') || '').trim() || null;
      const file = fd.get('file');
      const user = Auth.currentUser();

      try {
        if (!name) throw new Error('Give the document a name.');
        if (!file || !file.size) throw new Error('Choose a file to add.');

        const ext = H.extOf(file.name);
        if (H.ALLOWED_EXT.indexOf(ext) === -1) {
          throw new Error('Only PDF, Word, JPG, or PNG files can be added.');
        }
        if (file.size > H.MAX_BYTES) {
          throw new Error('File is larger than 20 MB.');
        }
        const okSig = await H.sniffOk(file, ext);
        if (!okSig) {
          throw new Error('This file does not look like a real ' + ext.toUpperCase() + ' file.');
        }

        const docId = H.newId('d');
        const verId = H.newId('v');
        const mime = H.MIME_BY_EXT[ext] || file.type || 'application/octet-stream';

        // 1. document row
        await SB.rest('/lc_documents', {
          method: 'POST',
          body: {
            id: docId,
            organization_id: user.organization_id,
            matter_id: matterId,
            name: name,
            folder_label_id: folderId,
            document_type: null,
            storage_key: null,
            mime_type: mime,
            file_size: file.size,
            status: 'verified',
            source: 'uploaded',
            created_by: user.id,
            updated_by: user.id,
          },
          headers: { Prefer: 'return=representation' },
        });

        // 2. version row (storage_key filled after upload)
        const path = Storage.buildPath(user.organization_id, matterId, docId, verId, file.name);
        try {
          await SB.rest('/lc_document_versions', {
            method: 'POST',
            body: {
              id: verId,
              document_id: docId,
              version_no: 1,
              storage_key: path,
              original_name: file.name,
              mime_type: mime,
              file_size: file.size,
              uploaded_by: user.id,
            },
            headers: { Prefer: 'return=representation' },
          });
        } catch (ex) {
          await SB.rest('/lc_documents', { method: 'DELETE', query: { id: 'eq.' + docId } }).catch(function(){});
          throw ex;
        }

        // 3. upload file
        try {
          await Storage.upload(path, file);
        } catch (ex) {
          await SB.rest('/lc_document_versions', { method: 'DELETE', query: { id: 'eq.' + verId } }).catch(function(){});
          await SB.rest('/lc_documents', { method: 'DELETE', query: { id: 'eq.' + docId } }).catch(function(){});
          throw new Error('Could not upload the file: ' + (ex.message || 'unknown error'));
        }

        // 4. point document at its current version + storage_key
        await SB.rest('/lc_documents', {
          method: 'PATCH',
          query: { id: 'eq.' + docId },
          body: { current_version_id: verId, storage_key: path },
          headers: { Prefer: 'return=representation' },
        });

        window.location.hash = '#/documents/' + docId;
      } catch (ex) {
        err.textContent = ex.message || 'Could not add the document.';
        err.hidden = false;
        saveBtn.disabled = false;
      }
    });
  }

  shell.registerRoute('documents', async function (ctx) {
    const seg = ctx.segments;
    if (seg[1] === 'new') {
      const matterId = ctx.query.matter_id;
      if (!matterId) return '<div class="panel"><div class="empty">No matter selected.</div></div>';
      const html = await H.formHtml(matterId);
      return { html: html, mount: function (el) {
        if (el.querySelector('#docForm')) mountForm(el, matterId);
      }};
    }
    return '<div class="panel"><div class="empty">Document view coming in 5.4c.</div></div>';
  });

  window.__LegisDocsMount = mountForm;
})(window);
