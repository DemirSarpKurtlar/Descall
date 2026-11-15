-- İşlem kaydı (admin audit console, owner pick Draft B "Konsol", Nov 2026).
-- Additive only. Until this is applied the console still works: request facts
-- ride in admin_audit.meta._req, saved views / notes answer 503, alert rules use
-- the defaults and anomaly reviews are kept in memory.

-- 1. Request facts on every new audit row (masked IP, never the full address).
ALTER TABLE public.admin_audit ADD COLUMN IF NOT EXISTS ip_masked text;
ALTER TABLE public.admin_audit ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.admin_audit ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE public.admin_audit ADD COLUMN IF NOT EXISTS endpoint text;
ALTER TABLE public.admin_audit ADD COLUMN IF NOT EXISTS step_up boolean;

CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON public.admin_audit (target, at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_actor_name_idx ON public.admin_audit (actor_username, at DESC);

-- 2. Saved views ("Gece vardiyası incelemesi"): a named filter, own or shared with every admin.
CREATE TABLE IF NOT EXISTS public.admin_audit_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  owner_username text,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_views_owner_idx ON public.admin_audit_views (owner_id, created_at);
CREATE INDEX IF NOT EXISTS admin_audit_views_shared_idx ON public.admin_audit_views (shared) WHERE shared;

-- 3. Alert rules ("Uyarı kuralları"): settings over the built-in defaults.
CREATE TABLE IF NOT EXISTS public.admin_audit_rules (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  threshold integer NOT NULL CHECK (threshold BETWEEN 1 AND 1000),
  window_sec integer NOT NULL CHECK (window_sec BETWEEN 10 AND 86400),
  updated_by uuid,
  updated_by_username text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Decisions on "olağan dışı" alerts (reviewed, undone, permission suspension and its owner approval).
CREATE TABLE IF NOT EXISTS public.admin_audit_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_key text NOT NULL,
  rule text NOT NULL,
  actor_id uuid,
  actor_username text,
  decision text NOT NULL CHECK (decision IN ('reviewed', 'undo', 'suspend')),
  status text NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'pending_owner', 'declined')),
  section text,
  reason text,
  entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by uuid,
  reviewed_by_username text,
  decided_by_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_audit_reviews_key_idx ON public.admin_audit_reviews (anomaly_key);
CREATE INDEX IF NOT EXISTS admin_audit_reviews_created_idx ON public.admin_audit_reviews (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_reviews_pending_idx ON public.admin_audit_reviews (status) WHERE status = 'pending_owner';

-- 5. Notes on one audit entry (admin_audit itself is append-only).
CREATE TABLE IF NOT EXISTS public.admin_audit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id text NOT NULL,
  author_id uuid,
  author_username text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_notes_entry_idx ON public.admin_audit_notes (entry_id, created_at);

-- Service role only: RLS on, no policies, nothing for anon / authenticated.
ALTER TABLE public.admin_audit_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_views, public.admin_audit_rules, public.admin_audit_reviews, public.admin_audit_notes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_views, public.admin_audit_rules, public.admin_audit_reviews, public.admin_audit_notes TO service_role;
GRANT SELECT, INSERT ON public.admin_audit TO service_role;
