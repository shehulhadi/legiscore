// js/screens/clients.js — list, new, edit, detail
(function (window) {
  'use strict';
  const shell = window.AppShell;
  if (!shell) return;
  const esc = shell.escapeHtml;

  const TYPES = [
    { v: 'individual', label: 'Individual' },
    { v: 'company', label: 'Company' },
    { v: 'government', label: 'Government' },
  ];

  function typeLabel(v) {
    const t = TYPES.find(function (x) { return x.v === v; });
    return t ? t.label : (v || '—');
  }

  function newId(prefix) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return prefix + '_' + hex;
  }

  // ---- list ----
  async function listScreen() {
    const rows = await SB.rest('/lc_clients', {
      query: { select: '*', order: 'name.asc' },
    });

    let html = '' +
      '<h1 class="page-title">Clients</h1>' +
      '<p class="page-sub">' + rows.length + ' client' + (rows.length === 1 ? '' : 's') + '</p>' +
      '<div class="actions">' +
        '<a class="btn primary" href="#/clients/new">New client</a>' +
      '</div>';

    if (rows.length === 0) {
      html += '<div class="panel"><div class="empty">No clients yet. Tap "New client" to add the first one.</div></div>';
      return html;
    }

    html += '<div class="panel"><div class="list">';
    rows.forEach(function (c) {
      html += '' +
        '<a class="list-row" href="#/clients/' + esc(c.id) + '">' +
          '<div class="list-main">' +
            '<div class="list-title">' + esc(c.name) + '</div>' +
            '<div class="list-sub">' + esc(typeLabel(c.client_type)) +
              (c.phone ? ' · ' + esc(c.phone) : '') +
            '</div>' +
          '</div>' +
          '<div class="chev">›</div>' +
        '</a>';
    });
    html += '</div></div>';
    return html;
  }

  // ---- form (new + edit) ----
  function formHtml(client) {
    const isEdit = !!client;
    const c = client || { name: '', client_type: 'individual', phone: '', email: '', address: '' };
    return '' +
      '<h1 class="page-title">' + (isEdit ? 'Edit client' : 'New client') + '</h1>' +
      '<p class="page-sub">' + (isEdit ? 'Update the client details.' : 'Add a new client to your filing room.') + '</p>' +
      '<form id="clientForm" class="panel form">' +
        '<label for="f_name">Name</label>' +
        '<input id="f_name" name="name" type="text" required value="' + esc(c.name) + '">' +
        '<label for="f_type">Type</label>' +
        '<select id="f_type" name="client_type">' +
          TYPES.map(function (t) {
            return '<option value="' + t.v + '"' + (c.client_type === t.v ? ' selected' : '') + '>' + t.label + '</option>';
          }).join('') +
        '</select>' +
        '<label for="f_phone">Phone</label>' +
        '<input id="f_phone" name="phone" type="tel" inputmode="tel" value="' + esc(c.phone || '') + '">' +
        '<label for="f_email">Email</label>' +
        '<input id="f_email" name="email" type="email" inputmode="email" value="' + esc(c.email || '') + '">' +
        '<label for="f_address">Address</label>' +
        '<textarea id="f_address" name="address" rows="3">' + esc(c.address || '') + '</textarea>' +
        '<div id="formErr" class="err" hidden></div>' +
        '<div class="form-actions">' +
          '<button class="btn primary" type="submit" id="saveBtn">' + (isEdit ? 'Save changes' : 'Create client') + '</button>' +
          '<a class="btn" href="' + (isEdit ? '#/clients/' + esc(c.id) : '#/clients') + '">Cancel</a>' +
        '</div>' +
      '</form>';
  }

  function mountForm(screenEl, client) {
    const form = screenEl.querySelector('#clientForm');
    const err = screenEl.querySelector('#formErr');
    const saveBtn = screenEl.querySelector('#saveBtn');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      err.hidden = true;
      saveBtn.disabled = true;
      const fd = new FormData(form);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        client_type: String(fd.get('client_type') || 'individual'),
        phone: String(fd.get('phone') || '').trim() || null,
        email: String(fd.get('email') || '').trim() || null,
        address: String(fd.get('address') || '').trim() || null,
      };
      if (!payload.name) {
        err.textContent = 'Name is required.';
        err.hidden = false; saveBtn.disabled = false; return;
      }
      try {
        if (client) {
          await SB.rest('/lc_clients', {
            method: 'PATCH',
            query: { id: 'eq.' + client.id },
            body: payload,
            headers: { Prefer: 'return=representation' },
          });
          window.location.hash = '#/clients/' + client.id;
        } else {
          const user = Auth.currentUser();
          payload.id = newId('c');
          payload.organization_id = user.organization_id;
          await SB.rest('/lc_clients', {
            method: 'POST',
            body: payload,
            headers: { Prefer: 'return=representation' },
          });
          window.location.hash = '#/clients/' + payload.id;
        }
      } catch (ex) {
        err.textContent = ex.message || 'Could not save.';
        err.hidden = false; saveBtn.disabled = false;
      }
    });
  }

  // ---- detail ----
  async function detailScreen(id) {
    const clients = await SB.rest('/lc_clients', {
      query: { id: 'eq.' + id, select: '*' },
    });
    if (!clients || !clients[0]) {
      return '<div class="panel"><div class="empty">Client not found.</div></div>';
    }
    const c = clients[0];

    const matters = await SB.rest('/lc_matters', {
      query: { client_id: 'eq.' + id, select: 'id,title,matter_number,status,updated_at', order: 'updated_at.desc' },
    });

    let html = '' +
      '<div class="crumbs"><a href="#/clients">Clients</a> › ' + esc(c.name) + '</div>' +
      '<h1 class="page-title">' + esc(c.name) + '</h1>' +
      '<p class="page-sub">' + esc(typeLabel(c.client_type)) + '</p>' +
      '<div class="actions">' +
        '<a class="btn primary" href="#/matters/new?client_id=' + esc(c.id) + '">New matter</a>' +
        '<a class="btn" href="#/clients/' + esc(c.id) + '/edit">Edit client</a>' +
      '</div>' +
      '<section class="panel">' +
        '<h2>Contact</h2>' +
        '<dl class="kv">' +
          '<dt>Phone</dt><dd>' + (c.phone ? esc(c.phone) : '<span class="muted">—</span>') + '</dd>' +
          '<dt>Email</dt><dd>' + (c.email ? esc(c.email) : '<span class="muted">—</span>') + '</dd>' +
          '<dt>Address</dt><dd>' + (c.address ? esc(c.address) : '<span class="muted">—</span>') + '</dd>' +
        '</dl>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Matters</h2>';

    if (!matters || matters.length === 0) {
      html += '<div class="empty">No matters for this client yet.</div>';
    } else {
      html += '<div class="list">';
      matters.forEach(function (m) {
        html += '' +
          '<a class="list-row" href="#/matters/' + esc(m.id) + '">' +
            '<div class="list-main">' +
              '<div class="list-title">' + esc(m.title) + '</div>' +
              '<div class="list-sub">' + esc(m.matter_number || '—') + ' · ' + esc(m.status || '—') + '</div>' +
            '</div>' +
            '<div class="chev">›</div>' +
          '</a>';
      });
      html += '</div>';
    }
    html += '</section>';
    return html;
  }

  // ---- route dispatcher ----
  shell.registerRoute('clients', async function (ctx) {
    const seg = ctx.segments;
    if (seg.length === 1) return await listScreen();
    if (seg[1] === 'new') return { html: formHtml(null), mount: function (el) { mountForm(el, null); } };
    if (seg.length === 3 && seg[2] === 'edit') {
      const rows = await SB.rest('/lc_clients', { query: { id: 'eq.' + seg[1], select: '*' } });
      const c = rows && rows[0];
      if (!c) return '<div class="panel"><div class="empty">Client not found.</div></div>';
      return { html: formHtml(c), mount: function (el) { mountForm(el, c); } };
    }
    return await detailScreen(seg[1]);
  });
})(window);
