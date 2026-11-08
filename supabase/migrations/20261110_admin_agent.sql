-- Admin agent (phase 1, owner request 2026-11-08): a Claude-powered assistant inside the
-- Yönetici Paneli. Phase 1 is read-only: it answers admins' questions with the same admin
-- endpoints the panel uses, under the asking admin's own session and section permissions.
-- Additive only. Every table: RLS on, no policies, no grants to anon / authenticated
-- (the backend's service role is the only reader and writer).

-- One row: the owner's switches. enabled = false stops every agent call (kill switch).
CREATE TABLE IF NOT EXISTS public.admin_agent_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  monthly_budget_usd numeric(10, 2) NOT NULL DEFAULT 50 CHECK (monthly_budget_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.admin_agent_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- A conversation belongs to the admin who started it; other admins cannot open it.
CREATE TABLE IF NOT EXISTS public.admin_agent_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_agent_threads_admin_idx ON public.admin_agent_threads (admin_id, updated_at DESC);

-- The exact message list sent to the model, in order. content is the API's content block
-- array, stored unchanged so thinking blocks and tool calls replay byte for byte.
CREATE TABLE IF NOT EXISTS public.admin_agent_messages (
  id bigserial PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES public.admin_agent_threads (id) ON DELETE CASCADE,
  seq integer NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, seq)
);

-- One row per model call: tokens and the dollar cost, for the monthly budget.
CREATE TABLE IF NOT EXISTS public.admin_agent_usage (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  admin_id uuid,
  thread_id uuid,
  kind text NOT NULL DEFAULT 'chat',
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS admin_agent_usage_at_idx ON public.admin_agent_usage (at DESC);

ALTER TABLE public.admin_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_agent_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_agent_settings FROM anon, authenticated;
REVOKE ALL ON public.admin_agent_threads FROM anon, authenticated;
REVOKE ALL ON public.admin_agent_messages FROM anon, authenticated;
REVOKE ALL ON public.admin_agent_usage FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.admin_agent_messages_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.admin_agent_usage_id_seq FROM anon, authenticated;
