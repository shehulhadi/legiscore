// js/core/search.js — global search bar
(function (window) {
  'use strict';
  if (!window.Auth || !Auth.requireLogin()) return;

  const input = document.getElementById('search');
  if (!input) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function sanitize(q) {
    return String(q || '').replace(/[%_,()*\\]/g, ' ').trim();
  }

  let timer = null;
  let reqId = 0;

  function closePanel() {
    const p = document.getElementById('searchPanel');
    if (p) p.remove();
  }

  function showPanel(html) {
    closePanel();
    const panel = document.createElement('div');
    panel.id = 'searchPanel';
    panel.className = 'search-panel';
    panel.innerHTML = html;
    document.body.appendChild(panel);
  }

  async function runSearch(q) {
    const myReq = ++reqId;
    try {
      const results = await Promise.all([
        SB.rest('/lc_clients', {
          query: { select: 'id,name,client_type', name: 'ilike.*' + q + '*', order: 'name.asc', limit: '5' },
        }),
        SB.rest('/lc_matters', {
          query: { select: 'id,title,matter_number,lc_clients(name)', or: '(title.ilike.*' + q + '*,matter_number.ilike.*' + q + '*)', order: 'updated_at.desc', limit: '5' },
        }),
        SB.rest('/lc_documents', {
          query: { select: 'id,name,mime_type,lc_matters(id,title)', name: 'ilike.*' + q + '*', order: 'created_at.desc', limit: '5' },
        }),
      ]);
      if (myReq !== reqId) return;
      const clients = results[0] || [];
      const matters = results[1] || [];
      const docs = results[2] || [];
      const total = clients.length + matters.length + docs.length;

      if (!total) {
        showPanel('<div class="search-empty">Nothing found for \u201C' + esc(q) + '\u201D.</div>');
        return;
      }

      let html = '<div class="search-groups">';

      if (clients.length) {
        html += '<div class="search-group"><div class="search-group-title">Clients</div>';
        clients.forEach(function (c) {
          html += '<a class="search-row" href="#/clients/' + esc(c.id) + '">' +
            '<div class="search-row-main">' +
              '<div class="search-row-title">' + esc(c.name) + '</div>' +
              '<div class="search-row-sub">' + esc(c.client_type || '') + '</div>' +
            '</div></a>';
        });
        html += '</div>';
      }

      if (matters.length) {
        html += '<div class="search-group"><div class="search-group-title">Matters</div>';
        matters.forEach(function (m) {
          const clientName = (m.lc_clients && m.lc_clients.name) ? m.lc_clients.name : '';
          const sub = clientName + (m.matter_number ? (clientName ? ' \u00B7 ' : '') + m.matter_number : '');
          html += '<a class="search-row" href="#/matters/' + esc(m.id) + '">' +
            '<div class="search-row-main">' +
              '<div class="search-row-title">' + esc(m.title) + '</div>' +
              '<div class="search-row-sub">' + esc(sub) + '</div>' +
            '</div></a>';
        });
        html += '</div>';
      }

      if (docs.length) {
        html += '<div class="search-group"><div class="search-group-title">Documents</div>';
        docs.forEach(function (d) {
          const matterTitle = (d.lc_matters && d.lc_matters.title) ? d.lc_matters.title : '';
          html += '<a class="search-row" href="#/documents/' + esc(d.id) + '">' +
            '<div class="search-row-main">' +
              '<div class="search-row-title">' + esc(d.name) + '</div>' +
              '<div class="search-row-sub">' + esc(matterTitle) + '</div>' +
            '</div></a>';
        });
        html += '</div>';
      }

      html += '</div>';
      showPanel(html);

      document.querySelectorAll('#searchPanel .search-row').forEach(function (a) {
        a.addEventListener('click', function () {
          closePanel();
          input.value = '';
          input.blur();
        });
      });
    } catch (ex) {
      if (myReq !== reqId) return;
      showPanel('<div class="search-empty">Search failed. ' + esc(ex.message || '') + '</div>');
    }
  }

  input.addEventListener('input', function () {
    const q = sanitize(input.value);
    clearTimeout(timer);
    if (q.length < 2) { closePanel(); return; }
    timer = setTimeout(function () { runSearch(q); }, 220);
  });

  input.addEventListener('focus', function () {
    const q = sanitize(input.value);
    if (q.length >= 2) runSearch(q);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closePanel(); input.blur(); }
  });

  document.addEventListener('click', function (ev) {
    if (ev.target === input) return;
    if (ev.target.closest && ev.target.closest('#searchPanel')) return;
    closePanel();
  });

  window.addEventListener('hashchange', closePanel);
})(window);
