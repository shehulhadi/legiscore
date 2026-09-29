/**
 * LegisCore — js/api/storage-api.js
 * Supabase Storage wrapper for the legiscore-documents bucket.
 * Exposes window.LegisCoreStorageApi.
 *
 * Path convention: {orgId}/{docId}/{safeFilename}
 * Bucket is private; downloads go through short-lived signed URLs.
 * Per-org isolation is by path prefix for now. Tighten with a
 * storage.objects policy keyed on path prefix before real client data.
 *
 * Free-tier limits: 50 MB per file, 1 GB total. Client-side checks
 * mirror those limits so we fail fast without a wasted round trip.
 */

(function(window) {
    'use strict';

    const api    = window.LegisCoreApi;
    const state  = window.LegisCoreState;
    const config = window.LegisCoreConfig;

    if (!api || !state || !config) {
        console.error('[LegisCoreStorageApi] api, state and config must load first.');
        return;
    }

    const BUCKET        = 'legiscore-documents';
    const MAX_FILE_MB   = 50;
    const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
    const DEFAULT_SIGNED_TTL = 3600; // seconds

    function orgId() {
        const id = state.get('orgId');
        if (!id) throw new api.ApiError(400, 'No active organization on this session.');
        return id;
    }

    function safeFilename(name) {
        // Strip anything that could break a URL path or collide.
        return String(name || 'file')
            .replace(/[^\w.\-]+/g, '_')
            .replace(/_{2,}/g, '_')
            .slice(0, 120) || 'file';
    }

    function buildPath(docId, filename) {
        if (!docId) throw new api.ApiError(400, 'Document id is required for upload.');
        return orgId() + '/' + docId + '/' + safeFilename(filename);
    }

    function checkSize(file) {
        if (!file) throw new api.ApiError(400, 'No file provided.');
        if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) {
            throw new api.ApiError(
                413,
                'File is larger than ' + MAX_FILE_MB + ' MB. Please compress or split it.'
            );
        }
    }

    async function uploadDocument(docId, file) {
        checkSize(file);
        const path = buildPath(docId, file.name);
        const url = '/storage/v1/object/' + BUCKET + '/' + encodeURI(path);

        await api.upload(url, file, {
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
                'x-upsert': 'true',
            },
        });

        return {
            storage_key: path,
            mime_type:   file.type || 'application/octet-stream',
            file_size:   file.size || null,
        };
    }

    async function getSignedUrl(storageKey, ttlSeconds) {
        if (!storageKey) throw new api.ApiError(400, 'storage_key is required.');
        const ttl = Number(ttlSeconds) > 0 ? Number(ttlSeconds) : DEFAULT_SIGNED_TTL;
        const url = '/storage/v1/object/sign/' + BUCKET + '/' + encodeURI(storageKey);

        const data = await api.post(url, { expiresIn: ttl });
        const signed = data && (data.signedURL || data.signedUrl);
        if (!signed) {
            throw new api.ApiError(500, 'Storage did not return a signed URL.');
        }

        // signedURL looks like: /object/sign/{bucket}/{path}?token=...
        // Full download URL = SUPABASE_URL + /storage/v1 + that path.
        const prefix = config.SUPABASE_URL + '/storage/v1';
        if (signed.startsWith('http')) return signed;
        if (signed.startsWith('/object/')) return prefix + signed;
        return prefix + '/object' + (signed.startsWith('/') ? '' : '/') + signed;
    }

    async function removeDocument(storageKey) {
        if (!storageKey) return false;
        const url = '/storage/v1/object/' + BUCKET + '/' + encodeURI(storageKey);
        try {
            await api.delete(url);
            return true;
        } catch (err) {
            // 404 is fine — object already gone.
            if (err && err.status === 404) return true;
            throw err;
        }
    }

    window.LegisCoreStorageApi = {
        BUCKET: BUCKET,
        MAX_FILE_MB: MAX_FILE_MB,
        uploadDocument: uploadDocument,
        getSignedUrl: getSignedUrl,
        removeDocument: removeDocument,
    };

})(window);
