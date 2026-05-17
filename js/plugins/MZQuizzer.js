//=============================================================================
// MZ-Quiz-Engine.js (v1.5.0 多變／集中出題、答題設定選單、排行榜答對題數聯動)
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v1.5.0] Quiz Engine（多變／集中；答錯同一題；TSA 鎖題；逾時算錯）
 * @author Starbird (Modified by Senior Programmer)
 * @help MZ-Quiz-Engine.js
 *
 * @command getQuestion
 * @desc 依變數 990／989 與出題模式顯示題目。
 *
 * @command setQuizProfile
 * @text 設定答題組合
 * @desc 供公共事件一鍵設定難度、語言、模式；可選是否重置進度。
 *
 * @arg difficulty
 * @text 難度（變數 990）
 * @type number
 * @min 1
 * @max 4
 * @default 1
 *
 * @arg language
 * @text 語言（變數 989）
 * @type number
 * @min 1
 * @max 2
 * @default 1
 *
 * @arg varietyMode
 * @text 出題模式
 * @type select
 * @option 多變
 * @value diverse
 * @option 集中
 * @value focused
 * @default diverse
 *
 * @arg resetProgress
 * @text 重置答對與進度
 * @type boolean
 * @default false
 *
 * @param penaltyStateId
 * @text 懲罰狀態 ID (跳過回合)
 * @desc 當答錯時施加的狀態 ID。須為「無法行動」且不自動解除；僅答對時由插件移除。
 * @type state
 * @default 300
 *
 * @param quizPromptSubstring
 * @text 縮窄訊息窗：觸發字串
 * @desc 戰鬥訊息全文含此字串時，將訊息窗改矮以免遮住題圖。題庫改提示語時請同步修改。
 * @default 請看題目圖片
 *
 * @param quizMessageLineCount
 * @text 縮窄時訊息行數
 * @desc 1～4。愈少愈不遮擋圖片；過小可能裁切頭圖。
 * @type number
 * @min 1
 * @max 4
 * @default 2
 *
 * @param TsaLockVariableId
 * @text TSA 題號鎖定變數 ID
 * @desc Var 990=4（TSA）時：答錯會重複同一題直到答對。0=未鎖定，>0 表示目前題號為 (值-1)。
 * @type variable
 * @default 988
 *
 * @param correctCountVariableId
 * @text 答對累計變數 ID
 * @type variable
 * @default 993
 *
 * @param wrongCountVariableId
 * @text 答錯累計變數 ID
 * @type variable
 * @default 994
 *
 * @param streakVariableId
 * @text 連對變數 ID
 * @type variable
 * @default 996
 *
 * @param missStreakVariableId
 * @text 連錯變數 ID
 * @type variable
 * @default 997
 *
 * @param currentQuestionVariableId
 * @text 目前題號變數 ID（顯示用）
 * @desc 非 TSA 時寫入目前題庫索引，供事件參考。
 * @type variable
 * @default 992
 *
 * @param varietyModeVariableId
 * @text 出題模式變數 ID（選用）
 * @desc 1=多變 2=集中；0 表示僅用選單／存檔內 Game_System，不讀寫變數。
 * @type variable
 * @default 0
 *
 * @help
 * Var 990: 1=中一 2=中二 3=中三 4=TSA
 * Var 989: 1=中文 2=English（TSA 仍建議保留）
 * 主選單可開「答題設定」變更難度／語言／模式；變更時會提示並重置答對題數與出題進度。
 * 多變：本輪隨機跨 Note，直到全題都曾答對才開新一輪。
 * 集中：依 Note（如 1A01）分組，該組全對才進下一組；全組輪完才清空重來。
 * TSA：仍用鎖定變數；多變時同樣輪詢全題再重開輪。
 *
 * 題庫要求（四選題 Q_T=4）：C_A、A2、A3、A4 須為 A～D 各出現一次之字母，
 * C_A 為正解字母。若皆為「?」占位，出題時會自動略過該題（請補齊題庫）。
 */

(() => {
    'use strict';

    const pluginName = 'MZQuizzer';
    const parameters = PluginManager.parameters(pluginName);
    const penaltyStateId = Number(parameters.penaltyStateId || 300);
    const quizPromptSubstring = String(parameters.quizPromptSubstring || '請看題目圖片');
    let quizMessageLineCount = Number(parameters.quizMessageLineCount || 2);
    if (quizMessageLineCount < 1) quizMessageLineCount = 1;
    if (quizMessageLineCount > 4) quizMessageLineCount = 4;
    const tsaLockVariableId = Number(parameters.TsaLockVariableId || 988);
    const correctCountVariableId = Number(parameters.correctCountVariableId || 993);
    const wrongCountVariableId = Number(parameters.wrongCountVariableId || 994);
    const streakVariableId = Number(parameters.streakVariableId || 996);
    const missStreakVariableId = Number(parameters.missStreakVariableId || 997);
    const currentQuestionVariableId = Number(parameters.currentQuestionVariableId || 992);
    const varietyModeVariableId = Number(parameters.varietyModeVariableId || 0);

    let _mzqExpireFrame = 0;
    let _mzqPending = null;
    let _mzqCurrentQuestion = null;
    let _mzqAwaitingCorrect = false;
    let _mzqDeferredEnemyTurn = false;
    const _mzqValidIndexCache = Object.create(null);

    function mzqPartyHasPenalty() {
        if (!$gameParty.inBattle()) return false;
        return $gameParty.members().some(
            actor => actor.isAlive() && actor.isStateAffected(penaltyStateId)
        );
    }

    function mzqMustBlockPartyInput() {
        return _mzqAwaitingCorrect || mzqPartyHasPenalty();
    }

    function mzqAdvanceToEnemyTurnAfterWrong() {
        if (!$gameParty.inBattle() || BattleManager.isTpb()) return;
        if (!mzqMustBlockPartyInput()) {
            _mzqDeferredEnemyTurn = false;
            return;
        }
        updatePenaltyState(true);
        if ($gameParty.canInput()) return;

        if ($gameTroop.isEventRunning() || $gameMessage.isBusy()) {
            _mzqDeferredEnemyTurn = true;
            return;
        }
        _mzqDeferredEnemyTurn = false;

        BattleManager._currentActor = null;
        BattleManager._inputting = false;

        if (BattleManager._phase === 'start') {
            BattleManager._phase = 'input';
            $gameParty.makeActions();
            $gameTroop.makeActions();
        }
        if (BattleManager._phase === 'input' || BattleManager._phase === 'start') {
            BattleManager.startTurn();
        }
    }

    function mzqTryDeferredEnemyTurn() {
        if (!_mzqDeferredEnemyTurn) return;
        if ($gameTroop.isEventRunning() || BattleManager.isBusy() || $gameMessage.isBusy()) return;
        mzqAdvanceToEnemyTurnAfterWrong();
    }

    function mzqMakeQuestionId(categoryKey, qIndex) {
        return String(categoryKey) + '#' + qIndex;
    }

    const _MZQ_Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function () {
        _MZQ_Game_System_initialize.call(this);
        this.initMzqQuizState();
    };

    Game_System.prototype.initMzqQuizState = function () {
        this._mzqQuizState = {
            lockedCategoryKey: '',
            lockedQIndex: -1,
            varietyMode: 'diverse',
            diverseAnsweredIds: {},
            focusedByNote: {},
            focusedNoteOrder: [],
            focusedNoteOrderKey: '',
            focusedNoteIdx: 0,
            tsaAnsweredIds: {},
            battleWrongLock: null
        };
    };

    Game_System.prototype.ensureMzqQuizState = function () {
        if (!this._mzqQuizState || typeof this._mzqQuizState !== 'object') this.initMzqQuizState();
        if (this._mzqQuizState.battleWrongLock === undefined) {
            this._mzqQuizState.battleWrongLock = null;
        }
    };

    function mzqPinBattleQuestion() {
        const meta = _mzqCurrentQuestion;
        if (!meta || !$gameParty.inBattle()) return;
        $gameSystem.ensureMzqQuizState();
        const st = $gameSystem._mzqQuizState;
        st.battleWrongLock = {
            categoryKey: meta.categoryKey,
            qIndex: meta.qIndex,
            diff: meta.diff
        };
        st.lockedCategoryKey = meta.categoryKey;
        st.lockedQIndex = meta.qIndex;
        if (meta.diff === 4) {
            $gameVariables.setValue(tsaLockVariableId, meta.qIndex + 1);
        }
        $gameVariables.setValue(currentQuestionVariableId, meta.qIndex);
    }

    function mzqClearBattleQuestionLock() {
        _mzqAwaitingCorrect = false;
        if ($gameSystem._mzqQuizState) {
            $gameSystem._mzqQuizState.battleWrongLock = null;
        }
    }

    function mzqSyncVarietyFromVariable() {
        if (varietyModeVariableId <= 0) return;
        const v = $gameVariables.value(varietyModeVariableId);
        const st = $gameSystem._mzqQuizState;
        st.varietyMode = v === 2 ? 'focused' : 'diverse';
    }

    function mzqWriteVarietyToVariable() {
        if (varietyModeVariableId <= 0) return;
        const st = $gameSystem._mzqQuizState;
        $gameVariables.setValue(varietyModeVariableId, st.varietyMode === 'focused' ? 2 : 1);
    }

    function mzqBuildNoteOrder(questionList) {
        const seen = Object.create(null);
        const order = [];
        for (let i = 0; i < questionList.length; i++) {
            const n = String(questionList[i].Note != null ? questionList[i].Note : '');
            if (!Object.prototype.hasOwnProperty.call(seen, n)) {
                seen[n] = true;
                order.push(n);
            }
        }
        order.sort(function (a, b) {
            if (a === b) return 0;
            return a < b ? -1 : 1;
        });
        return order;
    }

    /** 與出題時 letterMcq 分支一致：四格須為 A～D 各一次，且 C_A 為正解字母。 */
    function mzqHasStandardLetterMcq(q) {
        if (!q || q.Q_T !== 4) return true;
        const answers = [q.C_A, q.A2, q.A3, q.A4].map(x => String(x != null ? x : '').trim());
        if (answers.some(a => !a)) return false;
        const realAnswer = answers[0];
        const expectedLetters = 'ABCD';
        if (answers.length !== 4) return false;
        if (!answers.every(a => a.length === 1 && /[A-E]/i.test(a))) return false;
        if (answers.slice().sort().join('').toUpperCase() !== 'ABCD') return false;
        return expectedLetters.indexOf(String(realAnswer).toUpperCase()) >= 0;
    }

    function mzqGetValidIndices(categoryKey, questionList) {
        const ck = String(categoryKey);
        if (_mzqValidIndexCache[ck]) return _mzqValidIndexCache[ck];
        const arr = [];
        for (let i = 0; i < questionList.length; i++) {
            if (mzqHasStandardLetterMcq(questionList[i])) arr.push(i);
        }
        _mzqValidIndexCache[ck] = arr;
        if (arr.length < questionList.length && arr.length > 0) {
            console.warn(
                '[MZQuizzer] 題庫',
                ck,
                '有',
                questionList.length - arr.length,
                '題選項資料不完整（多為 C_A~A4 為 ?），已自動略過；請補齊 questionDatabase.js。'
            );
        }
        return arr;
    }

    function mzqPickDiverseIndex(categoryKey, questionList, state) {
        const valid = mzqGetValidIndices(categoryKey, questionList);
        const len = valid.length;
        if (!len) {
            console.error('[MZQuizzer] 題庫', categoryKey, '沒有任何有效四選字母題，請檢查 questionDatabase.js');
            return 0;
        }
        const answered = state.diverseAnsweredIds || (state.diverseAnsweredIds = {});
        const pool = [];
        for (let vi = 0; vi < len; vi++) {
            const i = valid[vi];
            const id = mzqMakeQuestionId(categoryKey, i);
            if (!answered[id]) pool.push(i);
        }
        if (pool.length === 0) {
            state.diverseAnsweredIds = {};
            for (let j = 0; j < len; j++) pool.push(valid[j]);
        }
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function mzqPickFocusedIndex(categoryKey, questionList, state) {
        const len = questionList.length;
        if (!len) return 0;
        if (state.focusedNoteOrderKey !== categoryKey) {
            state.focusedNoteOrderKey = categoryKey;
            state.focusedNoteOrder = mzqBuildNoteOrder(questionList);
            state.focusedNoteIdx = 0;
            state.focusedByNote = {};
        }
        if (!state.focusedNoteOrder.length) return Math.floor(Math.random() * len);
        let guard = 0;
        const maxGuard = len + state.focusedNoteOrder.length + 8;
        while (guard < maxGuard) {
            guard++;
            const note = state.focusedNoteOrder[state.focusedNoteIdx];
            if (!state.focusedByNote[note]) state.focusedByNote[note] = {};
            const doneForNote = state.focusedByNote[note];
            const pool = [];
            for (let i = 0; i < len; i++) {
                const qn = String(questionList[i].Note != null ? questionList[i].Note : '');
                if (qn !== note) continue;
                if (!mzqHasStandardLetterMcq(questionList[i])) continue;
                const id = mzqMakeQuestionId(categoryKey, i);
                if (!doneForNote[id]) pool.push(i);
            }
            if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
            state.focusedNoteIdx++;
            if (state.focusedNoteIdx >= state.focusedNoteOrder.length) {
                state.focusedNoteIdx = 0;
                state.focusedByNote = {};
            }
        }
        return 0;
    }

    function mzqPickTsaNewIndex(categoryKey, questionList, state) {
        const valid = mzqGetValidIndices(categoryKey, questionList);
        const len = valid.length;
        if (!len) {
            console.error('[MZQuizzer] TSA 題庫無有效題目');
            return 0;
        }
        const answered = state.tsaAnsweredIds || (state.tsaAnsweredIds = {});
        const pool = [];
        for (let vi = 0; vi < len; vi++) {
            const i = valid[vi];
            const id = mzqMakeQuestionId(categoryKey, i);
            if (!answered[id]) pool.push(i);
        }
        if (pool.length === 0) {
            state.tsaAnsweredIds = {};
            for (let j = 0; j < len; j++) pool.push(valid[j]);
        }
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function mzqResetQuizProgressCore(options) {
        const keepVariety = options && options.keepVariety;
        let savedVariety = 'diverse';
        $gameSystem.ensureMzqQuizState();
        if (keepVariety) {
            savedVariety = $gameSystem._mzqQuizState.varietyMode === 'focused' ? 'focused' : 'diverse';
        }
        $gameVariables.setValue(correctCountVariableId, 0);
        $gameVariables.setValue(wrongCountVariableId, 0);
        $gameVariables.setValue(streakVariableId, 0);
        $gameVariables.setValue(missStreakVariableId, 0);
        $gameVariables.setValue(currentQuestionVariableId, 0);
        $gameVariables.setValue(tsaLockVariableId, 0);
        $gameSystem.initMzqQuizState();
        if (keepVariety) $gameSystem._mzqQuizState.varietyMode = savedVariety;
        mzqWriteVarietyToVariable();
    }

    window.MZQ_resetQuizProgress = mzqResetQuizProgressCore;

    const _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function () {
        const scene = SceneManager._scene;
        const text = $gameMessage.allText() || '';
        const isBattleMsg =
            scene &&
            scene._messageWindow === this &&
            typeof Scene_Battle !== 'undefined' &&
            scene instanceof Scene_Battle;
        if (isBattleMsg && scene.calcWindowHeight) {
            const narrow =
                quizPromptSubstring.length > 0 && text.indexOf(quizPromptSubstring) >= 0;
            const lines = narrow ? quizMessageLineCount : 4;
            const ww = Graphics.boxWidth;
            const wh = scene.calcWindowHeight(lines, false) + 8;
            this.move(0, this.y, ww, wh);
            this.createContents();
        }
        _Window_Message_startMessage.call(this);
    };

    Game_Interpreter.prototype.skipBranch = function () {
        while (true) {
            const next = this._list && this._list[this._index + 1];
            if (!next || next.indent <= this._indent) break;
            this._index++;
        }
    };

    PluginManager.registerCommand(pluginName, 'getQuestion', function () {
        this.getQuestion();
        this.setWaitMode('message');
    });

    PluginManager.registerCommand(pluginName, 'setQuizProfile', function (args) {
        const diff = Number(args.difficulty != null ? args.difficulty : 1);
        const lang = Number(args.language != null ? args.language : 1);
        const variety = String(args.varietyMode || 'diverse') === 'focused' ? 'focused' : 'diverse';
        const reset =
            args.resetProgress === true ||
            args.resetProgress === 'true' ||
            String(args.resetProgress) === 'true';
        if (reset) mzqResetQuizProgressCore({ keepVariety: false });
        $gameVariables.setValue(990, diff >= 1 && diff <= 4 ? diff : 1);
        $gameVariables.setValue(989, lang >= 1 && lang <= 2 ? lang : 1);
        $gameSystem.ensureMzqQuizState();
        $gameSystem._mzqQuizState.varietyMode = variety;
        mzqWriteVarietyToVariable();
    });

    Game_Interpreter.prototype.getQuestion = function () {
        $gameSwitches.setValue(991, false);
        $gameSwitches.setValue(992, false);

        let diff = $gameVariables.value(990);
        let lang = $gameVariables.value(989);
        if (!diff || diff === 0) diff = 1;
        if (!lang || lang === 0) lang = 1;

        let categoryKey = 'Questions';
        let folderPrefix = '';

        if (diff === 4) {
            categoryKey = 'TSA_ALL';
            folderPrefix = '初中題庫/TSA/';
        } else {
            let diffStr = '';
            let folderDiff = '';
            if (diff === 1) {
                diffStr = 'S1';
                folderDiff = 'S1 AI 生成題目';
            } else if (diff === 2) {
                diffStr = 'S2';
                folderDiff = 'S2 AI生成題目';
            } else if (diff === 3) {
                diffStr = 'S3';
                folderDiff = 'S3 AI生成題目';
            }
            let langStr = '';
            let folderLang = '';
            if (lang === 1) {
                langStr = 'CH';
                folderLang = '中文題目';
            } else if (lang === 2) {
                langStr = 'EN';
                folderLang = '英文題目';
            }
            if (diffStr !== '' && langStr !== '') {
                categoryKey = diffStr + '_' + langStr;
                folderPrefix = '初中題庫/' + folderDiff + '/' + folderLang + '/';
            } else {
                if (diff === 1) {
                    categoryKey = 'S1MCQ';
                    folderPrefix = 'S1MCQ/';
                } else if (diff === 2) {
                    categoryKey = 'S2MCQ';
                    folderPrefix = 'S2MCQ/';
                }
            }
        }

        let questionList = questionDatabase[categoryKey];
        if (!questionList) {
            if (questionDatabase.Questions) {
                questionList = questionDatabase.Questions;
                folderPrefix = '';
            } else {
                $gameMessage.add('Error: No questions found for ' + categoryKey);
                return;
            }
        }

        $gameSystem.ensureMzqQuizState();
        mzqSyncVarietyFromVariable();
        const state = $gameSystem._mzqQuizState;
        const variety = state.varietyMode === 'focused' ? 'focused' : 'diverse';

        let qIndex = 0;
        const battleLock = state.battleWrongLock;
        const reuseBattleQuestion =
            $gameParty.inBattle() &&
            battleLock &&
            battleLock.categoryKey === categoryKey &&
            battleLock.qIndex >= 0 &&
            battleLock.qIndex < questionList.length;

        if (reuseBattleQuestion) {
            qIndex = battleLock.qIndex;
            state.lockedCategoryKey = categoryKey;
            state.lockedQIndex = qIndex;
        } else if (diff === 4) {
            const lockRaw = $gameVariables.value(tsaLockVariableId);
            if (lockRaw > 0) {
                qIndex = lockRaw - 1;
                if (qIndex < 0 || qIndex >= questionList.length) {
                    qIndex = mzqPickTsaNewIndex(categoryKey, questionList, state);
                    $gameVariables.setValue(tsaLockVariableId, qIndex + 1);
                }
            } else {
                qIndex = mzqPickTsaNewIndex(categoryKey, questionList, state);
                $gameVariables.setValue(tsaLockVariableId, qIndex + 1);
            }
        } else {
            if (
                state.lockedCategoryKey === categoryKey &&
                state.lockedQIndex >= 0 &&
                state.lockedQIndex < questionList.length
            ) {
                qIndex = state.lockedQIndex;
            } else {
                state.lockedCategoryKey = '';
                state.lockedQIndex = -1;
                qIndex =
                    variety === 'focused'
                        ? mzqPickFocusedIndex(categoryKey, questionList, state)
                        : mzqPickDiverseIndex(categoryKey, questionList, state);
                state.lockedCategoryKey = categoryKey;
                state.lockedQIndex = qIndex;
            }
        }

        const question = questionList[qIndex];
        $gameVariables.setValue(995, 0);
        $gameVariables.setValue(currentQuestionVariableId, qIndex);

        const qid = mzqMakeQuestionId(categoryKey, qIndex);
        _mzqCurrentQuestion = {
            categoryKey,
            qIndex,
            id: qid,
            note: String(question.Note != null ? question.Note : ''),
            diff
        };

        $gameScreen.showPicture(97, 'MZQ_picBG', 0, 0, 0, 100, 100, 255, 0);

        let picName = '';
        if (question.P_I && question.P_I !== 0 && question.P_I !== '0') picName = question.P_I;
        else if (question.GUID) picName = question.GUID;

        if (picName !== '') {
            picName = picName.replace(/\.(png|jpg|jpeg)$/i, '');
            const finalPath = folderPrefix + picName;
            $gameScreen.showPicture(98, finalPath, 0, 0, 0, 100, 100, 255, 0);
        }

        let qText = question.Q;
        if (question.E === 1) qText = atob(rotHex(qText));
        qText = qText.replace(/(?:\r\n|\r|\n)/g, '\\n');
        $gameMessage.add(qText);

        const choices = [];
        let correctIndex = 0;

        if ([2, 3, 4, 5].includes(question.Q_T)) {
            const answers = [];
            let c_a = question.C_A;
            let a2 = question.A2;
            let a3 = question.A3;
            let a4 = question.A4;
            let a5 = question.A5;

            if (question.E === 1) {
                c_a = atob(rotHex(c_a));
                a2 = atob(rotHex(a2));
                if (a3) a3 = atob(rotHex(a3));
                if (a4) a4 = atob(rotHex(a4));
                if (a5) a5 = atob(rotHex(a5));
            }

            answers.push(c_a);
            answers.push(a2);
            if (a3) answers.push(a3);
            if (a4) answers.push(a4);
            if (a5) answers.push(a5);

            const realAnswer = question.E === 1 ? atob(rotHex(question.C_A)) : question.C_A;
            const expectedLetters = 'ABCDE'.slice(0, question.Q_T);
            const letterMcqOrder =
                [2, 3, 4, 5].includes(question.Q_T) &&
                answers.length === question.Q_T &&
                answers.slice().sort().join('') === expectedLetters &&
                expectedLetters.indexOf(realAnswer) >= 0;

            if (letterMcqOrder) {
                choices.push(...expectedLetters.split(''));
                correctIndex = choices.indexOf(realAnswer);
            } else {
                for (let i = 0; i < answers.length; i++) {
                    if (answers[i] === realAnswer) correctIndex = i;
                    choices.push(answers[i]);
                }
            }
        } else if (question.Q_T === 9) {
            choices.push('True', 'False');
            const realAns = String(question.C_A).toLowerCase();
            correctIndex = realAns === 'true' ? 0 : 1;
        }

        if (choices.length > 0) {
            const qFrames = Number(question.T);
            if (!isNaN(qFrames) && qFrames > 0 && choices.length > 1) {
                _mzqExpireFrame = Graphics.frameCount + qFrames;
                _mzqPending = { choices, correctIndex };
            } else {
                _mzqExpireFrame = 0;
                _mzqPending = null;
            }

            $gameMessage.setChoices(choices, 0, -1);
            $gameMessage.setChoiceCallback(function (n) {
                _mzqExpireFrame = 0;
                _mzqPending = null;
                $gameVariables.setValue(991, choices[n]);

                if (n === correctIndex) processCorrectAnswer();
                else processWrongAnswer();

                $gameScreen.erasePicture(97);
                $gameScreen.erasePicture(98);
            });
        }
    };

    function updatePenaltyState(apply) {
        if (!$gameParty.inBattle()) return;
        $gameParty.members().forEach(battler => {
            if (battler && battler.isAlive()) {
                if (apply) {
                    if (!battler.isStateAffected(penaltyStateId)) battler.addState(penaltyStateId);
                } else if (battler.isStateAffected(penaltyStateId)) {
                    battler.removeState(penaltyStateId);
                }
            }
        });
    }

    function penaltySystem() {
        if (!$gameParty.inBattle()) return;
        mzqAdvanceToEnemyTurnAfterWrong();
    }

    window.penaltySystem = penaltySystem;

    function processCorrectAnswer() {
        const meta = _mzqCurrentQuestion;
        const wasBattleRetry = $gameParty.inBattle() && _mzqAwaitingCorrect;
        mzqClearBattleQuestionLock();
        $gameSwitches.setValue(991, true);
        $gameSwitches.setValue(992, false);
        updatePenaltyState(false);

        $gameSystem.ensureMzqQuizState();
        const st = $gameSystem._mzqQuizState;

        if (meta && meta.diff === 4) {
            st.tsaAnsweredIds = st.tsaAnsweredIds || {};
            st.tsaAnsweredIds[meta.id] = 1;
            $gameVariables.setValue(tsaLockVariableId, 0);
        } else if (meta) {
            const variety = st.varietyMode === 'focused' ? 'focused' : 'diverse';
            if (variety === 'focused') {
                const note = meta.note;
                if (!st.focusedByNote[note]) st.focusedByNote[note] = {};
                st.focusedByNote[note][meta.id] = 1;
            } else {
                st.diverseAnsweredIds = st.diverseAnsweredIds || {};
                st.diverseAnsweredIds[meta.id] = 1;
            }
            st.lockedCategoryKey = '';
            st.lockedQIndex = -1;
        }

        $gameVariables.setValue(correctCountVariableId, $gameVariables.value(correctCountVariableId) + 1);
        $gameVariables.setValue(streakVariableId, $gameVariables.value(streakVariableId) + 1);
        $gameVariables.setValue(missStreakVariableId, 0);

        $gameScreen.showPicture(99, 'MZQ_correctAnswer', 1, 640, 360, 100, 100, 255, 0);
        AudioManager.playSe({ name: 'MZQ_correctAnswer', volume: 90, pitch: 100, pan: 0 });
        setTimeout(function () {
            $gameScreen.erasePicture(99);
        }, 1500);

        if (wasBattleRetry && BattleManager._phase === 'start') {
            BattleManager.updateStart();
        }
    }

    function processWrongAnswer() {
        _mzqAwaitingCorrect = true;
        mzqPinBattleQuestion();
        $gameSwitches.setValue(991, false);
        $gameSwitches.setValue(992, true);

        $gameVariables.setValue(wrongCountVariableId, $gameVariables.value(wrongCountVariableId) + 1);
        $gameVariables.setValue(missStreakVariableId, $gameVariables.value(missStreakVariableId) + 1);
        $gameVariables.setValue(streakVariableId, 0);

        $gameScreen.showPicture(99, 'MZQ_wrongAnswer', 1, 640, 360, 100, 100, 255, 0);
        AudioManager.playSe({ name: 'MZQ_wrongAnswer', volume: 90, pitch: 100, pan: 0 });

        penaltySystem();
        setTimeout(function () {
            $gameScreen.erasePicture(99);
        }, 1500);
    }

    function rotHex(s) {
        return s;
    }

    const MZQ_WindowChoiceList_callCancelHandler = Window_ChoiceList.prototype.callCancelHandler;
    Window_ChoiceList.prototype.callCancelHandler = function () {
        MZQ_WindowChoiceList_callCancelHandler.call(this);
        this._count = 0;
        _mzqExpireFrame = 0;
        _mzqPending = null;
        penaltySystem();
    };

    function tryMzqQuestionTimeout(scene) {
        if (
            _mzqExpireFrame > 0 &&
            _mzqPending &&
            Graphics.frameCount >= _mzqExpireFrame &&
            SceneManager._scene === scene &&
            $gameMessage.isChoice()
        ) {
            const pq = _mzqPending;
            let wp = pq.correctIndex === 0 ? 1 : 0;
            if (wp >= pq.choices.length) wp = 0;
            _mzqExpireFrame = 0;
            _mzqPending = null;
            $gameMessage.onChoice(wp);
        }
    }

    const _BattleManager_updateStart_MZQ = BattleManager.updateStart;
    BattleManager.updateStart = function () {
        if (
            !this.isTpb() &&
            $gameParty.inBattle() &&
            _mzqAwaitingCorrect &&
            $gameTroop.turnCount() > 0 &&
            !BattleManager.isBusy()
        ) {
            if ($gameMessage.isBusy() || $gameMessage.isChoice()) {
                return;
            }
            Game_Interpreter.prototype.getQuestion.call({});
            return;
        }
        _BattleManager_updateStart_MZQ.call(this);
        if (mzqMustBlockPartyInput()) {
            mzqAdvanceToEnemyTurnAfterWrong();
        }
    };

    const _BattleManager_startInput_MZQ = BattleManager.startInput;
    BattleManager.startInput = function () {
        _BattleManager_startInput_MZQ.call(this);
        if (mzqMustBlockPartyInput()) {
            mzqAdvanceToEnemyTurnAfterWrong();
        }
    };

    const _BattleManager_endBattle_MZQ = BattleManager.endBattle;
    BattleManager.endBattle = function (result) {
        _mzqDeferredEnemyTurn = false;
        mzqClearBattleQuestionLock();
        if ($gameSystem._mzqQuizState) {
            $gameSystem._mzqQuizState.battleWrongLock = null;
        }
        _BattleManager_endBattle_MZQ.call(this, result);
    };

    const _Scene_Battle_update_MZQ = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function () {
        _Scene_Battle_update_MZQ.call(this);
        tryMzqQuestionTimeout(this);
        mzqTryDeferredEnemyTurn();
    };

    const _Scene_Map_update_MZQ = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update_MZQ.call(this);
        tryMzqQuestionTimeout(this);
    };

    ConfigManager.instantText = true;
    const alias_cm_md = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const e = alias_cm_md.call(this);
        e.instantText = this.instantText;
        return e;
    };
    const alias_cm_ad = ConfigManager.applyData;
    ConfigManager.applyData = function (e) {
        alias_cm_ad.call(this, e);
        this.instantText = this.readConfigInstantText(e, 'instantText');
    };
    ConfigManager.readConfigInstantText = function (e, t) {
        return e[t] !== undefined ? e[t] : false;
    };

    const alias_wm_udf = Window_Message.prototype.updateShowFast;
    Window_Message.prototype.updateShowFast = function () {
        alias_wm_udf.call(this);
        if (ConfigManager.instantText === true) this._showFast = true;
    };

    Sprite_Timer.prototype.updatePosition = function () {
        this.x = (Graphics.width - this.bitmap.width) / 2;
        this.y = 584;
    };

    // --- 主選單：答題設定 ---
    const _Window_MenuCommand_addSaveCommand_MZQ = Window_MenuCommand.prototype.addSaveCommand;
    Window_MenuCommand.prototype.addSaveCommand = function () {
        if (this.needsCommand('mzqQuiz')) {
            this.addCommand('答題設定', 'mzqQuiz', true);
        }
        _Window_MenuCommand_addSaveCommand_MZQ.call(this);
    };

    const _Scene_Menu_createCommandWindow_MZQ = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function () {
        _Scene_Menu_createCommandWindow_MZQ.call(this);
        this._commandWindow.setHandler('mzqQuiz', this.commandMzqQuiz.bind(this));
    };

    Scene_Menu.prototype.commandMzqQuiz = function () {
        SoundManager.playOk();
        SceneManager.push(Scene_MzqQuizSettings);
    };

    class Window_MzqSettingsMain extends Window_Command {
        initialize(rect) {
            super.initialize(rect);
        }
        makeCommandList() {
            this.addCommand('難度…', 'diff', true);
            this.addCommand('語言…', 'lang', true);
            this.addCommand('出題模式…', 'vari', true);
            this.addCommand('關閉', 'cancel', true);
        }
    }

    class Window_MzqSettingsPick extends Window_Command {
        initialize(rect, kind) {
            this._kind = kind || 'diff';
            super.initialize(rect);
        }
        makeCommandList() {
            if (this._kind === 'diff') {
                this.addCommand('中一 (S1)', 'd1', true);
                this.addCommand('中二 (S2)', 'd2', true);
                this.addCommand('中三 (S3)', 'd3', true);
                this.addCommand('TSA', 'd4', true);
            } else if (this._kind === 'lang') {
                this.addCommand('中文', 'l1', true);
                this.addCommand('English', 'l2', true);
            } else if (this._kind === 'vari') {
                this.addCommand('多變（隨機跨單元）', 'v1', true);
                this.addCommand('集中（同一單元全對才換）', 'v2', true);
            }
            this.addCommand('返回', 'back', true);
        }
    }

    class Scene_MzqQuizSettings extends Scene_MenuBase {
        create() {
            super.create();
            this._subKind = '';
            const h = this.calcWindowHeight(4, true);
            const rect = new Rectangle(0, this.mainAreaTop(), Math.min(560, Graphics.boxWidth - 48), h);
            this._mainWindow = new Window_MzqSettingsMain(rect);
            this._mainWindow.setHandler('ok', this.onMainOk.bind(this));
            this._mainWindow.setHandler('cancel', this.popScene.bind(this));
            this.addWindow(this._mainWindow);

            const rect2 = new Rectangle(
                rect.width + 24,
                this.mainAreaTop(),
                Math.min(520, Graphics.boxWidth - rect.width - 48),
                this.mainAreaHeight()
            );
            this._pickWindow = new Window_MzqSettingsPick(rect2, 'diff');
            this._pickWindow.hide();
            this._pickWindow.deactivate();
            this._pickWindow.setHandler('ok', this.onPickOk.bind(this));
            this._pickWindow.setHandler('cancel', this.onPickCancel.bind(this));
            this.addWindow(this._pickWindow);

            this._mainWindow.activate();
            this._mainWindow.select(0);
        }

        onMainOk() {
            const sym = this._mainWindow.currentSymbol();
            if (sym === 'cancel') {
                this.popScene();
                return;
            }
            if (sym === 'diff') this._subKind = 'diff';
            else if (sym === 'lang') this._subKind = 'lang';
            else if (sym === 'vari') this._subKind = 'vari';
            else return;

            this._pickWindow._kind = this._subKind;
            this._pickWindow.refresh();
            this._pickWindow.show();
            this._pickWindow.activate();
            this._pickWindow.select(0);
            this._mainWindow.deactivate();
        }

        onPickCancel() {
            this._pickWindow.hide();
            this._pickWindow.deactivate();
            this._mainWindow.activate();
        }

        onPickOk() {
            const sym = this._pickWindow.currentSymbol();
            if (sym === 'back') {
                this.onPickCancel();
                return;
            }
            let changed = false;
            let msg = '';
            if (this._subKind === 'diff') {
                const map = { d1: 1, d2: 2, d3: 3, d4: 4 };
                const nv = map[sym];
                if (nv && $gameVariables.value(990) !== nv) {
                    changed = true;
                    msg = '更改難度將重置「答對題數」與出題進度，確定嗎？';
                }
                if (changed && !window.confirm(msg)) return;
                if (changed) mzqResetQuizProgressCore({ keepVariety: true });
                if (nv) $gameVariables.setValue(990, nv);
            } else if (this._subKind === 'lang') {
                const nv = sym === 'l2' ? 2 : 1;
                if ($gameVariables.value(989) !== nv) {
                    changed = true;
                    msg = '更改語言將重置「答對題數」與出題進度，確定嗎？';
                }
                if (changed && !window.confirm(msg)) return;
                if (changed) mzqResetQuizProgressCore({ keepVariety: true });
                $gameVariables.setValue(989, nv);
            } else if (this._subKind === 'vari') {
                $gameSystem.ensureMzqQuizState();
                const want = sym === 'v2' ? 'focused' : 'diverse';
                if ($gameSystem._mzqQuizState.varietyMode !== want) {
                    changed = true;
                    msg = '更改出題模式將重置「答對題數」與出題進度，確定嗎？';
                }
                if (changed && !window.confirm(msg)) return;
                if (changed) mzqResetQuizProgressCore({ keepVariety: false });
                $gameSystem._mzqQuizState.varietyMode = want;
                mzqWriteVarietyToVariable();
            }
            this._pickWindow.hide();
            this._pickWindow.deactivate();
            this._mainWindow.activate();
        }
    }

    window.Scene_MzqQuizSettings = Scene_MzqQuizSettings;
})();
