# mathrpg2026

TSA Training（RPG Maker MZ 網頁版）

## 正式網址（GitHub Pages）

https://donaldcpk.github.io/mathrpg2026/

若出現 **404**，代表 Pages 尚未發布成功，請依下方「重新部署」操作。

## 學生登入

| 項目 | 說明 |
|------|------|
| 電郵 | 完整學校電郵，或只輸入 `@` 前部分（例：`s########`、後備帳 `mathai01`） |
| 密碼 | 出生年月日 8 位（後備帳用校方指定密碼） |
| 管理員 | 電郵輸入 `admin`，密碼見校方文件（勿寫入 Git） |

完整說明：**[tools/AUTH.md](tools/AUTH.md)** · 隱私與勿 commit 清單：**[tools/PRIVACY.md](tools/PRIVACY.md)**

**與 Supabase 無關的常見問題**

- 畫面仍是舊密碼說明 → 瀏覽器快取，請 **Cmd+Shift+R** 強制重新整理。
- 電郵欄出現舊帳號 → 瀏覽器「自動填入」，請刪除後輸入自己的學校電郵。
- 學生首次登入 → 遊戲會自動用你輸入的生日建立 Auth 帳號（名冊須已有該電郵）。

## 重新部署 GitHub Pages

1. 打開 https://github.com/Donaldcpk/mathrpg2026/settings/pages  
2. **Build and deployment → Source** 選 **GitHub Actions**（不要選 Deploy from a branch 若 workflow 已存在）  
3. 到 **Actions** 分頁，選 **Deploy GitHub Pages**，按 **Run workflow** → Run  
4. 等約 2–5 分鐘，綠色勾勾後再開 https://donaldcpk.github.io/mathrpg2026/

推送 `main` 分支也會自動觸發部署（`.github/workflows/deploy-github-pages.yml`）。

## 本機測試

```bash
cd /path/to/mathrpg2026
npx --yes serve -l 5500
```

瀏覽 http://localhost:5500/index.html

## 題庫與校園用語（2026-10 上架前）

- 中二 **2A05**（中英各 100 題）暫時整章停用：題圖選項常與官方答案表不符，且多題 A–D 沒有數學正解。出題外掛會自動略過 `C_A~A4` 為 `?` 的題。
- 已對題圖核對並修正：`2A02 MCQ6` → D（最高次 8）；`2A03 MCQ51` → C（`14(x−2)`）。
- 中一（S1）維持原答案，不因官方表字母差異而改動。
- 校園用語：紅線（粗口暗示／人身攻擊）與黃線（糞game、白痴、廢物、血腥等）已改為較適合課堂的講法（含第二輪 83 筆）。
- `tools/AUTH.md` 沿用 main（PR #6）的 placeholder，本 PR 不新增密碼、不重開 2A05。
- 題圖路徑改為純 ASCII：`img/pictures/quiz/S1/CH|EN/`、`quiz/S2/`、`quiz/S3/`、`quiz/TSA/`（避免 iPad Safari 載入含中文／空白的舊路徑失敗）。S1–S3 題幹由字面 `MCQ` 改為「請看題目圖片，選出正確答案。」與 TSA 一致。
- 題圖大小（iPad）：MZQuizzer 載入後依**該題**位圖寬高自動縮放，填入畫布約 92% 寬 × 48% 高（外掛參數可調），小圖放大、大圖縮小，**左上對齊**並留出底部選項。不是全題共用同一個放大倍率。
- 驗證：

```bash
python3 tools/verify_school_content_fixes.py
python3 tools/verify_wording_r2.py
python3 tools/verify_mcq_display.py
python3 tools/verify_quiz_picture_scale.py
# 若有官方答案表 xlsx：
# python3 tools/verify_school_content_fixes.py --xlsx /path/to/Answer-Key-S1-6.xlsx
```

## 版本與變更

變更紀錄見 **[CHANGELOG.md](CHANGELOG.md)**（Keep a Changelog + SemVer）。初期尚未標 1.0.0 公開 API。
