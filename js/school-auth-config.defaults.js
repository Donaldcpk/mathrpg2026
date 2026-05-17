/**
 * 學校登入設定（會進 Git）。Supabase 金鑰須與 plugins.js → OmniscientEncyclopedia 一致。
 * 勿在此放入 service_role。
 */
window.SCHOOL_AUTH = {
    supabaseUrl: 'https://oqsvxizemgyfointylpe.supabase.co',
    supabaseAnonKey: 'sb_publishable_rk_C92nMfpMxwZ0ciWajPw_jUYxWrCw',
    adminAuthEmail: 'nwcs211@ngwahsec.edu.hk',
    adminEmails: ['nwcs211@ngwahsec.edu.hk'],
    studentEmailDomain: 'ngwahsec.edu.hk',
    storagePrefix: 'nwcs_sb_',
    skipGateOnNwjs: true
};
