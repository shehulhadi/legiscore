/**
 * LegisCore — app.js
 * Bootstrap: auth guard, load user profile, mount layout, register routes, start router.
 * Exposes window.LegisCoreApp.
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
            render: function(container) {
                if (window.LegisCoreClients && typeof window.LegisCoreClients.render === 'function') {
                    window.LegisCoreClients.render(container);
                } else {
                    placeholder('Clients', 'Clients module failed to load.')(container);
                }
            },
        });

        router.register('physical-files', {
            title: 'Physical Files',
            allowedRoles: BOTH,
            render: function(container) {
                if (window.LegisCorePhysicalFiles && typeof window.LegisCorePhysicalFiles.render === 'function') {
                    window.LegisCorePhysicalFiles.render(container);
                } else {
                    placeholder('Physical Files', 'Physical file tracking module failed to load.')(container);
                }
            },
        });

        router.register('settings', {
            title: 'Settings',
            allowedRoles: ADMIN_ONLY,
            render: function(container) {
                if (window.LegisCoreSettings && typeof window.LegisCoreSettings.render === 'function') {
                    window.LegisCoreSettings.render(container);
                } else {
                    placeholder('Settings', 'Settings module failed to load.')(container);
                }
            },
        });
    }

    async function init() {
        if (!authApi.isAuthenticated()) {
            redirectToLogin();
            return;
        }

        let sessionUser = null;
        try {
            sessionUser = await authApi.getCurrentUser();
        } catch (err) {
            console.error('Failed to get current auth user:', err);
        }

        if (!sessionUser || !sessionUser.id) {
            redirectToLogin();
            return;
        }

        let profile = null;
        try {
            const res = await api.rest('lc_users?select=*&auth_user_id=eq.' + encodeURIComponent(sessionUser.id) + '&limit=1');
            if (Array.isArray(res) && res.length > 0) {
                profile = res[0];
            }
        } catch (err) {
            console.error('Failed to load profile from lc_users:', err);
        }

        if (!profile) {
            profile = {
                id: sessionUser.id,
                auth_user_id: sessionUser.id,
                email: sessionUser.email,
                full_name: (sessionUser.user_metadata && sessionUser.user_metadata.full_name) || sessionUser.email,
                role: 'secretary',
                is_active: true
            };
        }

        if (profile.is_active === false) {
            alert('Your account has been deactivated. Please contact the administrator.');
            redirectToLogin();
            return;
        }

        state.setUser(profile);

        const appContainer = document.getElementById('app');
        if (!appContainer) {
            console.error('Root #app container not found in DOM.');
            return;
        }

        layout.mount(appContainer, {
            user: profile,
            onLogout: async function() {
                try {
                    await authApi.logout();
                } catch (_) {}
                redirectToLogin();
            }
        });

        registerRoutes();
        router.init();
    }

    window.LegisCoreApp = {
        init: init
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window);
