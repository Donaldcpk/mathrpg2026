# Changelog

本專案依 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 記錄可見變更，版本號依 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Added

- `tools/verify_mcq_display.py`：確認活躍題庫沒有裸 `MCQ` 題幹，並抽查 S1／S2／S3／TSA 題圖檔存在。
- `tools/verify_quiz_picture_scale.py`：用真實 `mzqComputeQuizPictureLayout` 驗證小圖放大、大圖縮小、置中且不超出目標框。
- MZQuizzer 外掛參數：`quizPictureMaxWidthPercent`（預設 92）、`quizPictureMaxHeightPercent`（預設 48）、`quizPictureTopY`（預設 24），方便老師之後微調。

### Security

- 將 `tools/AUTH.md`、`tools/.env.supabase.local.example`、`tools/SUPABASE_AUTH_ROOT_CAUSE.md`、`tools/student_auth_passwords.csv.example` 中看起來像真實密碼的範例改為明確 placeholder（例如 `YOUR_LEGACY_PASSWORD_HERE`、`YYYYMMDD`），避免明文秘密寫入 Git。
- 同步移除 `tools/setup_nwcs_auth.sh` 錯誤提示中的舊測試密碼字樣。

### Fixed

- 全級別（S1／S2／S3／TSA）戰鬥題圖在 iPad Safari 常只見空白外框：題幹字面 `MCQ` 不會觸發縮窄訊息窗，且 `初中題庫/S1 AI 生成題目/中文題目/` 等含中文與空白的路徑載入失敗。現改提示語、ASCII 資料夾，並在載入失敗時顯示中文路徑錯誤。
- 中二 `2A02 MCQ6`：最高次為 D（8 次），不再標 B。
- 中二 `2A03 MCQ51`：正解改為 C `14(x−2)`，不再標 A `7(x−4)`。
- 王都／地牢紅線對話改為校園用語（CE12、CE14、CE18、Map094 死亡之球／劍）。
- 黃線用語快修：糞game、數學腦殘粉、白痴、笨蛋、神經病、混蛋。
- 第二輪校園用語（83 筆）：紅線 5（糞 Game、我X、合法常數、絕對領域）、黃線 53（血腥／廢物／老太婆／老娘／Threads／切割敵喉等）、錯字 25。

### Removed

- 刪除執行期不會載入的 `data/CommonEvents_Script.txt`、`data/劇本提取結果.txt`（內含 #7 前粗口與亂碼髒話）。

### Changed

- MZQuizzer 題圖改為**按每題位圖尺寸**自動縮放至合適可讀大小（目標框約畫布 92% 寬 × 48% 高，保持比例）：S1 常見 400–560×180 會放大；S3／TSA 過大圖會縮小以免蓋住選項。水平置中，頂端約 y=24，外框 `MZQ_picBG` 對齊同一框。未重開 2A05、未改 AUTH／答案。
- 題圖資料夾由 `img/pictures/初中題庫/…` 改為 `img/pictures/quiz/S1/CH|EN`、`quiz/S2/…`、`quiz/S3/…`、`quiz/TSA/…`。執行期仍會嘗試舊路徑作為後備。
- S1／S2／S3 全部 `"Q":"MCQ"` 改為「請看題目圖片，選出正確答案。」（與 TSA 一致）。2A05 仍停用，未重開。
- 暫時停用中二 **2A05** 中英各 100 題（`C_A~A4` 設為 `?`，MZQuizzer 會略過）。官方答案表字母與題圖數學常不一致，無法在上架前逐題重畫選項。
- 中一 S1 答案維持審計時的狀態，不跟官方表盲目覆寫。
- 排行榜暱稱過濾：新增粵語／國語／英語詞（仆街、撚、柒、他媽、傻逼、fuk 等），並做空白／符號正規化；白名單保留 Dick／Dickson。

### Notes

- 官方答案表：Google Sheet `16E2x8Ios7qEwhMm-rgaGOAJyD9u3DuNdTB3XO8vHlKE`。抽查後發現表上字母不一定等於題圖正確選項，故以「題圖有正解才改、否則停用」為準。
- `tools/AUTH.md` 沿用 main（PR #6）的 placeholder 清理，本 PR 不新增密碼、不重開已停用題包。未改黑暗隧道 CE7／Map040 軟鎖修復。
- 第二輪只改用詞與錯字，不重寫劇情。
- 空白 MCQ 修復不重開 2A05、不改 AUTH；題圖只搬資料夾名稱，檔名與 GUID 不變。
- iPad 題圖過大／過小：按每題位圖自動縮放，不是全題共用固定倍率。老師可用外掛參數微調目標框。
