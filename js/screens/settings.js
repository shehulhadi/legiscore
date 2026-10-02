// js/screens/settings.js — admin settings: staff, folder labels, activity record
(function (window) {
  'use strict';
  const shell = window.AppShell;
  if (!shell) return;
  const esc = shell.escapeHtml;

  const TABS = [
    { slug: 'staff', label: 'Staff' },
    { slug: 'labels', label: 'Folder labels' },
    { slug: 'activity', label: 'Activity record' },
  ];

  function tabsHtml(current) {
    return '<div class="tabs">' + TABS.map(function (t) {
      const cls = t.slug === current ? 'tab active' : 'tab';
      return '<a class="' + cls + '" href="#/settings/' + t.slug + '">' + t.label + '</a>';
    }).join('') + '</div>';
  }

  function fmtDate(s) {
    if (!s) return '';
    try {
      const d = new Date(s);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return s.slice(0, 16).replace('T', ' '); }
  }

  function humanAction(a) {
    if (!a) return '';
    const map = {
      'document.opened': 'Opened',
      'document.added': 'Added',
      'document.downloaded': 'Downloaded',
      'document.printed': 'Printed',
      'document.shared': 'Shared',
      'document.archived': 'Archived',
      'document.unarchived': 'Unarchived',
      'document.version_added': 'Added new version of',
    };
    return map[a] || a;
  }

  // ---- Staff tab ----
  async function staffTab() {
    const users = await SB.rest('/lc_users', {
      query: { select: '*', order: 'name.asc' },
    });
    let html = '<h2>Staff</h2>' +
      '<p class="page-sub">Accounts in your organization. Deactivated staff cannot sign in.</p>' +
      '<div class="actions"><button class="btn primary" id="newStaffBtn" type="button">Add staff</button></div>' +
      '<div class="panel"><div class="list" id="staffList">';
    (users || []).forEach(function (u) {
      html += '<div class="list-row" data-uid="' + esc(u.id) + '">' +
        '<div class="list-main">' +
          '<div class="list-title">' + esc(u.name) + (u.active === false ? ' <span class="chip small">inactive</span>' : '') + '</div>' +
          '<div class="list-sub">' + esc(u.email) + ' \u00B7 ' + esc(u.role || '') + '</div>' +
        '</div>' +
        '<button class="link-btn" data-act="toggle" data-uid="' + esc(u.id) + '">' + (u.active === false ? 'Activate' : 'Deactivate') + '</button>' +
      '</div>';
    });
    html += '</div></div>';
    return { html: html, mount: function (el) { mountStaff(el); } };
  }

  function mountStaff(el) {
    el.querySelector('#newStaffBtn').addEventListener('click', function () {
      if (el.querySelector('#newStaffPanel')) return;
      const panel = document.createElement('div');
      panel.className = 'panel'; panel.id = 'newStaffPanel';
      panel.innerHTML =
        '<h2>Add staff</h2>' +
        '<div class="hint">First create the account in Supabase \u2192 Authentication \u2192 Users (email + password). Then enter the same email here to link them into your organization.</div>' +
        '<label for="ns_name">Name</label>' +
        '<input id="ns_name" type="text" required>' +
        '<label for="ns_email">Email</label>' +
        '<input id="ns_email" type="email" required>' +
        '<label for="ns_role">Role</label>' +
        '<select id="ns_role">' +
          '<option value="associate">Associate</option>' +
          '<option value="secretary">Secretary</option>' +
          '<option value="partner">Partner</option>' +
          '<option value="administrator">Administrator</option>' +
          '<option value="viewer">Viewer</option>' +
        '</select>' +
        '<div id="nsErr" class="err" hidden></div>' +
        '<div class="form-actions">' +
          '<button class="btn primary" id="nsGo" type="button">Link account</button>' +
          '<button class="btn" id="nsCancel" type="button">Cancel</button>' +
        '</div>';
      el.insertBefore(panel, el.querySelector('.actions'));
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const err = panel.querySelector('#nsErr');
      panel.querySelector('#nsCancel').addEventListener('click', function () { panel.remove(); });
      panel.querySelector('#nsGo').addEventListener('click', async function () {
        const name = panel.querySelector('#ns_name').value.trim();
        const email = panel.querySelector('#ns_email').value.trim().toLowerCase();
        const role = panel.querySelector('#ns_role').value;
        err.hidden = true;
        if (!name || !email) { err.textContent = 'Name and email are required.'; err.hidden = false; return; }
        try {
          await SB.rest('/rpc/lc_link_user', {
            method: 'POST',
            body: { p_email: email, p_name: name, p_role: role },
            headers: { 'Content-Type': 'application/json' },
          });
          shell.render();
        } catch (ex) {
          err.textContent = ex.message || 'Could not link account.';
          err.hidden = false;
        }
      });
    });

    el.querySelectorAll('[data-act="toggle"]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const uid = btn.getAttribute('data-uid');
        const row = btn.closest('.list-row');
        const isActive = !row.querySelector('.chip');
        try {
          await SB.rest('/lc_users', {
            method: 'PATCH',
            query: { id: 'eq.' + uid },
            body: { active: !isActive },
            headers: { Prefer: 'return=minimal' },
          });
          shell.render();
        } catch (ex) {
          alert(ex.message || 'Could not update.');
        }
      });
    });
  }

  // ---- Folder labels tab ----
  async function labelsTab() {
    const rows = await SB.rest('/lc_folder_labels', {
      query: { select: '*', order: 'sort_order.asc' },
    });
    let html = '<h2>Folder labels</h2>' +
      '<p class="page-sub">The folder names shown when adding a document.</p>' +
      '<div class="panel"><div class="list">';
    (rows || []).forEach(function (r) {
      html += '<div class="list-row"><div class="list-main"><div class="list-title">' + esc(r.name) + '</div></div></div>';
    });
    html += '</div></div>';
    return html;
  }

  // ---- Activity tab ----
  async function activityTab() {
    const logs = await SB.rest('/lc_audit_logs', {
      query: { select: '*', order: 'created_at.desc', limit: '200' },
    });
    const users = await SB.rest('/lc_users', { query: { select: 'id,name,email' } });
    const map = {};
    (users || []).forEach(function (u) { map[u.id] = u; });

    const actions = Array.from(new Set((logs || []).map(function (r) { return r.action; }))).sort();

    let html = '<h2>Activity record</h2>' +
      '<p class="page-sub">Every action in your organization, most recent first.</p>' +
      '<div class="panel">' +
        '<div class="filter-row">' +
          '<select id="fltAction"><option value="">All actions</option>' +
            actions.map(function (a) { return '<option value="' + esc(a) + '">' + esc(humanAction(a)) + '</option>'; }).join('') +
          '</select>' +
          '<input id="fltSearch" type="search" placeholder="Search name\u2026">' +
        '</div>' +
        '<div id="logsBox" class="list"></div>' +
      '</div>';

    const renderLogs = function (filterAction, filterText) {
      const box = document.getElementById('logsBox');
      if (!box) return;
      let list = logs || [];
      if (filterAction) list = list.filter(function (r) { return r.action === filterAction; });
      if (filterText) {
        const t = filterText.toLowerCase();
        list = list.filter(function (r) {
          const meta = r.meta || {};
          const name = (meta.name || '') + ' ' + (meta.note || '');
          return name.toLowerCase().indexOf(t) !== -1;
        });
      }
      if (!list.length) { box.innerHTML = '<div class="empty">No matching activity.</div>'; return; }
      box.innerHTML = list.map(function (r) {
        const u = map[r.user_id] || {};
        const meta = r.meta || {};
        const title = humanAction(r.action) + (meta.name ? ' \u201C' + esc(meta.name) + '\u201D' : '');
        const sub = (u.name || u.email || 'unknown') + ' \u00B7 ' + fmtDate(r.created_at) +
          (meta.version ? ' \u00B7 version ' + esc(meta.version) : '') +
          (meta.note ? ' \u00B7 ' + esc(meta.note) : '');
        return '<div class="list-row"><div class="list-main">' +
          '<div class="list-title">' + title + '</div>' +
          '<div class="list-sub">' + sub + '</div>' +
        '</div></div>';
      }).join('');
    };

    return { html: html, mount: function (el) {
      renderLogs('', '');
      el.querySelector('#fltAction').addEventListener('change', function () {
        renderLogs(this.value, el.querySelector('#fltSearch').value);
      });
      el.querySelector('#fltSearch').addEventListener('input', function () {
        renderLogs(el.querySelector('#fltAction').value, this.value);
      });
    }};
  }

  // ---- route ----
  shell.registerRoute('settings', async function (ctx) {
    if (!Auth.isAdmin()) {
      return '<div class="panel"><div class="empty">Only administrators can open Settings.</div></div>';
    }
    const tab = ctx.segments[1] || 'staff';
    let body;
    if (tab === 'labels') body = await labelsTab();
    else if (tab === 'activity') body = await activityTab();
    else body = await staffTab();

    const html = '<h1 class="page-title">Settings</h1>' + tabsHtml(tab) +
      (typeof body === 'string' ? body : body.html);

    return {
      html: html,
      mount: function (el) { if (body && body.mount) body.mount(el); },
    };
  });
})(window);
