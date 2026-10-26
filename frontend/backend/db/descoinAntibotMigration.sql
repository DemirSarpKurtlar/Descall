-- DesCoin anti-bot, Faz 0 (monitor only).
--
-- STATUS: NOT APPLIED to production (Supabase pubpfuoymdlgrdevedxk). Applying it
-- needs Demir's approval. Never apply to the Seoul project.
--
-- Purely ADDITIVE: only new tables + indexes. No existing table or column is
-- altered, nothing touches users.descoin_balance or descoin_ledger. The backend
-- tolerates these tables being absent (anti-bot persistence just stays off).
--
-- Privacy: no raw IP addresses or device identifiers are stored. Network data is
-- reduced to /24 (IPv4) or /64 (IPv6) and stored only as a keyed HMAC-SHA256;
-- device fingerprints likewise. Hashes, links and alerts are deleted after 90
-- days, message fingerprints (MinHash numbers, no text) after 7 days, by the
-- backend's daily retention job.
--
-- RLS is enabled with NO policies: only the service role (backend) can read or
-- write; anon/authenticated clients get nothing.

-- One row per scored account.
CREATE TABLE IF NOT EXISTS public.descoin_risk (
  user_id     UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  reasons     TEXT[] NOT NULL DEFAULT '{}',
  signals     JSONB NOT NULL DEFAULT '{}'::jsonb,
  trusted     BOOLEAN NOT NULL DEFAULT false,
  trusted_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  trusted_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_descoin_risk_score ON public.descoin_risk (score DESC);

-- Hashed device fingerprints / network subnets seen per account (90 days).
CREATE TABLE IF NOT EXISTS public.descoin_device_seen (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('fp', 'subnet')),
  hash        TEXT NOT NULL CHECK (char_length(hash) <= 128),
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, hash)
);
CREATE INDEX IF NOT EXISTS idx_descoin_device_seen_hash ON public.descoin_device_seen (hash, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_descoin_device_seen_last ON public.descoin_device_seen (last_seen);

-- Account pairs linked by >= 2 independent signals (user_a < user_b).
CREATE TABLE IF NOT EXISTS public.descoin_account_links (
  id          BIGSERIAL PRIMARY KEY,
  user_a      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_b      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kinds       TEXT[] NOT NULL DEFAULT '{}',
  strength    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_a, user_b),
  CHECK (user_a <> user_b)
);
CREATE INDEX IF NOT EXISTS idx_descoin_account_links_b ON public.descoin_account_links (user_b);
CREATE INDEX IF NOT EXISTS idx_descoin_account_links_last ON public.descoin_account_links (last_seen);

-- Keyed MinHash signatures of recent messages (no text), 7 days.
CREATE TABLE IF NOT EXISTS public.descoin_message_fingerprints (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conv_key_hash  TEXT,
  minhash        BIGINT[] NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_descoin_msg_fp_user_created ON public.descoin_message_fingerprints (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_descoin_msg_fp_created ON public.descoin_message_fingerprints (created_at);

-- Accounts that crossed the alert threshold (one per account per 24 h), 90 days.
-- email_enabled / push_enabled record whether sending was switched on at the time.
CREATE TABLE IF NOT EXISTS public.descoin_risk_alerts (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score          INTEGER NOT NULL,
  reasons        TEXT[] NOT NULL DEFAULT '{}',
  email_enabled  BOOLEAN NOT NULL DEFAULT false,
  push_enabled   BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_descoin_risk_alerts_user_created ON public.descoin_risk_alerts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_descoin_risk_alerts_created ON public.descoin_risk_alerts (created_at);

-- Admin / moderator actions in the anti-bot tab (trust, untrust, note, run).
CREATE TABLE IF NOT EXISTS public.descoin_admin_audit (
  id           BIGSERIAL PRIMARY KEY,
  admin_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  target_user  UUID REFERENCES public.users(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('trust', 'untrust', 'note', 'run_job', 'release')),
  note         TEXT CHECK (note IS NULL OR char_length(note) <= 1000),
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_descoin_admin_audit_target ON public.descoin_admin_audit (target_user, created_at DESC);

ALTER TABLE public.descoin_risk                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descoin_device_seen          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descoin_account_links        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descoin_message_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descoin_risk_alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descoin_admin_audit          ENABLE ROW LEVEL SECURITY;
