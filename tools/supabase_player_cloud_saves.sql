-- =============================================================================
-- player_cloud_saves + player_daily_playtime
-- 在 Supabase Dashboard → SQL Editor 執行（可重複執行）
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.player_cloud_saves (
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    slot smallint NOT NULL DEFAULT 1,
    save_data text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    playtime text,
    game_title text,
    save_version text,
    content_hash text,
    PRIMARY KEY (user_id, slot)
);

ALTER TABLE public.player_cloud_saves ADD COLUMN IF NOT EXISTS save_version text;
ALTER TABLE public.player_cloud_saves ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS player_cloud_saves_updated_at_idx
    ON public.player_cloud_saves (updated_at DESC);

ALTER TABLE public.player_cloud_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_cloud_saves_select_own ON public.player_cloud_saves;
CREATE POLICY player_cloud_saves_select_own
    ON public.player_cloud_saves FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS player_cloud_saves_insert_own ON public.player_cloud_saves;
CREATE POLICY player_cloud_saves_insert_own
    ON public.player_cloud_saves FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS player_cloud_saves_update_own ON public.player_cloud_saves;
CREATE POLICY player_cloud_saves_update_own
    ON public.player_cloud_saves FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.player_cloud_saves TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.player_cloud_saves TO service_role;

-- 每日遊玩秒數（跨裝置累計，取較大值以防換機繞過）
CREATE TABLE IF NOT EXISTS public.player_daily_playtime (
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    play_date date NOT NULL,
    used_seconds integer NOT NULL DEFAULT 0 CHECK (used_seconds >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, play_date)
);

ALTER TABLE public.player_daily_playtime ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_daily_playtime_select_own ON public.player_daily_playtime;
CREATE POLICY player_daily_playtime_select_own
    ON public.player_daily_playtime FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS player_daily_playtime_insert_own ON public.player_daily_playtime;
CREATE POLICY player_daily_playtime_insert_own
    ON public.player_daily_playtime FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS player_daily_playtime_update_own ON public.player_daily_playtime;
CREATE POLICY player_daily_playtime_update_own
    ON public.player_daily_playtime FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.player_daily_playtime TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.player_daily_playtime TO service_role;

-- UPSERT: player_cloud_saves?on_conflict=user_id,slot
-- UPSERT: player_daily_playtime?on_conflict=user_id,play_date
