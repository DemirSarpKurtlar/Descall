-- Error logs. Applied as supabase/migrations/20261011_error_logs.sql.
-- The API uses the service role, which bypasses row level security.

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  stack text,
  component_stack text,
  url text,
  user_agent text,
  user_id text,
  timestamp timestamptz DEFAULT now(),
  resolved boolean DEFAULT false,
  severity text DEFAULT 'error',
  source text DEFAULT 'frontend'
);

CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON public.error_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON public.error_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON public.error_logs (resolved);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.error_logs FROM anon, authenticated;
