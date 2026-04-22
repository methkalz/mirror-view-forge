-- Phase 1: Rebalance default difficulty profile
UPDATE public.difficulty_profile SET
  base_max_concurrent = 3,
  max_concurrent_cap = 15,
  concurrent_growth = 0.7,
  base_spawn_interval = 2.4,
  min_spawn_interval = 0.55,
  spawn_interval_decay = 0.15,
  threats_unlock = '{"shrapnel":1,"missile":2,"cluster":3}'::jsonb,
  drones_unlock = '{"scout":2,"tracker":4,"incendiary":5,"bomber":7,"chemical":7}'::jsonb,
  cluster_splits_base = 2,
  cluster_splits_growth = 0.35,
  cluster_splits_cap = 8,
  drone_interval_base = 18,
  drone_interval_min = 7,
  drone_interval_decay = 0.85,
  boss_every_n_waves = 6,
  boss_start_wave = 12,
  bullet_level_waves = '{"2":2,"3":4,"4":8}'::jsonb,
  wave_duration = 60,
  phase_in_delay = 10,
  updated_at = now()
WHERE id IS NOT NULL;

-- Phase 2: Mid-wave dynamic events support
ALTER TABLE public.wave_configs
  ADD COLUMN IF NOT EXISTS events JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.wave_configs.events IS
  'Array of {type: surge|calm|swarm|volley, triggerAt: seconds, duration: seconds}';

-- Phase 3: Add meteor threat
UPDATE public.difficulty_profile
SET
  threats_unlock = threats_unlock || '{"meteor":6}'::jsonb,
  updated_at = now()
WHERE id IS NOT NULL
  AND NOT (threats_unlock ? 'meteor');

-- Phase 4: Add laser drone tier
UPDATE public.difficulty_profile
SET
  drones_unlock = drones_unlock || '{"laser":8}'::jsonb,
  updated_at = now()
WHERE id IS NOT NULL
  AND NOT (drones_unlock ? 'laser');