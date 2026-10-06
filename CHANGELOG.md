# Changelog

本專案依 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 記錄可見變更，版本號依 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Security

- 將 `tools/AUTH.md`、`tools/.env.supabase.local.example`、`tools/SUPABASE_AUTH_ROOT_CAUSE.md`、`tools/student_auth_passwords.csv.example` 中看起來像真實密碼的範例改為明確 placeholder（例如 `YOUR_LEGACY_PASSWORD_HERE`、`YYYYMMDD`），避免明文秘密寫入 Git。
- 同步移除 `tools/setup_nwcs_auth.sh` 錯誤提示中的舊測試密碼字樣。

### Fixed

- 中二 `2A02 MCQ6`：最高次為 D（8 次），不再標 B。
- 中二 `2A03 MCQ51`：正解改為 C `14(x−2)`，不再標 A `7(x−4)`。
- 王都／地牢紅線對話改為校園用語（CE12、CE14、CE18、Map094 死亡之球／劍）。
- 黃線用語快修：糞game、數學腦殘粉、白痴、笨蛋、神經病、混蛋。
- 第二輪校園用語（83 筆）：紅線 5（糞 Game、我X、合法常數、絕對領域）、黃線 53（血腥／廢物／老太婆／老娘／Threads／切割敵喉等）、錯字 25。

### Removed

- 刪除執行期不會載入的 `data/CommonEvents_Script.txt`、`data/劇本提取結果.txt`（內含 #7 前粗口與亂碼髒話）。

### Changed

- 暫時停用中二 **2A05** 中英各 100 題（`C_A~A4` 設為 `?`，MZQuizzer 會略過）。官方答案表字母與題圖數學常不一致，無法在上架前逐題重畫選項。
- 中一 S1 答案維持審計時的狀態，不跟官方表盲目覆寫。
- 排行榜暱稱過濾：新增粵語／國語／英語詞（仆街、撚、柒、他媽、傻逼、fuk 等），並做空白／符號正規化；白名單保留 Dick／Dickson。

### Notes

- 官方答案表：Google Sheet `16E2x8Ios7qEwhMm-rgaGOAJyD9u3DuNdTB3XO8vHlKE`。抽查後發現表上字母不一定等於題圖正確選項，故以「題圖有正解才改、否則停用」為準。
- `tools/AUTH.md` 沿用 main（PR #6）的 placeholder 清理，本 PR 不新增密碼、不重開已停用題包。未改黑暗隧道 CE7／Map040 軟鎖修復。
- 第二輪只改用詞與錯字，不重寫劇情。
