#!/usr/bin/env node
/**
 * 在 Supabase Auth 建立／更新學生與管理員帳號（需 service_role，勿 commit 金鑰）。
 *
 * 用法：
 *   export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="你的_service_role"
 *   export NWCS_PROVISION_MODE=upsert
 *
 *   node tools/provision_supabase_auth_users.mjs --students --passwords-csv tools/student_auth_passwords.csv
 *   node tools/provision_supabase_auth_users.mjs --admins-only
 *   node tools/provision_supabase_auth_users.mjs --include-legacy-nwcs
 *
 * 環境變數：
 *   NWCS_PROVISION_MODE=create_only（預設）或 upsert
 *   NWCS_ADMIN_PASSWORD、NWCS_ADMIN_EMAILS
 *   NWCS_LEGACY_PASSWORD（僅 --include-legacy-nwcs）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadDotEnv(path.join(__dirname, '.env.supabase.local'));

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PROVISION_MODE = (process.env.NWCS_PROVISION_MODE || 'create_only').toLowerCase();
const OVERWRITE_EXISTING = PROVISION_MODE === 'upsert';

const LEGACY_IDS = `nwcs003 nwcs004 nwcs017 nwcs020 nwcs022 nwcs025 nwcs032 nwcs037 nwcs039 nwcs049 nwcs067 nwcs072 nwcs073 nwcs074 nwcs078 nwcs084 nwcs085 nwcs086 nwcs088 nwcs090 nwcs091 nwcs092 nwcs102 nwcs103 nwcs112 nwcs114 nwcs120 nwcs128 nwcs129 nwcs134 nwcs135 nwcs137 nwcs138 nwcs140 nwcs141 nwcs143 nwcs152 nwcs153 nwcs161 nwcs176 nwcs181 nwcs183 nwcs186 nwcs188 nwcs191 nwcs195 nwcs196 nwcs198 nwcs202 nwcs203 nwcs204 nwcs205 nwcs206 nwcs208 nwcs209 nwcs210 nwcs211 nwcs213 nwcs214 nwcs217 nwcs218 nwcs219 nwcs220 nwcs221 nwcs222 nwcs224 nwcs227 nwcs228 nwcs230 nwcs235 nwcs234 nwcs233 nwcs236 nwcs237 nwcs238 nwcs239 nwcs240 nwcs241 nwcs242 nwcs243 nwcs244`
    .split(/\s+/)
    .filter(Boolean);

function loadDotEnv(filePath) {
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 1) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (process.env[key] == null || process.env[key] === '') {
            process.env[key] = val;
        }
    }
}

function parseArgs(argv) {
    const opts = {
        students: false,
        adminsOnly: false,
        includeLegacy: false,
        passwordsCsv: ''
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--students') opts.students = true;
        else if (a === '--admins-only') opts.adminsOnly = true;
        else if (a === '--include-legacy-nwcs') opts.includeLegacy = true;
        else if (a === '--passwords-csv' && argv[i + 1]) opts.passwordsCsv = argv[++i];
        else if (a === '--help') {
            console.log(`Usage:
  node tools/provision_supabase_auth_users.mjs --students --passwords-csv tools/student_auth_passwords.csv
  node tools/provision_supabase_auth_users.mjs --admins-only
  node tools/provision_supabase_auth_users.mjs --include-legacy-nwcs
`);
            process.exit(0);
        }
    }
    return opts;
}

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
            if (c === '"') {
                if (line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else inQ = false;
            } else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === ',') {
            out.push(cur);
            cur = '';
        } else cur += c;
    }
    out.push(cur);
    return out;
}

function readPasswordCsv(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const emailIdx = header.indexOf('email');
    const pwIdx = header.indexOf('password');
    if (emailIdx < 0 || pwIdx < 0) {
        throw new Error('CSV 需含 email,password 欄');
    }
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const c = parseCsvLine(lines[i]);
        const email = (c[emailIdx] || '').trim().toLowerCase();
        const password = (c[pwIdx] || '').trim();
        if (!email || !email.includes('@') || !password) continue;
        rows.push({ email, password });
    }
    return rows;
}

function adminEmails() {
    const raw = process.env.NWCS_ADMIN_EMAILS || 'admin@ngwahsec.edu.hk,nwcs211@ngwahsec.edu.hk';
    return raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.includes('@'));
}

async function adminFetch(urlPath, options = {}) {
    const url = `${BASE}${urlPath}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    const text = await res.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }
    return { res, data };
}

async function listAllUsers() {
    const byEmail = new Map();
    let page = 1;
    const perPage = 200;
    while (true) {
        const { res, data } = await adminFetch(
            `/auth/v1/admin/users?page=${page}&per_page=${perPage}`
        );
        if (!res.ok) {
            throw new Error(`列出使用者失敗: ${res.status} ${JSON.stringify(data)}`);
        }
        const users = data.users || [];
        for (const u of users) {
            if (u && u.email) byEmail.set(String(u.email).toLowerCase(), u);
        }
        if (users.length < perPage) break;
        page += 1;
        if (page > 50) break;
    }
    return byEmail;
}

async function createUser(email, password) {
    const { res, data } = await adminFetch('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
            email,
            password,
            email_confirm: true
        })
    });
    if (!res.ok) {
        throw new Error(`建立失敗 ${email}: ${res.status} ${JSON.stringify(data)}`);
    }
    return data;
}

async function updatePassword(userId, password) {
    const { res, data } = await adminFetch(`/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ password, email_confirm: true })
    });
    if (!res.ok) {
        throw new Error(`更新密碼失敗 ${userId}: ${res.status} ${JSON.stringify(data)}`);
    }
    return data;
}

async function upsertAccount(existingMap, email, password) {
    const existing = existingMap.get(email);
    if (existing && existing.id) {
        if (!OVERWRITE_EXISTING) {
            return 'skipped';
        }
        await updatePassword(existing.id, password);
        existingMap.set(email, existing);
        return 'updated';
    }
    const created = await createUser(email, password);
    if (created && created.id) existingMap.set(email, created);
    return 'created';
}

function validateServiceKey() {
    const k = SERVICE_KEY;
    if (k.startsWith('sb_publishable_') || k.includes('anon')) {
        console.error(
            '\n錯誤：你用的是 publishable／anon 金鑰，無法呼叫 Admin API。\n' +
                '請到 Supabase → Settings → API → 複製「service_role」（secret）。\n' +
                '切勿把 service_role 放進遊戲或 commit 到 Git。\n'
        );
        process.exit(1);
    }
}

async function runBatch(existingMap, accounts) {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const failures = [];

    for (const { email, password } of accounts) {
        try {
            const action = await upsertAccount(existingMap, email, password);
            if (action === 'created') created++;
            else if (action === 'updated') updated++;
            else if (action === 'skipped') skipped++;
            console.log(`[OK] ${email} (${action})`);
        } catch (e) {
            failed++;
            const msg = e.message || String(e);
            failures.push({ email, msg });
            console.error(`[FAIL] ${email}:`, msg);
        }
        await new Promise((r) => setTimeout(r, 80));
    }

    return { created, updated, skipped, failed, failures };
}

async function main() {
    const opts = parseArgs(process.argv);

    if (!opts.students && !opts.adminsOnly && !opts.includeLegacy) {
        console.error(
            '請指定 --students、--admins-only 或 --include-legacy-nwcs（見 --help）'
        );
        process.exit(1);
    }

    if (!BASE || !SERVICE_KEY) {
        console.error(
            '請設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY（或寫入 tools/.env.supabase.local）'
        );
        process.exit(1);
    }
    validateServiceKey();

    const accounts = [];

    if (opts.adminsOnly) {
        const adminPw = process.env.NWCS_ADMIN_PASSWORD || '';
        if (!adminPw) {
            console.error('請設定 NWCS_ADMIN_PASSWORD（勿寫進程式碼）');
            process.exit(1);
        }
        for (const email of adminEmails()) {
            accounts.push({ email, password: adminPw });
        }
    }

    if (opts.includeLegacy) {
        const legacyPw = process.env.NWCS_LEGACY_PASSWORD || '';
        if (!legacyPw) {
            console.error('請設定 NWCS_LEGACY_PASSWORD（nwcs###@ 測試帳）');
            process.exit(1);
        }
        for (const id of LEGACY_IDS) {
            accounts.push({ email: `${id}@ngwahsec.edu.hk`, password: legacyPw });
        }
    }

    if (opts.students) {
        const csvPath = opts.passwordsCsv
            ? path.resolve(opts.passwordsCsv)
            : path.join(__dirname, 'student_auth_passwords.csv');
        if (!fs.existsSync(csvPath)) {
            console.error('找不到密碼 CSV：', csvPath);
            process.exit(1);
        }
        accounts.push(...readPasswordCsv(csvPath));
    }

    if (!accounts.length) {
        console.error('沒有要處理的帳號');
        process.exit(1);
    }

    console.log(
        '模式：',
        OVERWRITE_EXISTING
            ? 'upsert（會覆蓋既有密碼）'
            : 'create_only（既有帳號保留原密碼，只建立新帳號）'
    );
    console.log('待處理：', accounts.length, '筆');

    const existingMap = await listAllUsers();
    console.log('Auth 現有使用者：', existingMap.size);

    const result = await runBatch(existingMap, accounts);
    console.log(
        '\n完成：建立',
        result.created,
        '略過（已有帳號）',
        result.skipped,
        '覆蓋更新',
        result.updated,
        '失敗',
        result.failed
    );
    if (result.failed) {
        process.exitCode = 1;
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
