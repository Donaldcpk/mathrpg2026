-- =============================================================================
-- 修復 Supabase Linter：觸發器用 SECURITY DEFINER 函數不應被 RPC 直接呼叫
-- 在 SQL Editor 執行（不影響觸發器正常運作）
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.enforce_student_whitelist_signup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_student_whitelist_signup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_student_whitelist_signup() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.global_leaderboard_enforce_identity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.global_leaderboard_enforce_identity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.global_leaderboard_enforce_identity() FROM authenticated;

-- rls_auto_enable 為 Supabase 內建函數；若 linter 仍提示，可選執行：
-- REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
-- REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
