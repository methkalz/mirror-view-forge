
-- Create difficulty_profile table
CREATE TABLE public.difficulty_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_max_concurrent integer NOT NULL DEFAULT 3,
  max_concurrent_cap integer NOT NULL DEFAULT 15,
  concurrent_growth real NOT NULL DEFAULT 0.5,
  base_spawn_interval real NOT NULL DEFAULT 2.5,
  min_spawn_interval real NOT NULL DEFAULT 0.5,
  spawn_interval_decay real NOT NULL DEFAULT 0.1,
  threats_unlock jsonb NOT NULL DEFAULT '{"shrapnel":1,"missile":2,"cluster":4}'::jsonb,
  drones_unlock jsonb NOT NULL DEFAULT '{"scout":5,"tracker":7,"bomber":9,"chemical":10,"incendiary":11}'::jsonb,
  cluster_splits_base integer NOT NULL DEFAULT 2,
  cluster_splits_growth real NOT NULL DEFAULT 0.3,
  cluster_splits_cap integer NOT NULL DEFAULT 8,
  drone_interval_base real NOT NULL DEFAULT 25,
  drone_interval_min real NOT NULL DEFAULT 6,
  drone_interval_decay real NOT NULL DEFAULT 0.8,
  boss_every_n_waves integer NOT NULL DEFAULT 6,
  boss_start_wave integer NOT NULL DEFAULT 12,
  bullet_level_waves jsonb NOT NULL DEFAULT '{"2":3,"3":8}'::jsonb,
  wave_duration real NOT NULL DEFAULT 60,
  phase_in_delay real NOT NULL DEFAULT 12,
  scaling_formula text NOT NULL DEFAULT 'linear',
  updated_at timestamp with time zone DEFAULT now()
);

-- RLS
ALTER TABLE public.difficulty_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read difficulty_profile" ON public.difficulty_profile
  FOR SELECT TO public USING (true);

CREATE POLICY "Admins can manage difficulty_profile" ON public.difficulty_profile
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default row
INSERT INTO public.difficulty_profile (id) VALUES (gen_random_uuid());

-- Expand wave_configs with new columns
ALTER TABLE public.wave_configs
  ADD COLUMN IF NOT EXISTS cluster_splits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bullet_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS phase_in_delay real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drone_interval real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_boss boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_chemical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_incendiary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warning_text text,
  ADD COLUMN IF NOT EXISTS warning_color text DEFAULT '#ef4444',
  ADD COLUMN IF NOT EXISTS warning_type text DEFAULT 'warning';
