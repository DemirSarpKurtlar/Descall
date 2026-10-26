-- Settings › Görünüm on the account (Descall 3.0.0). ADDITIVE ONLY: one new
-- table. No existing table is altered, nothing is dropped or rewritten.
-- Written only by the backend (service role) via GET/PUT /api/me/appearance.

CREATE TABLE IF NOT EXISTS public.user_appearance_settings (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  settings   jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object' AND pg_column_size(settings) < 2048),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_appearance_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_appearance_settings FROM anon, authenticated;
