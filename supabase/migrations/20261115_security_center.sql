-- Yönetici Paneli › Güvenlik Merkezi (remake, owner-approved Draft A "Komuta merkezi", Nov 2026).
--
-- security_events: the live threat feed (failed logins, brute-force bursts, account
--   locks, per-IP limiter refusals, access-ban hits, message rate-limit refusals,
--   refused sign-ups, admin step-up codes) plus a twice-daily "posture" row with the
--   security score. The backend merges events in memory and writes one row per
--   (type, source, account, reason) every 15 s with a count, at most 300 rows per
--   write, and deletes rows older than 30 days (posture rows after 120 days).
--   Privacy: no address is stored, only the masked address / network and the same
--   keyed HMAC hashes public.access_bans matches on.
-- security_setting_changes: settings history with { key, from, to } per changed value,
--   reason, and revert state (Güvenlik Merkezi "Ayar değişikliği geçmişi", also used by
--   PATCH /admin/system).
--
-- Only the backend reads and writes them with the service role: RLS on, no policies,
-- no anon / authenticated grants. Additive, safe to re-run. Until it is applied the
-- page keeps working from memory (lost on restart) and says so.

CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN (
    'brute_force', 'failed_login', 'account_locked', 'ip_blocked', 'access_ban',
    'rate_limit', 'signup_denied', 'admin_step_up', 'posture'
  )),
  at timestamptz NOT NULL DEFAULT now(),
  first_at timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 1 CHECK (count >= 0),
  ip_masked text,
  ip_hash text,
  net_hash text,
  net_label text,
  country text,
  city text,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  username text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_security_events_at ON public.security_events (at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type_at ON public.security_events (type, at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_at ON public.security_events (ip_hash, at DESC) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_user_at ON public.security_events (user_id, at DESC) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.security_setting_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_username text,
  source text NOT NULL DEFAULT 'security',
  category text NOT NULL DEFAULT 'other',
  title text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  revert_of uuid REFERENCES public.security_setting_changes(id) ON DELETE SET NULL,
  reverted_at timestamptz,
  reverted_by_username text
);

CREATE INDEX IF NOT EXISTS idx_security_setting_changes_at ON public.security_setting_changes (at DESC);
CREATE INDEX IF NOT EXISTS idx_security_setting_changes_cat_at ON public.security_setting_changes (category, at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_setting_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.security_setting_changes FROM anon, authenticated;
GRANT ALL ON TABLE public.security_events TO service_role;
GRANT ALL ON TABLE public.security_setting_changes TO service_role;
