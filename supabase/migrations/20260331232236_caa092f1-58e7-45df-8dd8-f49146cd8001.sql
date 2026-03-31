INSERT INTO public.audio_config (sound_key, category, label, label_ar, volume, enabled, play_mode, volume_mode)
VALUES ('scoreTick', 'sfx', 'Score Tick', 'نقرة العد التنازلي', 1.0, true, 'single', 'group')
ON CONFLICT DO NOTHING;