-- Cloudflare Turnstile (human check at sign-up, password reset and login step-up).
--
-- turnstile_config: one row (id = 'default') written by the GitHub workflow
--   .github/workflows/cloudflare-turnstile.yml after it finds or creates the
--   "Descall" widget. The backend (frontend/backend/lib/turnstile.js) reads it every
--   60 s, so a new or rotated key works without a deploy. TURNSTILE_SITE_KEY /
--   TURNSTILE_SECRET_KEY env vars on Render override the row when both are set.
--   secret_key is the widget secret: only the service role may read it.
-- turnstile_stats_hourly: pass / fail / fallback / fail-open counters per hour, per
--   protected action and per server process (each process owns its rows, so writes
--   are plain upserts, never increments). Güvenlik Merkezi sums the last 24 hours.
--   Rows older than 30 days are deleted by the backend.
--
-- Only the backend reads and writes them with the service role: RLS on, no policies,
-- no anon / authenticated grants. Additive, safe to re-run. Until it is applied the
-- workflow stops with a clear message and the app keeps working without Turnstile.

CREATE TABLE IF NOT EXISTS public.turnstile_config (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  site_key text NOT NULL,
  secret_key text NOT NULL,
  hostnames text[] NOT NULL DEFAULT '{}'::text[],
  widget_name text,
  widget_mode text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE TABLE IF NOT EXISTS public.turnstile_stats_hourly (
  bucket timestamptz NOT NULL,
  node text NOT NULL,
  action text NOT NULL,
  outcome text NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, node, action, outcome)
);

CREATE INDEX IF NOT EXISTS idx_turnstile_stats_hourly_bucket ON public.turnstile_stats_hourly (bucket DESC);

ALTER TABLE public.turnstile_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnstile_stats_hourly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.turnstile_config FROM anon, authenticated;
REVOKE ALL ON TABLE public.turnstile_stats_hourly FROM anon, authenticated;
GRANT ALL ON TABLE public.turnstile_config TO service_role;
GRANT ALL ON TABLE public.turnstile_stats_hourly TO service_role;
