-- 在 Supabase SQL Editor 執行一次（解決「登入 400 + 註冊 422」卻不知原因）
-- 讓遊戲在登入前可檢查電郵是否在名冊（不公開整份名單）

CREATE OR REPLACE FUNCTION public.check_student_email_allowed(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_whitelist w
    WHERE lower(w.email) = lower(trim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.check_student_email_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_student_email_allowed(text) TO anon, authenticated;
