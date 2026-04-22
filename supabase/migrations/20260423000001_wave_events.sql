-- Phase 2: Mid-wave dynamic events support
-- Adds an `events` JSONB column to wave_configs so admin can schedule
-- surges, calms, swarms, and volleys at specific times within any wave.

ALTER TABLE public.wave_configs
  ADD COLUMN IF NOT EXISTS events JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.wave_configs.events IS
  'Array of {type: surge|calm|swarm|volley, triggerAt: seconds, duration: seconds}';
