-- Growth phase 2, draft 2A "Başla panosu" (first five minutes, 27 Nov 2026).
--
-- For an account's first five days the Chats tab home is a "Başla" dashboard: interests,
-- live suggested servers, a preview before joining, "Katıl ve gönder", the official
-- community server, the Rehber greeting, a 5-day checklist with DesCoin rewards and the
-- "İlk Selam" badge for the first real message. Backend: frontend/backend/lib/onboarding/,
-- routes/onboarding.js; admin numbers: routes/adminGrowth.js (GET /growth/onboarding).
--
-- Additive and idempotent: new tables, one settings row and one badge catalog row. Nothing
-- existing is changed. Every table is service-role only (RLS on, no policies).

-- 1) One row per account that has seen the dashboard (created lazily by the API).
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id             uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  interests           text[] NOT NULL DEFAULT '{}'::text[],
  interests_at        timestamptz,
  opened_at           timestamptz,
  hidden_at           timestamptz,
  community_server_id uuid,
  community_joined_at timestamptz,
  community_left_at   timestamptz,
  rehber_greeted_at   timestamptz,
  -- The join the dashboard started last ({ serverId, slot, interest }): which card or chip
  -- led to the first message (admin "Büyüme" numbers).
  last_join           jsonb,
  -- A first message waiting out its undo window ({ kind, serverId, channelId, messageId, peerId, at }).
  first_hello_pending jsonb,
  first_hello_at      timestamptz,
  first_hello_ref     jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_onboarding_interests_len CHECK (cardinality(interests) <= 12)
);
CREATE INDEX IF NOT EXISTS user_onboarding_created ON public.user_onboarding (created_at DESC);
CREATE INDEX IF NOT EXISTS user_onboarding_first_hello ON public.user_onboarding (first_hello_at DESC)
  WHERE first_hello_at IS NOT NULL;

-- 2) Checklist rewards: one row per (account, step). The primary key is the idempotency
--    guard: a second claim of the same step fails with 23505 and pays nothing.
CREATE TABLE IF NOT EXISTS public.onboarding_rewards (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  step       text NOT NULL CHECK (step IN ('interests', 'join', 'first_message', 'voice', 'friend')),
  amount     integer NOT NULL DEFAULT 0 CHECK (amount >= 0 AND amount <= 100),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, step)
);
CREATE INDEX IF NOT EXISTS onboarding_rewards_claimed ON public.onboarding_rewards (claimed_at DESC);

-- 3) Settings (one row): which server is the official "Descall Topluluk", and switches.
CREATE TABLE IF NOT EXISTS public.onboarding_settings (
  id                  text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  enabled             boolean NOT NULL DEFAULT true,
  community_server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  auto_join           boolean NOT NULL DEFAULT true,
  rehber_enabled      boolean NOT NULL DEFAULT true,
  rewards_enabled     boolean NOT NULL DEFAULT true,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL
);
INSERT INTO public.onboarding_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_onboarding, public.onboarding_rewards, public.onboarding_settings FROM anon, authenticated;

-- 4) Special badge #38 "İlk Selam": the first real message to another person. Admin-only
--    grant mode so no promo code can carry it; the server grants it (source 'admin', no actor).
INSERT INTO public.special_badges (id, no, name, tier, description, grant_mode, max_holders) VALUES
  ('ilkselam', 38, 'İlk Selam', 'nadir', 'Descall''daki ilk mesajını gerçek biriyle paylaşanlar.', 'admin_only', NULL)
ON CONFLICT (id) DO UPDATE SET
  no = EXCLUDED.no, name = EXCLUDED.name, tier = EXCLUDED.tier, description = EXCLUDED.description,
  grant_mode = EXCLUDED.grant_mode, max_holders = EXCLUDED.max_holders;
