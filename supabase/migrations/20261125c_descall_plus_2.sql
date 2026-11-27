-- Descall+ 2.0 "Sunucu ve Hediye" (owner pick 5B, 27 Nov 2026). ADDITIVE ONLY: new tables, new
-- columns (nullable or with defaults), new indexes and new functions. Nothing is dropped, renamed or
-- rewritten; the phase 1 tables (20261106_premium_memberships.sql) keep every row and constraint, so
-- current members and manual admin grants keep working exactly as before.
--
-- What it adds:
--   * premium_offer_config (+ history): admin-configurable prices per platform, trial, tickets,
--     boost levels, tier limits and the per-platform "selling is on" flags (default OFF).
--   * server_boosts, server_plus_settings, server_boost_thanks: server boosts (Descall+ 2, Ultra 5),
--     levels, the owner's boost goal, the thank-you wall.
--   * premium_gifts, premium_group_gifts(+shares): gifts with scheduled delivery, live tracking,
--     recall, return after 30 days, and group gifts ("ortak hediye").
--   * premium_trial_tickets: 2 three-day trial tickets a month per member, plus streak tickets.
--   * premium_paywall_events: every paywall moment (shown / clicked / dismissed / converted), the
--     daily reminder budget reads it.
--   * premium_checkouts, payment_webhook_events, premium_refund_requests, premium_cancellations:
--     provider-agnostic payments (Apple, Paddle, iyzico, RevenueCat). Only verified webhooks write.
--   * premium_plus_apply(): the one function every payment / gift / trial change goes through
--     (advisory lock per user, one subscription_events row per change, idempotent by request id).
-- Every write function is SECURITY DEFINER and only service_role may execute it.

-- 1) Columns on the phase 1 tables (all optional; older code ignores them).
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS origin text
  CHECK (origin IS NULL OR origin IN ('admin', 'campaign', 'web', 'store', 'gift', 'trial', 'ticket'));
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS provider text
  CHECK (provider IS NULL OR provider IN ('apple', 'google', 'paddle', 'iyzico', 'revenuecat', 'internal'));
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS platform text
  CHECK (platform IS NULL OR platform IN ('web', 'desktop', 'ios', 'android'));
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS period text
  CHECK (period IS NULL OR period IN ('monthly', 'yearly'));
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS cancel_reason text
  CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 200);
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS provider_sub_ref text
  CHECK (provider_sub_ref IS NULL OR char_length(provider_sub_ref) <= 200);
CREATE INDEX IF NOT EXISTS user_subscriptions_provider_ref_idx
  ON public.user_subscriptions (provider, provider_sub_ref) WHERE provider_sub_ref IS NOT NULL;

ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS product text
  CHECK (product IS NULL OR char_length(product) <= 80);
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS platform text
  CHECK (platform IS NULL OR platform IN ('web', 'desktop', 'ios', 'android'));
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS period text
  CHECK (period IS NULL OR period IN ('monthly', 'yearly', 'once'));
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS gift_id uuid;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS checkout_id uuid;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS refund_of uuid;
CREATE INDEX IF NOT EXISTS payment_transactions_user_idx ON public.payment_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_created_idx ON public.payment_transactions (created_at DESC);

-- 2) Offer configuration (one row; the backend merges it over its built-in defaults).
CREATE TABLE IF NOT EXISTS public.premium_offer_config (
  id         text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  config     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  version    integer NOT NULL DEFAULT 1,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.premium_offer_config_history (
  id         bigserial PRIMARY KEY,
  version    integer NOT NULL,
  config     jsonb NOT NULL,
  changed    text[] NOT NULL DEFAULT '{}',
  actor_id   uuid,
  note       text CHECK (note IS NULL OR char_length(note) <= 500),
  undo_of    bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS premium_offer_config_history_created_idx ON public.premium_offer_config_history (created_at DESC);

-- 3) Server boosts.
CREATE TABLE IF NOT EXISTS public.server_boosts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  server_id      uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'moving', 'grace', 'removed')),
  move_to        uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  move_at        timestamptz,
  moved_at       timestamptz,
  grace_until    timestamptz,
  removed_at     timestamptz,
  removed_reason text CHECK (removed_reason IS NULL OR removed_reason IN ('membership_ended', 'over_capacity', 'left_server', 'admin', 'server_deleted')),
  show_on_wall   boolean NOT NULL DEFAULT true,
  request_id     text CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 8 AND 100),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS server_boosts_request_uq ON public.server_boosts (user_id, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS server_boosts_server_idx ON public.server_boosts (server_id) WHERE status <> 'removed';
CREATE INDEX IF NOT EXISTS server_boosts_user_idx ON public.server_boosts (user_id) WHERE status <> 'removed';
CREATE INDEX IF NOT EXISTS server_boosts_move_idx ON public.server_boosts (move_at) WHERE status = 'moving';
CREATE INDEX IF NOT EXISTS server_boosts_grace_idx ON public.server_boosts (grace_until) WHERE status = 'grace';

CREATE TABLE IF NOT EXISTS public.server_plus_settings (
  server_id            uuid PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  goal_level           smallint CHECK (goal_level IS NULL OR goal_level BETWEEN 1 AND 3),
  goal_due             date,
  goal_show            boolean NOT NULL DEFAULT true,
  show_boosters_group  boolean NOT NULL DEFAULT true,
  thank_wall           boolean NOT NULL DEFAULT true,
  announced_level      smallint NOT NULL DEFAULT 0,
  goal_reached_at      timestamptz,
  updated_by           uuid,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.server_boost_thanks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id  uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  from_user  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user    uuid REFERENCES public.users(id) ON DELETE CASCADE,
  message    text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_boost_thanks_server_idx ON public.server_boost_thanks (server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS server_boost_thanks_to_idx ON public.server_boost_thanks (to_user, created_at DESC);

-- 4) Gifts.
CREATE TABLE IF NOT EXISTS public.premium_gifts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  recipient_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan              text NOT NULL REFERENCES public.premium_plans(id),
  months            smallint NOT NULL CHECK (months IN (1, 3, 12)),
  note              text CHECK (note IS NULL OR char_length(note) <= 200),
  deliver_at        timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN
                      ('awaiting_payment', 'scheduled', 'delivered', 'opened', 'recalled', 'returned', 'refunded', 'cancelled')),
  platform          text CHECK (platform IS NULL OR platform IN ('web', 'desktop', 'ios', 'android')),
  provider          text,
  order_ref         text CHECK (order_ref IS NULL OR char_length(order_ref) <= 200),
  amount_minor      integer CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency          text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  group_id          uuid,
  paid_at           timestamptz,
  delivered_at      timestamptz,
  opened_at         timestamptz,
  boosts_given_at   timestamptz,
  recalled_at       timestamptz,
  returned_at       timestamptz,
  converted_at      timestamptz,
  ask_id            uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS premium_gifts_sender_idx ON public.premium_gifts (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS premium_gifts_recipient_idx ON public.premium_gifts (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS premium_gifts_due_idx ON public.premium_gifts (deliver_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS premium_gifts_unopened_idx ON public.premium_gifts (delivered_at) WHERE status = 'delivered';

CREATE TABLE IF NOT EXISTS public.premium_group_gifts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan          text NOT NULL REFERENCES public.premium_plans(id),
  months        smallint NOT NULL DEFAULT 12 CHECK (months IN (3, 12)),
  shares        smallint NOT NULL CHECK (shares BETWEEN 2 AND 4),
  share_minor   integer NOT NULL CHECK (share_minor >= 0),
  currency      text NOT NULL DEFAULT 'TRY' CHECK (currency ~ '^[A-Z]{3}$'),
  note          text CHECK (note IS NULL OR char_length(note) <= 200),
  deliver_at    timestamptz,
  status        text NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting', 'complete', 'cancelled', 'expired')),
  expires_at    timestamptz NOT NULL,
  gift_id       uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS premium_group_gifts_org_idx ON public.premium_group_gifts (organizer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS premium_group_gifts_open_idx ON public.premium_group_gifts (expires_at) WHERE status = 'collecting';

CREATE TABLE IF NOT EXISTS public.premium_group_gift_shares (
  group_id   uuid NOT NULL REFERENCES public.premium_group_gifts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded')),
  order_ref  text,
  paid_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- 5) Trial tickets (Descall+ / Ultra members get 2 a month; a 30-day streak gives one more).
CREATE TABLE IF NOT EXISTS public.premium_trial_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source       text NOT NULL CHECK (source IN ('monthly', 'streak', 'admin')),
  period       text NOT NULL CHECK (char_length(period) BETWEEN 1 AND 80),
  seq          smallint NOT NULL DEFAULT 1 CHECK (seq BETWEEN 1 AND 10),
  status       text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sent', 'redeemed', 'expired', 'revoked')),
  sent_to      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sent_at      timestamptz,
  redeemed_by  uuid,
  redeemed_at  timestamptz,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, source, period, seq)
);
CREATE INDEX IF NOT EXISTS premium_trial_tickets_owner_idx ON public.premium_trial_tickets (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS premium_trial_tickets_sent_idx ON public.premium_trial_tickets (sent_to) WHERE status = 'sent';

-- 6) Paywall moments (funnel + daily reminder budget), gift asks, small per-user prefs.
CREATE TABLE IF NOT EXISTS public.premium_paywall_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL,
  moment     text NOT NULL CHECK (moment ~ '^[a-z][a-z0-9_]{1,40}$'),
  action     text NOT NULL CHECK (action IN ('shown', 'compact', 'clicked', 'dismissed', 'trial_started',
               'gift_requested', 'first_frame', 'checkout', 'converted', 'suppressed', 'ceiling_exceeded')),
  platform   text CHECK (platform IS NULL OR platform IN ('web', 'desktop', 'ios', 'android')),
  server_id  uuid,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS premium_paywall_events_user_idx ON public.premium_paywall_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS premium_paywall_events_moment_idx ON public.premium_paywall_events (moment, action, created_at DESC);

CREATE TABLE IF NOT EXISTS public.premium_gift_asks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind         text NOT NULL DEFAULT 'animated_profile' CHECK (kind ~ '^[a-z][a-z0-9_]{1,40}$'),
  seen_at      timestamptz,
  dismissed_at timestamptz,
  gift_id      uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS premium_gift_asks_from_idx ON public.premium_gift_asks (from_user, created_at DESC);
CREATE INDEX IF NOT EXISTS premium_gift_asks_to_idx ON public.premium_gift_asks (to_user, created_at DESC);

CREATE TABLE IF NOT EXISTS public.premium_user_prefs (
  user_id          uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  gift_asks_off    boolean NOT NULL DEFAULT false,
  wishlist         boolean NOT NULL DEFAULT false,
  wishlist_at      timestamptz,
  gif_note_seen_at timestamptz,
  hide_on_walls    boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 7) Payments (provider agnostic). Only verified webhooks and the store verify endpoint write.
CREATE TABLE IF NOT EXISTS public.premium_checkouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('self', 'gift', 'group_share')),
  plan         text NOT NULL REFERENCES public.premium_plans(id),
  period       text CHECK (period IS NULL OR period IN ('monthly', 'yearly')),
  months       smallint CHECK (months IS NULL OR months IN (1, 3, 12)),
  trial        boolean NOT NULL DEFAULT false,
  platform     text NOT NULL CHECK (platform IN ('web', 'desktop', 'ios', 'android')),
  provider     text NOT NULL CHECK (provider IN ('apple', 'google', 'paddle', 'iyzico', 'revenuecat')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency     text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  gift_id      uuid,
  group_id     uuid,
  source       text CHECK (source IS NULL OR source ~ '^[a-z][a-z0-9_]{1,40}$'),
  status       text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'paid', 'failed', 'expired', 'cancelled')),
  provider_ref text CHECK (provider_ref IS NULL OR char_length(provider_ref) <= 200),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '2 hours'
);
CREATE INDEX IF NOT EXISTS premium_checkouts_user_idx ON public.premium_checkouts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 40),
  event_id     text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 200),
  event_type   text CHECK (event_type IS NULL OR char_length(event_type) <= 120),
  status       text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  error        text CHECK (error IS NULL OR char_length(error) <= 500),
  user_id      uuid,
  summary      jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS payment_webhook_events_received_idx ON public.payment_webhook_events (received_at DESC);

CREATE TABLE IF NOT EXISTS public.premium_refund_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  transaction_id uuid,
  amount_minor   integer CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency       text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  reason         text CHECK (reason IS NULL OR char_length(reason) <= 500),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by     uuid,
  decided_at     timestamptz,
  decision_note  text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS premium_refund_requests_status_idx ON public.premium_refund_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.premium_cancellations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason       text NOT NULL CHECK (reason ~ '^[a-z][a-z0-9_]{1,40}$'),
  note         text CHECK (note IS NULL OR char_length(note) <= 500),
  effective_at timestamptz,
  undone_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS premium_cancellations_created_idx ON public.premium_cancellations (created_at DESC);

-- 8) Security: RLS on, no client access; the backend uses the service role.
ALTER TABLE public.premium_offer_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_offer_config_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_plus_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_boost_thanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_group_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_group_gift_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_trial_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_paywall_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_gift_asks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_user_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.premium_offer_config, public.premium_offer_config_history, public.server_boosts,
  public.server_plus_settings, public.server_boost_thanks, public.premium_gifts, public.premium_group_gifts,
  public.premium_group_gift_shares, public.premium_trial_tickets, public.premium_paywall_events,
  public.premium_gift_asks, public.premium_user_prefs, public.premium_checkouts, public.payment_webhook_events,
  public.premium_refund_requests, public.premium_cancellations FROM anon, authenticated;

-- 9) Extended "me" (status, trial, renewal, origin) for /api/plus/me.
CREATE OR REPLACE FUNCTION public.premium_plus_me(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'plan', CASE WHEN s.status = 'active' AND (s.unlimited OR s.ends_at > now()) THEN s.plan_id END,
    'last_plan', s.plan_id,
    'active', coalesce(s.status = 'active' AND (s.unlimited OR s.ends_at > now()), false),
    'ends_at', s.ends_at,
    'unlimited', coalesce(s.unlimited, false),
    'started_at', s.started_at,
    'source', s.source,
    'origin', s.origin,
    'provider', s.provider,
    'platform', s.platform,
    'period', s.period,
    'auto_renew', coalesce(s.auto_renew, false),
    'cancel_at_period_end', coalesce(s.cancel_at_period_end, false),
    'trial_ends_at', CASE WHEN s.trial_ends_at > now() THEN s.trial_ends_at END,
    'is_free', s.is_free,
    'trial_used', EXISTS (SELECT 1 FROM public.subscription_events e WHERE e.user_id = w.want AND e.kind = 'trial'),
    'ever_paid', EXISTS (SELECT 1 FROM public.subscription_events e WHERE e.user_id = w.want AND e.actor_kind = 'payment')
  )
  FROM (SELECT p_user AS want) w
  LEFT JOIN public.user_subscriptions s ON s.user_id = w.want;
$$;

-- 10) The one membership writer for payments, gifts and trials.
--   p_op: purchase   grant, or extend / upgrade an active membership (never shortens it, never
--                    touches an unlimited admin grant except for a plan upgrade)
--         renew      same as purchase (store renewals)
--         trial      3-day trial: once per account (subscription_events_one_trial_uq), never on top
--                    of an active membership; pays no DesCoin gift unless it converts
--         cancel_at_end  auto-renew off (the membership runs to its end)
--         resume     auto-renew back on
--         revoke     refund / chargeback: ends now
--   p_ends_at: the provider's period end, when it knows it (stores); else now/end + p_days.
CREATE OR REPLACE FUNCTION public.premium_plus_apply(
  p_user uuid, p_op text, p_plan text, p_days integer, p_ends_at timestamptz,
  p_origin text, p_provider text, p_platform text, p_period text, p_auto_renew boolean,
  p_request_id text, p_meta jsonb DEFAULT '{}'::jsonb, p_provider_sub_ref text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_req text := nullif(btrim(coalesce(p_request_id, '')), '');
  v_prev public.user_subscriptions;
  v_had boolean;
  v_active boolean;
  v_plan public.premium_plans;
  v_row public.user_subscriptions;
  v_event public.subscription_events;
  v_new_end timestamptz;
  v_kind text;
  v_rank_new integer;
  v_rank_old integer;
  v_is_free boolean := p_origin IN ('trial', 'ticket');
  v_source text := CASE WHEN p_origin = 'ticket' THEN 'campaign' ELSE 'payment' END;
  v_actor text := CASE WHEN p_origin = 'ticket' THEN 'system' ELSE 'payment' END;
  v_coins integer := 0;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'user_not_found'); END IF;
  IF p_op IS NULL OR p_op NOT IN ('purchase', 'renew', 'trial', 'cancel_at_end', 'resume', 'revoke') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_op');
  END IF;
  IF v_req IS NULL OR v_req !~ '^[A-Za-z0-9:_.-]{8,100}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request_id');
  END IF;
  IF p_origin IS NULL OR p_origin NOT IN ('web', 'store', 'gift', 'trial', 'ticket') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_origin');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('premium:user:' || p_user::text));

  SELECT * INTO v_event FROM public.subscription_events WHERE request_id = v_req AND user_id = p_user;
  IF FOUND THEN
    SELECT * INTO v_row FROM public.user_subscriptions WHERE user_id = p_user;
    RETURN jsonb_build_object('ok', true, 'replay', true, 'subscription', public.premium_sub_json(v_row),
      'event', public.premium_event_json(v_event));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  PERFORM public.premium_pay_cycles(p_user);
  SELECT * INTO v_prev FROM public.user_subscriptions WHERE user_id = p_user FOR UPDATE;
  v_had := FOUND;
  v_active := v_had AND v_prev.status = 'active' AND (v_prev.unlimited OR v_prev.ends_at > now());

  IF p_op IN ('purchase', 'renew', 'trial') THEN
    SELECT * INTO v_plan FROM public.premium_plans WHERE id = p_plan;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_plan'); END IF;
    IF v_plan.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'plan_archived'); END IF;
    IF p_ends_at IS NULL AND (p_days IS NULL OR p_days < 1 OR p_days > 3660) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
    END IF;
    IF p_ends_at IS NOT NULL AND (p_ends_at <= now() OR p_ends_at > now() + interval '20 years') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_end');
    END IF;
  END IF;

  IF p_op = 'trial' THEN
    IF v_active THEN RETURN jsonb_build_object('ok', false, 'error', 'already_active'); END IF;
    IF EXISTS (SELECT 1 FROM public.subscription_events WHERE user_id = p_user AND kind = 'trial') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'trial_used');
    END IF;
    v_new_end := coalesce(p_ends_at, now() + make_interval(days => p_days));
    INSERT INTO public.user_subscriptions AS t (user_id, plan_id, status, started_at, ends_at, unlimited, is_free,
      source, next_coin_at, coin_cycles_paid, trial_ends_at, origin, provider, platform, period, auto_renew,
      cancel_at_period_end, provider_sub_ref, created_at, updated_at)
    VALUES (p_user, v_plan.id, 'active', now(), v_new_end, false, v_is_free, v_source,
      v_new_end, 0, v_new_end, p_origin, p_provider, p_platform, p_period, coalesce(p_auto_renew, false),
      false, p_provider_sub_ref, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', started_at = now(),
      ends_at = EXCLUDED.ends_at, unlimited = false, is_free = EXCLUDED.is_free, source = EXCLUDED.source,
      next_coin_at = EXCLUDED.next_coin_at, coin_cycles_paid = 0, trial_ends_at = EXCLUDED.trial_ends_at,
      origin = EXCLUDED.origin, provider = EXCLUDED.provider, platform = EXCLUDED.platform, period = EXCLUDED.period,
      auto_renew = EXCLUDED.auto_renew, cancel_at_period_end = false, cancel_reason = NULL,
      provider_sub_ref = EXCLUDED.provider_sub_ref, updated_at = now()
    RETURNING * INTO v_row;
    v_kind := 'trial';
  ELSIF p_op IN ('purchase', 'renew') THEN
    IF NOT v_active THEN
      v_new_end := coalesce(p_ends_at, now() + make_interval(days => p_days));
      INSERT INTO public.user_subscriptions AS t (user_id, plan_id, status, started_at, ends_at, unlimited, is_free,
        source, next_coin_at, coin_cycles_paid, origin, provider, platform, period, auto_renew,
        cancel_at_period_end, provider_sub_ref, created_at, updated_at)
      VALUES (p_user, v_plan.id, 'active', now(), v_new_end, false, false, v_source, now(), 0,
        p_origin, p_provider, p_platform, p_period, coalesce(p_auto_renew, false), false, p_provider_sub_ref, now(), now())
      ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', started_at = now(),
        ends_at = EXCLUDED.ends_at, unlimited = false, is_free = false, source = EXCLUDED.source,
        next_coin_at = now(), coin_cycles_paid = 0, trial_ends_at = NULL, origin = EXCLUDED.origin,
        provider = EXCLUDED.provider, platform = EXCLUDED.platform, period = EXCLUDED.period,
        auto_renew = EXCLUDED.auto_renew, cancel_at_period_end = false, cancel_reason = NULL,
        provider_sub_ref = EXCLUDED.provider_sub_ref, updated_at = now()
      RETURNING * INTO v_row;
      v_kind := 'grant';
    ELSE
      v_rank_new := CASE v_plan.id WHEN 'ultra' THEN 2 WHEN 'plus' THEN 1 ELSE 0 END;
      v_rank_old := CASE v_prev.plan_id WHEN 'ultra' THEN 2 WHEN 'plus' THEN 1 ELSE 0 END;
      IF v_prev.unlimited THEN
        v_new_end := NULL;
      ELSIF p_ends_at IS NOT NULL THEN
        v_new_end := greatest(v_prev.ends_at, p_ends_at);
      ELSE
        v_new_end := v_prev.ends_at + make_interval(days => p_days);
      END IF;
      UPDATE public.user_subscriptions SET
        plan_id = CASE WHEN v_rank_new > v_rank_old THEN v_plan.id ELSE plan_id END,
        ends_at = v_new_end,
        is_free = CASE WHEN v_prev.unlimited THEN is_free ELSE false END,
        source = CASE WHEN v_prev.source IN ('admin', 'campaign') AND coalesce(v_prev.origin, '') NOT IN ('ticket', 'trial')
                      THEN source ELSE v_source END,
        -- a converted trial starts paying the monthly DesCoin gift now
        next_coin_at = CASE WHEN trial_ends_at IS NOT NULL AND p_origin NOT IN ('trial', 'ticket')
                         THEN least(coalesce(next_coin_at, now()), now()) ELSE next_coin_at END,
        trial_ends_at = CASE WHEN p_origin IN ('trial', 'ticket') THEN trial_ends_at ELSE NULL END,
        origin = CASE WHEN v_prev.unlimited THEN coalesce(origin, 'admin') ELSE p_origin END,
        provider = coalesce(p_provider, provider),
        platform = coalesce(p_platform, platform),
        period = coalesce(p_period, period),
        auto_renew = CASE WHEN p_origin IN ('web', 'store') THEN coalesce(p_auto_renew, auto_renew) ELSE auto_renew END,
        cancel_at_period_end = CASE WHEN p_origin IN ('web', 'store') AND coalesce(p_auto_renew, false) THEN false ELSE cancel_at_period_end END,
        provider_sub_ref = coalesce(p_provider_sub_ref, provider_sub_ref),
        updated_at = now()
       WHERE user_id = p_user RETURNING * INTO v_row;
      v_kind := CASE WHEN v_rank_new > v_rank_old THEN 'change_plan' ELSE 'extend' END;
    END IF;
  ELSIF p_op IN ('cancel_at_end', 'resume') THEN
    IF NOT v_active THEN RETURN jsonb_build_object('ok', false, 'error', 'not_active'); END IF;
    UPDATE public.user_subscriptions SET
      auto_renew = (p_op = 'resume'),
      cancel_at_period_end = (p_op = 'cancel_at_end'),
      cancel_reason = CASE WHEN p_op = 'cancel_at_end' THEN left(p_meta ->> 'reason', 200) ELSE NULL END,
      updated_at = now()
     WHERE user_id = p_user RETURNING * INTO v_row;
    v_kind := 'set_end';
  ELSIF p_op = 'revoke' THEN
    IF NOT v_active THEN RETURN jsonb_build_object('ok', false, 'error', 'not_active'); END IF;
    -- A manual admin / campaign grant is never ended by a payment event: a refund of days that were
    -- stacked on top of it only takes those days back (p_days), never below now.
    IF v_prev.unlimited THEN
      RETURN jsonb_build_object('ok', false, 'error', 'admin_grant');
    END IF;
    IF v_prev.source IN ('admin', 'campaign') AND coalesce(v_prev.origin, '') NOT IN ('ticket') THEN
      IF p_days IS NULL OR p_days < 1 THEN RETURN jsonb_build_object('ok', false, 'error', 'admin_grant'); END IF;
      UPDATE public.user_subscriptions SET ends_at = greatest(now() + interval '1 minute', ends_at - make_interval(days => p_days)),
        auto_renew = false, updated_at = now()
       WHERE user_id = p_user RETURNING * INTO v_row;
      v_kind := 'set_end';
    ELSE
      UPDATE public.user_subscriptions SET status = 'cancelled', unlimited = false, ends_at = now(),
        next_coin_at = NULL, auto_renew = false, updated_at = now()
       WHERE user_id = p_user RETURNING * INTO v_row;
      v_kind := 'cancel';
    END IF;
  END IF;

  INSERT INTO public.subscription_events (user_id, kind, prev_plan, new_plan, prev_ends_at, new_ends_at,
    prev_unlimited, new_unlimited, actor_kind, reason, is_free, request_id, meta)
  VALUES (p_user, v_kind,
    CASE WHEN v_had THEN v_prev.plan_id END, v_row.plan_id,
    CASE WHEN v_had THEN v_prev.ends_at END, v_row.ends_at,
    CASE WHEN v_had THEN v_prev.unlimited END, v_row.unlimited,
    v_actor, 'plus_' || p_op, v_row.is_free, v_req,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('op', p_op, 'origin', p_origin, 'provider', p_provider,
      'platform', p_platform, 'period', p_period))
  RETURNING * INTO v_event;

  IF p_op <> 'trial' THEN v_coins := public.premium_pay_cycles(p_user); END IF;
  SELECT * INTO v_row FROM public.user_subscriptions WHERE user_id = p_user;
  RETURN jsonb_build_object('ok', true, 'replay', false, 'subscription', public.premium_sub_json(v_row),
    'event', public.premium_event_json(v_event), 'coin_cycles_paid_now', v_coins);
END;
$$;

-- 11) Boosts. Slots come from the offer config (the backend passes them).
CREATE OR REPLACE FUNCTION public.premium_boost_counts(p_server_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(x.server_id::text, x.n), '{}'::jsonb) FROM (
    SELECT b.server_id, count(*)::int AS n FROM public.server_boosts b
     WHERE b.server_id = ANY (coalesce(p_server_ids, '{}'::uuid[])) AND b.status IN ('active', 'moving', 'grace')
     GROUP BY b.server_id) x;
$$;

CREATE OR REPLACE FUNCTION public.premium_boost_assign(p_user uuid, p_server uuid, p_slots integer, p_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_req text := nullif(btrim(coalesce(p_request_id, '')), '');
  v_used integer;
  v_row public.server_boosts;
  v_count integer;
BEGIN
  IF p_user IS NULL OR p_server IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid'); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('premium:user:' || p_user::text));
  IF v_req IS NOT NULL THEN
    SELECT * INTO v_row FROM public.server_boosts WHERE user_id = p_user AND request_id = v_req;
    IF FOUND THEN
      SELECT count(*) INTO v_count FROM public.server_boosts WHERE server_id = v_row.server_id AND status IN ('active', 'moving', 'grace');
      RETURN jsonb_build_object('ok', true, 'replay', true, 'boost', to_jsonb(v_row), 'server_count', v_count);
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_subscriptions s WHERE s.user_id = p_user AND s.status = 'active'
                  AND (s.unlimited OR s.ends_at > now())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.server_members m WHERE m.server_id = p_server AND m.user_id = p_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_server');
  END IF;
  SELECT count(*) INTO v_used FROM public.server_boosts WHERE user_id = p_user AND status IN ('active', 'moving', 'grace');
  IF v_used >= greatest(coalesce(p_slots, 0), 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_slots', 'used', v_used, 'slots', p_slots);
  END IF;
  INSERT INTO public.server_boosts (user_id, server_id, status, request_id)
  VALUES (p_user, p_server, 'active', v_req) RETURNING * INTO v_row;
  SELECT count(*) INTO v_count FROM public.server_boosts WHERE server_id = p_server AND status IN ('active', 'moving', 'grace');
  RETURN jsonb_build_object('ok', true, 'replay', false, 'boost', to_jsonb(v_row), 'server_count', v_count);
END;
$$;

-- Moving a boost: once per p_cooldown_days per boost; it leaves the old server after p_notice_hours
-- (the owner is told now), then counts for the new one.
CREATE OR REPLACE FUNCTION public.premium_boost_move(p_user uuid, p_boost uuid, p_to uuid, p_cooldown_days integer, p_notice_hours integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.server_boosts;
  v_since timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('premium:user:' || p_user::text));
  SELECT * INTO v_row FROM public.server_boosts WHERE id = p_boost AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_row.status = 'moving' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_moving', 'move_at', v_row.move_at); END IF;
  IF v_row.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_active'); END IF;
  IF v_row.server_id = p_to THEN RETURN jsonb_build_object('ok', false, 'error', 'same_server'); END IF;
  v_since := coalesce(v_row.moved_at, v_row.created_at);
  IF v_since > now() - make_interval(days => greatest(coalesce(p_cooldown_days, 7), 0)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cooldown',
      'available_at', v_since + make_interval(days => greatest(coalesce(p_cooldown_days, 7), 0)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.server_members m WHERE m.server_id = p_to AND m.user_id = p_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_server');
  END IF;
  UPDATE public.server_boosts SET status = 'moving', move_to = p_to,
    move_at = now() + make_interval(hours => greatest(coalesce(p_notice_hours, 24), 0)), updated_at = now()
   WHERE id = p_boost RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'boost', to_jsonb(v_row));
END;
$$;

CREATE OR REPLACE FUNCTION public.premium_boost_cancel_move(p_user uuid, p_boost uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.server_boosts;
BEGIN
  UPDATE public.server_boosts SET status = 'active', move_to = NULL, move_at = NULL, updated_at = now()
   WHERE id = p_boost AND user_id = p_user AND status = 'moving' RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_moving'); END IF;
  RETURN jsonb_build_object('ok', true, 'boost', to_jsonb(v_row));
END;
$$;

-- Periodic: due moves, lapsed memberships (grace), ended grace, over-capacity after a downgrade,
-- members who left the server. Returns the touched servers for the owner notices.
CREATE OR REPLACE FUNCTION public.premium_boost_sweep(p_plus_slots integer, p_ultra_slots integer, p_grace_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('premium:boost-sweep')) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;
  -- due moves
  FOR r IN SELECT * FROM public.server_boosts WHERE status = 'moving' AND move_at <= now() FOR UPDATE SKIP LOCKED LOOP
    IF r.move_to IS NOT NULL AND EXISTS (SELECT 1 FROM public.server_members m WHERE m.server_id = r.move_to AND m.user_id = r.user_id) THEN
      UPDATE public.server_boosts SET server_id = r.move_to, status = 'active', move_to = NULL, move_at = NULL,
        moved_at = now(), updated_at = now() WHERE id = r.id;
      v_out := v_out || jsonb_build_array(jsonb_build_object('event', 'moved_out', 'server_id', r.server_id, 'user_id', r.user_id),
                                          jsonb_build_object('event', 'moved_in', 'server_id', r.move_to, 'user_id', r.user_id));
    ELSE
      UPDATE public.server_boosts SET status = 'active', move_to = NULL, move_at = NULL, updated_at = now() WHERE id = r.id;
    END IF;
  END LOOP;
  -- lapsed membership -> grace (trial-only memberships: no grace)
  FOR r IN
    SELECT b.*, s.ends_at AS sub_end, s.trial_ends_at AS sub_trial FROM public.server_boosts b
      LEFT JOIN public.user_subscriptions s ON s.user_id = b.user_id
     WHERE b.status IN ('active', 'moving')
       AND NOT coalesce(s.status = 'active' AND (s.unlimited OR s.ends_at > now()), false)
     FOR UPDATE OF b SKIP LOCKED
  LOOP
    UPDATE public.server_boosts SET status = 'grace', move_to = NULL, move_at = NULL,
      grace_until = CASE WHEN r.sub_trial IS NOT NULL AND r.sub_trial >= coalesce(r.sub_end, now()) - interval '1 minute'
                         THEN now() ELSE greatest(coalesce(r.sub_end, now()), now() - interval '1 day') + make_interval(days => greatest(coalesce(p_grace_days, 3), 0)) END,
      updated_at = now() WHERE id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('event', 'grace', 'server_id', r.server_id, 'user_id', r.user_id));
  END LOOP;
  -- membership is back: grace -> active
  UPDATE public.server_boosts b SET status = 'active', grace_until = NULL, updated_at = now()
   WHERE b.status = 'grace' AND EXISTS (SELECT 1 FROM public.user_subscriptions s WHERE s.user_id = b.user_id
     AND s.status = 'active' AND (s.unlimited OR s.ends_at > now()));
  -- grace over -> removed
  FOR r IN SELECT * FROM public.server_boosts WHERE status = 'grace' AND grace_until <= now() FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.server_boosts SET status = 'removed', removed_at = now(), removed_reason = 'membership_ended', updated_at = now() WHERE id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('event', 'removed', 'server_id', r.server_id, 'user_id', r.user_id));
  END LOOP;
  -- left the server -> removed at once
  FOR r IN SELECT b.* FROM public.server_boosts b WHERE b.status <> 'removed'
     AND NOT EXISTS (SELECT 1 FROM public.server_members m WHERE m.server_id = b.server_id AND m.user_id = b.user_id)
     FOR UPDATE OF b SKIP LOCKED LOOP
    UPDATE public.server_boosts SET status = 'removed', removed_at = now(), removed_reason = 'left_server', updated_at = now() WHERE id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('event', 'removed', 'server_id', r.server_id, 'user_id', r.user_id));
  END LOOP;
  -- over capacity after a downgrade: the newest boosts beyond the slots are removed
  FOR r IN
    SELECT x.id, x.server_id, x.user_id FROM (
      SELECT b.id, b.server_id, b.user_id, row_number() OVER (PARTITION BY b.user_id ORDER BY b.created_at, b.id) AS rn,
             CASE s.plan_id WHEN 'ultra' THEN p_ultra_slots ELSE p_plus_slots END AS slots
        FROM public.server_boosts b JOIN public.user_subscriptions s ON s.user_id = b.user_id
       WHERE b.status IN ('active', 'moving')) x
     WHERE x.rn > x.slots
  LOOP
    UPDATE public.server_boosts SET status = 'removed', removed_at = now(), removed_reason = 'over_capacity', updated_at = now() WHERE id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('event', 'removed', 'server_id', r.server_id, 'user_id', r.user_id));
  END LOOP;
  RETURN jsonb_build_object('skipped', false, 'changes', v_out);
END;
$$;

-- 12) Gifts: open (the recipient, or the sender after a return), and the delivery / return sweep.
CREATE OR REPLACE FUNCTION public.premium_gift_open(p_gift uuid, p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g public.premium_gifts;
  v_res jsonb;
  v_target uuid;
BEGIN
  SELECT * INTO g FROM public.premium_gifts WHERE id = p_gift FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF g.status = 'opened' THEN RETURN jsonb_build_object('ok', false, 'error', 'gift_opened'); END IF;
  IF g.status = 'delivered' AND g.recipient_id = p_user THEN
    v_target := g.recipient_id;
  ELSIF g.status = 'returned' AND g.sender_id = p_user THEN
    v_target := g.sender_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'not_openable');
  END IF;
  v_res := public.premium_plus_apply(v_target, 'purchase', g.plan, g.months * 30, NULL, 'gift', g.provider,
    g.platform, NULL, false, 'gift:' || g.id::text, jsonb_build_object('gift_id', g.id, 'sender_id', g.sender_id));
  IF NOT coalesce((v_res ->> 'ok')::boolean, false) THEN RETURN v_res; END IF;
  UPDATE public.premium_gifts SET status = 'opened', opened_at = now(), updated_at = now() WHERE id = g.id;
  RETURN v_res || jsonb_build_object('gift_id', g.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.premium_gift_sweep(p_return_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_delivered jsonb;
  v_returned jsonb;
  v_expired jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('premium:gift-sweep')) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;
  WITH d AS (
    UPDATE public.premium_gifts SET status = 'delivered', delivered_at = now(), updated_at = now()
     WHERE status = 'scheduled' AND deliver_at <= now() RETURNING id, sender_id, recipient_id)
  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO v_delivered FROM d;
  WITH r AS (
    UPDATE public.premium_gifts SET status = 'returned', returned_at = now(), updated_at = now()
     WHERE status = 'delivered' AND sender_id IS NOT NULL
       AND delivered_at <= now() - make_interval(days => greatest(coalesce(p_return_days, 30), 1))
     RETURNING id, sender_id, recipient_id)
  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_returned FROM r;
  WITH e AS (
    UPDATE public.premium_group_gifts SET status = 'expired', updated_at = now()
     WHERE status = 'collecting' AND expires_at <= now() RETURNING id, organizer_id)
  SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) INTO v_expired FROM e;
  RETURN jsonb_build_object('skipped', false, 'delivered', v_delivered, 'returned', v_returned, 'group_expired', v_expired);
END;
$$;

-- A group share was paid: when every share is paid the group becomes one real gift.
CREATE OR REPLACE FUNCTION public.premium_group_share_paid(p_group uuid, p_user uuid, p_order_ref text, p_provider text, p_platform text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  g public.premium_group_gifts;
  v_paid integer;
  v_gift uuid;
BEGIN
  SELECT * INTO g FROM public.premium_group_gifts WHERE id = p_group FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF g.status NOT IN ('collecting', 'complete') THEN RETURN jsonb_build_object('ok', false, 'error', 'group_closed'); END IF;
  INSERT INTO public.premium_group_gift_shares (group_id, user_id, status, order_ref, paid_at)
  VALUES (p_group, p_user, 'paid', p_order_ref, now())
  ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'paid', order_ref = EXCLUDED.order_ref,
    paid_at = coalesce(public.premium_group_gift_shares.paid_at, now());
  SELECT count(*) INTO v_paid FROM public.premium_group_gift_shares WHERE group_id = p_group AND status = 'paid';
  IF g.status = 'collecting' AND v_paid >= g.shares THEN
    INSERT INTO public.premium_gifts (sender_id, recipient_id, plan, months, note, deliver_at, status, platform,
      provider, amount_minor, currency, group_id, paid_at)
    VALUES (g.organizer_id, g.recipient_id, g.plan, g.months, g.note, coalesce(g.deliver_at, now()),
      'scheduled', p_platform, p_provider, g.share_minor * g.shares, g.currency, g.id, now())
    RETURNING id INTO v_gift;
    UPDATE public.premium_group_gifts SET status = 'complete', gift_id = v_gift, updated_at = now() WHERE id = p_group;
    RETURN jsonb_build_object('ok', true, 'paid', v_paid, 'shares', g.shares, 'complete', true, 'gift_id', v_gift);
  END IF;
  RETURN jsonb_build_object('ok', true, 'paid', v_paid, 'shares', g.shares, 'complete', g.status = 'complete', 'gift_id', g.gift_id);
END;
$$;

-- 13) Trial tickets: redeem one (the owner for themselves, or the friend it was sent to).
CREATE OR REPLACE FUNCTION public.premium_ticket_redeem(p_ticket uuid, p_user uuid, p_plan text, p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t public.premium_trial_tickets;
  v_res jsonb;
BEGIN
  SELECT * INTO t FROM public.premium_trial_tickets WHERE id = p_ticket FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF t.expires_at <= now() AND t.status IN ('available', 'sent') THEN
    UPDATE public.premium_trial_tickets SET status = 'expired' WHERE id = t.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF NOT ((t.status = 'available' AND t.owner_id = p_user) OR (t.status = 'sent' AND t.sent_to = p_user)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_redeemable');
  END IF;
  v_res := public.premium_plus_apply(p_user, 'trial', p_plan, p_days, NULL, 'ticket', 'internal', NULL, NULL, false,
    'ticket:' || t.id::text, jsonb_build_object('ticket_id', t.id, 'owner_id', t.owner_id));
  IF NOT coalesce((v_res ->> 'ok')::boolean, false) THEN RETURN v_res; END IF;
  UPDATE public.premium_trial_tickets SET status = 'redeemed', redeemed_by = p_user, redeemed_at = now() WHERE id = t.id;
  RETURN v_res || jsonb_build_object('ticket_id', t.id);
END;
$$;

-- 14) Admin console numbers ("Ölçüm" line included). Real data only; nulls where nothing exists yet.
CREATE OR REPLACE FUNCTION public.premium_plus_metrics(p_levels integer[] DEFAULT ARRAY[2, 5, 10])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v jsonb;
  v_boosted integer;
  v_affected integer;
  v_payers integer;
  v_gift_ended integer;
  v_gift_conv integer;
  v_purch30 integer;
  v_ref30 integer;
BEGIN
  SELECT count(DISTINCT server_id) INTO v_boosted FROM public.server_boosts WHERE status IN ('active', 'moving', 'grace');
  SELECT count(DISTINCT m.user_id) INTO v_affected FROM public.server_members m
   WHERE m.server_id IN (SELECT server_id FROM public.server_boosts WHERE status IN ('active', 'moving', 'grace')
                          GROUP BY server_id HAVING count(*) >= p_levels[1]);
  SELECT count(*) INTO v_payers FROM public.user_subscriptions s
   WHERE s.status = 'active' AND (s.unlimited OR s.ends_at > now()) AND NOT s.is_free;
  -- gift recipients whose gift period is over, and how many of them pay themselves afterwards
  SELECT count(DISTINCT g.recipient_id),
         count(DISTINCT g.recipient_id) FILTER (WHERE EXISTS (
           SELECT 1 FROM public.subscription_events e WHERE e.user_id = g.recipient_id AND e.actor_kind = 'payment'
              AND e.created_at > g.opened_at AND coalesce(e.meta ->> 'origin', '') IN ('web', 'store')))
    INTO v_gift_ended, v_gift_conv
    FROM public.premium_gifts g
   WHERE g.status = 'opened' AND g.opened_at + make_interval(days => g.months * 30) <= now();
  SELECT count(*) FILTER (WHERE kind IN ('purchase', 'renewal') AND status = 'succeeded'),
         count(*) FILTER (WHERE kind IN ('refund', 'chargeback'))
    INTO v_purch30, v_ref30
    FROM public.payment_transactions WHERE created_at > now() - interval '30 days';
  v := jsonb_build_object(
    'subscribers', v_payers,
    'subscribers_new_30d', (SELECT count(DISTINCT user_id) FROM public.subscription_events
                             WHERE kind = 'grant' AND actor_kind = 'payment' AND created_at > now() - interval '30 days'),
    'in_trial', (SELECT count(*) FROM public.user_subscriptions WHERE status = 'active' AND trial_ends_at > now()),
    'in_trial_ticket', (SELECT count(*) FROM public.user_subscriptions WHERE status = 'active' AND trial_ends_at > now() AND origin = 'ticket'),
    'boosted_servers', v_boosted,
    'boosted_servers_level1', (SELECT count(*) FROM (SELECT server_id FROM public.server_boosts WHERE status IN ('active', 'moving', 'grace')
                                 GROUP BY server_id HAVING count(*) >= p_levels[1]) x),
    'affected_members', v_affected,
    'affected_per_payer', CASE WHEN v_payers > 0 THEN round(v_affected::numeric / v_payers, 1) END,
    'gift_recipients_ended', v_gift_ended,
    'gift_converted', v_gift_conv,
    'gift_conversion', CASE WHEN v_gift_ended > 0 THEN round(100.0 * v_gift_conv / v_gift_ended, 1) END,
    'purchases_30d', v_purch30,
    'refunds_30d', v_ref30,
    'refund_rate', CASE WHEN v_purch30 > 0 THEN round(100.0 * v_ref30 / v_purch30, 1) END,
    'refunds_pending', (SELECT count(*) FROM public.premium_refund_requests WHERE status = 'pending'),
    'mrr_minor', (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE sum(CASE WHEN t.period = 'yearly' THEN t.amount_minor / 12 ELSE t.amount_minor END)::bigint END
                    FROM public.user_subscriptions s
                    JOIN LATERAL (SELECT pt.amount_minor, pt.period FROM public.payment_transactions pt
                                   WHERE pt.user_id = s.user_id AND pt.status = 'succeeded' AND pt.kind IN ('purchase', 'renewal')
                                     AND coalesce(pt.period, 'monthly') IN ('monthly', 'yearly')
                                   ORDER BY pt.created_at DESC LIMIT 1) t ON true
                   WHERE s.status = 'active' AND (s.unlimited OR s.ends_at > now()) AND NOT s.is_free AND s.auto_renew),
    'gift_funnel_30d', jsonb_build_object(
      'bought', (SELECT count(*) FROM public.premium_gifts WHERE paid_at > now() - interval '30 days'),
      'opened', (SELECT count(*) FROM public.premium_gifts WHERE paid_at > now() - interval '30 days' AND opened_at IS NOT NULL),
      'boosted', (SELECT count(*) FROM public.premium_gifts g WHERE g.paid_at > now() - interval '30 days' AND g.opened_at IS NOT NULL
                    AND EXISTS (SELECT 1 FROM public.server_boosts b WHERE b.user_id = g.recipient_id AND b.created_at >= g.opened_at)),
      'subscribed', (SELECT count(*) FROM public.premium_gifts g WHERE g.paid_at > now() - interval '30 days' AND g.opened_at IS NOT NULL
                    AND EXISTS (SELECT 1 FROM public.subscription_events e WHERE e.user_id = g.recipient_id AND e.actor_kind = 'payment'
                                  AND e.created_at > g.opened_at AND coalesce(e.meta ->> 'origin', '') IN ('web', 'store')))),
    'paywall_30d', (SELECT coalesce(jsonb_object_agg(moment, counts), '{}'::jsonb) FROM (
                      SELECT moment, jsonb_object_agg(action, n) AS counts FROM (
                        SELECT moment, action, count(*) AS n FROM public.premium_paywall_events
                         WHERE created_at > now() - interval '30 days' GROUP BY moment, action) a GROUP BY moment) b)
  );
  RETURN v;
END;
$$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.premium_plus_me(uuid)',
    'public.premium_plus_apply(uuid, text, text, integer, timestamptz, text, text, text, text, boolean, text, jsonb, text)',
    'public.premium_boost_counts(uuid[])',
    'public.premium_boost_assign(uuid, uuid, integer, text)',
    'public.premium_boost_move(uuid, uuid, uuid, integer, integer)',
    'public.premium_boost_cancel_move(uuid, uuid)',
    'public.premium_boost_sweep(integer, integer, integer)',
    'public.premium_gift_open(uuid, uuid)',
    'public.premium_gift_sweep(integer)',
    'public.premium_group_share_paid(uuid, uuid, text, text, text)',
    'public.premium_ticket_redeem(uuid, uuid, text, integer)',
    'public.premium_plus_metrics(integer[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
