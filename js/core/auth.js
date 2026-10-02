// js/core/auth.js — login, session, current user
(function (window) {
  'use strict';
  const CFG = window.LegisCoreConfig;
  const SB = window.SB;

  const LOGIN_URL = '/legiscore/login.html';

  function saveSession(session, user) {
    localStorage.setItem(CFG.STORAGE_KEYS.TOKEN, session.access_token);
    localStorage.setItem(CFG.STORAGE_KEYS.REFRESH_TOKEN, session.refresh_token || '');
    localStorage.setItem(CFG.STORAGE_KEYS.USER, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(CFG.STORAGE_KEYS.TOKEN);
    localStorage.removeItem(CFG.STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(CFG.STORAGE_KEYS.USER);
  }

  function currentUser() {
    const raw = localStorage.getItem(CFG.STORAGE_KEYS.USER);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function isLoggedIn() {
    return !!localStorage.getItem(CFG.STORAGE_KEYS.TOKEN);
  }

  function isAdmin() {
    const u = currentUser();
    return !!u && (u.role === 'administrator' || u.role === 'partner');
  }

  async function login(email, password) {
    const session = await SB.auth('/token?grant_type=password', {
      body: { email: email, password: password },
    });

    // Save the token FIRST so the next request carries the Authorization header.
    localStorage.setItem(CFG.STORAGE_KEYS.TOKEN, session.access_token);
    localStorage.setItem(CFG.STORAGE_KEYS.REFRESH_TOKEN, session.refresh_token || '');

    let profile;
    try {
      const rows = await SB.rest('/lc_users', {
        query: { id: 'eq.' + session.user.id, select: '*' },
      });
      profile = rows && rows[0] ? rows[0] : null;
    } catch (e) {
      clearSession();
      throw new Error('Could not load your profile. ' + (e.message || ''));
    }

    if (!profile) {
      clearSession();
      throw new Error('No profile found for this account.');
    }
    if (profile.active === false) {
      clearSession();
      throw new Error('Your account is not active.');
    }

    const user = {
      id: session.user.id,
      email: session.user.email,
      name: profile.name,
      role: profile.role,
      organization_id: profile.organization_id,
    };
    saveSession(session, user);
    return user;
  }

  async function logout() {
    try { await SB.auth('/logout', { headers: { Authorization: 'Bearer ' + SB.getToken() } }); } catch (e) {}
    clearSession();
  }

  function requireLogin() {
    if (!isLoggedIn() || !currentUser()) {
      window.location.href = LOGIN_URL;
      return false;
    }
    return true;
  }

  window.Auth = {
    login: login,
    logout: logout,
    currentUser: currentUser,
    isLoggedIn: isLoggedIn,
    isAdmin: isAdmin,
    requireLogin: requireLogin,
    clearSession: clearSession,
  };
})(window);
