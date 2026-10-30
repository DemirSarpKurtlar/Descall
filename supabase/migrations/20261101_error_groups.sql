-- Hata Kayıtları (3.7.0): issue grouping for public.error_logs.
-- fingerprint / platform / app_version are filled on insert by routes/errors.js
-- (lib/errorGroups.js); older rows are grouped on the fly. error_group_state
-- keeps the admin's decision per issue (open / resolved / ignored + note); a
-- resolved issue that happens again reopens itself (regression). Backend only.
ALTER TABLE public.error_logs
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS app_version text;

CREATE INDEX IF NOT EXISTS idx_error_logs_fp_time ON public.error_logs (fingerprint, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_time ON public.error_logs ("timestamp" DESC);

CREATE TABLE IF NOT EXISTS public.error_group_state (
  fingerprint text PRIMARY KEY CHECK (char_length(fingerprint) BETWEEN 8 AND 64),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  resolved_at timestamptz,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by_username text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.error_group_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.error_group_state FROM anon, authenticated;
GRANT ALL ON TABLE public.error_group_state TO service_role;
