# mathrpg2026

TSA Training（RPG Maker MZ 網頁版）

## 正式網址（GitHub Pages）

https://donaldcpk.github.io/mathrpg2026/

若出現 **404**，代表 Pages 尚未發布成功，請依下方「重新部署」操作。

## 學生登入

| 項目 | 說明 |
|------|------|
| 電郵 | 校方派發的 `s########@ngwahsec.edu.hk` |
| 密碼 | 出生年月日 8 位（例 `20100315`） |
| 管理員 | 電郵輸入 `admin`，密碼見校方文件（勿寫入 Git） |

完整說明：**[tools/AUTH.md](tools/AUTH.md)** · 隱私與勿 commit 清單：**[tools/PRIVACY.md](tools/PRIVACY.md)** · 登入故障：**[tools/SUPABASE_AUTH_ROOT_CAUSE.md](tools/SUPABASE_AUTH_ROOT_CAUSE.md)**

### 登入不了？先看這三點

1. **登入畫面紅字寫「無法連線登入伺服器」** → Supabase 專案網址失效（刪除／暫停／DNS 無紀錄）。網頁本身正常，但帳號伺服器連不上；請老師重建或更新 `js/school-auth-config.js` 的 `supabaseUrl`。
2. **紅字寫電郵已註冊／密碼不符** → 帳號早存在但密碼不是生日；老師需用 provision 把密碼改回生日。
3. **畫面仍是舊說明／自動填入舊帳** → 瀏覽器快取：`Cmd+Shift+R`；清掉自動填入後再輸入自己的學校電郵。

**學生首次登入** → 遊戲會嘗試用你輸入的生日建立 Auth 帳號（名冊須已有該電郵，且後端須可連線）。

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

## 版本與變更

見 **[CHANGELOG.md](CHANGELOG.md)**（Keep a Changelog + SemVer）。
