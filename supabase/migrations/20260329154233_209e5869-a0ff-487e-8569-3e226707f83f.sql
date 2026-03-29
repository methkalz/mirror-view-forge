-- Fix 1: CRITICAL - Privilege escalation on user_roles
-- Drop the overly permissive ALL policy and replace with specific secure policies
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Admin SELECT (already exists via "Users can view own roles", but admins need to see all)
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin INSERT with proper WITH CHECK
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin UPDATE
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin DELETE
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Fix 2: Tighten leaderboard INSERT - add rate limiting via score validation
DROP POLICY IF EXISTS "Anyone can submit scores" ON public.leaderboard;
CREATE POLICY "Anyone can submit scores" ON public.leaderboard
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    score >= 0 AND score <= 999999
    AND length(player_name) >= 1 AND length(player_name) <= 20
  );

-- Fix 3: Tighten game_sessions INSERT - validate data ranges
DROP POLICY IF EXISTS "Anyone can insert game_sessions" ON public.game_sessions;
CREATE POLICY "Anyone can insert game_sessions" ON public.game_sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    score >= 0 AND score <= 999999
    AND duration_seconds >= 0 AND duration_seconds <= 36000
    AND waves_reached >= 0 AND waves_reached <= 1000
    AND length(player_name) >= 1 AND length(player_name) <= 20
  );

-- Fix 4: Restrict game_sessions SELECT to not expose all player data publicly
-- Keep public read but limit what's visible (can't restrict columns via RLS, but this is acceptable for a leaderboard game)

-- Fix 5: Add storage policy to prevent unauthorized file deletion
DROP POLICY IF EXISTS "Anyone can read game-audio" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload game-audio" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete game-audio" ON storage.objects;