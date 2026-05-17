#!/usr/bin/env node
/**
 * 在 Supabase Auth 建立／更新學生與管理員帳號（需 service_role，勿 commit 金鑰）。
 *
 * 用法：
 *   export SUPABASE_URL="https://oqsvxizemgyfointylpe.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="你的_service_role"
 *   node tools/provision_supabase_auth_users.mjs
 *
 * 可選環境變數：
 *   NWCS_STUDENT_PASSWORD、NWCS_ADMIN_PASSWORD
 *   NWCS_PROVISION_MODE=create_only（預設，不覆蓋舊帳密碼）
 *   NWCS_PROVISION_MODE=upsert（會把名單內既有帳號密碼改為統一密碼，慎用）
 */
const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const STUDENT_PASSWORD = process.env.NWCS_STUDENT_PASSWORD || 'NWcs1965!';
const ADMIN_EMAIL = 'nwcs211@ngwahsec.edu.hk';
const ADMIN_PASSWORD = process.env.NWCS_ADMIN_PASSWORD || 'NgW@h2526!';
const PROVISION_MODE = (process.env.NWCS_PROVISION_MODE || 'create_only').toLowerCase();
const OVERWRITE_EXISTING = PROVISION_MODE === 'upsert';

const STUDENT_IDS = `nwcs003 nwcs004 nwcs017 nwcs020 nwcs022 nwcs025 nwcs032 nwcs037 nwcs039 nwcs049 nwcs067 nwcs072 nwcs073 nwcs074 nwcs078 nwcs084 nwcs085 nwcs086 nwcs088 nwcs090 nwcs091 nwcs092 nwcs102 nwcs103 nwcs112 nwcs114 nwcs120 nwcs128 nwcs129 nwcs134 nwcs135 nwcs137 nwcs138 nwcs140 nwcs141 nwcs143 nwcs152 nwcs153 nwcs161 nwcs176 nwcs181 nwcs183 nwcs186 nwcs188 nwcs191 nwcs195 nwcs196 nwcs198 nwcs202 nwcs203 nwcs204 nwcs205 nwcs206 nwcs208 nwcs209 nwcs210 nwcs211 nwcs213 nwcs214 nwcs217 nwcs218 nwcs219 nwcs220 nwcs221 nwcs222 nwcs224 nwcs227 nwcs228 nwcs230 nwcs235 nwcs234 nwcs233 nwcs236 nwcs237 nwcs238 nwcs239 nwcs240 nwcs241 nwcs242 nwcs243 nwcs244`
    .split(/\s+/)
    .filter(Boolean);

function studentEmails() {
    return STUDENT_IDS.map(id => `${id}@ngwahsec.edu.hk`);
}

async function adminFetch(path, options = {}) {
    const url = `${BASE}${path}`;
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

async function upsertAccount(email, password) {
    const existing = await findUserByEmail(email);
    if (existing && existing.id) {
        if (!OVERWRITE_EXISTING) {
            return 'skipped';
        }
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
            '\n錯誤：你用的是 publishable／anon 金鑰，無法呼叫 Admin API。\n' +
                '請到 Supabase → Settings → API → 複製「service_role」（secret），\n' +
                '設定：export SUPABASE_SERVICE_ROLE_KEY="eyJ..." 或 sb_secret_...\n' +
                '切勿把 service_role 放進遊戲或 commit 到 Git。\n'
        );
        process.exit(1);
    }
}

async function main() {
    if (!BASE || !SERVICE_KEY) {
        console.error('請設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
    validateServiceKey();

    const emails = studentEmails();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    console.log(
        '模式：',
        OVERWRITE_EXISTING
            ? 'upsert（會覆蓋既有密碼）'
            : 'create_only（既有帳號保留原密碼，只建立新帳號）'
    );

    for (const email of emails) {
        const pw = email === ADMIN_EMAIL ? ADMIN_PASSWORD : STUDENT_PASSWORD;
        try {
            const action = await upsertAccount(email, pw);
            if (action === 'created') created++;
            else if (action === 'updated') updated++;
            else if (action === 'skipped') skipped++;
            console.log(`[OK] ${email} (${action})`);
        } catch (e) {
            failed++;
            console.error(`[FAIL] ${email}:`, e.message);
        }
        await new Promise(r => setTimeout(r, 120));
    }

    console.log('\n完成：建立', created, '略過（已有帳號）', skipped, '覆蓋更新', updated, '失敗', failed);
    console.log('請確認已執行 tools/supabase_seed_nwcs_players.sql（名冊）');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
