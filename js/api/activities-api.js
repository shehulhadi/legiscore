/**
 * LegisCore — js/api/activities-api.js
 * Records and reads the firm activity log. Exposes window.LegisCoreActivitiesApi.
 *
 * Every write action in the app calls logActivity() so the dashboard
 * activity feed and the Settings → Activity record stay up to date.
 *
 * Text style (uniform, per agreed convention):
 *   "Added document 'X'"    / "Updated document 'X'"    / "Deleted document 'X'"
 *   "Added client 'X'"      / "Updated client 'X'"      / "Deleted client 'X'"
 *   "Opened matter 'X'"     / "Updated matter 'X'"      / "Closed matter 'X'"
 *   "Set deadline 'X'"
 */

(function(window) {
    'use strict';

    const api   = window.LegisCoreApi;
    const state = window.LegisCoreState;

    if (!api || !state) {
        console.error('[LegisCoreActivitiesApi] api and state must load first.');
        return;
    }

    function orgId() {
        const id = state.get('orgId');
        if (!id) return null;
        return id;
    }

    function genId() {
        const t = Date.now().toString(36);
        const r = Math.random().toString(36).slice(2, 6);
        return 'act_' + t + '_' + r;
    }

    function currentUser() {
        return state.get('user') || {};
    }

    /**
     * Fire-and-forget log write. Never throws, never blocks the caller's UI.
     * A failed log entry is a minor loss — it must not break the user action.
     *
     * @param {object} opts
     * @param {string} opts.text      Full readable sentence, e.g. "Added document 'X'"
     * @param {string} opts.refType   document | client | matter | deadline | physical_file
     * @param {string} opts.refId     Id of the referenced record (optional but recommended)
     * @param {string} opts.icon      Icon name (optional, defaults to refType)
     */
    function logActivity(opts) {
        if (!opts || !opts.text) return;
        const org = orgId();
        if (!org) return;

        const user = currentUser();
        const row = {
            id: genId(),
            organization_id: org,
            user_id: user.id || null,
            icon: opts.icon || opts.refType || 'dot',
            text: String(opts.text).slice(0, 500),
            who: user.name || user.email || 'system',
            ref_type: opts.refType || null,
            ref_id: opts.refId || null,
            created_at: new Date().toISOString(),
        };

        // Deliberately not awaited — writes in the background.
        api.rest('/lc_activities', {
            method: 'POST',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify([row]),
        }).catch(function(err) {
            console.warn('[activities] could not log:', err && err.message);
        });
    }

    async function list(filters) {
        filters = filters || {};
        const org = orgId();
        if (!org) throw new api.ApiError(400, 'No active organization.');

        const parts = ['select=*', 'organization_id=eq.' + encodeURIComponent(org)];
        if (filters.ref_type) parts.push('ref_type=eq.' + encodeURIComponent(filters.ref_type));
        if (filters.ref_id)   parts.push('ref_id=eq.'   + encodeURIComponent(filters.ref_id));
        if (filters.limit)    parts.push('limit=' + Number(filters.limit));
        parts.push('order=created_at.desc');

        const rows = await api.rest('/lc_activities?' + parts.join('&'));
        return Array.isArray(rows) ? rows : [];
    }

    window.LegisCoreActivitiesApi = {
        logActivity: logActivity,
        list: list,
        genId: genId,
    };

})(window);
