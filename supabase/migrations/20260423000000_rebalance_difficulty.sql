-- Phase 1: Rebalance default difficulty profile
-- Front-load drones and threats, faster spawn decay, more bullet upgrades.

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
