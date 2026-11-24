-- "El salla" (wave / nudge) from the iOS and Android home and lock screen widgets
-- (widgets draft B "Yuzler", Nov 2026). POST /api/native/wave records one row per wave
-- and the friend gets a socket event and a push ("Demir sana el salladi").
--
-- The rows are the durable side of the daily limits (lib/friendWave.js): 5 waves per
-- friend and 20 in total per sender in a rolling 24 hours, so a restart or a second node
-- (Render + the PC node share the database, not memory) cannot reset them. The in-memory
-- limiter in front of it only absorbs bursts. Rows older than 7 days carry no meaning and
-- are pruned by the backend (no cron needed: the insert path deletes the sender's old rows).
--
-- Only the backend reads and writes this table with the service role: RLS on, no
-- policies, no anon / authenticated grants. Additive, safe to re-run. Until it is applied
-- the endpoint falls back to the in-memory limits and still delivers the wave.

CREATE TABLE IF NOT EXISTS public.friend_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'widget' CHECK (source IN ('widget', 'app', 'notification', 'shortcut')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS friend_waves_from_created_idx
  ON public.friend_waves (from_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS friend_waves_pair_created_idx
  ON public.friend_waves (from_user_id, to_user_id, created_at DESC);

ALTER TABLE public.friend_waves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friend_waves FROM anon, authenticated;
