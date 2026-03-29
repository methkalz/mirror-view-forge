-- Table for multiple audio files per sound
CREATE TABLE public.audio_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sound_config_id uuid NOT NULL REFERENCES public.audio_config(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read audio_files" ON public.audio_files FOR SELECT USING (true);
CREATE POLICY "Admins can insert audio_files" ON public.audio_files FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update audio_files" ON public.audio_files FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete audio_files" ON public.audio_files FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Add playback mode and interval to audio_config
-- play_mode: 'single' (one file/synth), 'random' (pick random file each time), 'sequential' (cycle through), 'loop' (continuous loop)
ALTER TABLE public.audio_config ADD COLUMN play_mode text NOT NULL DEFAULT 'single';
-- interval_seconds: for periodic sounds (null = event-triggered)
ALTER TABLE public.audio_config ADD COLUMN interval_seconds real DEFAULT NULL;
-- max_concurrent: how many can play at once (for layered ambient)
ALTER TABLE public.audio_config ADD COLUMN max_concurrent integer NOT NULL DEFAULT 1;

CREATE INDEX idx_audio_files_config ON public.audio_files(sound_config_id);