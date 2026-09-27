/**
 * LegisCore Auth API
 * Provides login, logout, and getCurrentUser methods.
 */

(function(window) {
    'use strict';

    const api = window.LegisCoreAPI;
    const config = window.LegisCoreConfig || {
        STORAGE_KEYS: { TOKEN: 'legiscore_auth_token', USER: 'legiscore_current_user' }
    };

    if (!api) {
        console.error('LegisCoreAPI is required before loading AuthAPI.');
    }

    async function login(email, password) {
        const response = await api.post('/auth/login', { email, password });
        
        // Expecting response structure like { token: '...', user: {...} } or { access_token: '...', user: {...} }
        const token = response.token || response.access_token || (response.data && response.data.token);
        const user = response.user || (response.data && response.data.user);

        if (token) {
            localStorage.setItem(config.STORAGE_KEYS.TOKEN, token);
        }
        if (user) {
            localStorage.setItem(config.STORAGE_KEYS.USER, JSON.stringify(user));
        }

        return response;
    }

    async function logout() {
        try {
            await api.post('/auth/logout', {});
        } catch (e) {
            // Even if server logout fails, clean up local storage
            console.warn('Server logout failed or token already expired:', e);
        } finally {
            localStorage.removeItem(config.STORAGE_KEYS.TOKEN);
            localStorage.removeItem(config.STORAGE_KEYS.USER);
        }
    }

    async function getCurrentUser() {
        try {
            const response = await api.get('/auth/me');
            const user = response.user || response.data || response;
            if (user) {
                localStorage.setItem(config.STORAGE_KEYS.USER, JSON.stringify(user));
            }
            return user;
        } catch (e) {
            if (e.status === 401) {
                localStorage.removeItem(config.STORAGE_KEYS.TOKEN);\n                localStorage.removeItem(config.STORAGE_KEYS.USER);\n            }
            throw e;
        }
    }

    // Attach to global namespace under window.LegisCoreAPI.auth
    if (!window.LegisCoreAPI) {
        window.LegisCoreAPI = {};
    }

    window.LegisCoreAPI.auth = {
        login,
        logout,
        getCurrentUser
    };

})(window);
