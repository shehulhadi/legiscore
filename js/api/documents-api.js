/**
 * LegisCore — js/api/documents-api.js
 * Service layer for lc_documents. Exposes window.LegisCoreDocumentsApi.
 *
 * All Supabase REST calls for documents go through here so pages/
 * never need to know REST paths. Uses PostgREST embedded resources to
 * pull matter and client names in a single round trip.
 */

(function(window) {
    'use strict';

    const api = window.LegisCoreApi;
    const state = window.LegisCoreState;

    if (!api || !state) {
        console.error('[LegisCoreDocumentsApi] LegisCoreApi and LegisCoreState must load first.');
        return;
    }

    const TABLE = 'lc_documents';
    const SELECT = '*,lc_matters(id,title,matter_number),lc_clients(id,name)';

    function orgId() {
        const id = state.get('orgId');
        if (!id) throw new api.ApiError(400, 'No active organization on this session.');
        return id;
    }

    function genId() {
        const t = Date.now().toString(36);
        const r = Math.random().toString(36).slice(2, 6);
        return 'doc_' + t + '_' + r;
    }

    function buildQuery(filters) {
        filters = filters || {};
        const parts = [];
        parts.push('select=' + encodeURIComponent(SELECT));
        parts.push('organization_id=eq.' + encodeURIComponent(orgId()));

        if (filters.q && String(filters.q).trim()) {
            // Strip PostgREST syntax chars from user input to prevent injection.
            const kw = String(filters.q).trim().replace(/[%(),.*'"]/g, '');
            if (kw) {
                parts.push(
                    'or=(name.ilike.*' + kw + '*,document_type.ilike.*' + kw + '*)'
                );
            }
        }
        if (filters.document_type) {
            parts.push('document_type=eq.' + encodeURIComponent(filters.document_type));
        }
        if (filters.matter_id) {
            parts.push('matter_id=eq.' + encodeURIComponent(filters.matter_id));
        }
        if (filters.client_id) {
            parts.push('client_id=eq.' + encodeURIComponent(filters.client_id));
        }
        if (filters.status) {
            parts.push('status=eq.' + encodeURIComponent(filters.status));
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
        if (!id) throw new api.ApiError(400, 'Document id is required.');
        const rows = await api.rest(
            '/' + TABLE +
            '?id=eq.' + encodeURIComponent(id) +
            '&select=' + encodeURIComponent(SELECT)
        );
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new api.ApiError(404, 'Document not found.');
        }
        return rows[0];
    }

    async function create(input) {
        input = input || {};
        if (!input.name) throw new api.ApiError(400, 'Document name is required.');

        const user = state.get('user');
        const now = new Date().toISOString();

        const row = {
            id: input.id || genId(),
            organization_id: orgId(),
            matter_id: input.matter_id || null,
            client_id: input.client_id || null,
            name: input.name,
            document_type: input.document_type || null,
            source: input.source || 'uploaded',
            storage_key: input.storage_key || null,
            mime_type: input.mime_type || null,
            file_size: input.file_size || null,
            page_count: input.page_count || null,
            status: input.status || 'verified',
            tags: input.tags || [],
            expires_at: input.expires_at || null,
            created_by: user ? user.id : null,
            updated_by: user ? user.id : null,
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
        if (!id) throw new api.ApiError(400, 'Document id is required.');
        patch = patch || {};

        const user = state.get('user');
        const body = Object.assign({}, patch, {
            updated_at: new Date().toISOString(),
            updated_by: user ? user.id : null,
        });

        // Never let a caller overwrite identity or provenance fields.
        delete body.id;
        delete body.organization_id;
        delete body.created_at;
        delete body.created_by;

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
        if (!id) throw new api.ApiError(400, 'Document id is required.');
        await api.rest(
            '/' + TABLE + '?id=eq.' + encodeURIComponent(id),
            { method: 'DELETE' }
        );
        return true;
    }

    window.LegisCoreDocumentsApi = {
        list: list,
        get: get,
        create: create,
        update: update,
        remove: remove,
        genId: genId,
    };

})(window);
