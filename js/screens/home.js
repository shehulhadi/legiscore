// js/screens/home.js
(function (window) {
  'use strict';
  const shell = window.AppShell;
  if (!shell) return;

  shell.registerRoute('home', async function (ctx) {
    return '' +
      '<h1 class="page-title">Your filing room</h1>' +
      '<p class="page-sub">Welcome back, ' + escapeHtml(ctx.user.name || ctx.user.email) + '.</p>' +
      '<div class="actions">' +
        '<a class="btn primary" href="#/clients/new">New client</a>' +
        '<a class="btn" href="#/matters/new">New matter</a>' +
      '</div>' +
      '<section class="panel">' +
        '<h2>Recent matters</h2>' +
        '<div id="recentMatters" class="muted">Loading…</div>' +
      '</section>';
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
})(window);
