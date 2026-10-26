-- Yönetici Paneli › Kayıt İstatistikleri (Descall 3.0.0). ADDITIVE ONLY: two new
-- tables. No existing table is altered, nothing is dropped or rewritten.
-- Written and read only by the backend (service role). No raw IPs, emails or
-- usernames are stored: attempt_key is an HMAC of (ip, user agent, day).

-- One row per user per Istanbul calendar day with any authenticated activity.
-- Feeds D1 / D7 return rates. Rows older than ~400 days are pruned by the backend.
CREATE TABLE IF NOT EXISTS public.user_active_days (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day     date NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS user_active_days_day_idx ON public.user_active_days (day);

-- Outcome of each POST /auth/register: completed or failed (validation / conflict / error).
CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL CHECK (status IN ('completed', 'failed')),
  reason      text CHECK (reason IS NULL OR reason IN ('validation', 'conflict', 'rate_limited', 'error')),
  method      text NOT NULL DEFAULT 'email' CHECK (method IN ('email', 'google', 'apple', 'other')),
  attempt_key text NOT NULL CHECK (char_length(attempt_key) BETWEEN 16 AND 64),
  country     text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')
);
CREATE INDEX IF NOT EXISTS signup_attempts_created_idx ON public.signup_attempts (created_at);

ALTER TABLE public.user_active_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_active_days FROM anon, authenticated;
REVOKE ALL ON public.signup_attempts FROM anon, authenticated;
