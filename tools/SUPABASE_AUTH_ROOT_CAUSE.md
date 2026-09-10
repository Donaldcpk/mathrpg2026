# 登入失敗 — 根源說明

## 0. 目前最常見：後端網域已失效（優先檢查）

若畫面紅字為 **「無法連線登入伺服器」**，或 Console 對 `*.supabase.co` 出現 `Failed to fetch`／DNS 錯誤：

```bash
# 本機或任何電腦執行；若無 A 紀錄／NXDOMAIN，代表專案已刪除或不存在
dig oqsvxizemgyfointylpe.supabase.co A +short
```

**含義：** GitHub Pages 網頁仍可開啟，但登入靠的 Supabase 專案連不上。學生端無法自行修好。

**教師必做：**

1. 到 [Supabase Dashboard](https://supabase.com/dashboard) 確認專案是否仍在（若被刪除請新建）
2. 把新的 Project URL 與 anon／publishable key 寫入 `js/school-auth-config.js`（與 `js/plugins.js` → OmniscientEncyclopedia 的 supabaseUrl／supabaseKey 保持一致）
3. 執行名冊 SQL、`check_student_email_rpc.sql`，並用 `tools/provision_supabase_auth_users.mjs` 匯入學生（見下方 B）
4. Auth → Providers → Email：**關閉 Confirm email**
5. 推送 `main` 觸發 GitHub Pages 部署

> 註：`school-auth-config.defaults.js` 已 gitignore；GitHub Pages **不應**再請求此檔（僅本機 localhost 覆寫）。若 Console 仍見該檔 404，請強制重新整理或確認已部署最新 `index.html`。

---

## 你看到的 Console：400 + 422

```
token?grant_type=password  → 400   （登入失敗）
signup                     → 422   （註冊也失敗）
（可能重複兩次）
```

這**不是**網頁壞掉，而是 **Supabase Auth 的帳號狀態** 與 **遊戲自動「登入失敗就註冊」** 疊加（前提是後端網域仍可連線）。

## 根源（後端可連線時的三步）

### 1. 帳號早就存在，但密碼不是生日

- 以前用 `NWcs1965!` 或 provision 建過帳號  
- 學生現在用 **8 位生日** 登入 → **400 Invalid login credentials**  
- Supabase **故意不區分**「無此帳號」與「密碼錯」（安全設計）

### 2. 遊戲以為「新學生」而去 signUp

- `school-auth-gate.js` 在 400 後會嘗試 **signup**  
- 帳號已存在 → **422 User already registered**  
- 所以 Console 會出現 **400 然後 422**

### 3. 名冊與 Auth 必須一致

- `student_whitelist` 要有該電郵（CSV 名冊）  
- Auth 裡密碼要與學生輸入一致（需 **service_role** 批次設定，不能只靠前端）

## 徹底解法（教師／管理員做一次）

### A. Supabase SQL（必做）

1. 已有 `tools/supabase_student_whitelist_and_rls.sql`（名冊觸發器）  
2. **新增執行** `tools/supabase_check_email_rpc.sql`（登入前檢查電郵是否在名冊）  
3. 確認名冊含 666 個 `s…@`（從 `student_whitelist_rows.csv` 匯入）  
4. **Authentication → Providers → Email**：關閉 **Confirm email**（否則註冊後無法登入）  
5. 若生日 8 碼仍 422：考慮關閉 **Leaked password protection**（否則 `20100315` 可能被拒）

### B. 用生日重設所有 Auth 密碼（關鍵）

```bash
cd /path/to/mathrpg2026
export SUPABASE_URL="https://oqsvxizemgyfointylpe.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="（Settings → API → service_role secret）"

# 1) 管理員帳號
export NWCS_ADMIN_PASSWORD="你的管理密碼"
export NWCS_ADMIN_EMAILS="admin@ngwahsec.edu.hk,nwcs211@ngwahsec.edu.hk"
node tools/provision_supabase_auth_users.mjs --admins-only

# 2) 學生：需 Excel 第2欄生日 或 自製 CSV（email,password）
python3 tools/generate_student_whitelist_sql.py \
  --passwords-out tools/student_auth_passwords.csv \
  "/路徑/STD AC.xlsx"

export NWCS_PROVISION_MODE=upsert   # 會覆蓋既有密碼為 CSV 內生日
node tools/provision_supabase_auth_users.mjs --students \
  --passwords-csv tools/student_auth_passwords.csv
```

`upsert` 會把**已存在**帳號密碼改成 CSV 裡的生日，從根源消除 400。

### C. 部署遊戲

推送最新 `school-auth-gate.js` 後，學生會先看到：

- 電郵不在名冊 → 明確提示（需 RPC SQL）  
- 已註冊但密碼錯 → 明確提示（不再只有 400/422）

## 學生端

- 電郵：`s########@ngwahsec.edu.hk`  
- 密碼：8 位生日，例 `20100315`  
- 若仍失敗：老師尚未執行 B 步重設密碼

## 不建議

- 只靠前端 signUp 讓學生「自己註冊」— 已存在帳號永遠 422  
- 在 Git 放真實密碼或 `defaults.js` 含管理員密碼  
