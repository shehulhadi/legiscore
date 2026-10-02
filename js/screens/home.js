// js/screens/home.js
(function (window) {
  'use strict';
  const shell = window.AppShell;
  if (!shell) return;
  const esc = shell.escapeHtml;

  shell.registerRoute('home', async function (ctx) {
    const matters = await SB.rest('/lc_matters', {
      query: {
        select: 'id,title,matter_number,status,updated_at,lc_clients(name)',
        order: 'updated_at.desc',
        limit: '8',
      },
    });

    let listHtml = '';
    if (!matters || matters.length === 0) {
      listHtml = '<div class="empty">No matters yet. Tap "New matter" to open one.</div>';
    } else {
      listHtml = '<div class="list">';
      matters.forEach(function (m) {
        const clientName = (m.lc_clients && m.lc_clients.name) ? m.lc_clients.name : '';
        listHtml += '' +
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
      listHtml += '</div>';
    }

    return '' +
      '<h1 class="page-title">Your filing room</h1>' +
      '<p class="page-sub">Welcome back, ' + esc(ctx.user.name || ctx.user.email) + '.</p>' +
      '<div class="actions">' +
        '<a class="btn primary" href="#/clients/new">New client</a>' +
        '<a class="btn" href="#/matters/new">New matter</a>' +
      '</div>' +
      '<section class="panel">' +
        '<h2>Recent matters</h2>' +
        listHtml +
      '</section>';
  });
})(window);
