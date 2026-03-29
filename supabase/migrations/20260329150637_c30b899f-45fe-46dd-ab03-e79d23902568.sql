
CREATE TABLE public.audio_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sound_key text UNIQUE NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  label_ar text NOT NULL DEFAULT '',
  volume real NOT NULL DEFAULT 1.0,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audio_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read audio config (game needs it)
CREATE POLICY "Anyone can read audio_config" ON public.audio_config FOR SELECT USING (true);

-- Only admins can modify
CREATE POLICY "Admins can update audio_config" ON public.audio_config FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert audio_config" ON public.audio_config FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete audio_config" ON public.audio_config FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed all sounds with categories
INSERT INTO public.audio_config (sound_key, category, label, label_ar, volume, enabled) VALUES
  -- Ambient / Background
  ('ambient', 'ambient', 'Wind Ambient', 'رياح الخلفية', 1.0, true),
  ('thunder', 'ambient', 'Thunder', 'رعد', 1.0, true),
  -- Threats / Hazards
  ('explosion', 'threats', 'Explosion', 'انفجار', 1.0, true),
  ('impactLight', 'threats', 'Light Impact', 'اصطدام خفيف', 1.0, true),
  ('impactHeavy', 'threats', 'Heavy Impact', 'اصطدام ثقيل', 1.0, true),
  ('warning', 'threats', 'Warning Alert', 'تنبيه تحذير', 1.0, true),
  -- Combat
  ('shoot1', 'combat', 'Pistol Shot', 'طلقة مسدس', 1.0, true),
  ('shoot2', 'combat', 'Double Shot', 'رشقة مزدوجة', 1.0, true),
  ('shoot3', 'combat', 'Triple Burst', 'رشقة ثلاثية', 1.0, true),
  ('combo', 'combat', 'Combo Hit', 'ضربة كومبو', 1.0, true),
  ('closeCall', 'combat', 'Close Call', 'نجاة بأعجوبة', 1.0, true),
  -- Player
  ('damage', 'player', 'Player Damage', 'إصابة اللاعب', 1.0, true),
  ('dash', 'player', 'Dash/Roll', 'دحرجة', 1.0, true),
  ('footstep', 'player', 'Footstep', 'خطوة', 1.0, true),
  -- Power-ups
  ('pickup', 'powerups', 'Item Pickup', 'التقاط عنصر', 1.0, true),
  ('interceptor', 'powerups', 'Interceptor', 'صاروخ اعتراضي', 1.0, true),
  ('slowmo', 'powerups', 'Slow Motion', 'حركة بطيئة', 1.0, true),
  ('magnet', 'powerups', 'Magnet', 'مغناطيس', 1.0, true),
  ('airstrike', 'powerups', 'Airstrike', 'غارة جوية', 1.0, true),
  -- Boss
  ('bossSiren', 'boss', 'Boss Siren', 'صافرة الزعيم', 1.0, true),
  ('bossExplosion', 'boss', 'Boss Explosion', 'انفجار الزعيم', 1.0, true);
