/**
 * LegisCore Main Application Bootstrapper (js/app.js)
 * Initializes app state, wires up the router, renders layout (topbar, sidebar, notifications),
 * and handles view loading and navigation.
 */

(function(window) {
    'use strict';

    const config = window.LegisCoreConfig || {};
    const stateManager = window.LegisCoreState;
    const router = window.LegisCoreRouter;
    const api = window.LegisCoreAPI;

    if (!stateManager || !router) {
        console.error('LegisCore State or Router not loaded. Ensure state.js and router.js are included before app.js.');
        return;
    }

    // Application Controller
    const App = {
        async init() {
            console.log('Initializing LegisCore Application...');

            // Apply saved theme
            const currentState = stateManager.getState();
            this.applyTheme(currentState.theme);

            // Setup state change listener
            stateManager.subscribe((state) => {
                this.onStateChange(state);
            });

            // Render Shell Layout (Topbar & Sidebar)
            this.renderLayout();

            // Setup Routes
            this.setupRoutes();

            // Initialize Router (triggers initial route handling)
            // If hash is empty, default to dashboard
            if (!window.location.hash) {
                window.location.hash = '#/';
            }

            // Setup global event listeners (dropdowns, modals, mobile menu)
            this.setupGlobalEvents();

            console.log('LegisCore Application initialized successfully.');
        },

        applyTheme(theme) {
            if (theme === 'dark') {
                document.documentElement.classList.add('dark-theme');
            } else {
                document.documentElement.classList.remove('dark-theme');
            }
        },

        onStateChange(state) {
            // Update UI elements dependent on state (e.g. user avatar, auth badges)
            this.updateUserUI(state.user);
        },

        renderLayout() {
            const root = document.getElementById('app');
            if (!root) {
                console.error('Root element #app not found in DOM.');
                return;
            }

            root.innerHTML = `
                <div class="app-shell" id="app-shell">
                    <!-- Sidebar Navigation -->
                    <aside class="app-sidebar" id="app-sidebar" aria-label="Sidebar Navigation">
                        <div class="sidebar-header">
                            <a href="#/" class="sidebar-brand">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="brand-icon"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
                                <span class="brand-text">LegisCore</span>
                            </a>
                            <button class="sidebar-close-btn" id="sidebar-close-btn" aria-label="Close Sidebar">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div class="sidebar-user-summary" id="sidebar-user-summary">
                            <!-- Populated dynamically -->
                        </div>

                        <nav class="sidebar-nav" id="sidebar-nav">
                            <div class="nav-section-title">Core Modules</div>
                            <ul class="nav-list">
                                <li>
                                    <a href="#/" class="nav-item" data-route="/">
                                        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                                        <span>Dashboard</span>
                                    </a>
                                </li>
                                <li>
                                    <a href="#/bills" class="nav-item" data-route="/bills">
                                        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                        <span>Legislation</span>
                                    </a>
                                </li>
                                <li>
                                    <a href="#/amendments" class="nav-item" data-route="/amendments">
                                        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        <span>Amendments</span>
                                    </a>
                                </li>
                                <li>
                                    <a href="#/votes" class="nav-item" data-route="/votes">
                                        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                                        <span>Roll Call & Votes</span>
                                    </a>
                                </li>
                                <li>
                                    <a href="#/digital-transition" class="nav-item" data-route="/digital-transition">
                                        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                        <span>Digital Transition</span>
                                        <span class="badge badge-info ml-auto">Active</span>
                                    </a>
                                </li>
                                <li>
                                    <a href="#/compliance" class="nav-item" data-route="/compliance">
                                        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                        <span>Compliance & Audit</span>
                                    </a>
                                </li>
                            </ul>

                            <div class="nav-section-title">System & Admin</div>
                            <ul class="nav-list">
                                <li>
                                    <a href="#/settings" class="nav-item" data-route="/settings">
                                        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                        <span>Settings</span>
                                    </a>
                                </li>
                                <li>
                                    <a href="#/login" class="nav-item" data-route="/login" id="nav-login-item">
                                        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
                                        <span>Sign In</span>
                                    </a>
                                </li>
                            </ul>
                        </nav>

                        <div class="sidebar-footer">
                            <div class="sidebar-version">LegisCore v2.4.0-pro</div>
                            <div class="sidebar-status"><span class="status-dot online"></span> System Operational</div>
                        </div>
                    </aside>

                    <!-- Main App Wrapper -->
                    <div class="app-wrapper">
                        <!-- Topbar -->
                        <header class="app-topbar" id="app-topbar">
                            <div class="topbar-left">
                                <button class="sidebar-toggle-btn" id="sidebar-toggle-btn" aria-label="Toggle Sidebar">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                                </button>
                                <div class="topbar-search">
                                    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                    <input type="text" id="global-search-input" placeholder="Search bills, amendments, legislators... (Ctrl+K)" aria-label="Global Search">
                                    <kbd class="search-kbd">⌘K</kbd>
                                </div>
                            </div>

                            <div class="topbar-right">
                                <button class="topbar-icon-btn" id="theme-toggle-btn" aria-label="Toggle Theme" title="Toggle Theme">
                                    <svg class="sun-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                                </button>

                                <div class="dropdown" id="notifications-dropdown">
                                    <button class="topbar-icon-btn" id="notifications-btn" aria-label="Notifications" title="Notifications">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                                        <span class="notification-badge" id="notification-badge" style="display: none;">0</span>
                                    </button>
                                    <div class="dropdown-menu dropdown-menu-right" id="notifications-menu">
                                        <div class="dropdown-header">
                                            <span>Notifications</span>
                                            <button class="text-button text-sm" id="mark-all-read-btn">Mark all read</button>
                                        </div>
                                        <div class="dropdown-body" id="notifications-list">
                                            <div class="empty-dropdown-state">No new notifications</div>
                                        </div>
                                    </div>
                                </div>

                                <div class="topbar-divider"></div>

                                <div class="user-menu-container" id="user-menu-container">
                                    <!-- Populated dynamically based on auth -->
                                </div>
                            </div>
                        </header>

                        <!-- Main Content View Area -->
                        <main class="app-main" id="main-content">
                            <div class="view-loading-state">
                                <div class="spinner"></div>
                                <p>Loading LegisCore...</p>
                            </div>
                        </main>
                    </div>

                    <!-- Overlay for mobile sidebar -->
                    <div class="sidebar-overlay" id="sidebar-overlay"></div>
                </div>

                <!-- Global Modal Container -->
                <div class="modal-backdrop" id="modal-backdrop" style="display: none;">
                    <div class="modal-container" id="modal-container" role="dialog" aria-modal="true">
                        <!-- Dynamic modal content -->
                    </div>
                </div>

                <!-- Toast Notification Container -->
                <div class="toast-container" id="toast-container" aria-live="polite"></div>
            `;

            this.updateUserUI(currentState.user);
        },

        updateUserUI(user) {
            const userSummaryEl = document.getElementById('sidebar-user-summary');
            const userMenuContainer = document.getElementById('user-menu-container');
            const loginNavItem = document.getElementById('nav-login-item');

            if (user) {
                if (loginNavItem) loginNavItem.style.display = 'none';

                const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U';
                const roleDisplay = user.role ? user.role.replace('_', ' ').toUpperCase() : 'MEMBER';

                if (userSummaryEl) {
                    userSummaryEl.innerHTML = `
                        <div class="user-avatar">${initials}</div>
                        <div class="user-info">
                            <div class="user-name">${this.escapeHTML(user.name || 'User')}</div>
                            <div class="user-role badge badge-primary">${roleDisplay}</div>
                        </div>
                    `;
                }

                if (userMenuContainer) {
                    userMenuContainer.innerHTML = `
                        <div class="dropdown" id="user-dropdown">
                            <button class="user-dropdown-toggle" id="user-dropdown-toggle" aria-expanded="false">
                                <div class="user-avatar-sm">${initials}</div>
                                <span class="user-dropdown-name">${this.escapeHTML(user.name || 'User')}</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                            <div class="dropdown-menu dropdown-menu-right" id="user-dropdown-menu">
                                <div class="dropdown-user-header">
                                    <div class="font-weight-bold">${this.escapeHTML(user.name)}</div>
                                    <div class="text-sm text-muted">${this.escapeHTML(user.email || '')}</div>
                                </div>
                                <div class="dropdown-divider"></div>
                                <a href="#/settings" class="dropdown-item">Account Settings</a>
                                <a href="#/digital-transition" class="dropdown-item">Digital Transition Portal</a>
                                <div class="dropdown-divider"></div>
                                <button class="dropdown-item text-danger" id="logout-btn">Sign Out</button>
                            </div>
                        </div>
                    `;

                    // Wire user dropdown toggle
                    const toggleBtn = document.getElementById('user-dropdown-toggle');
                    const dropdownMenu = document.getElementById('user-dropdown-menu');
                    const logoutBtn = document.getElementById('logout-btn');

                    if (toggleBtn && dropdownMenu) {
                        toggleBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            dropdownMenu.classList.toggle('show');
                        });
                    }

                    if (logoutBtn) {
                        logoutBtn.addEventListener('click', async () => {
                            await api.logout();
                            stateManager.setState({ user: null, isAuthenticated: false });
                            window.location.hash = '#/login';
                            this.showToast('Signed out successfully', 'info');
                        });
                    }
                }
            } else {
                if (loginNavItem) loginNavItem.style.display = 'block';

                if (userSummaryEl) {
                    userSummaryEl.innerHTML = `
                        <div class="user-avatar guest">G</div>
                        <div class="user-info">
                            <div class="user-name">Guest User</div>
                            <div class="user-role text-sm text-muted">Not Signed In</div>
                        </div>
                    `;
                }

                if (userMenuContainer) {
                    userMenuContainer.innerHTML = `
                        <a href="#/login" class="btn btn-primary btn-sm">Sign In</a>
                    `;
                }
            }
        },

        setupRoutes() {
            const mainContent = document.getElementById('main-content');

            // Helper to load HTML view templates
            async function loadViewTemplate(templatePath) {
                try {
                    const response = await fetch(templatePath);
                    if (!response.ok) {
                        throw new Error(`Failed to load view: ${response.statusText}`);
                    }
                    return await response.text();
                } catch (e) {
                    console.error(`Error loading template ${templatePath}:`, e);
                    return `
                        <div class="error-container">
                            <h2>Failed to load view</h2>
                            <p class="text-muted">${e.message}</p>
                            <button class="btn btn-primary mt-3" onclick="window.location.reload()">Reload Page</button>
                        </div>
                    `;
                }
            }

            // Global BeforeEach Guard
            router.beforeEach(async (routeContext) => {
                // Highlight active nav item
                const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
                navItems.forEach(item => {
                    const routeAttr = item.getAttribute('data-route');
                    if (routeAttr === routeContext.path || (routeAttr !== '/' && routeContext.path.startsWith(routeAttr))) {
                        item.classList.add('active');
                    } else {
                        item.classList.remove('active');
                    }
                });

                // Close mobile sidebar on route change
                const appShell = document.getElementById('app-shell');
                if (appShell) appShell.classList.remove('sidebar-open');

                // Check auth requirement
                if (routeContext.matchedRoute && routeContext.matchedRoute.requiresAuth) {
                    const state = stateManager.getState();
                    if (!state.isAuthenticated) {
                        this.showToast('Please sign in to access this page.', 'warning');
                        return `#/login?redirect=${encodeURIComponent(routeContext.rawPath)}`;
                    }
                }

                return true;
            });

            // Register Routes
            router.addRoute('/', async (ctx) => {
                mainContent.innerHTML = await loadViewTemplate('pages/dashboard.html');
                // Initialize dashboard controller if available
                if (window.LegisCoreDashboard && typeof window.LegisCoreDashboard.init === 'function') {
                    window.LegisCoreDashboard.init(ctx);
                }
            }, { requiresAuth: true });

            router.addRoute('/bills', async (ctx) => {
                mainContent.innerHTML = await loadViewTemplate('pages/bills.html');
                if (window.LegisCoreBills && typeof window.LegisCoreBills.init === 'function') {
                    window.LegisCoreBills.init(ctx);
                }
            }, { requiresAuth: true });

            router.addRoute('/bills/:id', async (ctx) => {
                mainContent.innerHTML = await loadViewTemplate('pages/bill-detail.html');
                if (window.LegisCoreBillDetail && typeof window.LegisCoreBillDetail.init === 'function') {
                    window.LegisCoreBillDetail.init(ctx);
                }
            }, { requiresAuth: true });

            router.addRoute('/amendments', async (ctx) => {
                mainContent.innerHTML = await loadViewTemplate('pages/amendments.html');
                if (window.LegisCoreAmendments && typeof window.LegisCoreAmendments.init === 'function') {
                    window.LegisCoreAmendments.init(ctx);
                }
            }, { requiresAuth: true });

            router.addRoute('/votes', async (ctx) => {
                mainContent.innerHTML = await loadViewTemplate('pages/votes.html');
                if (window.LegisCoreVotes && typeof window.LegisCoreVotes.init === 'function') {
                    window.LegisCoreVotes.init(ctx);
                }
            }, { requiresAuth: true });

            router.addRoute('/digital-transition', async (ctx) => {
                mainContent.innerHTML = await loadViewTemplate('pages/digital-transition.html');
                if (window.LegisCoreDigitalTransition && typeof window.LegisCoreDigitalTransition.init === 'function') {
                    window.LegisCoreDigitalTransition.init(ctx);
                }
            }, { requiresAuth: true });

            router.addRoute('/compliance', async (ctx) => {
                mainContent.innerHTML = await loadViewTemplate('pages/compliance.html');
                if (window.LegisCoreCompliance && typeof window.LegisCoreCompliance.init === 'function') {
                    window.LegisCoreCompliance.init(ctx);
                }
            }, { requiresAuth: true });

            router.addRoute('/settings', async (ctx) => {
                mainContent.innerHTML = await loadViewTemplate('pages/settings.html');
                if (window.LegisCoreSettings && typeof window.LegisCoreSettings.init === 'function') {
                    window.LegisCoreSettings.init(ctx);
                }
            }, { requiresAuth: true });

            router.addRoute('/login', async (ctx) => {
                mainContent.innerHTML = await loadViewTemplate('pages/login.html');
                if (window.LegisCoreLogin && typeof window.LegisCoreLogin.init === 'function') {
                    window.LegisCoreLogin.init(ctx);
                }
            });

            router.setNotFound(async (ctx) => {
                mainContent.innerHTML = `
                    <div class="error-page">
                        <div class="error-code">404</div>
                        <h1>Page Not Found</h1>
                        <p class="text-muted">The page you are looking for (${ctx.path}) does not exist or has been moved.</p>
                        <a href="#/" class="btn btn-primary mt-4">Return to Dashboard</a>
                    </div>
                `;
            });
        },

        setupGlobalEvents() {
            // Sidebar toggle for mobile
            const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
            const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
            const sidebarOverlay = document.getElementById('sidebar-overlay');
            const appShell = document.getElementById('app-shell');

            if (sidebarToggleBtn && appShell) {
                sidebarToggleBtn.addEventListener('click', () => {
                    appShell.classList.toggle('sidebar-open');
                });
            }

            if (sidebarCloseBtn && appShell) {
                sidebarCloseBtn.addEventListener('click', () => {
                    appShell.classList.remove('sidebar-open');
                });
            }

            if (sidebarOverlay && appShell) {
                sidebarOverlay.addEventListener('click', () => {
                    appShell.classList.remove('sidebar-open');
                });
            }

            // Theme toggle button
            const themeToggleBtn = document.getElementById('theme-toggle-btn');
            if (themeToggleBtn) {
                themeToggleBtn.addEventListener('click', () => {
                    const currentState = stateManager.getState();
                    const newTheme = currentState.theme === 'dark' ? 'light' : 'dark';
                    stateManager.setState({ theme: newTheme });
                    this.applyTheme(newTheme);
                    this.showToast(`Switched to ${newTheme} theme`, 'info');
                });
            }

            // Notifications dropdown toggle
            const notificationsBtn = document.getElementById('notifications-btn');
            const notificationsMenu = document.getElementById('notifications-menu');
            if (notificationsBtn && notificationsMenu) {
                notificationsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    notificationsMenu.classList.toggle('show');
                });
            }

            // Close dropdowns on outside click
            window.addEventListener('click', () => {
                const userDropdownMenu = document.getElementById('user-dropdown-menu');
                if (userDropdownMenu) userDropdownMenu.classList.remove('show');

                if (notificationsMenu) notificationsMenu.classList.remove('show');
            });

            // Global keyboard shortcut (Ctrl+K or Cmd+K for search)
            window.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                    e.preventDefault();
                    const searchInput = document.getElementById('global-search-input');
                    if (searchInput) searchInput.focus();
                }
            });

            const searchInput = document.getElementById('global-search-input');
            if (searchInput) {
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const query = searchInput.value.trim();
                        if (query) {
                            window.location.hash = `#/bills?search=${encodeURIComponent(query)}`;
                        }
                    }
                });
            }
        },

        showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `
                <div class="toast-message">${this.escapeHTML(message)}</div>
                <button class="toast-close" aria-label="Close">&times;</button>
            `;

            const closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', () => {
                toast.classList.add('hide');
                setTimeout(() => toast.remove(), 300);
            });

            container.appendChild(toast);

            setTimeout(() => {
                if (toast.parentElement) {
                    toast.classList.add('hide');
                    setTimeout(() => toast.remove(), 300);
                }
            }, 4000);
        },

        escapeHTML(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    };

    // Expose globally and boot when DOM is ready
    window.LegisCoreApp = App;

    document.addEventListener('DOMContentLoaded', () => {
        App.init().catch(err => {
            console.error('Fatal error initializing LegisCore App:', err);
        });
    });

})(window);
