-- Yönetici Paneli › Admin Token (owner request, Nov 2026).
--
-- Personal access tokens for the owner account: a bot (Claude Code / Desktop through the
-- MCP endpoint, scripts through the REST API) acts as the owner. Only the owner creates
-- and manages them, from an owner session with a fresh 2FA code (creating, rotating,
-- restoring, resuming, renaming, the IP list, alert actions and the auto-pause settings).
-- A request made with a token may only read the token pages and reduce power: pause,
-- revoke and revoke-all. At most 50 tokens are active at a time.
--
-- admin_api_tokens: one row per token. The secret ("dsk_admin_" + 43 base64url chars) is
--   never stored: secret_hash is its SHA-256 hex. prefix / last4 are for the list
--   ("dsk_admin_7Hq2…k9Xa"). After a rotate the previous hash stays in grace_hash until
--   grace_until. A revoke can be undone for 10 minutes (revoked_at).
-- admin_api_token_usage_hourly: request counters per token and hour (written in batches).
-- admin_api_token_calls: a bounded tail of recent calls per token (7-day retention, the
--   backend writes at most a few rows per token every 15 s plus every destructive call).
-- admin_api_token_ips: addresses seen per token (new IP / new country alerts, "IPs 7d").
-- admin_api_token_alerts: new IP, new country and burst alerts, with the auto-pause flag.
-- admin_api_token_settings: one row, the owner's auto-pause switches.
--
-- Only the backend reads and writes them with the service role: RLS on, no policies,
-- no anon / authenticated grants. Additive, safe to re-run. Until it is applied the
-- Admin Token tab shows "not set up" and dsk_admin_ bearer tokens are refused (401).

CREATE TABLE IF NOT EXISTS public.admin_api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  secret_hash text NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  prefix text NOT NULL,
  last4 text NOT NULL,
  expires_in text NOT NULL DEFAULT '30d' CHECK (expires_in IN ('1h', '1d', '7d', '30d', '90d', 'never')),
  expires_at timestamptz,
  ip_allowlist jsonb NOT NULL DEFAULT '[]'::jsonb,
  paused boolean NOT NULL DEFAULT false,
  paused_at timestamptz,
  paused_reason text,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  revoke_reason text CHECK (revoke_reason IS NULL OR revoke_reason IN ('leaked', 'unused', 'replaced', 'other')),
  revoke_note text,
  grace_hash text CHECK (grace_hash IS NULL OR grace_hash ~ '^[0-9a-f]{64}$'),
  grace_until timestamptz,
  rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_ip text,
  last_used_at timestamptz,
  last_used_ip text,
  last_used_country text,
  last_client text,
  request_count bigint NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_api_tokens_secret_hash_key ON public.admin_api_tokens (secret_hash);
CREATE INDEX IF NOT EXISTS admin_api_tokens_grace_hash_idx ON public.admin_api_tokens (grace_hash) WHERE grace_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_api_tokens_owner_idx ON public.admin_api_tokens (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_api_token_usage_hourly (
  token_id uuid NOT NULL REFERENCES public.admin_api_tokens (id) ON DELETE CASCADE,
  hour timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  errors integer NOT NULL DEFAULT 0 CHECK (errors >= 0),
  mcp integer NOT NULL DEFAULT 0 CHECK (mcp >= 0),
  destructive integer NOT NULL DEFAULT 0 CHECK (destructive >= 0),
  d_ban integer NOT NULL DEFAULT 0 CHECK (d_ban >= 0),
  d_delete integer NOT NULL DEFAULT 0 CHECK (d_delete >= 0),
  d_descoin integer NOT NULL DEFAULT 0 CHECK (d_descoin >= 0),
  d_broadcast integer NOT NULL DEFAULT 0 CHECK (d_broadcast >= 0),
  ms_total bigint NOT NULL DEFAULT 0 CHECK (ms_total >= 0),
  ms_max integer NOT NULL DEFAULT 0 CHECK (ms_max >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_id, hour)
);

CREATE INDEX IF NOT EXISTS admin_api_token_usage_hourly_hour_idx ON public.admin_api_token_usage_hourly (hour DESC);

CREATE TABLE IF NOT EXISTS public.admin_api_token_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.admin_api_tokens (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL,
  path text NOT NULL,
  status integer NOT NULL DEFAULT 0,
  ms integer NOT NULL DEFAULT 0,
  ip text,
  country text,
  via text NOT NULL DEFAULT 'rest' CHECK (via IN ('rest', 'mcp')),
  tool text,
  destructive boolean NOT NULL DEFAULT false,
  destructive_kind text CHECK (destructive_kind IS NULL OR destructive_kind IN ('ban', 'delete', 'descoin', 'broadcast')),
  audit_id text
);

CREATE INDEX IF NOT EXISTS admin_api_token_calls_token_at_idx ON public.admin_api_token_calls (token_id, at DESC);
CREATE INDEX IF NOT EXISTS admin_api_token_calls_at_idx ON public.admin_api_token_calls (at);

CREATE TABLE IF NOT EXISTS public.admin_api_token_ips (
  token_id uuid NOT NULL REFERENCES public.admin_api_tokens (id) ON DELETE CASCADE,
  ip text NOT NULL,
  country text,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (token_id, ip)
);

CREATE INDEX IF NOT EXISTS admin_api_token_ips_last_idx ON public.admin_api_token_ips (token_id, last_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_api_token_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.admin_api_tokens (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('new_ip', 'new_country', 'burst')),
  ip text,
  country text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'resolved')),
  auto_paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz,
  handled_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  handled_action text
);

CREATE INDEX IF NOT EXISTS admin_api_token_alerts_created_idx ON public.admin_api_token_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_api_token_alerts_token_idx ON public.admin_api_token_alerts (token_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_api_token_alerts_open_idx ON public.admin_api_token_alerts (status) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.admin_api_token_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_pause_enabled boolean NOT NULL DEFAULT true,
  rule_new_country boolean NOT NULL DEFAULT true,
  rule_new_ip boolean NOT NULL DEFAULT false,
  rule_burst boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);
INSERT INTO public.admin_api_token_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_api_token_usage_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_api_token_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_api_token_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_api_token_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_api_token_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_api_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_api_token_usage_hourly FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_api_token_calls FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_api_token_ips FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_api_token_alerts FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_api_token_settings FROM anon, authenticated;

GRANT ALL ON TABLE public.admin_api_tokens TO service_role;
GRANT ALL ON TABLE public.admin_api_token_usage_hourly TO service_role;
GRANT ALL ON TABLE public.admin_api_token_calls TO service_role;
GRANT ALL ON TABLE public.admin_api_token_ips TO service_role;
GRANT ALL ON TABLE public.admin_api_token_alerts TO service_role;
GRANT ALL ON TABLE public.admin_api_token_settings TO service_role;
