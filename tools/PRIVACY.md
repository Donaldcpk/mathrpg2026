# 隱私與 Git 安全

## 絕對不要 commit 到 GitHub

| 類型 | 檔案／內容 |
|------|------------|
| 學生名冊 | `tools/student_whitelist_rows.csv` |
| 學生密碼表 | `tools/student_auth_passwords.csv` |
| 管理員電郵覆寫 | `js/school-auth-config.defaults.js`（可選；404 不影響學生） |
| 基礎 Supabase anon | `js/school-auth-config.js`（與 plugins.js 相同，客户端本來可見） |
| 真實名冊 SQL | `tools/supabase_seed_nwcs_players.sql` |
| 管理密碼、舊班密碼 | 僅放環境變數或密碼管理器，**勿寫進程式碼** |
| `service_role` 金鑰 | 僅本機 `export`，勿進 repo |

## 可公開（但仍建議用 Secrets 管理）

- Supabase **anon / publishable** 金鑰（網頁遊戲客户端本來會暴露）
- 若曾誤 commit 真實管理密碼或 service_role → **立即在 Supabase 旋轉金鑰**

## 本機第一次設定

```bash
cp js/school-auth-config.defaults.js.example js/school-auth-config.defaults.js
# 編輯填入管理員電郵等覆寫（檔案已在 .gitignore；學生登入主要靠 school-auth-config.js）
```

## GitHub Pages 部署

在 repo **Settings → Secrets and variables → Actions** 新增：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ADMIN_AUTH_EMAIL`（例：admin@ngwahsec.edu.hk）
- `ADMIN_EMAILS`（逗號分隔，例：admin@…,teacher@…）

推送 `main` 時 workflow 會執行 `write_school_auth_config.mjs` 產生設定檔再部署。

## 若過去已 push 敏感資料

Git 歷史仍可能留有舊 commit。建議：

1. 旋轉 Supabase anon key 與管理員密碼  
2. 必要時使用 [GitHub 密鑰掃描](https://docs.github.com/en/code-security/secret-scanning) 或 `git filter-repo` 清除歷史（需自行操作）
