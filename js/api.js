/**
 * LegisCore API Client (Supabase)
 * Centralized fetch wrapper. Handles apikey/Bearer headers, timeouts,
 * Supabase error shapes, and 401 session-clearing.
 */

(function(window) {
    'use strict';

    const CONFIG = window.LegisCoreConfig;
    if (!CONFIG) {
        console.error('LegisCoreConfig is required before loading api.js');
        return;
    }

    class ApiError extends Error {
        constructor(status, message, data = null) {
            super(message);
            this.name = 'ApiError';
            this.status = status;
            this.data = data;
        }
    }

    function getAccessToken() {
        return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
    }

    function buildHeaders(options) {
        const headers = Object.assign({}, options.headers);

        // Supabase requires apikey on every request
        if (!headers['apikey']) {
            headers['apikey'] = CONFIG.SUPABASE_ANON_KEY;
        }

        // Only set Content-Type when a body is present, so GETs stay clean
        if (options.body && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        // Prefer the user's access token; fall back to the anon key
        if (!headers['Authorization']) {
            const token = getAccessToken();
            headers['Authorization'] = 'Bearer ' + (token || CONFIG.SUPABASE_ANON_KEY);
        }

        return headers;
    }

    function extractErrorMessage(status, data, fallback) {
        if (data && typeof data === 'object') {
            return (
                data.error_description ||
                data.msg ||
                data.message ||
                data.error ||
                fallback ||
                'Request failed'
            );
        }
        if (typeof data === 'string' && data.length) return data;
        return fallback || 'Request failed';
    }

    async function request(url, options = {}) {
        const finalUrl = url.startsWith('http') ? url : (CONFIG.SUPABASE_URL + url);

        const config = Object.assign({}, options, {
            headers: buildHeaders(options)
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
        config.signal = controller.signal;

        try {
            const response = await fetch(finalUrl, config);
            clearTimeout(timeoutId);

            if (response.status === 204) return null;

            let data = null;
            const ct = response.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                try { data = await response.json(); } catch (_) { data = null; }
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                const message = extractErrorMessage(response.status, data, response.statusText);

                if (response.status === 401) {
                    localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
                    localStorage.removeItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
                    localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
                    window.dispatchEvent(new CustomEvent('legiscore:unauthorized', {
                        detail: { url: finalUrl }
                    }));
                } else if (response.status === 403) {
                    console.warn('API 403 Forbidden:', finalUrl);
                } else if (response.status === 404) {
                    console.warn('API 404 Not Found:', finalUrl);
                } else if (response.status === 422) {
                    console.warn('API 422 Validation Error:', data);
                } else if (response.status === 429) {
                    console.warn('API 429 Rate Limited');
                } else if (response.status >= 500) {
                    console.error('API', response.status, 'Server Error');
                }

                throw new ApiError(response.status, message, data);
            }

            return data;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new ApiError(408, 'Request timeout exceeded', { timeout: CONFIG.TIMEOUT_MS });
            }
            if (error instanceof ApiError) throw error;
            throw new ApiError(0, error.message || 'Network error', { originalError: String(error) });
        }
    }

    function authRequest(path, options = {}) {
        const p = path.startsWith('/') ? path : '/' + path;
        return request(CONFIG.AUTH_BASE + p, options);
    }

    function restRequest(path, options = {}) {
        const p = path.startsWith('/') ? path : '/' + path;
        return request(CONFIG.REST_BASE + p, options);
    }

    window.LegisCoreApi = {
        request,
        auth: authRequest,
        rest: restRequest,
        ApiError,
        get: (url, options) => request(url, Object.assign({}, options, { method: 'GET' })),
        post: (url, body, options) => request(url, Object.assign({}, options, { method: 'POST', body: JSON.stringify(body) })),
        put: (url, body, options) => request(url, Object.assign({}, options, { method: 'PUT', body: JSON.stringify(body) })),
        patch: (url, body, options) => request(url, Object.assign({}, options, { method: 'PATCH', body: JSON.stringify(body) })),
        delete: (url, options) => request(url, Object.assign({}, options, { method: 'DELETE' }))
    };

})(window);
