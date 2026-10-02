// js/core/supabase.js — thin REST + Auth client for Supabase
(function (window) {
  'use strict';
  const CFG = window.LegisCoreConfig;

  function getToken() {
    return localStorage.getItem(CFG.STORAGE_KEYS.TOKEN);
  }

  async function parse(res) {
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
    if (!res.ok) {
      const msg = (data && (data.message || data.msg || data.error_description || data.error || data.hint)) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  async function rest(path, opts) {
    opts = opts || {};
    const method = opts.method || 'GET';
    const headers = Object.assign({
      apikey: CFG.SUPABASE_ANON_KEY,
      Accept: 'application/json',
    }, opts.headers || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    let url = CFG.REST_BASE + path;
    if (opts.query) {
      const qs = new URLSearchParams(opts.query).toString();
      url += (url.indexOf('?') === -1 ? '?' : '&') + qs;
    }
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return parse(res);
  }

  async function auth(path, opts) {
    opts = opts || {};
    const method = opts.method || 'POST';
    const headers = Object.assign({
      apikey: CFG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    }, opts.headers || {});

    const res = await fetch(CFG.AUTH_BASE + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return parse(res);
  }

  window.SB = { rest: rest, auth: auth, getToken: getToken };
})(window);
