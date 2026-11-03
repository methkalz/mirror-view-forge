-- ═══════════════════════════════════════════════════════════════
-- Phase 1 — Security hardening
--   1. Scenes: only admins may modify (was: any authenticated user)
--   2. game_sessions: only admins may read (was: anyone)
--   3. Leaderboard: scores are accepted only through a server-side
--      function tied to a game run that the server timed itself.
--      Direct INSERT from the browser is no longer allowed.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Scenes — admin-only writes ─────────────────────────────
DROP POLICY IF EXISTS "Authenticated users manage scenes" ON public.scenes;
DROP POLICY IF EXISTS "Admins manage scenes" ON public.scenes;
CREATE POLICY "Admins manage scenes" ON public.scenes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── 2. game_sessions — admin-only reads ───────────────────────
DROP POLICY IF EXISTS "Anyone can read game_sessions" ON public.game_sessions;
DROP POLICY IF EXISTS "Admins can read game_sessions" ON public.game_sessions;
CREATE POLICY "Admins can read game_sessions" ON public.game_sessions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── 3. Server-timed game runs ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS game_runs_started_at_idx ON public.game_runs (started_at);
-- RLS on with NO policies: the table is reachable only through the
-- SECURITY DEFINER functions below, never directly from the browser.
ALTER TABLE public.game_runs ENABLE ROW LEVEL SECURITY;

-- Starts a run and returns its id. Old runs are pruned on the way.
CREATE OR REPLACE FUNCTION public.start_game_run()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  DELETE FROM public.game_runs WHERE started_at < now() - interval '1 day';
  INSERT INTO public.game_runs DEFAULT VALUES RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- Validates a finished run and records it. Returns the player's rank,
-- or NULL when the run is unknown, already submitted or implausible.
CREATE OR REPLACE FUNCTION public.submit_run_score(
  p_run_id UUID,
  p_player_name TEXT,
  p_score INT,
  p_waves INT,
  p_level INT,
  p_duration INT,
  p_drones INT DEFAULT 0,
  p_powerups INT DEFAULT 0,
  p_close_calls INT DEFAULT 0,
  p_bosses INT DEFAULT 0
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_started TIMESTAMPTZ;
  run_submitted BOOLEAN;
  elapsed NUMERIC;
  clean_name TEXT;
  player_rank INT;
BEGIN
  SELECT started_at, submitted INTO run_started, run_submitted
  FROM public.game_runs WHERE id = p_run_id FOR UPDATE;

  IF run_started IS NULL OR run_submitted THEN
    RETURN NULL;
  END IF;

  elapsed := EXTRACT(EPOCH FROM (now() - run_started));
  clean_name := left(btrim(coalesce(p_player_name, '')), 20);

  -- Plausibility limits (generous: an honest player never hits them)
  IF clean_name = ''
     OR p_score < 0 OR p_score > 999999
     OR p_score > elapsed * 300 + 2000
     OR p_waves < 1 OR p_waves > floor(elapsed / 20) + 2
     OR p_duration < 0 OR p_duration > elapsed + 10
  THEN
    UPDATE public.game_runs SET submitted = true WHERE id = p_run_id;
    RETURN NULL;
  END IF;

  UPDATE public.game_runs SET submitted = true WHERE id = p_run_id;

  INSERT INTO public.leaderboard (player_name, score, waves_reached, level_reached)
  VALUES (clean_name, p_score, p_waves, greatest(p_level, 1));

  INSERT INTO public.game_sessions (
    player_name, score, waves_reached, level_reached, duration_seconds,
    drones_destroyed, powerups_collected, close_calls, bosses_defeated
  ) VALUES (
    clean_name, p_score, p_waves, greatest(p_level, 1), p_duration,
    greatest(p_drones, 0), greatest(p_powerups, 0),
    greatest(p_close_calls, 0), greatest(p_bosses, 0)
  );

  SELECT count(*) + 1 INTO player_rank FROM public.leaderboard WHERE score > p_score;
  RETURN player_rank;
END;
$$;

REVOKE ALL ON FUNCTION public.start_game_run() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_run_score(UUID, TEXT, INT, INT, INT, INT, INT, INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_game_run() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_run_score(UUID, TEXT, INT, INT, INT, INT, INT, INT, INT, INT) TO anon, authenticated;

-- Block direct score / session inserts from the browser
DROP POLICY IF EXISTS "Anyone can submit scores" ON public.leaderboard;
DROP POLICY IF EXISTS "Anyone can insert game_sessions" ON public.game_sessions;
