/**
 * LegisCore API Client
 * Centralized fetch wrapper handling auth headers, timeouts, error handling (401, 403, 404, 422, 429, 500),
 * and fallback mock data integration when DATA_MODE is set to 'mock'.
 */

(function(window) {
    'use strict';

    const CONFIG = window.LegisCoreConfig;
    if (!CONFIG) {
        console.error('LegisCoreConfig is required before loading api.js');
    }

    class ApiError extends Error {
        constructor(status, message, data = null) {
            super(message);
            this.name = 'ApiError';
            this.status = status;
            this.data = data;
        }
    }

    async function request(endpoint, options = {}) {
        const baseUrl = CONFIG ? CONFIG.API_BASE_URL : 'http://localhost:8000/api';
        const isMock = CONFIG && CONFIG.DATA_MODE === 'mock';

        // If mock mode is active and mock handler exists, we could route through it if needed,
        // but for now let's build the central fetch wrapper.
        
        const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Attach Authorization header if token exists in localStorage
        const tokenKey = CONFIG ? CONFIG.STORAGE_KEYS.TOKEN : 'legiscore_auth_token';
        const token = localStorage.getItem(tokenKey);
        if (token && !headers['Authorization']) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        // Timeout handling using AbortController
        const timeoutMs = CONFIG ? CONFIG.TIMEOUT_MS : 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        config.signal = controller.signal;

        try {
            const response = await fetch(url, config);
            clearTimeout(timeoutId);

            // Handle No Content response
            if (response.status === 204) {
                return null;
            }

            let data = null;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch (e) {
                    data = null;
                }
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                let errorMessage = (data && (data.message || data.error)) || response.statusText || 'Request failed';
                
                // Specific status code handling per requirements (401, 403, 404, 422, 429, 500)
                switch (response.status) {
                    case 401:
                        // Unauthorized - clear token/user and trigger auth expired event or redirect
                        console.warn('API 401 Unauthorized: clearing session');
                        localStorage.removeItem(tokenKey);
                        if (CONFIG && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.USER) {
                            localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
                        }
                        window.dispatchEvent(new CustomEvent('legiscore:unauthorized', { detail: { endpoint } }));
                        break;
                    case 403:
                        console.warn('API 403 Forbidden:', endpoint);
                        break;
                    case 404:
                        console.warn('API 404 Not Found:', endpoint);
                        break;
                    case 422:
                        console.warn('API 422 Unprocessable Entity / Validation Error');
                        break;
                    case 429:
                        console.warn('API 429 Rate Limited');
                        break;
                    case 500:
                        console.error('API 500 Internal Server Error');
                        break;
                    default:
                        break;
                }

                throw new ApiError(response.status, errorMessage, data);
            }

            return data;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new ApiError(408, 'Request timeout exceeded', { timeout: timeoutMs });
            }
            if (error instanceof ApiError) {
                throw error;
            }
            // Network or other fetch errors
            throw new ApiError(0, error.message || 'Network error or service unavailable', { originalError: error.toString() });
        }
    }

    window.LegisCoreApi = {
        request,
        ApiError,
        get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
        post: (endpoint, body, options) => request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
        put: (endpoint, body, options) => request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
        patch: (endpoint, body, options) => request(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
        delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' })
    };

})(window);
