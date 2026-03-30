ALTER TABLE public.background_config ADD COLUMN display_mode text NOT NULL DEFAULT 'single';
ALTER TABLE public.background_config ADD COLUMN bg_margin double precision NOT NULL DEFAULT 400;