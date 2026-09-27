/**
 * LegisCore Configuration
 * Backend: Supabase (shared project with PXDynasty, lc_ prefixed tables)
 */

(function(window) {
    'use strict';

    const CONFIG = {
        SUPABASE_URL: window.__LEGISCORE_SUPABASE_URL__ || 'https://ocsglgkombwwpamdijes.supabase.co',
        SUPABASE_ANON_KEY: window.__LEGISCORE_SUPABASE_ANON_KEY__ || 'sb_publishable_6HHZQ1MoXmpvi45SD2k9fw_Rj_c3gGB',

        DATA_MODE: window.__LEGISCORE_DATA_MODE__ || localStorage.getItem('legiscore_data_mode') || 'api',
        TIMEOUT_MS: 30000,

        FEATURES: {
            ANALYTICS_ENABLED: true,
            ADVANCED_SEARCH: true,
            EXPORT_ENABLED: true,
            AUDIT_LOGS: true
        },

        STORAGE_KEYS: {
            TOKEN: 'legiscore_auth_token',
            REFRESH_TOKEN: 'legiscore_refresh_token',
            USER: 'legiscore_current_user',
            THEME: 'legiscore_theme',
            PREFERENCES: 'legiscore_preferences'
        }
    };

    CONFIG.AUTH_BASE = CONFIG.SUPABASE_URL + '/auth/v1';
    CONFIG.REST_BASE = CONFIG.SUPABASE_URL + '/rest/v1';

    if (Object.freeze) {
        Object.freeze(CONFIG);
        Object.freeze(CONFIG.FEATURES);
        Object.freeze(CONFIG.STORAGE_KEYS);
    }

    window.LegisCoreConfig = CONFIG;

})(window);
