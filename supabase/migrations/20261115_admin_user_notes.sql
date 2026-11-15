-- Kullanıcı dosyası (admin user file remake, Nov 2026): private admin notes on
-- an account ("Yönetici notları"). Only the backend reads and writes them with
-- the service role: RLS on, no policies, no anon / authenticated grants.
-- Admins delete only their own notes (checked in lib/userDossierSections.js).
-- Additive, safe to re-run. Until it is applied the notes card shows
-- "not set up yet" and POST answers 503 NOTES_UNAVAILABLE.
CREATE TABLE IF NOT EXISTS public.admin_user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_username text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_user_notes_user_created
  ON public.admin_user_notes (user_id, created_at DESC);

ALTER TABLE public.admin_user_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_user_notes FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_user_notes TO service_role;
