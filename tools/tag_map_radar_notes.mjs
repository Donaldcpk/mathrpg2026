#!/usr/bin/env node
/**
 * Batch-tag map events with LFS radar notes for MathVerse_Minimap.
 * <LFS:enemy> | <LFS:item> | <LFS:npc>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

const TAG = {
    enemy: '<LFS:enemy>',
    item: '<LFS:item>',
    npc: '<LFS:npc>'
};

const MAIN_CODES = new Set([101, 201, 301, 302, 126, 127, 128]);
const CUTSCENE_CODES = new Set([205, 505, 121, 123, 353, 322, 224, 655, 355, 117, 122, 111, 412, 313, 321, 102, 402, 404]);

const ENEMY_NAME = /哥布林|地精|魔物|BOSS|boss|暗殺|刺客|狼人|蝙蝠|史萊姆|Enemy|No\.\d|守衛|惡魔|幽靈|殭屍|龍|怪物|刺客/i;
const ITEM_NAME = /寶箱|宝箱|箱子|開關|机关|機關|鑰匙|钥匙|寶物|Gate|Switch|Door|Chest|門（|寶箱/i;
const NPC_CRYSTAL = /治癒水晶|劇情水晶|轉職水晶|剧情水晶/i;
const NPC_NAME = /轉移|商店|村民|商人|酒館|賢者|大賢者|塔主|任務|剧情|劇情|狗狗|悠真|莉娜|米勒|歐文|龍騎士|店員|店主|神父|修女|國王|皇后|僕人|士兵|居民|NPC|指引|轉職|戰士轉職|法師|牧師/i;
const SKIP_NAME = /鎖$|悠真鎖|莉娜鎖|EV鎖/i;

function parseArgs(argv) {
    const opts = {
        dataDir: DATA_DIR,
        dryRun: false,
        force: false,
        maps: null,
        backup: true
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        if (a === '--data-dir') opts.dataDir = path.resolve(next());
        else if (a === '--dry-run') opts.dryRun = true;
        else if (a === '--force') opts.force = true;
        else if (a === '--no-backup') opts.backup = false;
        else if (a === '--maps') opts.maps = next().split(',').map((s) => s.trim());
        else if (a === '--help') {
            console.log(`Usage: node tag_map_radar_notes.mjs [--dry-run] [--force] [--maps Map001,Map002]`);
            process.exit(0);
        }
    }
    return opts;
}

function loadMapInfos() {
    const p = path.join(DATA_DIR, 'MapInfos.json');
    const infos = JSON.parse(fs.readFileSync(p, 'utf8'));
    const byId = {};
    for (let i = 1; i < infos.length; i++) {
        const row = infos[i];
        if (row && row.id) byId[row.id] = row.name || '';
    }
    return byId;
}

function loadOverrides() {
    const p = path.join(__dirname, 'map_radar_tags_overrides.json');
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listMapFiles(opts) {
    const files = fs.readdirSync(opts.dataDir)
        .filter((f) => /^Map\d+\.json$/.test(f))
        .map((f) => path.join(opts.dataDir, f));
    if (!opts.maps) return files.sort();
    const want = new Set(opts.maps.map((m) => (m.endsWith('.json') ? m : `${m}.json`)));
    return files.filter((f) => want.has(path.basename(f)));
}

function collectPageData(pages) {
    const allCodes = new Set();
    let hasText = false;
    let charName = '';
    let trigger = 0;
    let moveType = 0;

    for (const pg of pages || []) {
        if (!pg) continue;
        if (!charName) {
            const img = pg.image || {};
            charName = img.characterName || '';
        }
        if (trigger === 0 && pg.trigger != null) trigger = pg.trigger;
        if (moveType === 0 && pg.moveType != null) moveType = pg.moveType;
        for (const cmd of pg.list || []) {
            if (!cmd || !cmd.code) continue;
            allCodes.add(cmd.code);
            if (cmd.code === 101 || cmd.code === 401) hasText = true;
        }
    }
    return { allCodes, hasText, charName, trigger, moveType };
}

function onlyCodes(codes, allowed) {
    for (const c of codes) {
        if (!allowed.has(c)) return false;
    }
    return true;
}

function hasExistingTag(note) {
    return /<LFS:(enemy|item|npc)>/i.test(note || '');
}

function shouldSkip(ev, data) {
    const name = ev.name || '';
    const { allCodes, charName, trigger, moveType } = data;

    if (SKIP_NAME.test(name)) return { skip: true, reason: 'party_lock' };

    if (allCodes.size === 0 || onlyCodes(allCodes, new Set([0]))) {
        return { skip: true, reason: 'decorative_empty' };
    }

    // Autorun / parallel decoration: move only, no player-facing commands
    if (![...allCodes].some((c) => MAIN_CODES.has(c))) {
        if (onlyCodes(allCodes, new Set([0, ...CUTSCENE_CODES]))) {
            return { skip: true, reason: 'cutscene_only' };
        }
    }

    // Patrol decoration: trigger 3, moves, no interaction
    if (trigger === 3 && moveType === 3 && ![...allCodes].some((c) => MAIN_CODES.has(c))) {
        return { skip: true, reason: 'patrol_decor' };
    }

    // !Flame torch with no real commands
    if (charName === '!Flame' && !allCodes.has(301) && !allCodes.has(101)) {
        return { skip: true, reason: 'flame_decor' };
    }

    return { skip: false };
}

function classifyEnemy(ev, data) {
    const name = ev.name || '';
    const { allCodes, charName } = data;

    if (allCodes.has(301)) return true;
    if (ENEMY_NAME.test(name)) return true;
    if (charName === 'Monster' && (allCodes.has(301) || allCodes.has(101))) return true;
    if (charName === '!Flame' && allCodes.has(301)) return true;

    return false;
}

function classifyItem(ev, data) {
    const name = ev.name || '';
    const { allCodes, charName } = data;

    if (NPC_CRYSTAL.test(name)) return false;

    if (allCodes.has(126) || allCodes.has(127) || allCodes.has(128)) return true;
    if (ITEM_NAME.test(name)) return true;

    const cn = charName || '';
    if (/!Chest|!Box|!Switch|!SF_Door|!\$Gate|!Door2/i.test(cn) && allCodes.has(250)) return true;
    if (/^!Door|^!Switch|^!Chest|^!Box/i.test(cn) && ![...allCodes].every((c) => c === 0)) {
        if (!NPC_CRYSTAL.test(name) && !/水晶/.test(name)) return true;
    }
    if (cn.includes('!SF_Door') || cn.includes('!$Gate')) return true;

    return false;
}

function classifyNpc(ev, data, mapName) {
    const name = ev.name || '';
    const { allCodes, charName, hasText } = data;

    if (allCodes.has(201) || allCodes.has(302) || allCodes.has(101)) return true;
    if (NPC_CRYSTAL.test(name) || /水晶/.test(name)) return true;
    if (NPC_NAME.test(name)) return true;
    if (/^轉移/.test(name)) return true;

    const cn = charName || '';
    if (/^People|^Actor|^infty-tow-ppl/i.test(cn) && hasText) return true;
    if (cn.includes('!Crystal')) return true;

    if (mapName && /商店|民房|酒館|圖書館|王都|數學村|霧光森林|無限之塔|魔王城/i.test(mapName)) {
        if (/^People|^Actor/i.test(cn) && !allCodes.has(301)) return true;
    }

    // Interactive EV with transfer-like invisible tile
    if (!cn && allCodes.has(201)) return true;

    return false;
}

function classifyEvent(ev, mapName, overrides, mapId) {
    const eventId = String(ev.id);
    if (overrides[mapId] && overrides[mapId][eventId]) {
        const t = overrides[mapId][eventId];
        if (t === 'skip' || t === 'none') return { tag: null, reason: 'override_skip' };
        if (TAG[t]) return { tag: TAG[t], reason: 'override' };
    }

    const data = collectPageData(ev.pages);
    const skip = shouldSkip(ev, data);
    if (skip.skip) return { tag: null, reason: skip.reason };

    if (classifyEnemy(ev, data)) return { tag: TAG.enemy, reason: 'enemy' };
    if (classifyItem(ev, data)) return { tag: TAG.item, reason: 'item' };
    if (classifyNpc(ev, data, mapName)) return { tag: TAG.npc, reason: 'npc' };

    // Remaining interactive-ish events
    if ([...data.allCodes].some((c) => MAIN_CODES.has(c) || CUTSCENE_CODES.has(c))) {
        return { tag: TAG.npc, reason: 'fallback_npc' };
    }

    return { tag: null, reason: 'uncertain' };
}

function applyTag(note, tag) {
    const n = (note || '').trim();
    if (!tag) return n;
    if (hasExistingTag(n)) {
        return n.replace(/<LFS:(enemy|item|npc)>/gi, tag);
    }
    return n ? `${tag} ${n}` : tag;
}

function processMapFile(filePath, mapName, opts, overrides, report) {
    const base = path.basename(filePath, '.json');
    const mapId = base;
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const events = data.events || [];

    const mapStats = {
        mapId,
        mapName,
        enemy: 0,
        item: 0,
        npc: 0,
        skipped: 0,
        already_tagged: 0,
        uncertain: 0,
        updated: 0
    };

    for (const ev of events) {
        if (!ev) continue;
        const note = ev.note || '';

        if (hasExistingTag(note) && !opts.force) {
            mapStats.already_tagged++;
            continue;
        }

        const result = classifyEvent(ev, mapName, overrides, mapId);

        if (result.reason === 'uncertain') {
            mapStats.uncertain++;
            report.uncertain.push({
                mapId,
                mapName,
                eventId: ev.id,
                eventName: ev.name,
                x: ev.x,
                y: ev.y
            });
            continue;
        }

        if (!result.tag) {
            mapStats.skipped++;
            if (opts.force && hasExistingTag(note)) {
                ev.note = note.replace(/<LFS:(enemy|item|npc)>\s*/gi, '').trim();
            }
            continue;
        }

        const newNote = applyTag(note, result.tag);
        if (newNote !== note) {
            ev.note = newNote;
            mapStats.updated++;
            if (result.tag === TAG.enemy) mapStats.enemy++;
            else if (result.tag === TAG.item) mapStats.item++;
            else if (result.tag === TAG.npc) mapStats.npc++;
        }
    }

    report.maps[mapId] = mapStats;
    report.totals.updated += mapStats.updated;
    report.totals.enemy += mapStats.enemy;
    report.totals.item += mapStats.item;
    report.totals.npc += mapStats.npc;
    report.totals.skipped += mapStats.skipped;
    report.totals.already_tagged += mapStats.already_tagged;
    report.totals.uncertain += mapStats.uncertain;

    if (!opts.dryRun && mapStats.updated > 0) {
        if (opts.backup) {
            const bak = `${filePath}.bak-radar`;
            if (!fs.existsSync(bak)) fs.copyFileSync(filePath, bak);
        }
        fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    }

    return mapStats;
}

function writeReport(report, opts) {
    const jsonPath = path.join(__dirname, 'map_radar_tags_report.json');
    const mdPath = path.join(__dirname, 'map_radar_tags_report.md');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const lines = [
        '# Map radar LFS tags report',
        '',
        `Generated: ${report.timestamp}`,
        `Mode: ${opts.dryRun ? 'dry-run' : 'write'}`,
        '',
        '## Totals',
        `- enemy: ${report.totals.enemy}`,
        `- item: ${report.totals.item}`,
        `- npc: ${report.totals.npc}`,
        `- updated: ${report.totals.updated}`,
        `- skipped: ${report.totals.skipped}`,
        `- already_tagged: ${report.totals.already_tagged}`,
        `- uncertain: ${report.totals.uncertain}`,
        '',
        '## Per map (top 20 by updates)',
        '',
        '| Map | Name | enemy | item | npc | updated | skipped | uncertain |',
        '|-----|------|-------|------|-----|---------|---------|-----------|'
    ];

    const ranked = Object.values(report.maps).sort((a, b) => b.updated - a.updated).slice(0, 20);
    for (const m of ranked) {
        lines.push(
            `| ${m.mapId} | ${m.mapName} | ${m.enemy} | ${m.item} | ${m.npc} | ${m.updated} | ${m.skipped} | ${m.uncertain} |`
        );
    }

    if (report.uncertain.length > 0) {
        lines.push('', '## Uncertain (first 40)', '');
        for (const u of report.uncertain.slice(0, 40)) {
            lines.push(`- ${u.mapId} #${u.eventId} "${u.eventName}" (${u.x},${u.y})`);
        }
    }

    fs.writeFileSync(mdPath, lines.join('\n'));
    return { jsonPath, mdPath };
}

function main() {
    const opts = parseArgs(process.argv);
    const mapInfos = loadMapInfos();
    const overrides = loadOverrides();
    const files = listMapFiles(opts);

    const report = {
        timestamp: new Date().toISOString(),
        dryRun: opts.dryRun,
        mapCount: files.length,
        maps: {},
        totals: {
            enemy: 0,
            item: 0,
            npc: 0,
            updated: 0,
            skipped: 0,
            already_tagged: 0,
            uncertain: 0
        },
        uncertain: []
    };

    for (const filePath of files) {
        const m = path.basename(filePath).match(/^Map(\d+)\.json$/);
        const mapIdNum = m ? parseInt(m[1], 10) : 0;
        const mapName = mapInfos[mapIdNum] || '';
        processMapFile(filePath, mapName, opts, overrides, report);
    }

    const { jsonPath, mdPath } = writeReport(report, opts);

    console.log('Processed maps:', files.length);
    console.log('Totals:', report.totals);
    console.log('Report:', jsonPath);
    console.log('Markdown:', mdPath);
    if (opts.dryRun) console.log('Dry run — no files written.');
}

main();
