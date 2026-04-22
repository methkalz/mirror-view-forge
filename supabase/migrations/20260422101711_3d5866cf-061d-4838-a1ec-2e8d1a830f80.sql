CREATE TABLE public.prize_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  phone text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  rank integer,
  waves_reached integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prize_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit phone"
ON public.prize_entries FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(player_name) BETWEEN 1 AND 20
  AND length(phone) BETWEEN 6 AND 20
  AND phone ~ '^[+0-9 \-]+$'
  AND score >= 0 AND score <= 999999
);

CREATE POLICY "Admins can read prize_entries"
ON public.prize_entries FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete prize_entries"
ON public.prize_entries FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_prize_entries_created_at ON public.prize_entries(created_at DESC);