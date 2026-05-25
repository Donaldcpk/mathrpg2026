#!/usr/bin/env node
/**
 * 將 tools/student_whitelist_rows.csv 同步至 Supabase public.student_whitelist（需 service_role）。
 *
 * 用法：
 *   export SUPABASE_URL="https://xxx.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
 *   node tools/sync_student_whitelist_from_csv.mjs
 *   node tools/sync_student_whitelist_from_csv.mjs --csv ./tools/student_whitelist_rows.csv
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BATCH = 100;

function parseArgs(argv) {
    let csv = path.join(__dirname, 'student_whitelist_rows.csv');
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--csv' && argv[i + 1]) csv = argv[++i];
    }
    return { csv };
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
    const seatIdx = header.indexOf('seat_code');
    const adminIdx = header.indexOf('is_admin');
    const earthIdx = header.indexOf('earth_ref');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const c = parseCsvLine(lines[i]);
        const email = (c[emailIdx] || '').trim().toLowerCase();
        if (!email || !email.includes('@')) continue;
        rows.push({
            email,
            seat_code: c[seatIdx] || null,
            earth_ref: c[earthIdx] || c[seatIdx] || null,
            is_admin: (c[adminIdx] || '').toLowerCase() === 'true'
        });
    }
    return rows;
}

async function upsertBatch(batch) {
    const res = await fetch(`${BASE}/rest/v1/student_whitelist?on_conflict=email`, {
        method: 'POST',
        headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(batch)
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`批次 upsert 失敗 ${res.status}: ${text}`);
    }
}

async function main() {
    const { csv } = parseArgs(process.argv);
    if (!BASE || !SERVICE_KEY) {
        console.error('請設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
    if (!fs.existsSync(csv)) {
        console.error('找不到名冊 CSV：', csv);
        process.exit(1);
    }

    const rows = readWhitelistCsv(csv);
    console.log('名冊：', csv);
    console.log('待同步：', rows.length, '筆');

    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        await upsertBatch(batch);
        console.log(`[OK] ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
        await new Promise(r => setTimeout(r, 200));
    }

    console.log('student_whitelist 同步完成');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
