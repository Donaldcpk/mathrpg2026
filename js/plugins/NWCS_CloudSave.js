/*:
 * @target MZ
 * @plugindesc [v1.1] 跨裝置雲端存檔＋每日遊玩時間同步
 * @author NWCS
 * @orderAfter OmniscientEncyclopedia
 * @orderAfter Kurimanju_TimeLimit
 *
 * @help NWCS_CloudSave.js
 * 需執行 tools/supabase_player_cloud_saves.sql，並完成學校登入。
 *
 * 功能：
 * - 登入後自動同步存檔格（較新時間戳覆蓋）
 * - 每次存檔後上傳；下載前驗證＋本機備份
 * - 記錄 RPG Maker 版本；版本不符時仍嘗試讀檔並提示
 * - 每日遊玩秒數跨裝置累計（取較大值，防止換機繞過限時）
 *
 * Supabase URL／Key 沿用 OmniscientEncyclopedia 參數。
 *
 * @param primarySaveSlot
 * @text 雲端同步存檔格
 * @type number
 * @min 1
 * @max 20
 * @default 1
 *
 * @param projectSaveVersion
 * @text 專案存檔版本號
 * @desc 更新地圖／變數結構時請手動 +1，用於跨版本警告（例：1.0.0）。
 * @default 1.0.0
 *
 * @param syncDailyPlaytime
 * @text 同步每日遊玩時間
 * @desc 登入後跨裝置累計今日已玩秒數（需 player_daily_playtime 表）。
 * @type boolean
 * @default true
 *
 * @param uploadRetryCount
 * @text 上傳失敗重試次數
 * @type number
 * @min 0
 * @max 5
 * @default 1
 *
 * @param maxSavePayloadChars
 * @text 存檔上傳字元上限
 * @desc base64 字串超過此值僅警告（約 1.5MB 建議 2097152）。
 * @type number
 * @default 2097152
 */

(() => {
    'use strict';

    const PLUGIN_NAME = 'NWCS_CloudSave';
    const SAVE_TABLE = 'player_cloud_saves';
    const TIME_TABLE = 'player_daily_playtime';
    const BACKUP_SUFFIX = '_nwcs_backup';

    const parameters = PluginManager.parameters(PLUGIN_NAME);
    const PRIMARY_SLOT = Math.max(1, Math.min(20, Number(parameters.primarySaveSlot) || 1));
    const PROJECT_SAVE_VERSION = String(parameters.projectSaveVersion || '1.0.0').trim();
    const SYNC_DAILY_TIME = (parameters.syncDailyPlaytime || 'true') === 'true';
    const UPLOAD_RETRIES = Math.max(0, Math.min(5, Number(parameters.uploadRetryCount) || 1));
    const MAX_PAYLOAD_CHARS = Math.max(100000, Number(parameters.maxSavePayloadChars) || 2097152);

    const ENGINE_VERSION = typeof Utils !== 'undefined' && Utils.RPGMAKER_VERSION
        ? String(Utils.RPGMAKER_VERSION)
        : '1.9.0';

    function getSupabaseConfig() {
        const p = PluginManager.parameters('OmniscientEncyclopedia') || {};
        return {
            baseUrl: String(p.supabaseUrl || '').trim().replace(/\/+$/, ''),
            apiKey: String(p.supabaseKey || '').trim()
        };
    }

    function storagePrefix() {
        return (window.SCHOOL_AUTH && window.SCHOOL_AUTH.storagePrefix) || 'nwcs_sb_';
    }

    function fullSaveVersion() {
        return `MZ${ENGINE_VERSION}_${PROJECT_SAVE_VERSION}`;
    }

    function zipToBase64(zip) {
        const bytes = new Uint8Array(zip.length);
        for (let i = 0; i < zip.length; i++) bytes[i] = zip.charCodeAt(i) & 0xff;
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function base64ToZip(b64) {
        const binary = atob(b64);
        let zip = '';
        for (let i = 0; i < binary.length; i++) zip += binary.charAt(i);
        return zip;
    }

    function simpleHash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(16);
    }

    function todayDateKey() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function validateSaveZip(zip) {
        if (!zip || typeof zip !== 'string') return { ok: false, reason: '空檔' };
        try {
            const json = pako.inflate(zip, { to: 'string' });
            if (!json || json === 'null') return { ok: false, reason: '解壓後為空' };
            JsonEx.parse(json);
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: e.message || '解壓失敗' };
        }
    }

    class NWCS_CloudSaveManager {
        static get lastSyncResult() {
            return this._lastSyncResult || { action: 'none' };
        }

        static getUserId() {
            return window.__sbUserId ? String(window.__sbUserId) : '';
        }

        static getBearer() {
            if (window.__sbAccessToken) return window.__sbAccessToken;
            return getSupabaseConfig().apiKey;
        }

        static isLoggedIn() {
            return !!this.getUserId() && !!getSupabaseConfig().baseUrl;
        }

        static setSyncMessage(text, level) {
            this._syncMessage = text || '';
            this._syncLevel = level || 'info';
            try {
                if (text) {
                    localStorage.setItem('nwcs_cloud_sync_msg', text);
                    localStorage.setItem('nwcs_cloud_sync_level', level || 'info');
                } else {
                    localStorage.removeItem('nwcs_cloud_sync_msg');
                    localStorage.removeItem('nwcs_cloud_sync_level');
                }
            } catch (e) {
                /* ignore */
            }
        }

        static async refreshUserSessionIfNeeded() {
            const rt = window.__sbRefreshToken;
            const uid = this.getUserId();
            const { baseUrl, apiKey } = getSupabaseConfig();
            if (!rt || !uid || !baseUrl || !apiKey) return;
            try {
                const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
                    method: 'POST',
                    headers: {
                        apikey: apiKey,
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ refresh_token: rt })
                });
                const data = await response.json().catch(() => ({}));
                if (response.ok && data.access_token) {
                    window.__sbAccessToken = data.access_token;
                    if (data.refresh_token) window.__sbRefreshToken = data.refresh_token;
                    const p = storagePrefix();
                    try {
                        localStorage.setItem(p + 'at', data.access_token);
                        if (data.refresh_token) localStorage.setItem(p + 'rt', data.refresh_token);
                        if (uid) localStorage.setItem(p + 'uid', uid);
                    } catch (e) {
                        /* ignore */
                    }
                }
            } catch (e) {
                console.warn('[NWCS_CloudSave] refresh session', e);
            }
        }

        static localTimestamp(slot) {
            if (!DataManager._globalInfo || !DataManager._globalInfo[slot]) return 0;
            const ts = DataManager._globalInfo[slot].timestamp;
            return ts ? Number(ts) : 0;
        }

        static cloudTimestamp(row) {
            if (!row || !row.updated_at) return 0;
            const t = new Date(row.updated_at).getTime();
            return Number.isFinite(t) ? t : 0;
        }

        static async restGet(table, query) {
            const { baseUrl, apiKey } = getSupabaseConfig();
            const url = `${baseUrl}/rest/v1/${table}?${query}`;
            const response = await fetch(url, {
                headers: { apikey: apiKey, Authorization: `Bearer ${this.getBearer()}` }
            });
            if (!response.ok) {
                const body = await response.text();
                console.warn('[NWCS_CloudSave] GET', table, response.status, body.slice(0, 200));
                return null;
            }
            return response.json();
        }

        static async restUpsert(table, conflict, payload) {
            const { baseUrl, apiKey } = getSupabaseConfig();
            const url = `${baseUrl}/rest/v1/${table}?on_conflict=${conflict}`;
            let lastErr = null;
            for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt++) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            apikey: apiKey,
                            Authorization: `Bearer ${this.getBearer()}`,
                            Prefer: 'resolution=merge-duplicates'
                        },
                        body: JSON.stringify(payload)
                    });
                    if (response.ok) return true;
                    lastErr = await response.text();
                    console.warn('[NWCS_CloudSave] UPSERT', table, response.status, lastErr.slice(0, 200));
                } catch (e) {
                    lastErr = String(e);
                    console.warn('[NWCS_CloudSave] UPSERT error', e);
                }
                if (attempt < UPLOAD_RETRIES) {
                    await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
                }
            }
            return false;
        }

        static async fetchCloudSaveRow(slot) {
            const uid = this.getUserId();
            if (!uid) return null;
            const rows = await this.restGet(
                SAVE_TABLE,
                `user_id=eq.${encodeURIComponent(uid)}&slot=eq.${slot}` +
                    '&select=user_id,slot,save_data,updated_at,playtime,game_title,save_version,content_hash'
            );
            return rows && rows[0] ? rows[0] : null;
        }

        static buildGlobalInfoEntry(row) {
            return {
                title: row.game_title || ($dataSystem && $dataSystem.gameTitle) || 'Game',
                characters: [],
                faces: [],
                playtime: row.playtime || '',
                timestamp: this.cloudTimestamp(row)
            };
        }

        static async backupLocalSlot(slot) {
            if (!DataManager.savefileExists(slot)) return;
            const saveName = DataManager.makeSavename(slot);
            const zip = await StorageManager.loadZip(saveName);
            if (!zip) return;
            await StorageManager.saveZip(saveName + BACKUP_SUFFIX, zip);
            console.log('[NWCS_CloudSave] 已備份本機存檔至', saveName + BACKUP_SUFFIX);
        }

        static warnVersionMismatch(cloudVersion) {
            const cur = fullSaveVersion();
            if (cloudVersion && cloudVersion !== cur) {
                const msg =
                    `雲端存檔版本（${cloudVersion}）與目前遊戲（${cur}）不同，仍嘗試還原；若異常請回報老師。`;
                console.warn('[NWCS_CloudSave]', msg);
                this.setSyncMessage(msg, 'warn');
                return true;
            }
            return false;
        }

        static async applyCloudSave(row, slot) {
            const zip = base64ToZip(row.save_data);
            const check = validateSaveZip(zip);
            if (!check.ok) {
                console.error('[NWCS_CloudSave] 雲端存檔無效，略過還原：', check.reason);
                this.setSyncMessage('雲端存檔損壞，已保留本機進度。', 'error');
                return false;
            }

            await this.backupLocalSlot(slot);
            this.warnVersionMismatch(row.save_version);

            const saveName = DataManager.makeSavename(slot);
            await StorageManager.saveZip(saveName, zip);
            if (!DataManager._globalInfo) DataManager._globalInfo = [];
            DataManager._globalInfo[slot] = this.buildGlobalInfoEntry(row);
            await DataManager.saveGlobalInfo();

            this.setSyncMessage('已從雲端還原較新進度，請在標題畫面選「繼續遊戲」。', 'ok');
            console.log('[NWCS_CloudSave] 已還原雲端存檔 slot', slot);
            return true;
        }

        static async uploadSlot(slot, options = {}) {
            if (!this.isLoggedIn()) return false;
            await this.refreshUserSessionIfNeeded();

            if (!DataManager.savefileExists(slot)) return false;

            const saveName = DataManager.makeSavename(slot);
            const zip = await StorageManager.loadZip(saveName);
            if (!zip) return false;

            const b64 = zipToBase64(zip);
            if (b64.length > MAX_PAYLOAD_CHARS) {
                console.warn(
                    '[NWCS_CloudSave] 存檔過大（',
                    b64.length,
                    '字元），仍嘗試上傳；若失敗請聯絡管理員。'
                );
            }

            const info = (DataManager._globalInfo && DataManager._globalInfo[slot]) || {};
            const updatedAt = info.timestamp
                ? new Date(Number(info.timestamp)).toISOString()
                : new Date().toISOString();

            const payload = {
                user_id: this.getUserId(),
                slot,
                save_data: b64,
                updated_at: updatedAt,
                playtime: info.playtime || '',
                game_title: info.title || ($dataSystem && $dataSystem.gameTitle) || '',
                save_version: fullSaveVersion(),
                content_hash: simpleHash(b64)
            };

            const ok = await this.restUpsert(SAVE_TABLE, 'user_id,slot', payload);
            if (ok && !options.silent) {
                console.log('[NWCS_CloudSave] 已上傳雲端存檔 slot', slot);
            }
            return ok;
        }

        static async syncDailyPlaytime() {
            if (!SYNC_DAILY_TIME || !this.isLoggedIn() || !window.NWCS_DailyTime) return;
            await window.NWCS_DailyTime.syncFromCloud();
        }

        static async pushDailyPlaytime() {
            if (!SYNC_DAILY_TIME || !this.isLoggedIn() || !window.NWCS_DailyTime) return;
            await window.NWCS_DailyTime.pushToCloud();
        }

        static async syncFromCloud() {
            if (!this.isLoggedIn()) {
                this._lastSyncResult = { action: 'skip' };
                return this._lastSyncResult;
            }

            await this.refreshUserSessionIfNeeded();

            const slot = PRIMARY_SLOT;
            const row = await this.fetchCloudSaveRow(slot);
            const localTs = this.localTimestamp(slot);
            const cloudTs = row ? this.cloudTimestamp(row) : 0;
            const hasLocal = DataManager.savefileExists(slot);

            let action = 'none';

            if (row && row.save_data && cloudTs > localTs) {
                const applied = await this.applyCloudSave(row, slot);
                action = applied ? 'download' : 'download_failed';
            } else if (hasLocal && localTs > cloudTs) {
                await this.uploadSlot(slot, { silent: true });
                action = 'upload';
            } else if (hasLocal && localTs === cloudTs && localTs > 0) {
                action = 'in_sync';
            }

            await this.syncDailyPlaytime();

            this._lastSyncResult = { action, cloudTs, localTs };
            return this._lastSyncResult;
        }

        static _syncPromise = null;

        static runSync() {
            if (this._syncPromise) return this._syncPromise;
            this._syncPromise = this.syncFromCloud()
                .catch(e => {
                    console.warn('[NWCS_CloudSave] sync', e);
                    return { action: 'error' };
                })
                .finally(() => {
                    this._syncPromise = null;
                });
            return this._syncPromise;
        }

        static scheduleSyncAfterAuth() {
            this.runSync();
        }
    }

    class NWCS_DailyTime {
        static dateKey() {
            return todayDateKey();
        }

        static keys() {
            const uid = NWCS_CloudSaveManager.getUserId();
            if (uid) {
                return {
                    date: `Kurimanju_DailyDate_${uid}`,
                    seconds: `Kurimanju_DailySeconds_${uid}`
                };
            }
            return { date: 'Kurimanju_DailyDate', seconds: 'Kurimanju_DailySeconds' };
        }

        static readLocal() {
            const k = this.keys();
            let date = '';
            let seconds = 0;
            try {
                date = localStorage.getItem(k.date) || '';
                seconds = Number(localStorage.getItem(k.seconds)) || 0;
            } catch (e) {
                /* ignore */
            }
            return { date, seconds };
        }

        static writeLocal(date, seconds) {
            const k = this.keys();
            try {
                localStorage.setItem(k.date, date);
                localStorage.setItem(k.seconds, String(Math.max(0, Math.floor(seconds))));
            } catch (e) {
                /* ignore */
            }
            this._cache = { date, seconds: Math.max(0, Math.floor(seconds)) };
        }

        static ensureToday() {
            const today = this.dateKey();
            const { date, seconds } = this.readLocal();
            if (date !== today) {
                this.writeLocal(today, 0);
                return { date: today, seconds: 0 };
            }
            return { date: today, seconds };
        }

        static getUsedSeconds() {
            this.ensureToday();
            const c = this._cache || this.readLocal();
            if (c.date === this.dateKey()) return c.seconds;
            return this.ensureToday().seconds;
        }

        static setUsedSeconds(seconds) {
            const today = this.dateKey();
            const val = Math.max(0, Math.floor(seconds));
            this.writeLocal(today, val);
            this._dirty = true;
            this.schedulePush();
        }

        static _pushTimer = null;

        static schedulePush() {
            if (!NWCS_CloudSaveManager.isLoggedIn()) return;
            if (this._pushTimer) clearTimeout(this._pushTimer);
            this._pushTimer = setTimeout(() => {
                this._pushTimer = null;
                this.pushToCloud();
            }, 5000);
        }

        static async fetchCloudRow() {
            const uid = NWCS_CloudSaveManager.getUserId();
            if (!uid) return null;
            const today = this.dateKey();
            const rows = await NWCS_CloudSaveManager.restGet(
                TIME_TABLE,
                `user_id=eq.${encodeURIComponent(uid)}&play_date=eq.${today}` +
                    '&select=used_seconds,updated_at,play_date'
            );
            return rows && rows[0] ? rows[0] : null;
        }

        static async syncFromCloud() {
            if (!NWCS_CloudSaveManager.isLoggedIn()) return;
            await NWCS_CloudSaveManager.refreshUserSessionIfNeeded();

            const today = this.dateKey();
            this.ensureToday();
            const local = this.readLocal();
            const row = await this.fetchCloudRow();
            const cloudSec = row ? Math.max(0, Number(row.used_seconds) || 0) : 0;
            const localSec = local.date === today ? local.seconds : 0;
            const merged = Math.max(localSec, cloudSec);

            this.writeLocal(today, merged);

            if (merged > cloudSec) {
                await this.pushToCloud();
            }

            console.log('[NWCS_DailyTime] 今日已玩', merged, '秒（本機', localSec, '／雲端', cloudSec, '）');
        }

        static async pushToCloud() {
            if (!NWCS_CloudSaveManager.isLoggedIn()) return false;
            const today = this.dateKey();
            const seconds = this.getUsedSeconds();
            const payload = {
                user_id: NWCS_CloudSaveManager.getUserId(),
                play_date: today,
                used_seconds: seconds,
                updated_at: new Date().toISOString()
            };
            return NWCS_CloudSaveManager.restUpsert(TIME_TABLE, 'user_id,play_date', payload);
        }
    }

    window.NWCS_CloudSaveManager = NWCS_CloudSaveManager;
    window.NWCS_DailyTime = NWCS_DailyTime;

    window.NWCS_getDailyUsedSeconds = () => NWCS_DailyTime.getUsedSeconds();
    window.NWCS_setDailyUsedSeconds = sec => NWCS_DailyTime.setUsedSeconds(sec);
    window.NWCS_ensureDailyDate = () => NWCS_DailyTime.ensureToday();

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function () {
        const boot = this;
        NWCS_CloudSaveManager.runSync().finally(() => {
            _Scene_Boot_start.call(boot);
        });
    };

    const _DataManager_saveGame = DataManager.saveGame;
    DataManager.saveGame = function (savefileId) {
        return _DataManager_saveGame.call(this, savefileId).then(result => {
            const tasks = [];
            if (savefileId === PRIMARY_SLOT && NWCS_CloudSaveManager.isLoggedIn()) {
                tasks.push(NWCS_CloudSaveManager.uploadSlot(savefileId));
            }
            if (NWCS_CloudSaveManager.isLoggedIn()) {
                tasks.push(NWCS_DailyTime.pushToCloud());
            }
            if (tasks.length === 0) return result;
            return Promise.all(tasks).then(() => result);
        });
    };

    const _Scene_Title_start = Scene_Title.prototype.start;
    Scene_Title.prototype.start = function () {
        _Scene_Title_start.call(this);
        try {
            const msg = localStorage.getItem('nwcs_cloud_sync_msg');
            const level = localStorage.getItem('nwcs_cloud_sync_level') || 'info';
            if (msg) {
                if (level === 'warn' || level === 'error') {
                    console.warn('[NWCS_CloudSave]', msg);
                } else {
                    console.log('[NWCS_CloudSave]', msg);
                }
                localStorage.removeItem('nwcs_cloud_sync_msg');
                localStorage.removeItem('nwcs_cloud_sync_level');
            }
        } catch (e) {
            /* ignore */
        }
        if (NWCS_CloudSaveManager.isLoggedIn()) {
            const r = NWCS_CloudSaveManager.lastSyncResult;
            console.log('[NWCS_CloudSave] 已登入｜同步:', r.action, '｜存檔格', PRIMARY_SLOT);
        }
    };
})();
