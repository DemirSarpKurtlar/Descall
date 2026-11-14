-- Ban experience (docs/design/ban-experience/CONTRACT.md, 2026-11-14).
-- Appeals against an account ban (users.is_banned) or an access ban
-- (public.access_bans). Written by the backend only (service role): RLS on,
-- no policies, no anon / authenticated grants. Additive, safe to re-run.
-- The backend tolerates this table missing (appeal endpoints answer 503,
-- sign-in keeps working).
CREATE TABLE IF NOT EXISTS public.ban_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('account', 'access')),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  access_ban_id uuid,
  access_code text CHECK (access_code IS NULL OR char_length(access_code) <= 16),
  email text CHECK (email IS NULL OR char_length(email) <= 254),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  decided_by uuid,
  decided_note text CHECK (decided_note IS NULL OR char_length(decided_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ban_appeals_status_created ON public.ban_appeals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ban_appeals_user ON public.ban_appeals (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ban_appeals_access_ban ON public.ban_appeals (access_ban_id) WHERE access_ban_id IS NOT NULL;

ALTER TABLE public.ban_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ban_appeals FROM anon, authenticated;
GRANT ALL ON TABLE public.ban_appeals TO service_role;

-- requireAuth now also enforces access bans on REST calls and records those
-- blocked attempts as action 'api' (throttled to one row per ban and visitor a
-- minute). Widen the hits check when the access-ban tables exist.
DO $$
BEGIN
  IF to_regclass('public.access_ban_hits') IS NOT NULL THEN
    ALTER TABLE public.access_ban_hits DROP CONSTRAINT IF EXISTS access_ban_hits_action_check;
    ALTER TABLE public.access_ban_hits
      ADD CONSTRAINT access_ban_hits_action_check CHECK (action IN ('login', 'register', 'socket', 'oauth', 'api'));
  END IF;
END $$;
