-- Phase 4: Add laser drone tier to default difficulty profile
-- Laser drones unlock at wave 8. They hover stationary and fire a
-- telegraphed vertical beam that deals heavy damage if the player
-- crosses it at the fire moment.

UPDATE public.difficulty_profile
SET
  drones_unlock = drones_unlock || '{"laser":8}'::jsonb,
  updated_at = now()
WHERE id IS NOT NULL
  AND NOT (drones_unlock ? 'laser');
