-- Yönetici Paneli › Canlı popup (remake, owner-approved Draft B "Kontrol merkezi", Nov 2026).
-- Durable history and schedule of live popups (popup_campaigns), one receipt
-- row per recipient (popup_receipts: delivered / seen / clicked / acknowledged /
-- dismissed / missed, shown again on next login), saved templates
-- (popup_templates) and people kept out of future info-tone popups
-- (popup_exemptions). Only the backend reads and writes them with the service
-- role: RLS on, no policies, no anon / authenticated grants.
-- Additive, safe to re-run. Until it is applied the page keeps working from
-- memory (history and schedule are lost on restart, templates cannot be saved).

CREATE TABLE IF NOT EXISTS public.popup_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'live'
    CHECK (status IN ('scheduled', 'live', 'ended', 'recalled', 'canceled')),
  kind text NOT NULL DEFAULT 'standard'
    CHECK (kind IN ('standard', 'resolved', 'edited', 'single')),
  parent_id uuid REFERENCES public.popup_campaigns(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 800),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'urgent')),
  icon text NOT NULL DEFAULT 'megaphone',
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms BETWEEN 0 AND 120000),
  require_ack boolean NOT NULL DEFAULT false,
  auto_resolve boolean NOT NULL DEFAULT false,
  cta_label text,
  cta_url text,
  audience jsonb NOT NULL DEFAULT '{"rules": []}'::jsonb,
  include_self boolean NOT NULL DEFAULT false,
  template_id text,
  note text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  sent_at timestamptz,
  expires_at timestamptz,
  ended_at timestamptz,
  recalled_at timestamptz,
  recall_mode text,
  recall_reason text,
  recalled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_popup_campaigns_status_sched
  ON public.popup_campaigns (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_popup_campaigns_sent
  ON public.popup_campaigns (sent_at DESC);

CREATE TABLE IF NOT EXISTS public.popup_receipts (
  campaign_id uuid NOT NULL REFERENCES public.popup_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  username text,
  platform text,
  language text,
  delivered_at timestamptz,
  seen_at timestamptz,
  clicked_at timestamptz,
  acked_at timestamptz,
  dismissed_at timestamptz,
  missed_at timestamptz,
  missed_reason text,
  closed_at timestamptz,
  pending_login boolean NOT NULL DEFAULT false,
  resend_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_popup_receipts_user
  ON public.popup_receipts (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_popup_receipts_pending
  ON public.popup_receipts (user_id) WHERE pending_login;

CREATE TABLE IF NOT EXISTS public.popup_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 800),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'urgent')),
  icon text NOT NULL DEFAULT 'megaphone',
  duration_ms integer NOT NULL DEFAULT 0,
  require_ack boolean NOT NULL DEFAULT false,
  auto_resolve boolean NOT NULL DEFAULT false,
  cta_label text,
  cta_url text,
  audience jsonb NOT NULL DEFAULT '{"rules": []}'::jsonb,
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.popup_exemptions (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_username text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.popup_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popup_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popup_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popup_exemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.popup_campaigns FROM anon, authenticated;
REVOKE ALL ON TABLE public.popup_receipts FROM anon, authenticated;
REVOKE ALL ON TABLE public.popup_templates FROM anon, authenticated;
REVOKE ALL ON TABLE public.popup_exemptions FROM anon, authenticated;
GRANT ALL ON TABLE public.popup_campaigns TO service_role;
GRANT ALL ON TABLE public.popup_receipts TO service_role;
GRANT ALL ON TABLE public.popup_templates TO service_role;
GRANT ALL ON TABLE public.popup_exemptions TO service_role;
