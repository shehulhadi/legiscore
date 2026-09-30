/**
 * LegisCore — js/api/matters-api.js
 * Service layer for lc_matters. Exposes window.LegisCoreMattersApi.
 * All Supabase REST calls for matters go through here.
 */

(function(window) {
    'use strict';

    const api = window.LegisCoreApi;
    const state = window.LegisCoreState;

    if (!api || !state) {
        console.error('[LegisCoreMattersApi] LegisCoreApi and LegisCoreState must load first.');
        return;
    }

    const TABLE = 'lc_matters';
    const SELECT = '*,lc_clients(id,name)';

    function orgId() {
        const id = state.get('orgId');
        if (!id) throw new api.ApiError(400, 'No active organization on this session.');
        return id;
    }

    function genId() {
        const t = Date.now().toString(36);
        const r = Math.random().toString(36).slice(2, 6);
        return 'mat_' + t + '_' + r;
    }

    function buildQuery(filters) {
        filters = filters || {};
        const parts = [];
        parts.push('select=' + encodeURIComponent(SELECT));
        parts.push('organization_id=eq.' + encodeURIComponent(orgId()));

        if (filters.q && String(filters.q).trim()) {
            const kw = String(filters.q).trim().replace(/[%(),.*'"]/g, '');
            if (kw) {
                parts.push('or=(title.ilike.*' + kw + '*,matter_number.ilike.*' + kw + '*)');
            }
        }
        if (filters.type) {
            parts.push('type=eq.' + encodeURIComponent(filters.type));
        }
        if (filters.status) {
            parts.push('status=eq.' + encodeURIComponent(filters.status));
        }
        if (filters.client_id) {
            parts.push('client_id=eq.' + encodeURIComponent(filters.client_id));
        }

        parts.push('order=created_at.desc');

        if (filters.limit)  parts.push('limit='  + Number(filters.limit));
        if (filters.offset) parts.push('offset=' + Number(filters.offset));

        return '/' + TABLE + '?' + parts.join('&');
    }

    async function list(filters) {
        const rows = await api.rest(buildQuery(filters));
        return Array.isArray(rows) ? rows : [];
    }

    async function get(id) {
        if (!id) throw new api.ApiError(400, 'Matter id is required.');
        const rows = await api.rest(
            '/' + TABLE +
            '?id=eq.' + encodeURIComponent(id) +
            '&select=' + encodeURIComponent(SELECT)
        );
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new api.ApiError(404, 'Matter not found.');
        }
        return rows[0];
    }

    async function create(input) {
        input = input || {};
        if (!input.title) throw new api.ApiError(400, 'Matter title is required.');

        const user = state.get('user');
        const now = new Date().toISOString();

        const row = {
            id: input.id || genId(),
            organization_id: orgId(),
            matter_number: input.matter_number || null,
            title: input.title,
            type: input.type || null,
            status: input.status || 'active',
            client_id: input.client_id || null,
            description: input.description || null,
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
        if (!id) throw new api.ApiError(400, 'Matter id is required.');
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
        if (!id) throw new api.ApiError(400, 'Matter id is required.');
        await api.rest(
            '/' + TABLE + '?id=eq.' + encodeURIComponent(id),
            { method: 'DELETE' }
        );
        return true;
    }

    window.LegisCoreMattersApi = {
        list: list,
        get: get,
        create: create,
        update: update,
        remove: remove,
        genId: genId,
    };

})(window);
