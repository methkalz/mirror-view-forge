CREATE TABLE public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  waves_reached integer NOT NULL DEFAULT 0,
  level_reached integer NOT NULL DEFAULT 0,
  duration_seconds real NOT NULL DEFAULT 0,
  drones_destroyed integer NOT NULL DEFAULT 0,
  powerups_collected integer NOT NULL DEFAULT 0,
  close_calls integer NOT NULL DEFAULT 0,
  bosses_defeated integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert game_sessions" ON public.game_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read game_sessions" ON public.game_sessions FOR SELECT USING (true);
CREATE POLICY "Admins can delete game_sessions" ON public.game_sessions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));