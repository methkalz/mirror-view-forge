-- Add audio_url column to store custom uploaded audio file path
ALTER TABLE public.audio_config ADD COLUMN audio_url text DEFAULT NULL;

-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('game-audio', 'game-audio', true);

-- Storage RLS: anyone can read (game needs it)
CREATE POLICY "Anyone can read game audio" ON storage.objects FOR SELECT USING (bucket_id = 'game-audio');

-- Only admins can upload/delete
CREATE POLICY "Admins can upload game audio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'game-audio' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update game audio" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'game-audio' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete game audio" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'game-audio' AND public.has_role(auth.uid(), 'admin'));