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

  window.__LegisDocsHelpers = { formHtml: formHtml, newId: newId, extOf: extOf, sniffOk: sniffOk, humanSize: humanSize, fmtDate: fmtDate, MAX_BYTES: MAX_BYTES, ALLOWED_EXT: ALLOWED_EXT, MIME_BY_EXT: MIME_BY_EXT };
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
        const path = FileStore.buildPath(user.organization_id, matterId, docId, verId, file.name);
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
          await FileStore.upload(path, file);
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

(function (window) {
  'use strict';
  const shell = window.AppShell;
  if (!shell) return;
  const esc = shell.escapeHtml;
  const H = window.__LegisDocsHelpers;

  let currentBlobUrl = null;
  function revokeBlob() {
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
  }

  async function logActivity(action, docName, docId) {
    try {
      const user = Auth.currentUser();
      await SB.rest('/lc_activities', {
        method: 'POST',
        body: {
          id: H.newId('a'),
          organization_id: user.organization_id,
          user_id: user.id,
          icon: 'file',
          text: action + ' \u201C' + docName + '\u201D',
          who: user.name,
          ref_type: 'document',
          ref_id: docId,
        },
        headers: { Prefer: 'return=minimal' },
      });
    } catch (e) { /* best effort */ }
  }

  async function detailScreen(id) {
    const docs = await SB.rest('/lc_documents', {
      query: { id: 'eq.' + id, select: '*,lc_matters(id,title)' },
    });
    if (!docs || !docs[0]) {
      return '<div class="panel"><div class="empty">Document not found, or you do not have access.</div></div>';
    }
    const d = docs[0];
    const matter = d.lc_matters || {};
    const vers = await SB.rest('/lc_document_versions', {
      query: { document_id: 'eq.' + id, select: '*', order: 'version_no.desc' },
    });
    const current = (vers || []).find(function (x) { return x.id === d.current_version_id; }) || (vers && vers[0]) || null;
    const isArchived = d.archived === true;
    const mime = current ? (current.mime_type || '') : '';
    const isPdf = mime.indexOf('pdf') !== -1;
    const isImg = mime.indexOf('image') !== -1;
    const canPrint = isPdf || isImg;

    let html = '' +
      '<div class="crumbs"><a href="#/matters">Matters</a> \u203A <a href="#/matters/' + esc(matter.id || '') + '">' + esc(matter.title || 'Matter') + '</a> \u203A ' + esc(d.name) + '</div>' +
      '<h1 class="page-title">' + esc(d.name) + '</h1>' +
      '<p class="page-sub">' +
        (current ? esc(current.original_name) + ' \u00B7 ' + H.humanSize(current.file_size) : '') +
        (isArchived ? ' \u00B7 <span class="chip">Archived</span>' : '') +
      '</p>' +
      '<div id="previewBox" class="preview"><div class="loading">Loading preview\u2026</div></div>' +
      '<div class="actions">' +
        '<button class="btn primary" id="dlBtn" type="button">Download</button>' +
        (canPrint ? '<button class="btn" id="prBtn" type="button">Print</button>' : '') +
        '<button class="btn" id="shBtn" type="button">Share</button>' +
        '<button class="btn" id="newVerBtn" type="button">Add new version</button>' +
        (Auth.isAdmin() ? '<button class="btn" id="arBtn" type="button">' + (isArchived ? 'Unarchive' : 'Archive') + '</button>' : '') +
      '</div>' +
      '<div id="actErr" class="err" hidden></div>' +
      '<section class="panel"><h2>Who can see this</h2><div id="whoBox" class="muted">Loading\u2026</div></section>' +
      '<section class="panel"><h2>Earlier versions</h2><div id="versBox" class="muted">Loading\u2026</div></section>' +
      '<section class="panel"><h2>Activity</h2><div id="actBox" class="muted">Loading\u2026</div></section>';

    return {
      html: html,
      mount: async function (el) {
        revokeBlob();
        const previewBox = el.querySelector('#previewBox');
        const errBox = el.querySelector('#actErr');
        const showErr = function (m) { errBox.textContent = m; errBox.hidden = false; };

        // Load preview
        if (current && current.storage_key) {
          try {
            const blob = await FileStore.download(current.storage_key);
            currentBlobUrl = URL.createObjectURL(blob);
            if (isPdf) {
              previewBox.innerHTML = '<iframe src="' + currentBlobUrl + '" title="Preview"></iframe>';
            } else if (isImg) {
              previewBox.innerHTML = '<img alt="Preview" src="' + currentBlobUrl + '">';
            } else {
              previewBox.innerHTML = '<div class="empty">Preview not available for this file type. Use Download to open it.</div>';
            }
          } catch (ex) {
            previewBox.innerHTML = '<div class="empty">Could not load the preview. ' + esc(ex.message || '') + '</div>';
          }
        } else {
          previewBox.innerHTML = '<div class="empty">No file for this document.</div>';
        }

        await logActivity('opened', d.name, d.id);

        // Who can see this
        (async function () {
          const whoBox = el.querySelector('#whoBox');
          try {
            const staff = await SB.rest('/lc_matter_staff', {
              query: { matter_id: 'eq.' + matter.id, select: 'user_id' },
            });
            const shares = await SB.rest('/lc_document_access', {
              query: { document_id: 'eq.' + d.id, select: 'user_id' },
            });
            const ids = {};
            (staff || []).forEach(function (r) { ids[r.user_id] = 'matter'; });
            (shares || []).forEach(function (r) { if (!ids[r.user_id]) ids[r.user_id] = 'shared'; });
            const keys = Object.keys(ids);
            if (!keys.length) {
              whoBox.innerHTML = '<div class="muted">No one is assigned to this matter yet.</div>';
              return;
            }
            const users = await SB.rest('/lc_users', {
              query: { select: 'id,name,role' },
            });
            const map = {};
            (users || []).forEach(function (u) { map[u.id] = u; });
            whoBox.innerHTML = '<div class="list">' + keys.map(function (uid) {
              const u = map[uid] || {};
              const how = ids[uid] === 'matter' ? 'Assigned to this matter' : 'This document shared with them';
              return '<div class="list-row"><div class="list-main"><div class="list-title">' + esc(u.name || uid.slice(0, 8)) + '</div><div class="list-sub">' + how + '</div></div></div>';
            }).join('') + '</div>';
          } catch (ex) {
            whoBox.innerHTML = '<div class="muted">Could not load the access list.</div>';
          }
        })();

        // Versions
        (async function () {
          const vb = el.querySelector('#versBox');
          const rows = vers || [];
          if (!rows.length) { vb.innerHTML = '<div class="muted">No versions yet.</div>'; return; }
          vb.innerHTML = '<div class="list">' + rows.map(function (r) {
            const isCur = r.id === d.current_version_id;
            const noteHtml = r.note ? '<div class="list-sub">' + esc(r.note) + '</div>' : '';
            return '<a class="list-row version-row" href="javascript:void(0)" data-ver-id="' + esc(r.id) + '">' +
              '<div class="list-main">' +
                '<div class="list-title">Version ' + r.version_no + (isCur ? ' <span class="chip small">Current</span>' : '') + '</div>' +
                '<div class="list-sub">' + esc(r.original_name) + ' \u00B7 ' + H.humanSize(r.file_size) + ' \u00B7 ' + H.fmtDate(r.uploaded_at) + '</div>' +
                noteHtml +
              '</div>' +
              '<div class="chev">\u203A</div>' +
            '</a>';
          }).join('') + '</div>';

          vb.querySelectorAll('.version-row').forEach(function (row) {
            row.addEventListener('click', async function () {
              const verId = row.getAttribute('data-ver-id');
              const v = rows.find(function (x) { return x.id === verId; });
              if (!v) return;
              vb.querySelectorAll('.version-row').forEach(function (x) { x.classList.remove('selected'); });
              row.classList.add('selected');
              previewBox.innerHTML = '<div class="loading">Loading\u2026</div>';
              revokeBlob();
              try {
                const blob = await FileStore.download(v.storage_key);
                currentBlobUrl = URL.createObjectURL(blob);
                const vmime = v.mime_type || '';
                const vIsPdf = vmime.indexOf('pdf') !== -1;
                const vIsImg = vmime.indexOf('image') !== -1;
                if (vIsPdf) previewBox.innerHTML = '<iframe src="' + currentBlobUrl + '" title="Preview"></iframe>';
                else if (vIsImg) previewBox.innerHTML = '<img alt="Preview" src="' + currentBlobUrl + '">';
                else previewBox.innerHTML = '<div class="empty">Preview not available for this file type.</div>';
              } catch (ex) {
                previewBox.innerHTML = '<div class="empty">Could not load. ' + esc(ex.message || '') + '</div>';
              }
            });
          });
        })();

        // Activity
        (async function () {
          const ab = el.querySelector('#actBox');
          try {
            const rows = await SB.rest('/lc_activities', {
              query: { ref_type: 'eq.document', ref_id: 'eq.' + d.id, select: '*', order: 'created_at.desc', limit: '30' },
            });
            if (!rows || !rows.length) { ab.innerHTML = '<div class="muted">No activity yet.</div>'; return; }
            ab.innerHTML = '<div class="list">' + rows.map(function (r) {
              return '<div class="list-row"><div class="list-main"><div class="list-title">' + esc(r.text || '') + '</div><div class="list-sub">' + esc(r.who || '') + ' \u00B7 ' + H.fmtDate(r.created_at) + '</div></div></div>';
            }).join('') + '</div>';
          } catch (ex) {
            ab.innerHTML = '<div class="muted">Could not load activity.</div>';
          }
        })();

        // Add new version
        el.querySelector('#newVerBtn').addEventListener('click', async function () {
          if (el.querySelector('#newVerPanel')) return;
          const panel = document.createElement('div');
          panel.className = 'panel';
          panel.id = 'newVerPanel';
          panel.innerHTML =
            '<h2>Add new version</h2>' +
            '<div class="hint">The old file is kept. Choose the new file and say what changed.</div>' +
            '<label for="nv_file">New file</label>' +
            '<input id="nv_file" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png">' +
            '<label for="nv_note">What changed? (optional)</label>' +
            '<input id="nv_note" type="text" placeholder="e.g. Signed copy, corrected page 3">' +
            '<div id="nvErr" class="err" hidden></div>' +
            '<div class="form-actions">' +
              '<button class="btn primary" id="nvGo" type="button">Add new version</button>' +
              '<button class="btn" id="nvCancel" type="button">Cancel</button>' +
            '</div>';
          el.insertBefore(panel, el.querySelector('.actions'));
          panel.scrollIntoView({ behavior: 'smooth', block: 'center' });

          const err = panel.querySelector('#nvErr');
          panel.querySelector('#nvCancel').addEventListener('click', function () { panel.remove(); });
          panel.querySelector('#nvGo').addEventListener('click', async function () {
            const file = panel.querySelector('#nv_file').files[0];
            const note = panel.querySelector('#nv_note').value.trim() || null;
            err.hidden = true;
            if (!file) { err.textContent = 'Choose a file.'; err.hidden = false; return; }
            try {
              const ext = H.extOf(file.name);
              if (H.ALLOWED_EXT.indexOf(ext) === -1) throw new Error('Only PDF, Word, JPG, or PNG files can be added.');
              if (file.size > H.MAX_BYTES) throw new Error('File is larger than 20 MB.');
              const okSig = await H.sniffOk(file, ext);
              if (!okSig) throw new Error('This file does not look like a real ' + ext.toUpperCase() + ' file.');

              const user = Auth.currentUser();
              const nextNo = (vers || []).reduce(function (a, r) { return Math.max(a, r.version_no || 0); }, 0) + 1;
              const verId = H.newId('v');
              const mime = H.MIME_BY_EXT[ext] || file.type || 'application/octet-stream';
              const path = FileStore.buildPath(user.organization_id, matter.id, d.id, verId, file.name);

              await SB.rest('/lc_document_versions', {
                method: 'POST',
                body: {
                  id: verId,
                  document_id: d.id,
                  version_no: nextNo,
                  storage_key: path,
                  original_name: file.name,
                  mime_type: mime,
                  file_size: file.size,
                  uploaded_by: user.id,
                  note: note,
                },
                headers: { Prefer: 'return=representation' },
              });

              try {
                await FileStore.upload(path, file);
              } catch (ex) {
                await SB.rest('/lc_document_versions', { method: 'DELETE', query: { id: 'eq.' + verId } }).catch(function(){});
                throw new Error('Could not upload the file: ' + (ex.message || 'unknown'));
              }

              await SB.rest('/lc_documents', {
                method: 'PATCH',
                query: { id: 'eq.' + d.id },
                body: { current_version_id: verId, storage_key: path, mime_type: mime, file_size: file.size },
                headers: { Prefer: 'return=representation' },
              });

              await logActivity('added a new version of', d.name, d.id);
              shell.render();
            } catch (ex) {
              err.textContent = ex.message || 'Could not add version.';
              err.hidden = false;
            }
          });
        });

        // Download
        el.querySelector('#dlBtn').addEventListener('click', async function () {
          try {
            const blob = await FileStore.download(current.storage_key);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = current.original_name || d.name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
            await logActivity('downloaded', d.name, d.id);
          } catch (ex) { showErr(ex.message || 'Could not download.'); }
        });

        // Print
        const printBtn = el.querySelector('#prBtn');
        if (printBtn) printBtn.addEventListener('click', function () {
          const w = window.open(currentBlobUrl, '_blank');
          if (!w) { showErr('Allow pop-ups to print.'); return; }
          setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 800);
          logActivity('printed', d.name, d.id);
        });

        // Archive / unarchive
        const arBtn = el.querySelector('#arBtn');
        if (arBtn) arBtn.addEventListener('click', async function () {
          const next = !isArchived;
          arBtn.disabled = true;
          try {
            await SB.rest('/lc_documents', {
              method: 'PATCH',
              query: { id: 'eq.' + d.id },
              body: { archived: next },
              headers: { Prefer: 'return=representation' },
            });
            await logActivity(next ? 'archived' : 'unarchived', d.name, d.id);
            shell.render();
          } catch (ex) { arBtn.disabled = false; showErr(ex.message || 'Could not update.'); }
        });

        // Share (inline, admins and matter staff)
        el.querySelector('#shBtn').addEventListener('click', async function () {
          const shareBox = document.createElement('div');
          shareBox.className = 'panel share-box';
          shareBox.innerHTML = '<h2>Who can see this document</h2>' +
            '<div class="hint">Pick a colleague to give access to this one document. Everyone already on the matter can see it.</div>' +
            '<select id="shareUser" class="form-select"></select>' +
            '<div id="shareMsg" class="hint"></div>' +
            '<div class="form-actions"><button class="btn primary" id="shareGo" type="button">Share</button><button class="btn" id="shareClose" type="button">Close</button></div>';
          el.insertBefore(shareBox, el.querySelector('.actions'));
          shareBox.scrollIntoView({ behavior: 'smooth', block: 'center' });

          const users = await SB.rest('/lc_users', { query: { select: 'id,name,role,active', order: 'name.asc' } });
          const staff = await SB.rest('/lc_matter_staff', { query: { matter_id: 'eq.' + matter.id, select: 'user_id' } });
          const shares = await SB.rest('/lc_document_access', { query: { document_id: 'eq.' + d.id, select: 'user_id' } });
          const seen = {};
          (staff || []).forEach(function (r) { seen[r.user_id] = 1; });
          (shares || []).forEach(function (r) { seen[r.user_id] = 1; });
          const sel = shareBox.querySelector('#shareUser');
          const options = (users || []).filter(function (u) { return u.active !== false && !seen[u.id]; });
          if (!options.length) {
            sel.innerHTML = '<option>Everyone already has access</option>';
            sel.disabled = true;
            shareBox.querySelector('#shareGo').disabled = true;
          } else {
            sel.innerHTML = options.map(function (u) {
              return '<option value="' + esc(u.id) + '">' + esc(u.name) + ' \u2014 ' + esc(u.role || '') + '</option>';
            }).join('');
          }

          shareBox.querySelector('#shareClose').addEventListener('click', function () { shareBox.remove(); });
          shareBox.querySelector('#shareGo').addEventListener('click', async function () {
            const uid = sel.value;
            if (!uid) return;
            const msg = shareBox.querySelector('#shareMsg');
            msg.textContent = 'Saving\u2026';
            try {
              const me = Auth.currentUser();
              await SB.rest('/lc_document_access', {
                method: 'POST',
                body: { document_id: d.id, user_id: uid, granted_by: me.id },
                headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
              });
              await logActivity('shared', d.name, d.id);
              msg.textContent = 'Shared.';
              shareBox.remove();
              shell.render();
            } catch (ex) { msg.textContent = ex.message || 'Could not share.'; }
          });
        });
      },
    };
  }

  shell.registerRoute('documents', async function (ctx) {
    const seg = ctx.segments;
    if (seg[1] === 'new') {
      const matterId = ctx.query.matter_id;
      if (!matterId) return '<div class="panel"><div class="empty">No matter selected.</div></div>';
      const html = await H.formHtml(matterId);
      return { html: html, mount: function (el) {
        if (el.querySelector('#docForm')) window.__LegisDocsMount(el, matterId);
      }};
    }
    return await detailScreen(seg[1]);
  });
})(window);
