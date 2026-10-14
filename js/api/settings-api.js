/**
 * LegisCore — js/api/settings-api.js
 * Service layer for the Settings page. Exposes window.LegisCoreSettingsApi.
 *
 * Firm profile lives on lc_organizations.
 * Staff lives on lc_users (id matches auth.users.id).
 * Adding a new staff member is a manual process — it requires signing
 *   up a Supabase auth user, which would end the admin's own session
 *   if done client-side. Documented in README.
 * Reset password is also deliberately not here: it needs a service-role
 *   key that we must never ship to the browser.
 */

(function(window) {
    'use strict';

    const api     = window.LegisCoreApi;
    const state   = window.LegisCoreState;
    if (!api || !state) {
        console.error('[LegisCoreSettingsApi] api and state must load first.');
        return;
    }

    function orgId() {
        const id = state.get('orgId');
        if (!id) throw new api.ApiError(400, 'No active organization on this session.');
        return id;
    }

    function genUserId() {
        // Placeholder — the id comes back from Supabase auth.signUp,
        // so we never actually generate one client-side. Kept here for
        // symmetry with other APIs.
        return null;
    }

    // ---- firm profile ------------------------------------------------

    async function getOrganization() {
        const rows = await api.rest(
            '/lc_organizations?id=eq.' + encodeURIComponent(orgId()) + '&select=*'
        );
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new api.ApiError(404, 'Organization not found.');
        }
        return rows[0];
    }

    async function updateOrganization(patch) {
        patch = patch || {};
        const body = {
            name: patch.name,
            country: patch.country || null,
            industry: patch.industry || 'Legal Services',
        };
        // Remove undefined so we don't clobber with null unintentionally
        Object.keys(body).forEach(function(k) {
            if (body[k] === undefined) delete body[k];
        });
        if (!body.name) throw new api.ApiError(400, 'Firm name is required.');

        const rows = await api.rest(
            '/lc_organizations?id=eq.' + encodeURIComponent(orgId()),
            {
                method: 'PATCH',
                headers: { 'Prefer': 'return=representation' },
                body: JSON.stringify(body),
            }
        );
        return Array.isArray(rows) ? rows[0] : null;
    }

    // ---- staff ------------------------------------------------------

    async function listStaff() {
        const rows = await api.rest(
            '/lc_users?organization_id=eq.' + encodeURIComponent(orgId()) +
            '&order=created_at.asc&select=id,email,name,role,phone,active,created_at'
        );
        return Array.isArray(rows) ? rows : [];
    }

    async function updateStaff(id, patch) {
        if (!id) throw new api.ApiError(400, 'User id is required.');
        patch = patch || {};
        const body = {};
        if (typeof patch.name === 'string')  body.name = patch.name;
        if (typeof patch.role === 'string')  body.role = patch.role;
        if (typeof patch.phone === 'string' || patch.phone === null) body.phone = patch.phone;
        if (typeof patch.active === 'boolean') body.active = patch.active;
        if (Object.keys(body).length === 0) {
            throw new api.ApiError(400, 'Nothing to update.');
        }
        const rows = await api.rest(
            '/lc_users?id=eq.' + encodeURIComponent(id),
            {
                method: 'PATCH',
                headers: { 'Prefer': 'return=representation' },
                body: JSON.stringify(body),
            }
        );
        return Array.isArray(rows) ? rows[0] : null;
    }

    async function countAdmins() {
        const rows = await api.rest(
            '/lc_users?organization_id=eq.' + encodeURIComponent(orgId()) +
            '&role=eq.administrator&active=eq.true&select=id'
        );
        return Array.isArray(rows) ? rows.length : 0;
    }

    // ---- activity (read-only for now) --------------------------------

    async function listActivity(filters) {
        filters = filters || {};
        const parts = [];
        parts.push('select=*');
        parts.push('organization_id=eq.' + encodeURIComponent(orgId()));

        if (filters.ref_type) {
            parts.push('ref_type=eq.' + encodeURIComponent(filters.ref_type));
        }
        if (filters.who && String(filters.who).trim()) {
            const w = String(filters.who).trim().replace(/[%(),.*'"]/g, '');
            if (w) parts.push('who.ilike.*' + w + '*');
        }
        if (filters.since) {
            parts.push('created_at=gte.' + encodeURIComponent(filters.since));
        }

        parts.push('order=created_at.desc');
        parts.push('limit=' + Number(filters.limit || 100));

        return api.rest('/lc_activities?' + parts.join('&'));
    }

    window.LegisCoreSettingsApi = {
        getOrganization: getOrganization,
        updateOrganization: updateOrganization,
        listStaff: listStaff,
        updateStaff: updateStaff,
        countAdmins: countAdmins,
        listActivity: listActivity,
        genUserId: genUserId,
    };

})(window);
