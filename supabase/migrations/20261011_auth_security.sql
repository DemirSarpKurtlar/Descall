-- Additive auth security columns and per-account code-attempt counters.
-- Service role writes these. No policies: anon and authenticated cannot read them.

CREATE TABLE IF NOT EXISTS public.auth_code_attempts (
  user_id uuid NOT NULL,
  purpose text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, purpose)
);

ALTER TABLE public.auth_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_code_attempts FROM anon, authenticated;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pending_email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

UPDATE public.users
SET is_super_admin = true
WHERE lower(username) = 'admin'
  AND is_super_admin IS NOT TRUE;
