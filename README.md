# mathrpg2026

TSA Training（RPG Maker MZ 網頁版）

## 正式網址（GitHub Pages）

https://donaldcpk.github.io/mathrpg2026/

若出現 **404**，代表 Pages 尚未發布成功，請依下方「重新部署」操作。

## 學生登入

| 項目 | 說明 |
|------|------|
| 電郵 | `s2013677@ngwahsec.edu.hk`（與校方名冊相同） |
| 密碼 | 出生年月日 8 位，例 `20100315` |
| 管理員 | 電郵輸入 `admin`，密碼見校方文件 |

完整說明（生日密碼存在哪、為何以前能登入）：**[tools/AUTH.md](tools/AUTH.md)**

**與 Supabase 無關的常見問題**

- 畫面仍是舊密碼說明 → 瀏覽器快取，請 **Cmd+Shift+R** 強制重新整理。
- 電郵欄出現 `nwcs211@…` → 瀏覽器「自動填入」記憶，請手動刪除再輸入自己的帳號。
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
