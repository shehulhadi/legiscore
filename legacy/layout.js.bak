/**
 * LegisCore — layout.js
 * Renders the app shell: sidebar navigation + topbar.
 * Exposes window.LegisCoreLayout.
 */

(function(window) {
    'use strict';

    const state = window.LegisCoreState;
    const router = window.LegisCoreRouter;
    const authApi = window.LegisCoreApi && window.LegisCoreApi.authApi;

    if (!state || !router) {
        console.error('[LegisCoreLayout] LegisCoreState and LegisCoreRouter must load first.');
        return;
    }

    const NAV_ITEMS = [
        { path: 'dashboard',       label: 'Dashboard',      icon: 'grid'  },
        { path: 'documents',       label: 'Documents',      icon: 'doc'   },
        { path: 'matters',         label: 'Matters',        icon: 'brief' },
        { path: 'clients',         label: 'Clients',        icon: 'users' },
        { path: 'physical-files',  label: 'Physical Files', icon: 'cab'   },
        { path: 'settings',        label: 'Settings',       icon: 'cog'   },
    ];

    const ICONS = {
        grid:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
        doc:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        brief: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
        users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        cab:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
        cog:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        menu:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
        x:     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    };

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderSidebar() {
        const items = NAV_ITEMS.map(function(item) {
            return (
                '<li>' +
                    '<a href="#/' + item.path + '" class="nav-item" data-route="' + item.path + '">' +
                        (ICONS[item.icon] || '') +
                        '<span>' + item.label + '</span>' +
                    '</a>' +
                '</li>'
            );
        }).join('');

        return (
            '<aside class="app-sidebar" id="app-sidebar" aria-label="Sidebar">' +
                '<div class="sidebar-header">' +
                    '<a href="#/dashboard" class="sidebar-brand">' +
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' +
                        '<span>LegisCore</span>' +
                    '</a>' +
                '</div>' +
                '<nav class="sidebar-nav">' +
                    '<div class="nav-section-title">Workspace</div>' +
                    '<ul class="nav-list">' + items + '</ul>' +
                '</nav>' +
                '<div class="sidebar-footer">' +
                    '<div>Twins Barristers</div>' +
                '</div>' +
            '</aside>' +
            '<div class="sidebar-overlay" id="sidebar-overlay"></div>'
        );
    }

    function userInitials(user) {
        if (!user) return '?';
        const name = user.name || user.email || '';
        return name.split(/\s+|@/).slice(0, 2).map(function(p) {
            return (p[0] || '').toUpperCase();
        }).join('') || '?';
    }

    function renderTopbar() {
        return (
            '<header class="app-topbar" id="app-topbar">' +
                '<div class="topbar-left">' +
                    '<button class="sidebar-toggle-btn" id="sidebar-toggle-btn" aria-label="Toggle sidebar">' +
                        ICONS.menu +
                    '</button>' +
                    '<h1 class="topbar-title" id="topbar-title">Dashboard</h1>' +
                '</div>' +
                '<div class="topbar-right" id="topbar-user-slot"></div>' +
            '</header>'
        );
    }

    function renderUserChip(user) {
        if (!user) {
            return '<a href="login.html" class="btn btn-secondary btn-sm">Sign in</a>';
        }
        const initials = userInitials(user);
        const roleLabel = (user.role || '').replace(/^\w/, function(c) { return c.toUpperCase(); });
        return (
            '<div class="topbar-user">' +
                '<span class="badge badge-primary">' + escapeHtml(roleLabel) + '</span>' +
                '<span class="text-sm">' + escapeHtml(user.name || user.email) + '</span>' +
            '</div>' +
            '<button class="topbar-icon-btn" id="sign-out-btn" title="Sign out" aria-label="Sign out">' +
                ICONS.x +
            '</button>'
        );
    }

    function wireMobileToggle() {
        const toggle = document.getElementById('sidebar-toggle-btn');
        const sidebar = document.getElementById('app-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (!toggle || !sidebar || !overlay) return;

        function open()  { sidebar.classList.add('open');  overlay.classList.add('active'); }
        function close() { sidebar.classList.remove('open'); overlay.classList.remove('active'); }

        toggle.addEventListener('click', function() {
            if (sidebar.classList.contains('open')) close(); else open();
        });
        overlay.addEventListener('click', close);

        // Close on nav click (mobile)
        sidebar.querySelectorAll('.nav-item').forEach(function(a) {
            a.addEventListener('click', close);
        });
    }

    function wireSignOut() {
        const btn = document.getElementById('sign-out-btn');
        if (!btn) return;
        btn.addEventListener('click', async function() {
            btn.disabled = true;
            try {
                if (authApi && authApi.logout) {
                    await authApi.logout();
                } else {
                    // Fallback: clear storage manually
                    const keys = (window.LegisCoreConfig && window.LegisCoreConfig.STORAGE_KEYS) || {};
                    localStorage.removeItem(keys.TOKEN || 'legiscore_auth_token');
                    localStorage.removeItem(keys.REFRESH_TOKEN || 'legiscore_refresh_token');
                    localStorage.removeItem(keys.USER || 'legiscore_current_user');
                }
            } catch (e) {
                console.warn('[LegisCoreLayout] logout error:', e);
            }
            state.reset();
            window.location.href = 'login.html';
        });
    }

    function updateActiveNav(path) {
        document.querySelectorAll('.nav-item').forEach(function(a) {
            const r = a.getAttribute('data-route');
            a.classList.toggle('active', r === path);
        });
    }

    function updateTitle(path) {
        const item = NAV_ITEMS.find(function(i) { return i.path === path; });
        const titleEl = document.getElementById('topbar-title');
        if (titleEl) {
            titleEl.textContent = item ? item.label : 'LegisCore';
        }
    }

    function updateUserSlot(user) {
        const slot = document.getElementById('topbar-user-slot');
        if (!slot) return;
        slot.innerHTML = renderUserChip(user);
        wireSignOut();
    }

    function mount() {
        const root = document.getElementById('app');
        if (!root) {
            console.error('[LegisCoreLayout] #app not found in DOM.');
            return;
        }

        root.innerHTML =
            '<div class="app-shell">' +
                renderSidebar() +
                renderTopbar() +
                '<main class="app-main" id="app-main"></main>' +
            '</div>';

        const user = state.get('user');
        updateUserSlot(user);
        wireMobileToggle();

        state.subscribe(function(s) {
            updateUserSlot(s.user);
        });

        router.onRouteChange(function(evt) {
            updateActiveNav(evt.path);
            updateTitle(evt.path);
        });
    }

    window.LegisCoreLayout = {
        mount,
        NAV_ITEMS,
    };

})(window);
