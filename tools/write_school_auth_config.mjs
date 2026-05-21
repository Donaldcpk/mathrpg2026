#!/usr/bin/env node
/** CI／本機：由環境變數寫入 js/school-auth-config.defaults.js（勿 commit 輸出檔） */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'js', 'school-auth-config.defaults.js');

const adminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_AUTH_EMAIL || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

const cfg = {
    supabaseUrl: (process.env.SUPABASE_URL || '').trim(),
    supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
    adminAuthEmail: (process.env.ADMIN_AUTH_EMAIL || adminEmails[0] || 'admin@example.edu.hk')
        .trim()
        .toLowerCase(),
    adminEmails: adminEmails.length ? adminEmails : undefined,
    studentEmailDomain: (process.env.STUDENT_EMAIL_DOMAIN || 'example.edu.hk').trim(),
    storagePrefix: (process.env.SCHOOL_AUTH_STORAGE_PREFIX || 'school_sb_').trim(),
    skipGateOnNwjs: true
};

if (!cfg.adminEmails) {
    cfg.adminEmails = [cfg.adminAuthEmail];
}

const body =
    '/**\n * 由 tools/write_school_auth_config.mjs 產生；覆寫 school-auth-config.js；勿 commit。\n */\n' +
    `window.SCHOOL_AUTH = Object.assign(window.SCHOOL_AUTH || {}, ${JSON.stringify(cfg, null, 4)});\n`;

fs.writeFileSync(out, body, 'utf8');
console.log('Wrote', out);
