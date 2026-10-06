# Changelog

本專案依 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 記錄可見變更，版本號依 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Added

- `tools/verify_answer_key_alignment.py`：對齊官方 Answer Key S1–S3 與題庫，並回報 matched／fixed／still-disabled／sheet-vs-pic conflicts。
- `tools/answer_key_s1s3_letters.json`：由 xlsx 抽出的 S1–S3 官方字母表（供無 xlsx 時驗證）。
- `tools/answer_key_picture_decisions.json`：題圖數學裁定（圖優先於表）。
- `tools/verify_mcq_display.py`：確認活躍題庫沒有裸 `MCQ` 題幹，並抽查 S1／S2／S3／TSA 題圖檔存在。

### Security

- 將 `tools/AUTH.md`、`tools/.env.supabase.local.example`、`tools/SUPABASE_AUTH_ROOT_CAUSE.md`、`tools/student_auth_passwords.csv.example` 中看起來像真實密碼的範例改為明確 placeholder（例如 `YOUR_LEGACY_PASSWORD_HERE`、`YYYYMMDD`），避免明文秘密寫入 Git。
- 同步移除 `tools/setup_nwcs_auth.sh` 錯誤提示中的舊測試密碼字樣。

### Fixed

- 全級別（S1／S2／S3／TSA）戰鬥題圖在 iPad Safari 常只見空白外框：題幹字面 `MCQ` 不會觸發縮窄訊息窗，且 `初中題庫/S1 AI 生成題目/中文題目/` 等含中文與空白的路徑載入失敗。現改提示語、ASCII 資料夾，並在載入失敗時顯示中文路徑錯誤。
- 中二 `2A05 MCQ1`：題圖正解 A `(1,5)`，不再跟官方表 B，已重開。
- 中二 `2A02 MCQ6`：最高次為 D（8 次），不再標 B。
- 中二 `2A03 MCQ51`：正解改為 C `14(x−2)`，不再標 A `7(x−4)`。
- 題庫 vs 官方表 vs 題圖：581 則裁定已套用（fixed 219、keep_db 143、停用 219）；活題與表不一致的 leftover 為 0。
- 對圖覆核後重開：1A01 Q18/38/87、2A02 Q16/55（先前 OCR 誤讀選項）；1A01 Q19 改正為 B（3456 不可被 5 整除）。
- 2A02 Eng47：C 為 \(y/(x-2)\)（非整式），重開為 C。
- 2A02 英文 leftover：有唯一正解者已改字母（如 Eng46 `10y^7`=B、Eng72 `(2^3·4)/16`=C）；無正解或題幹缺損者停用。
- 2B08：比例尺 Q28/46/64/94 以題圖保留庫內字母（圖勝表）；Q99 改為 A；其餘五題還原後仍不在 A–D，停用。
- 王都／地牢紅線對話改為校園用語（CE12、CE14、CE18、Map094 死亡之球／劍）。
- 黃線用語快修：糞game、數學腦殘粉、白痴、笨蛋、神經病、混蛋。
- 第二輪校園用語（83 筆）：紅線 5（糞 Game、我X、合法常數、絕對領域）、黃線 53（血腥／廢物／老太婆／老娘／Threads／切割敵喉等）、錯字 25。

### Removed

- 刪除執行期不會載入的 `data/CommonEvents_Script.txt`、`data/劇本提取結果.txt`（內含 #7 前粗口與亂碼髒話）。

### Changed

- 題圖資料夾由 `img/pictures/初中題庫/…` 改為 `img/pictures/quiz/S1/CH|EN`、`quiz/S2/…`、`quiz/S3/…`、`quiz/TSA/…`。執行期仍會嘗試舊路徑作為後備。
- S1／S2／S3 全部 `"Q":"MCQ"` 改為「請看題目圖片，選出正確答案。」（與 TSA 一致）。
- 中二 **2A05** 中英各重開 52 題、各停用 48 題（題圖有唯一正解才重開）。
- 官方答案表字母與題圖衝突時以題圖數學為準，不盲覆寫。
- 排行榜暱稱過濾：新增粵語／國語／英語詞（仆街、撚、柒、他媽、傻逼、fuk 等），並做空白／符號正規化；白名單保留 Dick／Dickson。

### Notes

- 官方答案表：Google Sheet `16E2x8Ios7qEwhMm-rgaGOAJyD9u3DuNdTB3XO8vHlKE`。表對庫的字母核對**有效**（欄位可對到 S1_CH/EN…），但表本身不可靠；以題圖數學為準。
- `tools/AUTH.md` 沿用 main（PR #6）的 placeholder，本 PR 不新增密碼、不改 AUTH。未改黑暗隧道 CE7／Map040 軟鎖修復。
- 第二輪只改用詞與錯字，不重寫劇情。
- 空白 MCQ 修復不改 AUTH；題圖只搬資料夾名稱，檔名與 GUID 不變。2A05 改由題圖裁定後部分重開。
