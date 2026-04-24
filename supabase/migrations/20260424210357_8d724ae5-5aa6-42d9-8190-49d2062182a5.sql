-- Add warnings array column to wave_configs (multi-message support)
ALTER TABLE public.wave_configs 
  ADD COLUMN IF NOT EXISTS warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Create dynamic_warnings table for in-game event messages (swarm, volley, airstrike, minefield, etc.)
CREATE TABLE IF NOT EXISTS public.dynamic_warnings (
  event_key TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#ef4444',
  sound_key TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  duration REAL NOT NULL DEFAULT 1.0,
  label_ar TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dynamic_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read dynamic_warnings" 
  ON public.dynamic_warnings FOR SELECT USING (true);

CREATE POLICY "Admins can insert dynamic_warnings" 
  ON public.dynamic_warnings FOR INSERT TO authenticated 
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update dynamic_warnings" 
  ON public.dynamic_warnings FOR UPDATE TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete dynamic_warnings" 
  ON public.dynamic_warnings FOR DELETE TO authenticated 
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed the 4 known dynamic event warnings
INSERT INTO public.dynamic_warnings (event_key, text, color, sound_key, duration, label_ar) VALUES
  ('swarm',           '⚠ سرب طائرات!',        '#ef4444', NULL, 1.0, 'سرب طائرات (Swarm)'),
  ('minefield',       '⚠ عسكري يزرع ألغام!',   '#f59e0b', NULL, 1.2, 'زراعة ألغام (Minefield)'),
  ('volley',          '⚠ وابل صواريخ!',        '#dc2626', NULL, 0.8, 'وابل صواريخ (Volley)'),
  ('airstrike_flyby', '⚠ قصف جوي!',           '#dc2626', NULL, 1.0, 'قصف جوي (Airstrike Flyby)')
ON CONFLICT (event_key) DO NOTHING;