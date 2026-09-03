-- Trust & Safety: user-to-user reports + wallet freeze flag for dossiers.
-- Backend uses the service role. RLS on with no anon/authenticated policies.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS descoin_frozen BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'other',
  note TEXT,
  context_type TEXT NOT NULL DEFAULT 'profile',
  context_id TEXT,
  snippet TEXT,
  occurred_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  resolution TEXT,
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_reports_not_self CHECK (reporter_id <> target_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status_created
  ON public.user_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_reports_target_status
  ON public.user_reports (target_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_created
  ON public.user_reports (reporter_id, created_at DESC);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_reports FROM anon, authenticated;
GRANT ALL ON TABLE public.user_reports TO service_role;
