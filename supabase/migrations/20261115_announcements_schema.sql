-- Duyurular (admin remake, owner-approved Drafts C + A, Nov 2026).
-- Additive only, safe to re-run. Written and read by the backend with the
-- service role; new tables have RLS on and no policies (no anon / authenticated
-- access). Until this is applied the old announcements keep working: the
-- backend reads only the legacy columns, the board shows Yayında / Bitti, and
-- the new writes (drafts, scheduling, translations, templates, versions,
-- engagement) answer 503 ANNOUNCEMENTS_SCHEMA_MISSING.

-- 1) announcements: lifecycle, translations, audience, CTA, cover, schedule.
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS status text,                       -- draft | pending | scheduled | live | ended | archived (NULL = legacy: is_active ? live : ended)
  ADD COLUMN IF NOT EXISTS icon text,                         -- key of the line icon set (lib/announcements/model.js ICONS); NULL = derived from the legacy emoji
  ADD COLUMN IF NOT EXISTS source_lang text NOT NULL DEFAULT 'tr',
  ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb, -- { "<lang>": { title, content, cta_label, state: ready|auto|stale, by, at } }
  ADD COLUMN IF NOT EXISTS cta_label text,
  ADD COLUMN IF NOT EXISTS cta_url text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS audience jsonb NOT NULL DEFAULT '{}'::jsonb,    -- { premium: member|non_member|null, langs: [], platforms: [], newDays: int|null }
  ADD COLUMN IF NOT EXISTS audience_size integer,             -- people the audience matched when it went live (funnel "Hedef kitle")
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,             -- scheduled publish time
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,               -- expiry: hidden automatically after this
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS pin_order integer,                 -- order inside the pinned strip (1 = first)
  ADD COLUMN IF NOT EXISTS live_notify boolean NOT NULL DEFAULT true,  -- push to open sessions (in-app toast for important / urgent)
  ADD COLUMN IF NOT EXISTS push boolean NOT NULL DEFAULT false,        -- phone notification on publish
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_name text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name text;

CREATE INDEX IF NOT EXISTS idx_announcements_status ON public.announcements (status);
CREATE INDEX IF NOT EXISTS idx_announcements_starts_at ON public.announcements (starts_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_announcements_ends_at ON public.announcements (ends_at) WHERE status = 'live';

-- 2) announcement_reads: one row per person and announcement, used only for
-- counts (delivered, seen, read, button click) and the platform / language split.
-- Existing rows (the old "opened the window" marks) count as delivered + read.
ALTER TABLE public.announcement_reads
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS lang text;
CREATE INDEX IF NOT EXISTS idx_announcement_reads_ann_seen ON public.announcement_reads (announcement_id, seen_at);

-- 3) Edit history: the state before each saved change ("Sürüm geçmişi").
CREATE TABLE IF NOT EXISTS public.announcement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  change text,                                               -- created | edited | restored | translated | audience | schedule | extended
  edited_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  edited_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcement_versions_ann ON public.announcement_versions (announcement_id, version DESC);
ALTER TABLE public.announcement_versions ENABLE ROW LEVEL SECURITY;

-- 4) Admin templates ("Şablonlarım"). Built-in templates live in code.
CREATE TABLE IF NOT EXISTS public.announcement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  category text NOT NULL DEFAULT 'custom',
  icon text,
  color text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  source_lang text NOT NULL DEFAULT 'tr',
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  cta_label text,
  cta_url text,
  translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  from_announcement_id uuid REFERENCES public.announcements(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcement_templates_live ON public.announcement_templates (created_at DESC) WHERE deleted_at IS NULL;
ALTER TABLE public.announcement_templates ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.announcement_versions TO service_role;
GRANT ALL ON public.announcement_templates TO service_role;
GRANT ALL ON public.announcements TO service_role;
GRANT ALL ON public.announcement_reads TO service_role;
