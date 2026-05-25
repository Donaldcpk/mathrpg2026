#!/usr/bin/env bash
# 一次性：名冊 → student_whitelist → Supabase Auth（nwcs 測試帳 + 管理員）
# 用法見 tools/AUTH.md
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f tools/.env.supabase.local ]]; then
  # shellcheck disable=SC1091
  source tools/.env.supabase.local
fi

: "${SUPABASE_URL:?請 export SUPABASE_URL 或寫入 tools/.env.supabase.local}"
: "${SUPABASE_SERVICE_ROLE_KEY:?請 export SUPABASE_SERVICE_ROLE_KEY}"
: "${NWCS_LEGACY_PASSWORD:?請 export NWCS_LEGACY_PASSWORD（nwcs###@ 密碼，例 NWcs1965!）}"
: "${NWCS_ADMIN_PASSWORD:?請 export NWCS_ADMIN_PASSWORD（admin@ 管理密碼）}"

echo "== 1/2 同步 student_whitelist =="
node tools/sync_student_whitelist_from_csv.mjs

echo "== 2/2 建立／更新 Auth 帳號（管理員 + nwcs 測試帳）=="
export NWCS_PROVISION_MODE="${NWCS_PROVISION_MODE:-upsert}"
export NWCS_ADMIN_EMAILS="${NWCS_ADMIN_EMAILS:-admin@ngwahsec.edu.hk,nwcs211@ngwahsec.edu.hk}"
node tools/provision_supabase_auth_users.mjs --include-legacy-nwcs

echo ""
echo "完成。請在 Supabase Dashboard 確認："
echo "  Authentication → Providers → Email：關閉 Confirm email"
echo "  https://supabase.com/dashboard/project/oqsvxizemgyfointylpe/auth/providers"
