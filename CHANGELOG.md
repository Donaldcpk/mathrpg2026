# Changelog

本專案依 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 記錄可見變更，版本號依 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### Security

- 將 `tools/AUTH.md`、`tools/.env.supabase.local.example`、`tools/SUPABASE_AUTH_ROOT_CAUSE.md`、`tools/student_auth_passwords.csv.example` 中看起來像真實密碼的範例改為明確 placeholder（例如 `YOUR_LEGACY_PASSWORD_HERE`、`YYYYMMDD`），避免明文秘密寫入 Git。
- 同步移除 `tools/setup_nwcs_auth.sh` 錯誤提示中的舊測試密碼字樣。
