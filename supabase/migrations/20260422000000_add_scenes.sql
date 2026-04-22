-- 1) Create scenes table
CREATE TABLE IF NOT EXISTS public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read scenes" ON public.scenes FOR SELECT USING (true);
CREATE POLICY "Authenticated users manage scenes" ON public.scenes FOR ALL TO authenticated USING (true);

-- 2) Seed one default scene
INSERT INTO public.scenes (id, name, sort_order)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 0)
ON CONFLICT (id) DO NOTHING;

-- 3) Add scene_id FK to background_config
ALTER TABLE public.background_config
  ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE
  DEFAULT '00000000-0000-0000-0000-000000000001';

-- 4) Add scene_change_interval to game_config
ALTER TABLE public.game_config
  ADD COLUMN IF NOT EXISTS scene_change_interval INT NOT NULL DEFAULT 6;
