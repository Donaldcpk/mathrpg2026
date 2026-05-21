#!/usr/bin/env node
/**
 * Rebuild S1–S3 (and optionally TSA_ALL) in questionDatabase.js from Answer Key CSVs.
 * Keep a question only when PNG exists on disk AND CSV has A–D answer (TSA: image + valid C_A).
 * Options are always A/B/C/D letters — never "?".
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const FOLDER_PREFIX = {
    S1_CH: '初中題庫/S1 AI 生成題目/中文題目/',
    S1_EN: '初中題庫/S1 AI 生成題目/英文題目/',
    S2_CH: '初中題庫/S2 AI生成題目/中文題目/',
    S2_EN: '初中題庫/S2 AI生成題目/英文題目/',
    S3_CH: '初中題庫/S3 AI生成題目/中文題目/',
    S3_EN: '初中題庫/S3 AI生成題目/英文題目/',
    TSA_ALL: '初中題庫/TSA/'
};

const S13_KEYS = ['S1_CH', 'S1_EN', 'S2_CH', 'S2_EN', 'S3_CH', 'S3_EN'];
const MCQ_QT = new Set([2, 3, 4, 5]);
const LETTERS = ['A', 'B', 'C', 'D'];

function parseArgs(argv) {
    const opts = {
        csvS1: path.join(process.env.HOME || '', 'Downloads/Answer Key S1-3 - S1ANS01-12.csv'),
        csvS2: path.join(process.env.HOME || '', 'Downloads/Answer Key S1-3 - S2ANS01-12.csv'),
        csvS3: path.join(process.env.HOME || '', 'Downloads/Answer Key S1-3 - S3ANS01-12.csv'),
        db: path.join(PROJECT_ROOT, 'js/plugins/questionDatabase.js'),
        pictures: path.join(PROJECT_ROOT, 'img/pictures'),
        keepTsa: false,
        dryRun: false
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        if (a === '--csv-s1') opts.csvS1 = next();
        else if (a === '--csv-s2') opts.csvS2 = next();
        else if (a === '--csv-s3') opts.csvS3 = next();
        else if (a === '--db') opts.db = path.resolve(next());
        else if (a === '--pictures') opts.pictures = path.resolve(next());
        else if (a === '--keep-tsa') opts.keepTsa = true;
        else if (a === '--dry-run') opts.dryRun = true;
        else if (a === '--help') {
            console.log(`Usage: node sync_question_answers_from_csv.mjs [options]
  --csv-s1 --csv-s2 --csv-s3  Answer Key CSV paths
  --db                        questionDatabase.js path
  --pictures                  img/pictures root
  --keep-tsa                  Keep TSA_ALL entries without CSV if image + valid C_A
  --dry-run                   Report only, do not write`);
            process.exit(0);
        }
    }
    return opts;
}

function isValidLetter(v) {
    return typeof v === 'string' && v.length === 1 && LETTERS.includes(v.toUpperCase());
}

function parseCsvFile(filePath, prefix) {
    let text = fs.readFileSync(filePath, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        rows.push(parseCsvLine(line));
    }
    if (rows.length === 0) return new Map();

    const hdr = rows[0];
    const seen = new Set();
    const blocks = [];

    for (let i = 0; i < hdr.length; i++) {
        const h = (hdr[i] || '').trim();
        const m = h.match(/^([0-9A-Z]+)(中文|英文)答案/);
        if (!m) continue;
        const ch = m[1];
        const lang = m[2] === '中文' ? 'CH' : 'EN';
        const key = `${prefix}_${lang}`;
        const mapKey = `${key}\0${ch}`;
        if (seen.has(mapKey)) continue;
        seen.add(mapKey);
        blocks.push({ key, ch, hi: i });
    }

    const answerMap = new Map();

    for (let ri = 1; ri < rows.length; ri++) {
        const r = rows[ri];
        if (!r.length) continue;

        let rowQ = null;
        const q0 = (r[0] || '').trim();
        const m0 = q0.match(/^Q(\d+)$/i);
        if (m0) rowQ = parseInt(m0[1], 10);

        for (const { key, ch, hi } of blocks) {
            if (hi >= r.length) continue;
            let qn = null;
            let ansCol = null;

            const qcell = (r[hi] || '').trim();
            const mq = qcell.match(/^Q(\d+)$/i);
            if (mq) {
                qn = parseInt(mq[1], 10);
                ansCol = hi + 1;
            } else if (rowQ != null && isValidLetter(r[hi])) {
                qn = rowQ;
                ansCol = hi;
            } else {
                continue;
            }

            if (ansCol == null || ansCol >= r.length) continue;
            const ans = (r[ansCol] || '').trim().toUpperCase();
            if (!isValidLetter(ans)) continue;

            const lookup = `${key}\0${ch}\0${qn}`;
            answerMap.set(lookup, ans);
        }
    }

    return answerMap;
}

/** Minimal RFC4180-style CSV line parse (handles quoted fields). */
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

function loadAnswerMaps(opts) {
    const merged = new Map();
    const files = [
        [opts.csvS1, 'S1'],
        [opts.csvS2, 'S2'],
        [opts.csvS3, 'S3']
    ];
    for (const [fp, prefix] of files) {
        if (!fs.existsSync(fp)) throw new Error(`CSV not found: ${fp}`);
        const m = parseCsvFile(fp, prefix);
        for (const [k, v] of m) merged.set(k, v);
    }
    return merged;
}

function loadQuestionDatabase(dbPath) {
    const code = fs.readFileSync(dbPath, 'utf8');
    const sandbox = { questionDatabase: null };
    const body = code.replace(/^\s*var\s+questionDatabase\s*=\s*/, 'questionDatabase = ');
    vm.runInNewContext(body, sandbox, { filename: dbPath });
    if (!sandbox.questionDatabase || typeof sandbox.questionDatabase !== 'object') {
        throw new Error('Failed to parse questionDatabase.js');
    }
    return sandbox.questionDatabase;
}

function chapterFromNote(categoryKey, note) {
    if (!note) return '';
    if (categoryKey.endsWith('_EN') && note.endsWith('EN')) return note.slice(0, -2);
    return note;
}

function imageExists(opts, categoryKey, guid) {
    const prefix = FOLDER_PREFIX[categoryKey];
    if (!prefix || !guid) return false;
    const base = path.join(opts.pictures, prefix);
    const candidates = [guid];
    if (!/\.(png|jpg|jpeg)$/i.test(guid)) {
        candidates.push(`${guid}.png`, `${guid}.PNG`, `${guid}.jpg`);
    }
    return candidates.some((c) => fs.existsSync(path.join(base, c)));
}

function otherLetters(correct) {
    const c = correct.toUpperCase();
    const rest = LETTERS.filter((l) => l !== c);
    return { A2: rest[0], A3: rest[1], A4: rest[2] };
}

function normalizeQuestion(q, correctLetter) {
    const c = correctLetter.toUpperCase();
    const o = otherLetters(c);
    q.C_A = c;
    q.A2 = o.A2;
    q.A3 = o.A3;
    q.A4 = o.A4;
    q.A = LETTERS.indexOf(c);
    if (q.A5 === '?' || q.A5 === undefined) q.A5 = '';
    return q;
}

function isMcq(q) {
    return MCQ_QT.has(Number(q.Q_T));
}

function hasQuestionMarkOptions(q) {
    return [q.C_A, q.A2, q.A3, q.A4].some((v) => v === '?');
}

function serializeValue(v, indent) {
    if (v === null) return 'null';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return JSON.stringify(v);
}

function serializeQuestion(q, baseIndent) {
    const keys = [
        'Note', 'GUID', 'E', 'Q_T', 'Q', 'T', 'I', 'A', 'C_A', 'A2', 'A3', 'A4', 'A5', 'A5_Why', 'S',
        'R_T', 'R_I', 'R_A', 'P_T', 'P_I', 'P_A', 'O_L'
    ];
    const lines = [`${baseIndent}{`];
    const ki = baseIndent + '    ';
    const ordered = [...keys];
    for (const k of Object.keys(q)) {
        if (!ordered.includes(k)) ordered.push(k);
    }
    for (const k of ordered) {
        if (!(k in q)) continue;
        lines.push(`${ki}"${k}": ${serializeValue(q[k], ki)},`);
    }
    lines.push(`${baseIndent}}`);
    return lines.join('\n');
}

function serializeDatabase(db) {
    const order = [...S13_KEYS, 'TSA_ALL'];
    const extra = Object.keys(db).filter((k) => !order.includes(k));
    const allKeys = [...order.filter((k) => k in db), ...extra];

    const lines = ['var questionDatabase = {'];
    for (const key of allKeys) {
        const arr = db[key];
        if (!Array.isArray(arr)) continue;
        lines.push(`    "${key}": [`);
        for (let i = 0; i < arr.length; i++) {
            const block = serializeQuestion(arr[i], '        ');
            lines.push(block + (i < arr.length - 1 ? ',' : ''));
        }
        lines.push('    ],');
    }
    lines.push('};');
    lines.push('');
    return lines.join('\n');
}

function processCategory(opts, categoryKey, questions, answerMap, report) {
    const qIndex = new Map();
    const kept = [];
    const prefix = FOLDER_PREFIX[categoryKey];
    const isTsa = categoryKey === 'TSA_ALL';

    for (const q of questions) {
        const note = String(q.Note != null ? q.Note : '');
        if (note === '題目廢案') {
            report.removed_scrap++;
            report.removed_details.push({ categoryKey, note, guid: q.GUID, reason: 'scrap' });
            continue;
        }

        if (!isMcq(q)) {
            kept.push(q);
            continue;
        }

        const chapter = chapterFromNote(categoryKey, note);
        const idxKey = `${categoryKey}\0${chapter}`;
        const qNum = (qIndex.get(idxKey) || 0) + 1;
        qIndex.set(idxKey, qNum);

        const hasImage = imageExists(opts, categoryKey, q.GUID);

        let csvAnswer = null;
        if (!isTsa) {
            const lookup = `${categoryKey}\0${chapter}\0${qNum}`;
            csvAnswer = answerMap.get(lookup) || null;
        }

        const reasons = [];
        if (!hasImage) reasons.push('no_image');
        if (isTsa) {
            if (!isValidLetter(q.C_A)) reasons.push('no_csv');
        } else if (!csvAnswer) {
            reasons.push('no_csv');
        }

        if (reasons.length > 0) {
            const noImg = reasons.includes('no_image');
            const noCsv = reasons.includes('no_csv');
            if (noImg && noCsv) report.removed_no_image_and_csv++;
            else if (noImg) report.removed_no_image++;
            else if (noCsv) report.removed_no_csv++;
            report.removed_details.push({
                categoryKey,
                chapter,
                qNum,
                note,
                guid: q.GUID,
                reasons
            });
            continue;
        }

        const correct = (isTsa ? String(q.C_A) : csvAnswer).toUpperCase();
        if (!isValidLetter(correct)) {
            report.removed_no_csv++;
            report.removed_details.push({
                categoryKey,
                chapter,
                qNum,
                note,
                guid: q.GUID,
                reasons: ['invalid_answer']
            });
            continue;
        }

        normalizeQuestion(q, correct);
        kept.push(q);
        report.kept++;
        if (report.kept_by_category[categoryKey] == null) report.kept_by_category[categoryKey] = 0;
        report.kept_by_category[categoryKey]++;
    }

    return kept;
}

function countQuestionMarks(db, keys) {
    let n = 0;
    for (const key of keys) {
        const arr = db[key];
        if (!Array.isArray(arr)) continue;
        for (const q of arr) {
            if (!isMcq(q)) continue;
            if (hasQuestionMarkOptions(q) || q.C_A === '?') n++;
        }
    }
    return n;
}

function main() {
    const opts = parseArgs(process.argv);
    const answerMap = loadAnswerMaps(opts);

    console.log('Loaded CSV answers:', answerMap.size);

    const db = loadQuestionDatabase(opts.db);
    const report = {
        timestamp: new Date().toISOString(),
        kept: 0,
        kept_by_category: {},
        removed_scrap: 0,
        removed_no_image: 0,
        removed_no_csv: 0,
        removed_no_image_and_csv: 0,
        removed_details: [],
        before: {},
        after: {}
    };

    for (const key of S13_KEYS) {
        if (!Array.isArray(db[key])) continue;
        report.before[key] = db[key].length;
    }
    if (Array.isArray(db.TSA_ALL)) report.before.TSA_ALL = db.TSA_ALL.length;

    for (const key of S13_KEYS) {
        if (!Array.isArray(db[key])) continue;
        db[key] = processCategory(opts, key, db[key], answerMap, report);
        report.after[key] = db[key].length;
    }

    if (Array.isArray(db.TSA_ALL)) {
        db.TSA_ALL = processCategory(opts, 'TSA_ALL', db.TSA_ALL, answerMap, report);
        report.after.TSA_ALL = db.TSA_ALL.length;
    }

    report.remaining_question_marks_s13 = countQuestionMarks(db, S13_KEYS);
    report.remaining_question_marks_tsa = countQuestionMarks(db, ['TSA_ALL']);

    const reportJsonPath = path.join(PROJECT_ROOT, 'tools/question_answer_sync_report.json');
    const reportMdPath = path.join(PROJECT_ROOT, 'tools/question_answer_sync_report.md');

    const md = [
        '# Question answer sync report',
        '',
        `Generated: ${report.timestamp}`,
        '',
        '## Summary',
        `- **kept**: ${report.kept}`,
        `- **removed_scrap**: ${report.removed_scrap}`,
        `- **removed_no_image**: ${report.removed_no_image}`,
        `- **removed_no_csv**: ${report.removed_no_csv}`,
        `- **removed_no_image_and_csv**: ${report.removed_no_image_and_csv}`,
        `- **remaining ? (S1–S3)**: ${report.remaining_question_marks_s13}`,
        `- **remaining ? (TSA_ALL)**: ${report.remaining_question_marks_tsa}`,
        '',
        '## Counts by category',
        '',
        '| Category | Before | After | Kept |',
        '|----------|--------|-------|------|',
        ...[...S13_KEYS, 'TSA_ALL'].filter((k) => report.before[k] != null).map(
            (k) =>
                `| ${k} | ${report.before[k]} | ${report.after[k] ?? '-'} | ${report.kept_by_category[k] ?? '-'} |`
        ),
        '',
        '## Sample removals (first 30)',
        '',
        ...report.removed_details.slice(0, 30).map(
            (d) =>
                `- ${d.categoryKey} ${d.chapter || d.note} Q${d.qNum || '?'} (${(d.reasons || [d.reason]).join(', ')}) ${d.guid || ''}`
        )
    ].join('\n');

    fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(reportMdPath, md);

    console.log('Report:', reportJsonPath);
    console.log('Summary:', {
        kept: report.kept,
        removed_scrap: report.removed_scrap,
        removed_no_image: report.removed_no_image,
        removed_no_csv: report.removed_no_csv,
        remaining_qm_s13: report.remaining_question_marks_s13
    });

    if (opts.dryRun) {
        console.log('Dry run — database not written.');
        return;
    }

    const bak = `${opts.db}.bak-${new Date().toISOString().slice(0, 10)}`;
    fs.copyFileSync(opts.db, bak);
    console.log('Backup:', bak);

    const out = serializeDatabase(db);
    fs.writeFileSync(opts.db, out, 'utf8');
    console.log('Wrote:', opts.db);
}

main();
