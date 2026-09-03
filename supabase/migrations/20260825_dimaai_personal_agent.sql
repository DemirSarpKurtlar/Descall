-- DimaAI personal agent: opt-in account actions with per-write confirmation.

ALTER TABLE public.dimaai_user_settings
  ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.dimaai_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.dimaai_conversations(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired', 'failed')),
  result JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dimaai_pending_actions_user_status
  ON public.dimaai_pending_actions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dimaai_pending_actions_expires
  ON public.dimaai_pending_actions (expires_at)
  WHERE status = 'pending';

ALTER TABLE public.dimaai_pending_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dimaai_pending_actions FROM anon, authenticated;
GRANT ALL ON TABLE public.dimaai_pending_actions TO service_role;
