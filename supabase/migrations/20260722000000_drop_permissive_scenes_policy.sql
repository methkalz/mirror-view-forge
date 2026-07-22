-- Harden scenes RLS: remove the over-permissive management policy.
--
-- The original add_scenes migration created:
--   CREATE POLICY "Authenticated users manage scenes"
--     ON public.scenes FOR ALL TO authenticated USING (true);
-- which lets ANY authenticated account (not just admins) write to scenes.
--
-- A later migration (20260422122642) already added proper admin-scoped
-- INSERT/UPDATE/DELETE policies (WITH CHECK has_role(auth.uid(),'admin')),
-- and "Anyone can read scenes" still covers the game's public read path.
-- So dropping the permissive policy is a pure tightening:
--   • admins keep full scene management (admin-scoped policies remain)
--   • the game keeps read access (SELECT policy remains)
--   • only the non-admin write hole is closed.
--
-- Safe to apply independently of any client change.

DROP POLICY IF EXISTS "Authenticated users manage scenes" ON public.scenes;
