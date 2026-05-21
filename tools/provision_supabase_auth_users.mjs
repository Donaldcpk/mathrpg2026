#!/usr/bin/env node
/**
 * 依名冊 CSV 建立／更新 Supabase Auth 帳號（需 service_role）。
 *
 * 密碼規則（與校方約定一致）：
 *   - s########@… 學生：出生年月日 8 碼（須另有密碼表，或讓學生首次登入自動註冊）
 *   - is_admin=true：NWCS_ADMIN_PASSWORD（必填，勿寫入 Git）
 *   - 其餘 nwcs###@（舊測試帳）：NWCS_LEGACY_PASSWORD（必填時用 --include-legacy-nwcs）
 *
 * 用法：
 *   export SUPABASE_URL="https://xxx.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
 *
 *   # 只建立／更新管理員
 *   node tools/provision_supabase_auth_users.mjs --admins-only
 *
 *   # 管理員 + 80 個舊 nwcs 測試帳（NWcs1965!）
 *   node tools/provision_supabase_auth_users.mjs --include-legacy-nwcs
 *
 *   # 學生（需密碼 CSV：email,password 或 學生電郵,密碼）
 *   node tools/provision_supabase_auth_users.mjs --students \
 *     --passwords-csv "/path/student_passwords.csv"
 *
 *   # 自訂名冊路徑
 *   node tools/provision_supabase_auth_users.mjs --whitelist-csv "./tools/student_whitelist_rows.csv" --admins-only
 *
 * 環境變數：
 *   NWCS_ADMIN_PASSWORD、NWCS_LEGACY_PASSWORD、NWCS_PROVISION_MODE=create_only|upsert
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_PASSWORD = process.env.NWCS_ADMIN_PASSWORD || '';
const LEGACY_PASSWORD = process.env.NWCS_LEGACY_PASSWORD || '';
const PROVISION_MODE = (process.env.NWCS_PROVISION_MODE || 'create_only').toLowerCase();
const OVERWRITE_EXISTING = PROVISION_MODE === 'upsert';

const ADMIN_EMAILS = new Set(
    (process.env.NWCS_ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)
);

function parseArgs(argv) {
    const out = {
        whitelistCsv: path.join(__dirname, 'student_whitelist_rows.csv'),
        passwordsCsv: '',
        adminsOnly: false,
        includeLegacyNwcs: false,
        students: false
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--admins-only') out.adminsOnly = true;
        else if (a === '--include-legacy-nwcs') out.includeLegacyNwcs = true;
        else if (a === '--students') out.students = true;
        else if (a === '--whitelist-csv' && argv[i + 1]) out.whitelistCsv = argv[++i];
        else if (a === '--passwords-csv' && argv[i + 1]) out.passwordsCsv = argv[++i];
    }
    if (!out.adminsOnly && !out.includeLegacyNwcs && !out.students) {
        out.adminsOnly = true;
    }
    return out;
}

function parseCsvLine(line) {
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQ = !inQ;
            continue;
        }
        if (ch === ',' && !inQ) {
            cells.push(cur.trim());
            cur = '';
            continue;
        }
        cur += ch;
    }
    cells.push(cur.trim());
    return cells;
}

function readWhitelistCsv(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const header = parseCsvLine(lines[0]).map(h => h.toLowerCase());
    const emailIdx = header.indexOf('email');
    const adminIdx = header.indexOf('is_admin');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const c = parseCsvLine(lines[i]);
        const email = (c[emailIdx] || '').trim().toLowerCase();
        if (!email || !email.includes('@')) continue;
        const isAdmin =
            (c[adminIdx] || '').toLowerCase() === 'true' || ADMIN_EMAILS.has(email);
        rows.push({ email, isAdmin });
    }
    return rows;
}

function readPasswordsCsv(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const map = new Map();
    for (let i = 0; i < lines.length; i++) {
        const c = parseCsvLine(lines[i]);
        if (c.length < 2) continue;
        const h0 = (c[0] || '').toLowerCase();
        if (i === 0 && (h0 === 'email' || h0.includes('電郵') || h0.includes('學生'))) continue;
        const email = (c[0] || '').trim().toLowerCase();
        const password = String(c[1] || '').trim();
        if (email && password) map.set(email, password);
    }
    return map;
}

function accountKind(email, isAdmin) {
    if (isAdmin || ADMIN_EMAILS.has(email)) return 'admin';
    if (/^s\d+@ngwahsec\.edu\.hk$/i.test(email)) return 'student';
    if (/^nwcs\d+@ngwahsec\.edu\.hk$/i.test(email)) return 'legacy_nwcs';
    return 'other';
}

function shouldProvision(row, kind, args) {
    if (kind === 'admin') return args.adminsOnly || args.includeLegacyNwcs || args.students;
    if (kind === 'legacy_nwcs') return args.includeLegacyNwcs;
    if (kind === 'student') return args.students;
    return false;
}

async function adminFetch(pathname, options = {}) {
    const url = `${BASE}${pathname}`;
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

async function findUserByEmail(email) {
    const { res, data } = await adminFetch(
        `/auth/v1/admin/users?email=${encodeURIComponent(email)}`
    );
    if (!res.ok) {
        throw new Error(`查詢使用者失敗 ${email}: ${res.status} ${JSON.stringify(data)}`);
    }
    const users = data.users || data;
    if (Array.isArray(users) && users.length) return users[0];
    return null;
}

async function createUser(email, password) {
    const { res, data } = await adminFetch('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, email_confirm: true })
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

async function upsertAccount(email, password) {
    const existing = await findUserByEmail(email);
    if (existing?.id) {
        if (!OVERWRITE_EXISTING) return 'skipped';
        await updatePassword(existing.id, password);
        return 'updated';
    }
    await createUser(email, password);
    return 'created';
}

function validateServiceKey() {
    const k = SERVICE_KEY;
    if (k.startsWith('sb_publishable_') || k.includes('anon')) {
        console.error(
            '\n錯誤：請使用 Supabase service_role（secret），不可用 publishable／anon。\n'
        );
        process.exit(1);
    }
}

function requirePasswords(args) {
    if ((args.adminsOnly || args.includeLegacyNwcs) && !ADMIN_PASSWORD) {
        console.error('請設定 NWCS_ADMIN_PASSWORD（勿寫入 Git）');
        process.exit(1);
    }
    if (args.includeLegacyNwcs && !LEGACY_PASSWORD) {
        console.error('請設定 NWCS_LEGACY_PASSWORD');
        process.exit(1);
    }
}

async function main() {
    const args = parseArgs(process.argv);
    if (!BASE || !SERVICE_KEY) {
        console.error('請設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
    validateServiceKey();
    requirePasswords(args);

    if (!fs.existsSync(args.whitelistCsv)) {
        console.error('找不到名冊 CSV：', args.whitelistCsv);
        console.error('請複製 student_whitelist_rows.csv 到 tools/ 或用 --whitelist-csv 指定路徑');
        process.exit(1);
    }

    const whitelist = readWhitelistCsv(args.whitelistCsv);
    let passwordMap = new Map();
    if (args.students) {
        if (!args.passwordsCsv || !fs.existsSync(args.passwordsCsv)) {
            console.error(
                '學生批次建立需要 --passwords-csv（欄位：email,password）。\n' +
                    '可從校方 Excel「第2欄密碼」匯出，或執行：\n' +
                    '  python3 tools/generate_student_whitelist_sql.py --passwords-out passwords.csv "STD AC.xlsx"\n' +
                    '若不要批次建立：學生首次用 s########@ + 生日登入時，遊戲會自動 signUp（見 tools/AUTH.md）。'
            );
            process.exit(1);
        }
        passwordMap = readPasswordsCsv(args.passwordsCsv);
    }

    const jobs = [];
    for (const row of whitelist) {
        const kind = accountKind(row.email, row.isAdmin);
        if (!shouldProvision(row, kind, args)) continue;

        let password = '';
        if (kind === 'admin') password = ADMIN_PASSWORD;
        else if (kind === 'legacy_nwcs') password = LEGACY_PASSWORD;
        else if (kind === 'student') {
            password = passwordMap.get(row.email) || '';
            if (!password) {
                jobs.push({ email: row.email, kind, skip: 'no_password_in_csv' });
                continue;
            }
        } else continue;

        jobs.push({ email: row.email, kind, password });
    }

    console.log('名冊：', args.whitelistCsv);
    console.log(
        '模式：',
        OVERWRITE_EXISTING ? 'upsert（覆蓋既有密碼）' : 'create_only（略過已有帳號）'
    );
    console.log('待處理：', jobs.filter(j => !j.skip).length, '略過無密碼學生：', jobs.filter(j => j.skip).length);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const job of jobs) {
        if (job.skip) {
            skipped++;
            continue;
        }
        try {
            const action = await upsertAccount(job.email, job.password);
            if (action === 'created') created++;
            else if (action === 'updated') updated++;
            else if (action === 'skipped') skipped++;
            console.log(`[OK] ${job.email} (${job.kind}, ${action})`);
        } catch (e) {
            failed++;
            console.error(`[FAIL] ${job.email}:`, e.message);
        }
        await new Promise(r => setTimeout(r, 120));
    }

    console.log('\n完成：建立', created, '略過', skipped, '覆蓋', updated, '失敗', failed);
    console.log('說明：tools/AUTH.md');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
