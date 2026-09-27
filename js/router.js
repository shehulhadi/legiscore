/**
 * LegisCore Router
 * Hash-based client-side router supporting route parameters, guards, and dynamic view rendering.
 */

(function(window) {
    'use strict';

    class Router {
        constructor() {
            this.routes = [];
            this.notFoundHandler = null;
            this.beforeEachGuard = null;
            this.currentRoute = null;

            window.addEventListener('hashchange', () => this.handleRoute());
            window.addEventListener('load', () => this.handleRoute());
        }

        addRoute(path, handler, options = {}) {
            // Convert path like /bills/:id to regex
            // e.g., /bills/([^\\/]+)
            const paramNames = [];
            const parsedPath = path.replace(/:([^\\/]+)/g, (match, paramName) => {
                paramNames.push(paramName);
                return '([^\\\\/]+)';
            });

            const regex = new RegExp(`^${parsedPath}$`, 'i');
            this.routes.push({
                path,
                regex,
                paramNames,
                handler,
                requiresAuth: options.requiresAuth || false,
                roles: options.roles || []
            });
            return this;
        }

        setNotFound(handler) {
            this.notFoundHandler = handler;
            return this;
        }

        beforeEach(guard) {
            this.beforeEachGuard = guard;
            return this;
        }

        async handleRoute() {
            const hash = window.location.hash || '#/';
            const rawPath = hash.slice(1) || '/';
            const [pathOnly, queryString] = rawPath.split('?');

            // Parse query parameters
            const queryParams = {};
            if (queryString) {
                const params = new URLSearchParams(queryString);
                for (const [key, value] of params.entries()) {
                    queryParams[key] = value;
                }
            }

            let matchedRoute = null;
            let params = {};

            for (const route of this.routes) {
                const match = pathOnly.match(route.regex);
                if (match) {
                    matchedRoute = route;
                    // Extract route parameters
                    route.paramNames.forEach((name, index) => {
                        params[name] = decodeURIComponent(match[index + 1]);
                    });
                    break;
                }
            }

            const routeContext = {
                path: pathOnly,
                rawPath,
                params,
                query: queryParams,
                matchedRoute
            };

            // Run global guard if present
            if (this.beforeEachGuard) {
                try {
                    const allow = await this.beforeEachGuard(routeContext);
                    if (allow === false) {
                        return; // Guard handled redirect/blocking
                    }
                    if (typeof allow === 'string' && allow !== rawPath) {
                        window.location.hash = allow;
                        return;
                    }
                } catch (e) {
                    console.error('Error in router beforeEach guard:', e);
                }
            }

            this.currentRoute = routeContext;

            if (matchedRoute) {
                try {
                    await matchedRoute.handler(routeContext);
                } catch (e) {
                    console.error(`Error executing route handler for ${pathOnly}:`, e);
                }
            } else if (this.notFoundHandler) {
                try {
                    await this.notFoundHandler(routeContext);
                } catch (e) {
                    console.error('Error executing 404 handler:', e);
                }
            }
        }

        navigateTo(path) {
            window.location.hash = path;
        }

        getCurrentRoute() {
            return this.currentRoute;
        }
    }

    // Expose globally
    window.LegisCoreRouter = Router;

})(window);
