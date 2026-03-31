ALTER TABLE public.audio_files ADD COLUMN volume real NOT NULL DEFAULT 1.0;
ALTER TABLE public.audio_config ADD COLUMN allow_overlap boolean NOT NULL DEFAULT false;