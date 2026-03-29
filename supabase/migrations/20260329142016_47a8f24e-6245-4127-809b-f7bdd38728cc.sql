
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- User roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- user_roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Leaderboard table
CREATE TABLE public.leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_name TEXT NOT NULL CHECK (char_length(player_name) <= 20),
    score INTEGER NOT NULL DEFAULT 0,
    waves_reached INTEGER NOT NULL DEFAULT 0,
    level_reached INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view leaderboard" ON public.leaderboard
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Anyone can submit scores" ON public.leaderboard
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Admins can delete leaderboard entries" ON public.leaderboard
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update leaderboard entries" ON public.leaderboard
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Game config table (single row)
CREATE TABLE public.game_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gravity FLOAT NOT NULL DEFAULT 1.0,
    base_speed FLOAT NOT NULL DEFAULT 260,
    spawn_interval FLOAT NOT NULL DEFAULT 3.5,
    difficulty_multiplier FLOAT NOT NULL DEFAULT 1.0,
    dda_enabled BOOLEAN NOT NULL DEFAULT true,
    global_pause BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read game config" ON public.game_config
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins can update game config" ON public.game_config
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Insert default config row
INSERT INTO public.game_config (gravity, base_speed, spawn_interval, difficulty_multiplier, dda_enabled, global_pause)
VALUES (1.0, 260, 3.5, 1.0, true, false);

-- Wave configs table
CREATE TABLE public.wave_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wave_number INTEGER NOT NULL UNIQUE,
    duration FLOAT NOT NULL DEFAULT 60,
    threats JSONB NOT NULL DEFAULT '["shrapnel"]'::jsonb,
    max_concurrent INTEGER NOT NULL DEFAULT 5,
    spawn_rate FLOAT NOT NULL DEFAULT 3.5,
    surge_multiplier FLOAT NOT NULL DEFAULT 1.0,
    drone_types JSONB NOT NULL DEFAULT '[]'::jsonb
);
ALTER TABLE public.wave_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read wave configs" ON public.wave_configs
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins can manage wave configs" ON public.wave_configs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for game_config updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_game_config_updated_at
  BEFORE UPDATE ON public.game_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
