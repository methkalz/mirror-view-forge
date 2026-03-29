
-- Add branding columns to game_config
ALTER TABLE public.game_config
  ADD COLUMN IF NOT EXISTS logo_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS game_title text NOT NULL DEFAULT 'SKYFALL',
  ADD COLUMN IF NOT EXISTS game_subtitle text NOT NULL DEFAULT 'SURVIVAL',
  ADD COLUMN IF NOT EXISTS developer_name text NOT NULL DEFAULT 'CAILOR GG',
  ADD COLUMN IF NOT EXISTS developer_url text DEFAULT NULL;

-- Add menu_music entry to audio_config
INSERT INTO public.audio_config (sound_key, category, label, label_ar, volume, enabled, play_mode, interval_seconds, max_concurrent)
VALUES ('menuMusic', 'ui', 'Menu Music', 'موسيقى القائمة', 0.5, true, 'loop', null, 1)
ON CONFLICT DO NOTHING;
