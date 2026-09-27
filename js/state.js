/**
 * LegisCore Application State Management
 * Provides centralized in-memory state with reactive listeners and persistence hooks.
 */

(function(window) {
    'use strict';

    const config = window.LegisCoreConfig || {
        STORAGE_KEYS: {
            TOKEN: 'legiscore_auth_token',
            USER: 'legiscore_current_user',
            THEME: 'legiscore_theme',
            PREFERENCES: 'legiscore_preferences'
        }
    };

    // Initial state loading from localStorage / defaults
    let initialUser = null;
    try {
        const userStr = localStorage.getItem(config.STORAGE_KEYS.USER);
        if (userStr && userStr !== 'undefined') {
            initialUser = JSON.parse(userStr);
        }
    } catch (e) {
        console.warn('Failed to parse stored user from localStorage:', e);
    }

    let initialTheme = 'light';
    try {
        initialTheme = localStorage.getItem(config.STORAGE_KEYS.THEME) || 'light';
    } catch (e) {
        // ignore
    }

    let initialPreferences = {};
    try {
        const prefStr = localStorage.getItem(config.STORAGE_KEYS.PREFERENCES);
        if (prefStr) {
            initialPreferences = JSON.parse(prefStr);
        }
    } catch (e) {
        // ignore
    }

    const state = {
        user: initialUser,
        isAuthenticated: !!initialUser && !!localStorage.getItem(config.STORAGE_KEYS.TOKEN),
        theme: initialTheme,
        preferences: initialPreferences,
        loading: false,
        activeModal: null,
        notifications: []
    };

    const listeners = new Set();

    function getState() {
        // Return a shallow copy to prevent direct mutation
        return { ...state };
    }

    function setState(updater) {
        const nextState = typeof updater === 'function' ? updater(state) : updater;
        
        let changed = false;
        for (const key in nextState) {
            if (Object.prototype.hasOwnProperty.call(nextState, key)) {
                if (state[key] !== nextState[key]) {
                    state[key] = nextState[key];
                    changed = true;

                    // Persistence hooks for specific keys
                    if (key === 'user') {
                        if (nextState.user) {
                            localStorage.setItem(config.STORAGE_KEYS.USER, JSON.stringify(nextState.user));
                            state.isAuthenticated = true;
                        } else {
                            localStorage.removeItem(config.STORAGE_KEYS.USER);
                            localStorage.removeItem(config.STORAGE_KEYS.TOKEN);
                            state.isAuthenticated = false;
                        }
                    } else if (key === 'theme') {
                        localStorage.setItem(config.STORAGE_KEYS.THEME, nextState.theme);
                    } else if (key === 'preferences') {
                        localStorage.setItem(config.STORAGE_KEYS.PREFERENCES, JSON.stringify(nextState.preferences));
                    }
                }
            }
        }

        if (changed) {
            notifyListeners();
        }
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') {
            throw new Error('Listener must be a function');
        }
        listeners.add(listener);
        // Return unsubscribe function
        return function unsubscribe() {
            listeners.delete(listener);
        };
    }

    function notifyListeners() {
        const currentState = getState();
        for (const listener of listeners) {
            try {
                listener(currentState);
            } catch (e) {
                console.error('Error in state change listener:', e);
            }
        }
    }

    // Expose globally
    window.LegisCoreState = {
        getState,
        setState,
        subscribe
    };

})(window);
