// js/screens/matters.js — list, new, edit, detail + staff assignment
(function (window) {
  'use strict';
  const shell = window.AppShell;
  if (!shell) return;
  const esc = shell.escapeHtml;

  const TYPES = ['Litigation', 'Corporate', 'Real Estate', 'Probate', 'Trusts', 'Other'];
  const STATUSES = [
    { v: 'active', label: 'Active' },
    { v: 'closed', label: 'Closed' },
    { v: 'archived', label: 'Archived' },
  ];

  function newId(prefix) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return prefix + '_' + hex;
  }

  function statusLabel(v) {
    const s = STATUSES.find(function (x) { return x.v === v; });
    return s ? s.label : (v || '—');
  }

  // ---- list ----
  async function listScreen() {
    const matters = await SB.rest('/lc_matters', {
      query: {
        select: 'id,title,matter_number,status,updated_at,lc_clients(name)',
        order: 'updated_at.desc',
      },
    });

    let html = '' +
      '<h1 class="page-title">Matters</h1>' +
      '<p class="page-sub">' + matters.length + ' matter' + (matters.length === 1 ? '' : 's') + '</p>' +
      '<div class="actions">' +
        '<a class="btn primary" href="#/matters/new">New matter</a>' +
      '</div>';

    if (matters.length === 0) {
      html += '<div class="panel"><div class="empty">No matters yet. Tap "New matter" to open one.</div></div>';
      return html;
    }

    html += '<div class="panel"><div class="list">';
    matters.forEach(function (m) {
      const clientName = (m.lc_clients && m.lc_clients.name) ? m.lc_clients.name : '';
      html += '' +
        '<a class="list-row" href="#/matters/' + esc(m.id) + '">' +
          '<div class="list-main">' +
            '<div class="list-title">' + esc(m.title) + '</div>' +
            '<div class="list-sub">' + esc(clientName) +
              (m.matter_number ? ' · ' + esc(m.matter_number) : '') +
              (m.status ? ' · ' + esc(m.status) : '') +
            '</div>' +
          '</div>' +
          '<div class="chev">›</div>' +
        '</a>';
    });
    html += '</div></div>';
    return html;
  }

  // ---- form ----
  async function formHtml(matter, defaultClientId) {
    const isEdit = !!matter;
    const m = matter || {
      title: '', matter_number: '', type: 'Litigation', status: 'active',
      client_id: defaultClientId || '', description: '',
    };
    const clients = await SB.rest('/lc_clients', {
      query: { select: 'id,name', order: 'name.asc' },
    });

    if (!clients || clients.length === 0) {
      return '<div class="panel"><div class="empty">Add a client first, then you can open a matter for them.</div>' +
             '<div class="actions" style="margin-top:12px"><a class="btn primary" href="#/clients/new">New client</a></div></div>';
    }

    const clientOpts = clients.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (m.client_id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    const typeOpts = TYPES.map(function (t) {
      return '<option value="' + esc(t) + '"' + (m.type === t ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');

    const statusOpts = STATUSES.map(function (s) {
      return '<option value="' + s.v + '"' + (m.status === s.v ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('');

    return '' +
      '<h1 class="page-title">' + (isEdit ? 'Edit matter' : 'New matter') + '</h1>' +
      '<p class="page-sub">' + (isEdit ? 'Update the matter details.' : 'Open a new matter under a client.') + '</p>' +
      '<form id="matterForm" class="panel form">' +
        '<label for="f_title">Matter title</label>' +
        '<input id="f_title" name="title" type="text" required value="' + esc(m.title) + '" placeholder="e.g. Ahmed Yusuf v. XYZ Ltd">' +
        '<label for="f_client">Client</label>' +
        '<select id="f_client" name="client_id" required>' + clientOpts + '</select>' +
        '<label for="f_number">Matter number</label>' +
        '<input id="f_number" name="matter_number" type="text" value="' + esc(m.matter_number || '') + '" placeholder="e.g. TB/2026/001">' +
        '<label for="f_type">Type</label>' +
        '<select id="f_type" name="type">' + typeOpts + '</select>' +
        '<label for="f_status">Status</label>' +
        '<select id="f_status" name="status">' + statusOpts + '</select>' +
        '<label for="f_desc">Description</label>' +
        '<textarea id="f_desc" name="description" rows="3">' + esc(m.description || '') + '</textarea>' +
        '<div id="formErr" class="err" hidden></div>' +
        '<div class="form-actions">' +
          '<button class="btn primary" type="submit" id="saveBtn">' + (isEdit ? 'Save changes' : 'Open matter') + '</button>' +
          '<a class="btn" href="' + (isEdit ? '#/matters/' + esc(m.id) : '#/matters') + '">Cancel</a>' +
        '</div>' +
      '</form>';
  }

  function mountForm(screenEl, matter) {
    const form = screenEl.querySelector('#matterForm');
    const err = screenEl.querySelector('#formErr');
    const saveBtn = screenEl.querySelector('#saveBtn');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      err.hidden = true;
      saveBtn.disabled = true;
      const fd = new FormData(form);
      const payload = {
        title: String(fd.get('title') || '').trim(),
        client_id: String(fd.get('client_id') || '').trim(),
        matter_number: String(fd.get('matter_number') || '').trim() || null,
        type: String(fd.get('type') || 'Litigation'),
        status: String(fd.get('status') || 'active'),
        description: String(fd.get('description') || '').trim() || null,
      };
      if (!payload.title || !payload.client_id) {
        err.textContent = 'Title and client are required.';
        err.hidden = false; saveBtn.disabled = false; return;
      }
      try {
        if (matter) {
          await SB.rest('/lc_matters', {
            method: 'PATCH',
            query: { id: 'eq.' + matter.id },
            body: payload,
            headers: { Prefer: 'return=representation' },
          });
          window.location.hash = '#/matters/' + matter.id;
        } else {
          const user = Auth.currentUser();
          payload.id = newId('m');
          payload.organization_id = user.organization_id;
          await SB.rest('/lc_matters', {
            method: 'POST',
            body: payload,
            headers: { Prefer: 'return=representation' },
          });
          window.location.hash = '#/matters/' + payload.id;
        }
      } catch (ex) {
        err.textContent = ex.message || 'Could not save.';
        err.hidden = false; saveBtn.disabled = false;
      }
    });
  }

  // ---- detail ----
  async function detailScreen(id) {
    const matters = await SB.rest('/lc_matters', {
      query: { id: 'eq.' + id, select: '*,lc_clients(id,name)' },
    });
    if (!matters || !matters[0]) {
      return '<div class="panel"><div class="empty">Matter not found, or you do not have access.</div></div>';
    }
    const m = matters[0];
    const clientName = (m.lc_clients && m.lc_clients.name) ? m.lc_clients.name : '—';
    const clientId = m.lc_clients ? m.lc_clients.id : '';
    const isAdmin = Auth.isAdmin();

    // staff assignment
    const assignments = await SB.rest('/lc_matter_staff', {
      query: { matter_id: 'eq.' + id, select: 'user_id,assigned_at' },
    });
    const orgUsers = isAdmin ? await SB.rest('/lc_users', {
      query: { select: 'id,name,email,role,active', order: 'name.asc' },
    }) : [];
    const assignedIds = (assignments || []).map(function (a) { return a.user_id; });

    let staffHtml = '';
    if (isAdmin) {
      staffHtml = '<div class="staff-list" id="staffList">';
      (orgUsers || []).forEach(function (u) {
        const checked = assignedIds.indexOf(u.id) !== -1;
        staffHtml += '' +
          '<label class="staff-row">' +
            '<input type="checkbox" data-uid="' + esc(u.id) + '"' + (checked ? ' checked' : '') + (u.active ? '' : ' disabled') + '>' +
            '<span class="staff-main">' +
              '<span class="staff-name">' + esc(u.name) + (u.active ? '' : ' <span class="muted">(inactive)</span>') + '</span>' +
              '<span class="staff-sub">' + esc(u.role || '') + '</span>' +
            '</span>' +
          '</label>';
      });
      staffHtml += '</div>';
      staffHtml += '<div id="staffErr" class="err" hidden></div>';
    } else {
      // non-admin: read-only view
      const allUsers = await SB.rest('/lc_users', {
        query: { select: 'id,name,role' },
      });
      const map = {};
      (allUsers || []).forEach(function (u) { map[u.id] = u; });
      const names = assignedIds.map(function (uid) {
        const u = map[uid];
        return u ? esc(u.name) : '<span class="muted">' + esc(String(uid).slice(0, 8)) + '…</span>';
      });
      staffHtml = names.length
        ? '<div class="muted">' + names.join(', ') + '</div>'
        : '<div class="muted">No one assigned yet.</div>';
    }

    let html = '' +
      '<div class="crumbs"><a href="#/matters">Matters</a> › ' + esc(m.title) + '</div>' +
      '<h1 class="page-title">' + esc(m.title) + '</h1>' +
      '<p class="page-sub">' +
        (clientId ? '<a class="inline-link" href="#/clients/' + esc(clientId) + '">' + esc(clientName) + '</a>' : esc(clientName)) +
        (m.matter_number ? ' · ' + esc(m.matter_number) : '') +
        ' · ' + esc(statusLabel(m.status)) +
      '</p>' +
      '<div class="actions">' +
        (isAdmin ? '<a class="btn primary" href="#/matters/' + esc(m.id) + '/edit">Edit matter</a>' : '') +
        '<a class="btn" href="#/documents/new?matter_id=' + esc(m.id) + '">Add document</a>' +
      '</div>';

    if (m.description) {
      html += '<section class="panel"><h2>Description</h2><div class="muted">' + esc(m.description) + '</div></section>';
    }

    html += '' +
      '<section class="panel">' +
        '<h2>Documents</h2>' +
        '<div class="chips" id="docChips">' +
          '<a class="chip-btn" data-filter="folder" data-value="">All</a>' +
          '<a class="chip-btn" data-filter="folder" data-value="__labels__">Folders</a>' +
          '<a class="chip-btn" data-filter="archived" data-value="active">Active</a>' +
          '<a class="chip-btn" data-filter="archived" data-value="archived">Archived</a>' +
        '</div>' +
        '<div id="docsBox" class="muted">Loading\u2026</div>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Who can see this</h2>' +
        staffHtml +
        (isAdmin ? '<div id="staffStatus" class="muted" style="margin-top:10px"></div>' : '') +
      '</section>';

    return {
      html: html,
      mount: function (el) {
        // Load documents list with filters
        (function () {
          const box = el.querySelector('#docsBox');
          const chipsEl = el.querySelector('#docChips');
          if (!box || !chipsEl) return;
          let folderFilter = '';
          let archivedFilter = 'active';
          let folderLabels = [];

          async function loadLabels() {
            try {
              const rows = await SB.rest('/lc_folder_labels', {
                query: { select: 'id,name,sort_order', order: 'sort_order.asc' },
              });
              folderLabels = rows || [];
            } catch (e) { folderLabels = []; }

            // Rebuild the chips row: All + each folder label + Active/Archived
            let html = '<a class="chip-btn' + (folderFilter === '' && archivedFilter === 'active' ? ' active' : '') + '" data-filter="folder" data-value="">All</a>';
            folderLabels.forEach(function (f) {
              html += '<a class="chip-btn' + (folderFilter === f.id ? ' active' : '') + '" data-filter="folder" data-value="' + f.id + '">' + f.name + '</a>';
            });
            html += '<a class="chip-btn' + (archivedFilter === 'active' ? ' active' : '') + '" data-filter="archived" data-value="active">Active</a>';
            html += '<a class="chip-btn' + (archivedFilter === 'archived' ? ' active' : '') + '" data-filter="archived" data-value="archived">Archived</a>';
            chipsEl.innerHTML = html;

            chipsEl.querySelectorAll('.chip-btn').forEach(function (btn) {
              btn.addEventListener('click', function () {
                const kind = btn.getAttribute('data-filter');
                const val = btn.getAttribute('data-value');
                if (kind === 'folder') folderFilter = val;
                if (kind === 'archived') archivedFilter = val;
                render();
                loadLabels();
              });
            });
          }

          async function render() {
            box.innerHTML = '<div class="loading">Loading\u2026</div>';
            try {
              const query = {
                matter_id: 'eq.' + id,
                select: 'id,name,file_size,mime_type,created_at,folder_label_id,archived',
                order: 'created_at.desc',
              };
              if (archivedFilter === 'active') query.archived = 'eq.false';
              else if (archivedFilter === 'archived') query.archived = 'eq.true';
              if (folderFilter) query.folder_label_id = 'eq.' + folderFilter;

              const rows = await SB.rest('/lc_documents', { query: query });
              if (!rows || !rows.length) {
                box.innerHTML = '<div class="empty">No documents match this filter.</div>';
                return;
              }
              box.className = '';
              box.innerHTML = '<div class="list">' + rows.map(function (r) {
                const size = r.file_size ? (r.file_size < 1024*1024 ? Math.round(r.file_size/1024) + ' KB' : (r.file_size/(1024*1024)).toFixed(1) + ' MB') : '';
                const archChip = r.archived ? ' <span class="chip small">Archived</span>' : '';
                const unarch = r.archived
                  ? '<button class="link-btn" data-unarchive="' + r.id + '" type="button" style="margin-left:8px">Unarchive</button>'
                  : '';
                return '<div class="list-row">' +
                  '<a class="list-main row-link" href="#/documents/' + r.id + '">' +
                    '<div class="list-title">' + esc(r.name) + archChip + '</div>' +
                    '<div class="list-sub">' + size + (r.created_at ? ' \u00B7 ' + r.created_at.slice(0,10) : '') + '</div>' +
                  '</a>' +
                  unarch +
                  '<a class="chev row-link" href="#/documents/' + r.id + '">\u203A</a>' +
                '</div>';
              }).join('') + '</div>';

              box.querySelectorAll('[data-unarchive]').forEach(function (btn) {
                btn.addEventListener('click', async function (ev) {
                  ev.preventDefault(); ev.stopPropagation();
                  const docId = btn.getAttribute('data-unarchive');
                  btn.disabled = true;
                  try {
                    await SB.rest('/lc_documents', {
                      method: 'PATCH',
                      query: { id: 'eq.' + docId },
                      body: { archived: false },
                      headers: { Prefer: 'return=minimal' },
                    });
                    if (window.Audit) Audit.log('document.unarchived', 'document', docId, {});
                    render();
                  } catch (e) {
                    btn.disabled = false;
                  }
                });
              });
            } catch (ex) {
              box.innerHTML = '<div class="muted">Could not load documents.</div>';
            }
          }

          loadLabels();
          render();
        })();

        if (!isAdmin) return;
        const listEl = el.querySelector('#staffList');
        if (!listEl) return;
        const errEl = el.querySelector('#staffErr');
        const statusEl = el.querySelector('#staffStatus');

        listEl.addEventListener('change', async function (ev) {
          const input = ev.target;
          if (!input || input.tagName !== 'INPUT') return;
          const uid = input.getAttribute('data-uid');
          const nowOn = input.checked;
          errEl.hidden = true;
          statusEl.textContent = 'Saving…';
          input.disabled = true;
          try {
            if (nowOn) {
              await SB.rest('/lc_matter_staff', {
                method: 'POST',
                body: { matter_id: id, user_id: uid },
                headers: { Prefer: 'resolution=merge-duplicates' },
              });
            } else {
              await SB.rest('/lc_matter_staff', {
                method: 'DELETE',
                query: { matter_id: 'eq.' + id, user_id: 'eq.' + uid },
              });
            }
            statusEl.textContent = 'Saved.';
            setTimeout(function () { statusEl.textContent = ''; }, 1500);
          } catch (ex) {
            input.checked = !nowOn;
            errEl.textContent = ex.message || 'Could not update.';
            errEl.hidden = false;
            statusEl.textContent = '';
          } finally {
            input.disabled = false;
          }
        });
      },
    };
  }

  // ---- route ----
  shell.registerRoute('matters', async function (ctx) {
    const seg = ctx.segments;
    if (seg.length === 1) return await listScreen();
    if (seg[1] === 'new') {
      const html = await formHtml(null, ctx.query.client_id);
      return { html: html, mount: function (el) {
        if (el.querySelector('#matterForm')) mountForm(el, null);
      }};
    }
    if (seg.length === 3 && seg[2] === 'edit') {
      const rows = await SB.rest('/lc_matters', { query: { id: 'eq.' + seg[1], select: '*' } });
      const m = rows && rows[0];
      if (!m) return '<div class="panel"><div class="empty">Matter not found.</div></div>';
      const html = await formHtml(m);
      return { html: html, mount: function (el) {
        if (el.querySelector('#matterForm')) mountForm(el, m);
      }};
    }
    return await detailScreen(seg[1]);
  });
})(window);
