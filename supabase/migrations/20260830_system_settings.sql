-- Durable admin systemConfig + site started_at (Vercel isolates have empty RAM).
-- Additive: new table + last_seen index. Does not rewrite users.

CREATE TABLE IF NOT EXISTS public.system_settings (
  id text PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.system_settings (id, config, started_at)
VALUES ('default', '{}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS users_last_seen_idx
  ON public.users (last_seen DESC)
  WHERE last_seen IS NOT NULL;
