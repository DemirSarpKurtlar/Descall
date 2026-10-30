-- Rapor iş akışı (3.4.0, owner list 3.6: "rapor iş akışı, atama ve notlar").
-- A reported account's open reports can be assigned to one admin (the one who
-- works the case), and admins leave a timeline of notes on the account
-- (notes, assignment changes, decisions). Backend-only (service role); RLS on,
-- no anon / authenticated grants. Additive, safe to re-run.
ALTER TABLE public.user_reports
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_user_reports_assignee_status
  ON public.user_reports (assignee_id, status) WHERE assignee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.user_report_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.user_reports(id) ON DELETE SET NULL,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_username text,
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'assign', 'unassign', 'resolve')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_report_notes_target_created
  ON public.user_report_notes (target_id, created_at DESC);

ALTER TABLE public.user_report_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_report_notes FROM anon, authenticated;
GRANT ALL ON TABLE public.user_report_notes TO service_role;
