INSERT INTO public.audio_config (sound_key, label, label_ar, category, volume, enabled, play_mode, max_concurrent)
VALUES
  ('warningShrapnel', 'Shrapnel Warning', 'تحذير شظايا', 'warnings', 0.8, true, 'random', 1),
  ('warningMissile', 'Missile Warning', 'تحذير صواريخ', 'warnings', 0.8, true, 'random', 1),
  ('warningCluster', 'Cluster Warning', 'تحذير تشظي', 'warnings', 0.8, true, 'random', 1),
  ('warningDrone', 'Drone Warning', 'تحذير طائرات', 'warnings', 0.8, true, 'random', 1),
  ('warningBoss', 'Boss Warning', 'تحذير زعيم', 'warnings', 0.9, true, 'random', 1),
  ('warningHazard', 'Hazard Warning', 'تحذير بيئي', 'warnings', 0.8, true, 'random', 1),
  ('warningBomber', 'Bomber Warning', 'تحذير قاذفات', 'warnings', 0.8, true, 'random', 1)
ON CONFLICT (sound_key) DO NOTHING;