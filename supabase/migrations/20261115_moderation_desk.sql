-- Moderasyon "İşlem masası" (admin remake, owner-approved Draft A, Nov 2026).
-- Five tables, all written and read only by the backend with the service role:
-- RLS on, no policies, no anon / authenticated grants. Additive, safe to re-run.
-- Until it is applied the page still works: templates, rules and the word
-- filter fall back to the built-in list and the legacy system_settings words,
-- the flagged queue shows only open user reports, and writes answer 503
-- MODERATION_DESK_UNAVAILABLE.

-- Hazır şablonlar: one click fills action, duration, category and the note.
-- The four suggested templates and one suggested escalation rule are added on
-- the first read of an empty table; deleting sets archived_at (never re-seeded).
CREATE TABLE IF NOT EXISTS public.moderation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 60), -- '' = shown as "category · duration" in the admin's language
  action text NOT NULL CHECK (action IN ('timeout', 'kick', 'ban')),
  category text NOT NULL,
  preset_id text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  message text CHECK (message IS NULL OR char_length(message) <= 500),
  use_count integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderation_templates_use
  ON public.moderation_templates (use_count DESC, created_at);

-- Kademe kuralları (auto-escalation): the n-th sanction for one of the rule's
-- categories inside the window maps to steps[n-1] (the last step repeats).
-- steps = [{"kind": "warn" | "timeout" | "kick" | "ban", "seconds": int | null}]
CREATE TABLE IF NOT EXISTS public.moderation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 80), -- '' = the suggested rule, named in the admin's language
  enabled boolean NOT NULL DEFAULT true,
  categories text[] NOT NULL DEFAULT '{}',
  window_days integer NOT NULL DEFAULT 30 CHECK (window_days BETWEEN 1 AND 365),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ban_suggest_only boolean NOT NULL DEFAULT true,
  discount_early_lift boolean NOT NULL DEFAULT true,
  trigger_count integer NOT NULL DEFAULT 0,
  recent_triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  archived_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Kelime filtresi: built-in words (source 'default'), words from the old
-- system_settings list (source 'legacy', copied on first read) and new admin
-- rules (source 'admin'). removed_at hides a rule without losing its counters.
CREATE TABLE IF NOT EXISTS public.profanity_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL CHECK (char_length(pattern) BETWEEN 1 AND 160),
  kind text NOT NULL CHECK (kind IN ('word', 'prefix', 'regex')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  language text NOT NULL DEFAULT 'all',
  action text NOT NULL DEFAULT 'mask' CHECK (action IN ('mask', 'mask_flag', 'block', 'block_flag', 'block_timeout')),
  timeout_seconds integer CHECK (timeout_seconds IS NULL OR timeout_seconds >= 60),
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('default', 'legacy', 'admin')),
  hits_total integer NOT NULL DEFAULT 0,
  removed_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_profanity_rules_pattern_kind
  ON public.profanity_rules (pattern, kind);

-- One row per filter match (7-day sparks, blocked count, busiest channel).
CREATE TABLE IF NOT EXISTS public.profanity_rule_hits (
  id bigserial PRIMARY KEY,
  rule_id uuid REFERENCES public.profanity_rules(id) ON DELETE CASCADE,
  where_label text,
  blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profanity_rule_hits_created
  ON public.profanity_rule_hits (created_at DESC);

-- İşaretli mesajlar: filter matches, admin flags and user reports waiting for a
-- decision (they used to live only in memory, state.flaggedMessages).
CREATE TABLE IF NOT EXISTS public.flagged_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('filter', 'admin', 'user_report')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'removed', 'sanctioned')),
  conv_type text NOT NULL DEFAULT 'server' CHECK (conv_type IN ('server', 'dm', 'group', 'general')),
  message_id text,
  server_id uuid,
  channel_id uuid,
  group_id uuid,
  peer_id uuid,
  where_label text,
  author_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  content text,
  severity text CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high')),
  rule_kind text,
  category text,
  reason text,
  blocked boolean NOT NULL DEFAULT false,
  report_id uuid,
  decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flagged_messages_status_created
  ON public.flagged_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flagged_messages_author
  ON public.flagged_messages (author_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_flagged_messages_report
  ON public.flagged_messages (report_id) WHERE report_id IS NOT NULL;

ALTER TABLE public.moderation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profanity_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profanity_rule_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flagged_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moderation_templates, public.moderation_rules, public.profanity_rules,
  public.profanity_rule_hits, public.flagged_messages FROM anon, authenticated;
GRANT ALL ON TABLE public.moderation_templates, public.moderation_rules, public.profanity_rules,
  public.profanity_rule_hits, public.flagged_messages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.profanity_rule_hits_id_seq TO service_role;
