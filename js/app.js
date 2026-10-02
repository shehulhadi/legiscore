// js/app.js — shell: layout, routing
(function (window) {
  'use strict';
  if (!window.Auth || !Auth.requireLogin()) return;

  const screenEl = document.getElementById('screen');
  const userNameEl = document.getElementById('userName');
  const logoutBtn = document.getElementById('logoutBtn');
  const navSettings = document.getElementById('navSettings');
  const navMore = document.getElementById('navMore');

  const user = Auth.currentUser();
  userNameEl.textContent = user.name || user.email;
  if (Auth.isAdmin()) {
    navSettings.hidden = false;
    navMore.hidden = true;
  }

  logoutBtn.addEventListener('click', async function () {
    await Auth.logout();
    window.location.href = 'login.html';
  });

  // ---- tiny router ----
  const routes = {};
  function registerRoute(name, render) { routes[name] = render; }

  function currentRoute() {
    const h = (window.location.hash || '#/home').replace(/^#\//, '');
    return h || 'home';
  }

  async function render() {
    const name = currentRoute();
    const fn = routes[name] || routes['home'];
    if (!fn) {
      screenEl.innerHTML = '<div class="empty">Screen not built yet.</div>';
      return;
    }
    screenEl.innerHTML = '<div class="loading">Loading…</div>';
    try {
      const html = await fn({ user: Auth.currentUser() });
      if (typeof html === 'string') screenEl.innerHTML = html;
    } catch (e) {
      screenEl.innerHTML = '<div class="err">' + (e.message || 'Something went wrong.') + '</div>';
    }
  }

  window.addEventListener('hashchange', render);
  window.AppShell = { registerRoute: registerRoute, render: render, screenEl: screenEl };
  render();
})(window);
