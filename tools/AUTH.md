# 學校登入與密碼（單一說明）

## 生日密碼「存在哪裡」？

**不在 Git 專案裡。** 學生的生日密碼只會出現在：

1. **Supabase → Authentication → Users**（每位學生註冊後的密碼雜湊）
2. 校方 Excel **「第 2 欄：密碼」**（`generate_student_whitelist_sql.py` 註明僅供紙本，**不寫入**資料庫）
3. 學生自己記住的出生年月日（8 碼，例 `20100315`）

### 為何以前可以用生日登入？

遊戲 `js/school-auth-gate.js` 的流程：

1. 學生輸入 `s########@ngwahsec.edu.hk` + 8 碼生日  
2. 若 Auth **尚無**此帳號 → 自動 **signUp**，密碼就是你輸入的生日  
3. 名冊 `student_whitelist` 必須已有該電郵（否則觸發器會擋註冊）

所以不必事先跑 provision，**首次登入即建立帳號**。  
若後來改過密碼或跑過舊版 provision（`NWcs1965!`），就會對不上。

---

## 密碼規則（請與學生／教師一致）

| 帳號類型 | 電郵範例 | 密碼 |
|----------|----------|------|
| 學生 | `s1913588@ngwahsec.edu.hk` | **出生年月日 8 碼**（例 `20100315`） |
| 管理員 | `admin@ngwahsec.edu.hk`、`nwcs211@ngwahsec.edu.hk`；畫面可輸入 `admin` | **`NgW@h2526!`** |
| 舊測試帳（可選） | `nwcs003@…`～`nwcs244@`（不含 211） | **`NWcs1965!`** |

名冊 CSV：`student_whitelist_rows.csv`（`is_admin=true` 只有 `admin@` 與 `nwcs211@`）。

---

## 工具指令

### 1. 名冊已在 Supabase 時

```bash
export SUPABASE_URL="https://oqsvxizemgyfointylpe.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="你的_service_role"

# 管理員（建議必跑）
node tools/provision_supabase_auth_users.mjs --admins-only

# 舊 nwcs 測試帳（可選）
node tools/provision_supabase_auth_users.mjs --include-legacy-nwcs
```

### 2. 從 Excel 匯出學生密碼 CSV 再批次建立

```bash
python3 tools/generate_student_whitelist_sql.py \
  --passwords-out tools/student_auth_passwords.csv \
  "/路徑/STD AC.xlsx"

node tools/provision_supabase_auth_users.mjs --students \
  --passwords-csv tools/student_auth_passwords.csv
```

### 3. 複製名冊到 tools（可選）

```bash
cp ~/Downloads/student_whitelist_rows.csv tools/student_whitelist_rows.csv
```

---

## 登入畫面

- 學生：`s########@ngwahsec.edu.hk` + 8 碼生日  
- 管理員：電郵輸入 `admin` 或完整管理員電郵 + 管理密碼  

設定檔：`js/school-auth-config.defaults.js`（勿 commit service_role）。
