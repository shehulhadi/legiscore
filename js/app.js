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

  function parseHash() {
    const raw = (window.location.hash || '#/home').replace(/^#\//, '');
    const qIdx = raw.indexOf('?');
    const path = qIdx === -1 ? raw : raw.slice(0, qIdx);
    const queryStr = qIdx === -1 ? '' : raw.slice(qIdx + 1);
    const query = {};
    if (queryStr) {
      queryStr.split('&').forEach(function (pair) {
        const eq = pair.indexOf('=');
        if (eq === -1) return;
        query[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
      });
    }
    return { segments: path.split('/').filter(Boolean), query: query };
  }

  function setActiveNav(section) {
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      const target = (a.getAttribute('href') || '').replace(/^#\//, '').split('/')[0].split('?')[0];
      a.classList.toggle('active', target === section);
    });
  }

  async function render() {
    const parsed = parseHash();
    const section = parsed.segments[0] || 'home';
    setActiveNav(section);
    const handler = routes[section] || routes['home'];
    if (!handler) {
      screenEl.innerHTML = '<div class="empty">Screen not built yet.</div>';
      return;
    }
    screenEl.innerHTML = '<div class="loading">Loading…</div>';
    try {
      const result = await handler({
        user: Auth.currentUser(),
        segments: parsed.segments,
        query: parsed.query,
        screenEl: screenEl,
      });
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

  // Render only after every screen module has had a chance to register its routes.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})(window);
