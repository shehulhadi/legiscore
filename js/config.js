/**
 * LegisCore Configuration
 * Defines global constants, API base URLs, data mode switches, and feature flags.
 */

(function(window) {
    'use strict';

    const CONFIG = {
        // API Base URL - can be overridden via localStorage or window.__LEGISCORE_API_URL__
        API_BASE_URL: window.__LEGISCORE_API_URL__ || localStorage.getItem('legiscore_api_url') || 'http://localhost:8000/api',

        // Data Mode: 'api' for backend connection, 'mock' for local fallback/simulation
        DATA_MODE: window.__LEGISCORE_DATA_MODE__ || localStorage.getItem('legiscore_data_mode') || 'api',

        // Request timeout in milliseconds
        TIMEOUT_MS: 30000,

        // Feature flags for progressive rollout
        FEATURES: {
            ANALYTICS_ENABLED: true,
            ADVANCED_SEARCH: true,
            EXPORT_ENABLED: true,
            AUDIT_LOGS: true
        },

        // Storage keys
        STORAGE_KEYS: {
            TOKEN: 'legiscore_auth_token',
            USER: 'legiscore_current_user',
            THEME: 'legiscore_theme',
            PREFERENCES: 'legiscore_preferences'
        }
    };

    // Freeze config to prevent tampering
    if (Object.freeze) {
        Object.freeze(CONFIG);
        Object.freeze(CONFIG.FEATURES);
        Object.freeze(CONFIG.STORAGE_KEYS);
    }

    window.LegisCoreConfig = CONFIG;

})(window);
