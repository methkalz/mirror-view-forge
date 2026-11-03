-- ═══════════════════════════════════════════════════════════════
-- Phase 2 — Editable in-game texts
-- Every player-facing gameplay message has a stable key (e.g.
-- 'event.swarm', 'warn.w6_minibos'). The game ships default values in
-- code; a row here overrides that key. Deleting a row restores the
-- default. Admins edit these from the "Texts" tab.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.game_texts (
  key TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 80),
  value TEXT NOT NULL CHECK (char_length(value) <= 300),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.game_texts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read game_texts" ON public.game_texts;
CREATE POLICY "Anyone can read game_texts" ON public.game_texts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage game_texts" ON public.game_texts;
CREATE POLICY "Admins manage game_texts" ON public.game_texts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Live updates in the running game when an admin edits texts, waves,
-- the difficulty profile or audio. The game already subscribes to these
-- tables, but they were never added to the realtime publication, so
-- admin edits only reached players after a page reload.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['game_texts', 'wave_configs', 'difficulty_profile', 'audio_config'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
