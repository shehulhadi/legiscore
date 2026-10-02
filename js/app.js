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

  const routes = {};
  function registerRoute(name, render) { routes[name] = render; }

  function currentSegments() {
    const h = (window.location.hash || '#/home').replace(/^#\//, '').split('?')[0];
    return h.split('/').filter(Boolean);
  }

  function setActiveNav(section) {
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      const target = (a.getAttribute('href') || '').replace(/^#\//, '').split('/')[0];
      a.classList.toggle('active', target === section);
    });
  }

  async function render() {
    const segments = currentSegments();
    const section = segments[0] || 'home';
    setActiveNav(section);
    const handler = routes[section] || routes['home'];
    if (!handler) {
      screenEl.innerHTML = '<div class="empty">Screen not built yet.</div>';
      return;
    }
    screenEl.innerHTML = '<div class="loading">Loading…</div>';
    try {
      const result = await handler({ user: Auth.currentUser(), segments: segments, screenEl: screenEl });
      if (typeof result === 'string') {
        screenEl.innerHTML = result;
      } else if (result && typeof result.html === 'string') {
        screenEl.innerHTML = result.html;
        if (typeof result.mount === 'function') result.mount(screenEl);
      }
    } catch (e) {
      screenEl.innerHTML = '<div class="panel"><div class="err">' + escapeHtml(e.message || 'Something went wrong.') + '</div></div>';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  window.addEventListener('hashchange', render);
  window.AppShell = {
    registerRoute: registerRoute,
    render: render,
    screenEl: screenEl,
    escapeHtml: escapeHtml,
  };
  render();
})(window);
