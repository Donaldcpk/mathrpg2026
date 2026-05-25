# 學校登入與密碼（維護用，不含真實密碼）

> **隱私：** 真實電郵、密碼、名冊 CSV 見 [PRIVACY.md](./PRIVACY.md)，勿 commit 到 Git。

## 生日密碼存在哪裡？

1. **Supabase → Authentication → Users**（雜湊，非明文）
2. 校方 Excel 第 2 欄（僅紙本／匯出用，不進 Git）
3. 學生首次登入時在畫面輸入 → 自動 signUp 寫入 Auth

## 密碼規則（口頭向學生說明即可）

| 類型 | 電郵 | 密碼 |
|------|------|------|
| 學生 | `s########@你的學校網域` | 出生年月日 8 碼 |
| 管理員 | 校方指定管理員電郵；畫面可輸入 `admin` | 校方指定（環境變數 `NWCS_ADMIN_PASSWORD`） |
| 舊 nwcs 測試帳（可選） | `nwcs###@…` | 環境變數 `NWCS_LEGACY_PASSWORD` |

## Provision（本機 only）

### 快速：nwcs003–nwcs244 + 管理員（一次完成）

名冊 `tools/student_whitelist_rows.csv` 已含 `nwcs003@`…`nwcs244@` 與 `admin@`（勿 push）。

```bash
cp tools/.env.supabase.local.example tools/.env.supabase.local
# 編輯填入 service_role secret、NWCS_LEGACY_PASSWORD、NWCS_ADMIN_PASSWORD

chmod +x tools/setup_nwcs_auth.sh
./tools/setup_nwcs_auth.sh
```

或手動：

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="（secret，勿 commit）"
export NWCS_LEGACY_PASSWORD="NWcs1965!"
export NWCS_ADMIN_PASSWORD="（管理密碼）"
export NWCS_PROVISION_MODE=upsert
export NWCS_ADMIN_EMAILS="admin@ngwahsec.edu.hk,nwcs211@ngwahsec.edu.hk"

node tools/sync_student_whitelist_from_csv.mjs
node tools/provision_supabase_auth_users.mjs --include-legacy-nwcs
```

**Supabase Dashboard 必做：** [Auth → Providers → Email](https://supabase.com/dashboard/project/oqsvxizemgyfointylpe/auth/providers) 關閉 **Confirm email**，否則無法登入。

### 僅管理員

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="（secret，勿 commit）"
export NWCS_ADMIN_PASSWORD="（管理密碼）"
export NWCS_ADMIN_EMAILS="admin@…,teacher@…"   # 逗號分隔，與名冊 is_admin 一致

cp ~/Downloads/student_whitelist_rows.csv tools/   # 勿 push

node tools/provision_supabase_auth_users.mjs --admins-only
```

學生批次：`--students --passwords-csv tools/student_auth_passwords.csv`（該 CSV 亦勿 commit）。

## 登入畫面

- 學生：學校派發的 `s########@…` + 8 碼生日  
- 管理員：輸入 `admin` + 管理密碼  

設定檔：`js/school-auth-config.defaults.js`（本機複製自 `.example`，已 gitignore）。
