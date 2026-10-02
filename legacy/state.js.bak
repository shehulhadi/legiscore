/**
 * LegisCore — state.js
 * In-memory application state with a small event emitter.
 * Exposes window.LegisCoreState.
 *
 * Nothing here is persisted. Auth tokens live in localStorage via
 * js/api/auth-api.js. Documents and user data never touch localStorage.
 */

(function(window) {
    'use strict';

    const STATE_KEYS = [
        'user',            // lc_users row for the signed-in user
        'orgId',           // lc_organizations.id for that user
        'currentRoute',    // e.g. 'documents'
        'routeParams',     // parsed query params from the hash
        'viewData',        // per-view cached data (lists, pagination, etc.)
        'filters',         // active filters per view
        'loading',         // boolean, global loading indicator
        'error',           // last error message (string or null)
    ];

    const state = {
        user: null,
        orgId: null,
        currentRoute: '',
        routeParams: {},
        viewData: {},
        filters: {},
        loading: false,
        error: null,
    };

    const listeners = new Set();

    function getState() {
        return state;
    }

    function get(key) {
        return state[key];
    }

    function setState(patch) {
        if (!patch || typeof patch !== 'object') return;
        let changed = false;
        for (const key of Object.keys(patch)) {
            if (state[key] !== patch[key]) {
                state[key] = patch[key];
                changed = true;
            }
        }
        if (changed) notify();
    }

    function set(key, value) {
        if (state[key] !== value) {
            state[key] = value;
            notify();
        }
    }

    function notify() {
        for (const listener of listeners) {
            try {
                listener(state);
            } catch (err) {
                console.error('[LegisCoreState] listener error:', err);
            }
        }
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return function() {};
        listeners.add(listener);
        return function unsubscribe() {
            listeners.delete(listener);
        };
    }

    function reset() {
        for (const key of STATE_KEYS) {
            if (Array.isArray(state[key])) state[key] = [];
            else if (state[key] && typeof state[key] === 'object') state[key] = {};
            else state[key] = null;
        }
        state.loading = false;
        state.error = null;
        notify();
    }

    window.LegisCoreState = {
        getState,
        get,
        set,
        setState,
        subscribe,
        reset,
    };

})(window);
