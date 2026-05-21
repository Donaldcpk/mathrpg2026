/**
 * 學校登入基礎設定（可進 Git）。
 * Supabase anon 與 plugins.js → OmniscientEncyclopedia 相同（本來就會暴露於客户端）。
 * 管理員電郵請用本機 school-auth-config.defaults.js 或 GitHub Actions Secrets 覆寫。
 */
window.SCHOOL_AUTH = Object.assign(
    {
        supabaseUrl: 'https://oqsvxizemgyfointylpe.supabase.co',
        supabaseAnonKey: 'sb_publishable_rk_C92nMfpMxwZ0ciWajPw_jUYxWrCw',
        adminAuthEmail: '',
        adminEmails: [],
        studentEmailDomain: 'ngwahsec.edu.hk',
        storagePrefix: 'nwcs_sb_',
        skipGateOnNwjs: true
    },
    window.SCHOOL_AUTH || {}
);
