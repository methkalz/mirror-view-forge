ALTER TABLE public.background_config ADD COLUMN fade_duration double precision DEFAULT 60;
ALTER TABLE public.background_config ADD COLUMN easing_type text DEFAULT 'smoothstep';