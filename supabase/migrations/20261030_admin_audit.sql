-- Durable admin audit log (3.1.3, owner request: "yönetici işlem kayıtları kalıcı olsun").
-- Every Yönetici Paneli action goes through state.appendAudit (runtime/sharedState.js);
-- until now those lived in memory and were lost on each restart / deploy. The backend
-- (service role) writes one row per action here. Append-only: rows cannot be updated
-- or deleted (trigger), RLS on with no policies, no grants to anon / authenticated.
CREATE TABLE IF NOT EXISTS public.admin_audit (
  id text PRIMARY KEY,                       -- same id as the in-memory entry (dedupe)
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_username text,
  action text NOT NULL,
  target text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS admin_audit_at_idx ON public.admin_audit (at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_actor_idx ON public.admin_audit (actor_id, at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_action_idx ON public.admin_audit (action, at DESC);

ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_audit_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_no_update ON public.admin_audit;
CREATE TRIGGER admin_audit_no_update
  BEFORE UPDATE OR DELETE ON public.admin_audit
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_append_only();
