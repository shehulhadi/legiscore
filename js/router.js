/**
 * LegisCore — router.js
 * Hash-based router. Exposes window.LegisCoreRouter.
 *
 * Routes are registered by js/layout.js and js/app.js. Each route has:
 *   { path, render, allowedRoles, title }
 *
 * A route's `render(container, params)` is responsible for everything
 * inside #app-main — including its own loading / success / empty /
 * error states. The router only handles matching, auth-gating, and
 * swapping the container.
 */

(function(window) {
    'use strict';

    const state = window.LegisCoreState;
    if (!state) {
        console.error('[LegisCoreRouter] LegisCoreState must load first.');
        return;
    }

    const routes = new Map();
    let mounted = false;
    const listeners = new Set();

    function register(path, config) {
        if (!path || typeof path !== 'string') {
            throw new Error('route path must be a non-empty string');
        }
        if (!config || typeof config.render !== 'function') {
            throw new Error('route "' + path + '" must have a render(container, params)');
        }
        routes.set(path, {
            path,
            render: config.render,
            allowedRoles: config.allowedRoles || [],
            title: config.title || path,
        });
    }

    function parseHash() {
        const raw = (window.location.hash || '').replace(/^#\/?/, '');
        const [pathPart, queryPart] = raw.split('?');
        const path = pathPart || 'dashboard';
        const params = {};
        if (queryPart) {
            try {
                new URLSearchParams(queryPart).forEach((v, k) => {
                    params[k] = v;
                });
            } catch (_) { /* ignore malformed query */ }
        }
        return { path, params };
    }

    function clearContainer(container) {
        if (container) container.innerHTML = '';
    }

    function renderNotFound(container, path) {
        container.innerHTML =
            '<div class="empty-state">' +
                '<div class="empty-state-icon">404</div>' +
                '<h2 class="empty-state-title">Page not found</h2>' +
                '<p class="empty-state-desc">No route matches <code>#' + escapeHtml(path) + '</code>.</p>' +
                '<a href="#/dashboard" class="btn btn-primary">Return to Dashboard</a>' +
            '</div>';
    }

    function renderForbidden(container, path, allowedRoles) {
        container.innerHTML =
            '<div class="empty-state">' +
                '<div class="empty-state-icon">&#128274;</div>' +
                '<h2 class="empty-state-title">Access restricted</h2>' +
                '<p class="empty-state-desc">Your role does not have access to <code>#' + escapeHtml(path) + '</code>. Required: ' +
                    escapeHtml(allowedRoles.join(' or ')) +
                '.</p>' +
                '<a href="#/dashboard" class="btn btn-primary">Return to Dashboard</a>' +
            '</div>';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function handleRoute() {
        const container = document.getElementById('app-main');
        if (!container) {
            console.error('[LegisCoreRouter] #app-main not found in DOM.');
            return;
        }

        const { path, params } = parseHash();
        const route = routes.get(path);

        state.setState({ currentRoute: path, routeParams: params });

        if (!route) {
            renderNotFound(container, path);
            notify(path, params, route);
            return;
        }

        const userRole = state.get('user') && state.get('user').role;
        if (route.allowedRoles.length > 0 && (!userRole || !route.allowedRoles.includes(userRole))) {
            renderForbidden(container, path, route.allowedRoles);
            notify(path, params, route);
            return;
        }

        clearContainer(container);
        try {
            route.render(container, params);
        } catch (err) {
            console.error('[LegisCoreRouter] render failed for', path, err);
            container.innerHTML =
                '<div class="alert alert-error">Could not render this view. ' +
                escapeHtml(err.message || 'Unknown error') + '</div>';
        }
        notify(path, params, route);
    }

    function notify(path, params, route) {
        for (const l of listeners) {
            try { l({ path, params, route }); } catch (e) { console.error(e); }
        }
    }

    function onRouteChange(fn) {
        if (typeof fn !== 'function') return function() {};
        listeners.add(fn);
        return function off() { listeners.delete(fn); };
    }

    function navigate(path) {
        const clean = String(path || '').replace(/^#\/?/, '');
        if (('#/' + clean) === window.location.hash) {
            handleRoute();
        } else {
            window.location.hash = '#/' + clean;
        }
    }

    function start() {
        if (mounted) return;
        mounted = true;
        window.addEventListener('hashchange', handleRoute);
        if (!window.location.hash) {
            window.location.hash = '#/dashboard';
        } else {
            handleRoute();
        }
    }

    window.LegisCoreRouter = {
        register,
        start,
        navigate,
        onRouteChange,
        getCurrentPath: function () { return parseHash().path; },
    };

})(window);
