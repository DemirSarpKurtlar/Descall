-- Passkey control center (Settings > Security > Passkeys, draft A "Guvenlik kontrol merkezi").
-- Depends on 20261124p_passkeys.sql. Additive and safe to re-run.
--
-- passkey_credentials gains coarse places (no IP addresses): the country / city the CDN
--   reports for the request (cf-ipcountry / cf-ipcity on Cloudflare, x-vercel-ip-* behind the
--   Vercel rewrite). City is empty when the edge does not send one; then only the country
--   is compared. `places` keeps at most 12 entries { country, city, first, last, n } so a
--   sign-in from a place this passkey never used can be flagged ("new place" alert).
--
-- passkey_events: one row per thing that happened to a passkey, for the 30-day usage bars,
--   "Son etkinlik", the new-place alert and the "Ben degildim" link in security e-mails.
--   kind: added, signin, renamed, removed, new_place, suspended, report_confirmed,
--   report_revoked. A row that carries a report link stores only the SHA-256 of the
--   one-time token (report_hash) and when it expires; resolved_at / resolution record the
--   answer ("confirmed": it was me, "revoked": not me, the passkey and sessions were ended).
--   credential_row_id is kept as a plain uuid (no foreign key) so the history of a removed
--   passkey survives its removal; credential_name is the name at the time.
--
-- Rows older than 400 days are pruned by the backend. Only the backend reads and writes
-- these tables with the service role: RLS on, no policies, no anon / authenticated grants.
-- Until this migration is applied the control center still works from
-- passkey_credentials alone (no usage bars, no activity, no new-place alerts).

ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS created_country text;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS created_city text;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS last_used_country text;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS last_used_city text;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS places jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.passkey_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  credential_row_id uuid,
  credential_name text CHECK (credential_name IS NULL OR char_length(credential_name) <= 64),
  kind text NOT NULL CHECK (kind IN ('added', 'signin', 'renamed', 'removed', 'new_place', 'suspended', 'report_confirmed', 'report_revoked')),
  at timestamptz NOT NULL DEFAULT now(),
  platform text,
  device text,
  country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  city text CHECK (city IS NULL OR char_length(city) <= 80),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 600000),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_hash text CHECK (report_hash IS NULL OR report_hash ~ '^[0-9a-f]{64}$'),
  report_expires_at timestamptz,
  resolved_at timestamptz,
  resolution text CHECK (resolution IS NULL OR resolution IN ('confirmed', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_passkey_events_user_at ON public.passkey_events (user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_passkey_events_cred_at ON public.passkey_events (credential_row_id, at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS passkey_events_report_hash_uidx ON public.passkey_events (report_hash) WHERE report_hash IS NOT NULL;

ALTER TABLE public.passkey_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.passkey_events FROM anon, authenticated;

COMMENT ON TABLE public.passkey_events IS 'Passkey history for the control center (usage, activity, new-place alerts, "not me" e-mail links as SHA-256 hashes); backend service role only.';
COMMENT ON COLUMN public.passkey_credentials.places IS 'Up to 12 coarse places { country, city, first, last, n } from CDN geo headers; no IP addresses.';
