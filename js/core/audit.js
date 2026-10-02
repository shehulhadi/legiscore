// js/core/audit.js — write activity record rows
(function (window) {
  'use strict';

  function newId() {
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    return 'log_' + Array.from(b).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  async function log(action, resourceType, resourceId, meta) {
    try {
      const user = window.Auth && Auth.currentUser && Auth.currentUser();
      if (!user || !user.organization_id) return;
      await SB.rest('/lc_audit_logs', {
        method: 'POST',
        body: {
          id: newId(),
          organization_id: user.organization_id,
          user_id: user.id,
          action: action,
          resource_type: resourceType || null,
          resource_id: resourceId || null,
          meta: meta || {},
        },
        headers: { Prefer: 'return=minimal' },
      });
    } catch (e) {
      // Never let audit failure break the UI.
      console.warn('audit log failed:', e && e.message);
    }
  }

  window.Audit = { log: log };
})(window);
