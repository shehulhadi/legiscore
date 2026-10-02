/**
 * LegisCore — app.js
 * Bootstrap: auth guard, load user profile, mount layout, register routes, start router.
 * Exposes window.LegisCoreApp.
 *
 * Page views (dashboard, documents, matters, ...) are intentionally
 * stubbed here. They get replaced one-by-one by real page modules in a
 * follow-up plan. The shell this file builds is the one everything else
 * plugs into.
 */

(function(window) {
    'use strict';

    const config  = window.LegisCoreConfig;
    const state   = window.LegisCoreState;
    const router  = window.LegisCoreRouter;
    const layout  = window.LegisCoreLayout;
    const api     = window.LegisCoreApi;
    const authApi = api && api.authApi;

    if (!config || !state || !router || !layout || !api || !authApi) {
        document.body.innerHTML =
            '<div style="padding:24px;font-family:sans-serif;color:#b91c1c">' +
            'LegisCore failed to boot: a required module did not load. ' +
            'Check the script order in index.html.' +
            '</div>';
        return;
    }

    const LOGIN_URL = 'login.html';

    function redirectToLogin() {
        // Clear any stale session before bouncing. Otherwise login.html
        // sees a leftover token and bounces us right back to index.html,
        // producing an infinite loop when the token is invalid.
        try {
            const keys = (config && config.STORAGE_KEYS) || {};
            localStorage.removeItem(keys.TOKEN || 'legiscore_auth_token');
            localStorage.removeItem(keys.REFRESH_TOKEN || 'legiscore_refresh_token');
            localStorage.removeItem(keys.USER || 'legiscore_current_user');
        } catch (_) { /* ignore */ }
        window.location.replace(LOGIN_URL);
    }

    function placeholder(title, note) {
        return function(container) {
            container.innerHTML =
                '<div class="page-header">' +
                    '<div>' +
                        '<h1>' + title + '</h1>' +
                        '<p class="page-subtitle">' + (note || 'Coming next.') + '</p>' +
                    '</div>' +
                '</div>' +
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">&#128193;</div>' +
                    '<h2 class="empty-state-title">' + title + ' view</h2>' +
                    '<p class="empty-state-desc">This view will be built in the next plan. The shell, routing, auth, and role gating are working — pages plug in here.</p>' +
                '</div>';
        };
    }

    function registerRoutes() {
        // Both roles can access the dashboard, documents, matters, clients,
        // and physical files. Only administrators see settings.
        const BOTH = ['secretary', 'administrator'];
        const ADMIN_ONLY = ['administrator'];

        router.register('dashboard', {
            title: 'Dashboard',
            allowedRoles: BOTH,
            render: function(container) {
                if (window.LegisCoreDashboard && typeof window.LegisCoreDashboard.render === 'function') {
                    window.LegisCoreDashboard.render(container);
                } else {
                    placeholder('Dashboard', 'Dashboard module failed to load.')(container);
                }
            },
        });

        router.register('documents', {
            title: 'Documents',
            allowedRoles: BOTH,
            render: function(container) {
                if (window.LegisCoreDocuments && typeof window.LegisCoreDocuments.render === 'function') {
                    window.LegisCoreDocuments.render(container);
                } else {
                    placeholder('Documents', 'Documents module failed to load.')(container);
                }
            },
        });

        router.register('matters', {
            title: 'Matters',
            allowedRoles: BOTH,
            render: function(container) {
                if (window.LegisCoreMatters && typeof window.LegisCoreMatters.render === 'function') {
                    window.LegisCoreMatters.render(container);
                } else {
                    placeholder('Matters', 'Matters module failed to load.')(container);
                }
            },
        });

        router.register('matter', {
            title: 'Matter',
            allowedRoles: BOTH,
            render: function(container, params) {
                if (window.LegisCoreMatterDetail && typeof window.LegisCoreMatterDetail.render === 'function') {
                    window.LegisCoreMatterDetail.render(container, params);
                } else {
                    placeholder('Matter', 'Matter detail module failed to load.')(container);
                }
            },
        });

        router.register('clients', {
            title: 'Clients',
            allowedRoles: BOTH,
            render: placeholder('Clients', 'Client directory and per-client documents.'),
        });

        router.register('physical-files', {
            title: 'Physical Files',
            allowedRoles: BOTH,
            render: placeholder('Physical Files', 'Cabinet, shelf, and folder tracking.'),
        });

        router.register('settings', {
            title: 'Settings',
            allowedRoles: ADMIN_ONLY,
            render: placeholder('Settings', 'Staff, permissions, document types.'),
        });
    }

    async function loadUserProfile() {
        // Pull the lc_users row that matches the signed-in auth user.
        // authApi.getCurrentUser returns the auth user (id, email, ...).
        // We then fetch the profile row by id.
        const authUser = await authApi.getCurrentUser();
        if (!authUser || !authUser.id) {
            throw new Error('No auth user returned');
        }

        const rows = await api.rest(
            '/lc_users?id=eq.' + encodeURIComponent(authUser.id) + '&select=*'
        );

        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error(
                'Your account is not linked to a LegisCore profile. ' +
                'Ask an administrator to add you.'
            );
        }

        const profile = rows[0];

        if (profile.active === false) {
            throw new Error('Your account has been deactivated.');
        }

        state.set('user', profile);
        state.set('orgId', profile.organization_id || null);
        return profile;
    }

    function showBootError(message) {
        const root = document.getElementById('app');
        if (root) {
            root.innerHTML =
                '<div style="padding:24px">' +
                    '<div class="alert alert-error">' + message + '</div>' +
                    '<a href="' + LOGIN_URL + '" class="btn btn-secondary">Back to sign in</a>' +
                '</div>';
        }
    }

    async function boot() {
        if (!authApi.isAuthenticated()) {
            redirectToLogin();
            return;
        }

        try {
            await loadUserProfile();
        } catch (err) {
            console.error('[LegisCoreApp] boot failed:', err);
            if (err.status === 401 || err.status === 403) {
                redirectToLogin();
                return;
            }
            showBootError(err.message || 'Could not load your profile.');
            return;
        }

        layout.mount();
        registerRoutes();
        router.start();
    }

    // authApi emits legiscore:unauthorized on 401 from anywhere.
    window.addEventListener('legiscore:unauthorized', function() {
        redirectToLogin();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.LegisCoreApp = { boot };

})(window);
