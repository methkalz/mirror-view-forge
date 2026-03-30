
-- Background config table for day/night cycle
CREATE TABLE public.background_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase TEXT NOT NULL UNIQUE,
  image_url TEXT,
  transition_start FLOAT NOT NULL DEFAULT 0,
  transition_end FLOAT NOT NULL DEFAULT 90,
  overlay_top TEXT DEFAULT '12,20,69',
  overlay_mid TEXT DEFAULT '26,16,46',
  overlay_bottom TEXT DEFAULT '26,10,46',
  overlay_opacity FLOAT DEFAULT 0.4,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.background_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Anyone can read background_config" ON public.background_config
  FOR SELECT TO public USING (true);

-- Admins can update
CREATE POLICY "Admins can update background_config" ON public.background_config
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert
CREATE POLICY "Admins can insert background_config" ON public.background_config
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete
CREATE POLICY "Admins can delete background_config" ON public.background_config
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed default phases
INSERT INTO public.background_config (phase, transition_start, transition_end, overlay_top, overlay_mid, overlay_bottom, overlay_opacity, sort_order)
VALUES
  ('day',    0,   90,  '30,100,200', '50,120,180', '70,140,200', 0.15, 0),
  ('sunset', 90,  240, '180,80,30',  '150,50,20',  '120,40,15',  0.3,  1),
  ('night',  240, 600, '12,20,69',   '26,16,46',   '26,10,46',   0.45, 2);

-- Storage bucket for background images
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-backgrounds', 'game-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: anyone can read
CREATE POLICY "Anyone can read game-backgrounds" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'game-backgrounds');

-- Admins can upload
CREATE POLICY "Admins can upload game-backgrounds" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'game-backgrounds' AND has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete
CREATE POLICY "Admins can delete game-backgrounds" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'game-backgrounds' AND has_role(auth.uid(), 'admin'::app_role));
