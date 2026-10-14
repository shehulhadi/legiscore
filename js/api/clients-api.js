/**
 * LegisCore — js/api/clients-api.js
 * Service layer for lc_clients. Exposes window.LegisCoreClientsApi.
 * All Supabase REST calls for clients go through here.
 */

(function(window) {
    'use strict';

    const api = window.LegisCoreApi;
    const state = window.LegisCoreState;

    if (!api || !state) {
        console.error('[LegisCoreClientsApi] LegisCoreApi and LegisCoreState must load first.');
        return;
    }

    const TABLE = 'lc_clients';

    function orgId() {
        const id = state.get('orgId');
        if (!id) throw new api.ApiError(400, 'No active organization on this session.');
        return id;
    }

    function genId() {
        const t = Date.now().toString(36);
        const r = Math.random().toString(36).slice(2, 6);
        return 'cli_' + t + '_' + r;
    }

    function buildQuery(filters) {
        filters = filters || {};
        const parts = [];
        parts.push('select=*');
        parts.push('organization_id=eq.' + encodeURIComponent(orgId()));

        if (filters.q && String(filters.q).trim()) {
            const kw = String(filters.q).trim().replace(/[%(),.*'"]/g, '');
            if (kw) {
                parts.push('or=(name.ilike.*' + kw + '*,email.ilike.*' + kw + '*,phone.ilike.*' + kw + '*)');
            }
        }
        if (filters.client_type) {
            parts.push('client_type=eq.' + encodeURIComponent(filters.client_type));
        }

        parts.push('order=name.asc');

        if (filters.limit)  parts.push('limit='  + Number(filters.limit));
        if (filters.offset) parts.push('offset=' + Number(filters.offset));

        return '/' + TABLE + '?' + parts.join('&');
    }

    async function list(filters) {
        const rows = await api.rest(buildQuery(filters));
        return Array.isArray(rows) ? rows : [];
    }

    async function get(id) {
        if (!id) throw new api.ApiError(400, 'Client id is required.');
        const rows = await api.rest(
            '/' + TABLE +
            '?id=eq.' + encodeURIComponent(id) +
            '&select=*'
        );
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new api.ApiError(404, 'Client not found.');
        }
        return rows[0];
    }

    async function create(input) {
        input = input || {};
        if (!input.name) throw new api.ApiError(400, 'Client name is required.');

        const now = new Date().toISOString();

        const row = {
            id: input.id || genId(),
            organization_id: orgId(),
            name: input.name,
            client_type: input.client_type || 'individual',
            phone: input.phone || null,
            email: input.email || null,
            address: input.address || null,
            created_at: now,
            updated_at: now,
        };

        const rows = await api.rest('/' + TABLE, {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify([row]),
        });
        return Array.isArray(rows) ? rows[0] : row;
    }

    async function update(id, patch) {
        if (!id) throw new api.ApiError(400, 'Client id is required.');
        patch = patch || {};

        const body = Object.assign({}, patch, {
            updated_at: new Date().toISOString(),
        });

        delete body.id;
        delete body.organization_id;
        delete body.created_at;

        const rows = await api.rest(
            '/' + TABLE + '?id=eq.' + encodeURIComponent(id),
            {
                method: 'PATCH',
                headers: { 'Prefer': 'return=representation' },
                body: JSON.stringify(body),
            }
        );
        return Array.isArray(rows) ? rows[0] : null;
    }

    async function remove(id) {
        if (!id) throw new api.ApiError(400, 'Client id is required.');
        await api.rest(
            '/' + TABLE + '?id=eq.' + encodeURIComponent(id),
            { method: 'DELETE' }
        );
        return true;
    }

    // Counts how many matters are attached — used by the client list.
    async function matterCounts() {
        const org = orgId();
        const rows = await api.rest(
            '/lc_matters?organization_id=eq.' + encodeURIComponent(org) + '&select=client_id'
        );
        const counts = {};
        if (Array.isArray(rows)) {
            rows.forEach(function(r) {
                if (r.client_id) counts[r.client_id] = (counts[r.client_id] || 0) + 1;
            });
        }
        return counts;
    }

    window.LegisCoreClientsApi = {
        list: list,
        get: get,
        create: create,
        update: update,
        remove: remove,
        genId: genId,
        matterCounts: matterCounts,
    };

})(window);
