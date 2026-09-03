-- Signup acquisition attribution (independent of auth_provider / Google OAuth).
-- First-touch columns are write-once from the application; last-touch may update later.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_touch_source TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_medium TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_campaign TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_term TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_content TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_gclid TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_fbclid TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_landing_page TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_referrer TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_touch_source TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_medium TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_campaign TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_term TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_content TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_gclid TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_fbclid TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_landing_page TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_referrer TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_method TEXT,
  ADD COLUMN IF NOT EXISTS signup_at TIMESTAMPTZ;

UPDATE public.users
SET signup_at = COALESCE(signup_at, created_at::timestamptz)
WHERE signup_at IS NULL AND created_at IS NOT NULL;

UPDATE public.users
SET auth_method = CASE
  WHEN auth_provider = 'google' THEN 'google'
  WHEN auth_provider ILIKE 'local%' THEN 'email'
  ELSE COALESCE(auth_method, 'other')
END
WHERE auth_method IS NULL;

CREATE INDEX IF NOT EXISTS users_first_touch_source_idx
  ON public.users (first_touch_source);

CREATE INDEX IF NOT EXISTS users_auth_method_idx
  ON public.users (auth_method);

CREATE INDEX IF NOT EXISTS users_signup_at_idx
  ON public.users (signup_at);
