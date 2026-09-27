/**
 * LegisCore Auth API (Supabase Auth)
 * Wraps /auth/v1 endpoints: password grant, signup, logout, get user, refresh.
 */

(function(window) {
    'use strict';

    const api = window.LegisCoreApi;
    const CONFIG = window.LegisCoreConfig;

    if (!api || !CONFIG) {
        console.error('LegisCoreApi and LegisCoreConfig are required before auth-api.js');
        return;
    }

    function persistSession(payload) {
        if (!payload) return;
        if (payload.access_token) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, payload.access_token);
        }
        if (payload.refresh_token) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN, payload.refresh_token);
        }
        if (payload.user) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(payload.user));
        }
    }

    function clearSession() {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
    }

    async function login(email, password) {
        if (!email || !password) {
            throw new api.ApiError(400, 'Email and password are required');
        }

        const data = await api.auth('/token?grant_type=password', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (!data || !data.access_token) {
            throw new api.ApiError(500, 'Login response missing access_token');
        }

        persistSession(data);
        return data;
    }

    async function signUp(email, password, metadata) {
        if (!email || !password) {
            throw new api.ApiError(400, 'Email and password are required');
        }
        const body = { email, password };
        if (metadata) body.data = metadata;

        const data = await api.auth('/signup', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        // If email confirmation is OFF, signup returns a session immediately.
        // If it's ON, only a user object is returned and the caller must log in later.
        if (data && data.access_token) {
            persistSession(data);
        }
        return data;
    }

    async function logout() {
        try {
            await api.auth('/logout', { method: 'POST' });
        } catch (e) {
            console.warn('Server logout failed; clearing local session anyway:', e);
        } finally {
            clearSession();
        }
    }

    async function getCurrentUser() {
        const data = await api.auth('/user', { method: 'GET' });
        if (data) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(data));
        }
        return data;
    }

    async function refreshSession() {
        const refreshToken = localStorage.getItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
        if (!refreshToken) {
            throw new api.ApiError(401, 'No refresh token stored');
        }

        const data = await api.auth('/token?grant_type=refresh_token', {
            method: 'POST',
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (!data || !data.access_token) {
            clearSession();
            throw new api.ApiError(401, 'Refresh failed; please log in again');
        }

        persistSession(data);
        return data;
    }

    function getStoredUser() {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (_) { return null; }
    }

    function isAuthenticated() {
        return !!localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
    }

    window.LegisCoreApi.authApi = {
        login,
        signUp,
        logout,
        getCurrentUser,
        refreshSession,
        getStoredUser,
        isAuthenticated
    };

})(window);
