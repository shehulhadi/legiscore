/**
 * LegisCore Router
 * Hash-based routing for SPA views: dashboard, documents, matters, clients, physical-files, settings.
 */

(function () {
    'use strict';

    const routes = {
        '': 'dashboard',
        '#': 'dashboard',
        '#dashboard': 'dashboard',
        '#documents': 'documents',
        '#matters': 'matters',
        '#clients': 'clients',
        '#physical-files': 'physical-files',
        '#settings': 'settings'
    };

    let currentRoute = null;
    let routeChangeListeners = [];

    function initRouter() {
        window.addEventListener('hashchange', handleRouteChange);
        // Initial route load
        handleRouteChange();
    }

    function handleRouteChange() {
        const hash = window.location.hash || '';
        // Extract base route (e.g. #documents/123 -> #documents)
        const baseHash = hash.split('/')[0] || '';
        const viewName = routes[baseHash] || 'dashboard';

        currentRoute = {
            hash: hash,
            baseHash: baseHash,
            viewName: viewName,
            params: hash.split('/').slice(1)
        };

        // Notify listeners
        routeChangeListeners.forEach(listener => {
            try {
                listener(currentRoute);
            } catch (err) {
                console.error('Error in route listener:', err);
            }
        });
    }

    function navigate(hash) {
        window.location.hash = hash;
    }

    function addListener(listener) {
        if (typeof listener === 'function') {
            routeChangeListeners.push(listener);
        }
    }

    function getCurrentRoute() {
        return currentRoute;
    }

    window.LegisCoreRouter = {
        init: initRouter,
        navigate: navigate,
        addListener: addListener,
        getCurrentRoute: getCurrentRoute
    };

})();
