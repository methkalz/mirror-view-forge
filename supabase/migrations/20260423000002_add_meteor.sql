-- Phase 3: Add meteor threat to default difficulty profile
-- Meteor unlocks at wave 6. Admin can change via threats_unlock JSONB.

UPDATE public.difficulty_profile
SET
  threats_unlock = threats_unlock || '{"meteor":6}'::jsonb,
  updated_at = now()
WHERE id IS NOT NULL
  AND NOT (threats_unlock ? 'meteor');
