-- Admin-only DimaAI +18 / NSFW flag (never exposed to non-admins in API).
ALTER TABLE public.dimaai_user_settings
  ADD COLUMN IF NOT EXISTS nsfw_enabled BOOLEAN NOT NULL DEFAULT FALSE;
