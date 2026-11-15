-- Admin agent, phase 2 (owner pick "Taslak B · Plan paneli", 2026-11-15): the agent can act.
-- The model never changes anything itself: it proposes a plan (agent_plans + agent_plan_items),
-- an admin approves it with a fresh 2FA code, and the server executes each item with the same
-- internal functions the panel's own admin routes use, re-checking scopes, limits and the
-- approving admin's sections per item. Every executed item keeps its result and undo data.
-- Additive only. Every table: RLS on, no policies, service role only.

CREATE SEQUENCE IF NOT EXISTS public.agent_plan_code_seq START 1;

-- One row per plan version. Versions of the same plan share `code` (#P-0412 v1, v2, ...).
CREATE TABLE IF NOT EXISTS public.agent_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code bigint NOT NULL DEFAULT nextval('public.agent_plan_code_seq'),
  version integer NOT NULL DEFAULT 1,
  parent_id uuid REFERENCES public.agent_plans (id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.admin_agent_threads (id) ON DELETE SET NULL,
  tool_use_id text,
  admin_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'admin_edit', 'task')),
  task_id uuid,
  title text NOT NULL DEFAULT '',
  summary text,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  diff jsonb,
  -- proposed -> (scheduled) -> running <-> paused -> done | cancelled | failed; superseded / discarded never ran.
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'scheduled', 'running', 'paused', 'done', 'cancelled', 'failed', 'superseded', 'discarded')),
  dry_run jsonb,
  dry_run_at timestamptz,
  approved_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  approved_by_username text,
  approved_at timestamptz,
  approve_mode text,
  scheduled_for timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  undo_until timestamptz,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);
CREATE INDEX IF NOT EXISTS agent_plans_thread_idx ON public.agent_plans (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_plans_admin_idx ON public.agent_plans (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_plans_status_idx ON public.agent_plans (status, scheduled_for);

-- One row per proposed action. target_user_id is null for platform-wide actions
-- (announcement, live popup to everyone).
CREATE TABLE IF NOT EXISTS public.agent_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.agent_plans (id) ON DELETE CASCADE,
  seq integer NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_username text,
  target_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk integer CHECK (risk IS NULL OR (risk >= 0 AND risk <= 100)),
  cluster text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected boolean NOT NULL DEFAULT true,
  excluded_reason text,
  -- proposed | excluded | queued | running | done | skipped | failed | cancelled | undone | undo_failed
  status text NOT NULL DEFAULT 'proposed',
  result jsonb,
  error text,
  undo jsonb,
  executed_at timestamptz,
  undone_at timestamptz,
  undone_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, seq)
);
CREATE INDEX IF NOT EXISTS agent_plan_items_plan_idx ON public.agent_plan_items (plan_id, seq);
CREATE INDEX IF NOT EXISTS agent_plan_items_target_idx ON public.agent_plan_items (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_plan_items_exec_idx ON public.agent_plan_items (action, executed_at DESC);

-- Saved prompts ("Kayıtlı komutlar"): per admin, optionally shared with every admin.
CREATE TABLE IF NOT EXISTS public.agent_saved_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  prompt text NOT NULL,
  shared boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_saved_prompts_admin_idx ON public.agent_saved_prompts (admin_id, updated_at DESC);

-- Scheduled tasks: a prompt the agent runs on a schedule. A run only reads and proposes a
-- plan; nothing is applied without an admin's approval. session_id is the creating admin's
-- session; when it is signed out the task stops (status 'session_ended').
CREATE TABLE IF NOT EXISTS public.agent_scheduled_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  admin_username text,
  session_id text,
  title text NOT NULL,
  prompt text NOT NULL,
  every text NOT NULL DEFAULT 'daily' CHECK (every IN ('hourly', 'every6h', 'daily', 'weekly')),
  at_minute integer NOT NULL DEFAULT 0 CHECK (at_minute >= 0 AND at_minute < 1440),
  weekday integer CHECK (weekday IS NULL OR (weekday >= 0 AND weekday <= 6)),
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  last_plan_id uuid,
  last_thread_id uuid,
  run_count integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_scheduled_tasks_due_idx ON public.agent_scheduled_tasks (enabled, next_run_at);

-- One row: which scopes the agent may act in, their limits and the approval rules (owner setting).
CREATE TABLE IF NOT EXISTS public.agent_scopes (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  scopes jsonb NOT NULL DEFAULT '{}'::jsonb,
  require_2fa_each boolean NOT NULL DEFAULT true,
  owner_approval_permanent boolean NOT NULL DEFAULT true,
  exclude_premium boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.agent_scopes (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.agent_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_saved_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_plans FROM anon, authenticated;
REVOKE ALL ON public.agent_plan_items FROM anon, authenticated;
REVOKE ALL ON public.agent_saved_prompts FROM anon, authenticated;
REVOKE ALL ON public.agent_scheduled_tasks FROM anon, authenticated;
REVOKE ALL ON public.agent_scopes FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.agent_plan_code_seq FROM anon, authenticated;
GRANT ALL ON TABLE public.agent_plans TO service_role;
GRANT ALL ON TABLE public.agent_plan_items TO service_role;
GRANT ALL ON TABLE public.agent_saved_prompts TO service_role;
GRANT ALL ON TABLE public.agent_scheduled_tasks TO service_role;
GRANT ALL ON TABLE public.agent_scopes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.agent_plan_code_seq TO service_role;
