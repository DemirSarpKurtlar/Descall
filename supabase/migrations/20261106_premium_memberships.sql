-- Descall+ and Descall Ultra, phase 1 (2026-11-02, docs/premium/CONTRACT.md). ADDITIVE ONLY:
-- new tables, new functions, one new partial unique index on descoin_ledger, and the
-- descoin_ledger reason CHECK widened to a strict superset (adds 'premium_gift'). Nothing is
-- dropped or renamed; the R3 tables are not touched.
--
-- Phase 1 has no payments: admins grant memberships, and free_membership campaigns grant them.
-- Every write runs inside a SECURITY DEFINER function that only service_role may execute (the
-- backend calls it with supabase.rpc). One call = one transaction:
--   * pg_advisory_xact_lock per user, then the subscription row FOR UPDATE,
--   * subscription_events is append-only (trigger), with UNIQUE (request_id, user_id) so a retried
--     admin request is answered from the first result and never applied twice,
--   * DesCoin gifts are written like promo_redeem: balance UPDATE + descoin_ledger row in the same
--     transaction, keyed by UNIQUE (user_id, cycle_at) on the event and a UNIQUE idempotency key
--     on the ledger row, so each 30-day cycle pays exactly once.
-- Membership state is lazy: a row is active while status = 'active' and (unlimited or
-- ends_at > now()). premium_expire_due() only writes the side effects (status + expire event).
-- Missed coin cycles (the backend sleeps on Render's free plan) are caught up one by one: every
-- cycle that started before ends_at is paid exactly once, however late the sweeper runs.

-- 1) Widen the DesCoin ledger reasons (superset of the live list, checked on 2026-11-02).
ALTER TABLE public.descoin_ledger DROP CONSTRAINT IF EXISTS descoin_ledger_reason_check;
ALTER TABLE public.descoin_ledger ADD CONSTRAINT descoin_ledger_reason_check
  CHECK (reason IN (
    'voice_activity', 'screenshare_activity', 'message_activity',
    'shop_purchase', 'admin_grant', 'admin_revoke',
    'referral_invite', 'referral_welcome', 'daily_claim', 'streak_bonus',
    'shop_refund', 'promo', 'premium_gift'
  )) NOT VALID;
ALTER TABLE public.descoin_ledger VALIDATE CONSTRAINT descoin_ledger_reason_check;

-- One ledger row per membership coin cycle, whatever path writes it.
CREATE UNIQUE INDEX IF NOT EXISTS descoin_ledger_premium_gift_key
  ON public.descoin_ledger ((meta ->> 'idempotency_key'))
  WHERE reason = 'premium_gift';

-- 2) Tables.
CREATE TABLE IF NOT EXISTS public.premium_plans (
  id              text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,31}$'),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  description     text CHECK (description IS NULL OR char_length(description) <= 500),
  features        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(features) = 'array'),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  visible         boolean NOT NULL DEFAULT true,
  monthly_descoin integer NOT NULL DEFAULT 0 CHECK (monthly_descoin BETWEEN 0 AND 1000000),
  price_minor     integer CHECK (price_minor IS NULL OR price_minor >= 0),
  currency        text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  sort            integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.premium_plans (id, name, description, features, status, visible, monthly_descoin, sort)
VALUES
  ('plus', 'Descall+', NULL, '["mini_mode","always_on_top","pip_call","multi_window","window_opacity","session_restore","tray_controls_plus","taskbar_plus","global_mute","global_ptt","custom_hotkeys","media_keys","quick_launcher","notification_history","focus_mode","notification_profiles","mic_presets","noise_gate","mic_monitor","voice_activity_monitor","auto_device_switch","audio_routing","audio_device_profiles","game_status","game_session_history","smart_game_notifications","clipboard_history","quick_file_drop","app_lock","quick_actions","quick_reply"]'::jsonb,
   'active', true, 5000, 10),
  ('ultra', 'Descall Ultra', NULL, '["mini_mode","always_on_top","pip_call","multi_window","window_opacity","session_restore","tray_controls_plus","taskbar_plus","global_mute","global_ptt","custom_hotkeys","media_keys","quick_launcher","notification_history","focus_mode","notification_profiles","mic_presets","noise_gate","mic_monitor","voice_activity_monitor","auto_device_switch","audio_routing","audio_device_profiles","game_status","game_session_history","smart_game_notifications","clipboard_history","quick_file_drop","app_lock","quick_actions","quick_reply","desktop_sidebar","screen_edge_actions","window_layouts","advanced_window_mgmt","voice_hud","gaming_hud","instant_clip","per_user_volume_hotkeys","stream_audio_control","workspace_profiles","desktop_automations","activity_timeline","command_center","widgets","custom_layouts","multi_account"]'::jsonb,
   'active', true, 15000, 20)
ON CONFLICT (id) DO NOTHING;

-- At most one current row per user: user_id is the primary key (a unique index).
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id          uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id          text NOT NULL REFERENCES public.premium_plans(id),
  status           text NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  ends_at          timestamptz,
  unlimited        boolean NOT NULL DEFAULT false,
  is_free          boolean NOT NULL DEFAULT true,
  source           text NOT NULL CHECK (source IN ('admin', 'campaign', 'payment')),
  next_coin_at     timestamptz,
  coin_cycles_paid integer NOT NULL DEFAULT 0 CHECK (coin_cycles_paid >= 0),
  -- Future (paid phase, owner decision 2026-11-06): a new paying subscriber gets a 3-day free trial.
  -- Nothing sets this in phase 1; it stays NULL.
  trial_ends_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_subscriptions_end_shape CHECK (
    (unlimited AND ends_at IS NULL) OR (NOT unlimited AND ends_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS user_subscriptions_due_coin_idx ON public.user_subscriptions (next_coin_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS user_subscriptions_ends_idx ON public.user_subscriptions (ends_at) WHERE status = 'active' AND NOT unlimited;
CREATE INDEX IF NOT EXISTS user_subscriptions_plan_idx ON public.user_subscriptions (plan_id, status);

CREATE TABLE IF NOT EXISTS public.premium_bulk_batches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid NOT NULL,
  plan_id    text,
  op         text NOT NULL,
  params     jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text UNIQUE CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 8 AND 100),
  total      integer NOT NULL DEFAULT 0,
  ok         integer NOT NULL DEFAULT 0,
  failed     integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS premium_bulk_batches_created_idx ON public.premium_bulk_batches (created_at DESC);

CREATE TABLE IF NOT EXISTS public.premium_bulk_results (
  batch_id   uuid NOT NULL REFERENCES public.premium_bulk_batches(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  ok         boolean NOT NULL,
  error      text,
  event_id   uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('grant', 'extend', 'change_plan', 'cancel', 'set_end',
                   'set_unlimited', 'expire', 'coin_grant', 'campaign_redeem', 'trial')),
  prev_plan      text,
  new_plan       text,
  prev_ends_at   timestamptz,
  new_ends_at    timestamptz,
  prev_unlimited boolean,
  new_unlimited  boolean,
  actor_id       uuid,
  actor_kind     text NOT NULL CHECK (actor_kind IN ('admin', 'system', 'campaign', 'payment')),
  reason         text CHECK (reason IS NULL OR char_length(reason) <= 500),
  note           text CHECK (note IS NULL OR char_length(note) <= 2000),
  is_free        boolean NOT NULL DEFAULT true,
  batch_id       uuid,
  request_id     text CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 8 AND 100),
  campaign_id    uuid,
  coins          integer,
  cycle_at       timestamptz,
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_events_request_uq
  ON public.subscription_events (request_id, user_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_events_coin_cycle_uq
  ON public.subscription_events (user_id, cycle_at) WHERE kind = 'coin_grant';
-- Future trial flow: one 'trial' event (= one free trial) per user, ever. No phase 1 code writes 'trial'.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_events_one_trial_uq
  ON public.subscription_events (user_id) WHERE kind = 'trial';
CREATE INDEX IF NOT EXISTS subscription_events_user_idx ON public.subscription_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_events_created_idx ON public.subscription_events (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS subscription_events_kind_idx ON public.subscription_events (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_events_batch_idx ON public.subscription_events (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscription_events_campaign_idx ON public.subscription_events (campaign_id) WHERE campaign_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.subscription_events_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'subscription_events is append-only';
END;
$$;
CREATE OR REPLACE TRIGGER subscription_events_no_update
  BEFORE UPDATE OR DELETE ON public.subscription_events
  FOR EACH ROW EXECUTE FUNCTION public.subscription_events_append_only();
CREATE OR REPLACE TRIGGER subscription_events_no_truncate
  BEFORE TRUNCATE ON public.subscription_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_events_append_only();

CREATE TABLE IF NOT EXISTS public.premium_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{4,32}$'),
  name             text CHECK (name IS NULL OR char_length(name) <= 80),
  kind             text NOT NULL CHECK (kind IN ('free_membership', 'percent', 'fixed')),
  plan_id          text REFERENCES public.premium_plans(id),
  duration_days    integer CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650),
  percent_off      integer CHECK (percent_off IS NULL OR percent_off BETWEEN 1 AND 100),
  amount_off_minor integer CHECK (amount_off_minor IS NULL OR amount_off_minor > 0),
  currency         text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  starts_at        timestamptz NOT NULL DEFAULT now(),
  ends_at          timestamptz,
  total_limit      integer CHECK (total_limit IS NULL OR total_limit > 0),
  per_user_limit   integer NOT NULL DEFAULT 1 CHECK (per_user_limit BETWEEN 1 AND 100),
  allowed_user_ids uuid[],
  used_count       integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  active           boolean NOT NULL DEFAULT true,
  note             text CHECK (note IS NULL OR char_length(note) <= 500),
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT premium_campaigns_within_limit CHECK (total_limit IS NULL OR used_count <= total_limit),
  CONSTRAINT premium_campaigns_dates CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT premium_campaigns_shape CHECK (
    (kind = 'free_membership' AND plan_id IS NOT NULL AND duration_days IS NOT NULL)
    OR (kind = 'percent' AND percent_off IS NOT NULL)
    OR (kind = 'fixed' AND amount_off_minor IS NOT NULL AND currency IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS premium_campaigns_created_idx ON public.premium_campaigns (created_at DESC);

CREATE TABLE IF NOT EXISTS public.premium_campaign_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.premium_campaigns(id),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  use_no      integer NOT NULL DEFAULT 1 CHECK (use_no >= 1),
  event_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id, use_no)
);
CREATE INDEX IF NOT EXISTS premium_campaign_redemptions_campaign_idx
  ON public.premium_campaign_redemptions (campaign_id, created_at DESC);

-- Provider-agnostic, for later. Only verified provider webhooks will write here; nothing does in phase 1.
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 40),
  provider_ref    text NOT NULL CHECK (char_length(provider_ref) BETWEEN 1 AND 200),
  user_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  plan_id         text REFERENCES public.premium_plans(id),
  kind            text NOT NULL CHECK (kind IN ('purchase', 'renewal', 'refund', 'chargeback', 'other')),
  status          text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  amount_minor    integer,
  currency        text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  period_start    timestamptz,
  period_end      timestamptz,
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);

-- 3) Security: RLS on everywhere, no client writes. A signed-in Supabase user may read only their
-- own subscription row and events (Descall signs in with its own JWT, so in practice only the
-- service role reads these tables).
ALTER TABLE public.premium_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_bulk_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_bulk_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_campaign_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.premium_plans, public.user_subscriptions, public.subscription_events,
  public.premium_bulk_batches, public.premium_bulk_results, public.premium_campaigns,
  public.premium_campaign_redemptions, public.payment_transactions FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_subscriptions, public.subscription_events TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_subscriptions'
                   AND policyname = 'user_subscriptions_select_own') THEN
      EXECUTE 'CREATE POLICY user_subscriptions_select_own ON public.user_subscriptions
               FOR SELECT TO authenticated USING (user_id = auth.uid())';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'subscription_events'
                   AND policyname = 'subscription_events_select_own') THEN
      EXECUTE 'CREATE POLICY subscription_events_select_own ON public.subscription_events
               FOR SELECT TO authenticated USING (user_id = auth.uid())';
    END IF;
  END IF;
END $$;

-- 4) Helpers.
CREATE OR REPLACE FUNCTION public.premium_mask_email(p_email text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_email IS NULL OR position('@' IN p_email) < 2 THEN NULL
    ELSE left(split_part(p_email, '@', 1), least(2, char_length(split_part(p_email, '@', 1)) - 1)) || '***@'
      || left(split_part(p_email, '@', 2), 1) || '***'
      || CASE WHEN position('.' IN split_part(p_email, '@', 2)) > 0
              THEN '.' || reverse(split_part(reverse(split_part(p_email, '@', 2)), '.', 1)) ELSE '' END
  END;
$$;

CREATE OR REPLACE FUNCTION public.premium_sub_json(s public.user_subscriptions)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN s.user_id IS NULL THEN NULL ELSE jsonb_build_object(
    'user_id', s.user_id,
    'plan_id', s.plan_id,
    'status', CASE WHEN s.status = 'active' AND NOT s.unlimited AND s.ends_at <= now() THEN 'expired' ELSE s.status END,
    'stored_status', s.status,
    'active', s.status = 'active' AND (s.unlimited OR s.ends_at > now()),
    'started_at', s.started_at,
    'ends_at', s.ends_at,
    'unlimited', s.unlimited,
    'is_free', s.is_free,
    'source', s.source,
    'next_coin_at', CASE WHEN s.status = 'active' AND (s.unlimited OR s.next_coin_at < s.ends_at) THEN s.next_coin_at END,
    'coin_cycles_paid', s.coin_cycles_paid,
    'updated_at', s.updated_at
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.premium_event_json(e public.subscription_events)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN e.id IS NULL THEN NULL ELSE to_jsonb(e) END;
$$;

-- Pays every due 30-day cycle of one membership (catch-up after a sleep), each exactly once.
-- Internal: callers hold the row (or the per-user advisory lock). Returns cycles handled.
CREATE OR REPLACE FUNCTION public.premium_pay_cycles(p_user uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.user_subscriptions;
  v_amount integer;
  v_cycle timestamptz;
  v_event uuid;
  v_paid integer := 0;
  v_frozen boolean;
  v_deleted boolean;
  v_balance integer;
  v_credit integer;
  v_key text;
BEGIN
  SELECT * INTO s FROM public.user_subscriptions WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  FOR i IN 1..240 LOOP
    EXIT WHEN s.status <> 'active' OR s.next_coin_at IS NULL OR s.next_coin_at > now();
    EXIT WHEN NOT s.unlimited AND s.next_coin_at >= s.ends_at;  -- the cycle would start after the end
    v_cycle := s.next_coin_at;
    SELECT monthly_descoin INTO v_amount FROM public.premium_plans WHERE id = s.plan_id;
    v_amount := coalesce(v_amount, 0);
    SELECT coalesce(u.descoin_frozen, false), u.deleted_at IS NOT NULL INTO v_frozen, v_deleted
      FROM public.users u WHERE u.id = p_user;
    v_credit := CASE WHEN v_frozen OR coalesce(v_deleted, true) THEN 0 ELSE v_amount END;
    v_key := 'premium_gift:' || p_user::text || ':' || floor(extract(epoch FROM v_cycle) * 1000)::bigint::text;

    INSERT INTO public.subscription_events (user_id, kind, prev_plan, new_plan, prev_ends_at, new_ends_at,
      prev_unlimited, new_unlimited, actor_kind, reason, is_free, coins, cycle_at, meta)
    VALUES (p_user, 'coin_grant', s.plan_id, s.plan_id, s.ends_at, s.ends_at, s.unlimited, s.unlimited,
      'system', 'monthly_gift', s.is_free, v_credit, v_cycle,
      jsonb_build_object('planned', v_amount, 'cycle_no', s.coin_cycles_paid + 1)
        || CASE WHEN v_frozen THEN jsonb_build_object('withheld', 'wallet_frozen')
                WHEN coalesce(v_deleted, true) THEN jsonb_build_object('withheld', 'account_deleted')
                ELSE '{}'::jsonb END)
    ON CONFLICT (user_id, cycle_at) WHERE kind = 'coin_grant' DO NOTHING
    RETURNING id INTO v_event;

    IF v_event IS NOT NULL AND v_credit > 0 THEN
      UPDATE public.users SET descoin_balance = coalesce(descoin_balance, 0) + v_credit
       WHERE id = p_user RETURNING descoin_balance INTO v_balance;
      INSERT INTO public.descoin_ledger (user_id, amount, reason, meta, balance_after)
      VALUES (p_user, v_credit, 'premium_gift',
        jsonb_build_object('plan', s.plan_id, 'cycle_at', v_cycle, 'premium_event_id', v_event,
          'idempotency_key', v_key),
        v_balance);
    END IF;

    UPDATE public.user_subscriptions
       SET next_coin_at = v_cycle + interval '30 days',
           coin_cycles_paid = coin_cycles_paid + CASE WHEN v_event IS NOT NULL THEN 1 ELSE 0 END,
           updated_at = now()
     WHERE user_id = p_user
     RETURNING * INTO s;
    IF v_event IS NOT NULL THEN v_paid := v_paid + 1; END IF;
  END LOOP;
  RETURN v_paid;
END;
$$;

-- 5) Admin apply: grant, extend, change_plan, cancel, set_end, set_unlimited.
CREATE OR REPLACE FUNCTION public.premium_admin_apply(
  p_actor uuid, p_user uuid, p_op text, p_plan text, p_days integer, p_ends_at timestamptz,
  p_unlimited boolean, p_is_free boolean, p_reason text, p_note text, p_request_id text, p_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_req text := nullif(btrim(coalesce(p_request_id, '')), '');
  v_prev public.user_subscriptions;
  v_had boolean;
  v_active boolean;
  v_plan public.premium_plans;
  v_new_ends timestamptz;
  v_new_unl boolean;
  v_row public.user_subscriptions;
  v_event public.subscription_events;
  v_coins integer := 0;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'user_not_found'); END IF;
  IF p_op IS NULL OR p_op NOT IN ('grant', 'extend', 'change_plan', 'cancel', 'set_end', 'set_unlimited') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_op');
  END IF;
  IF v_req IS NOT NULL AND v_req !~ '^[A-Za-z0-9:_.-]{8,100}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request_id');
  END IF;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'reason_required'); END IF;
  IF char_length(v_reason) > 500 OR char_length(coalesce(v_note, '')) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_long');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('premium:user:' || p_user::text));

  -- A retried request returns its first result and changes nothing.
  IF v_req IS NOT NULL THEN
    SELECT * INTO v_event FROM public.subscription_events WHERE request_id = v_req AND user_id = p_user;
    IF FOUND THEN
      SELECT * INTO v_row FROM public.user_subscriptions WHERE user_id = p_user;
      RETURN jsonb_build_object('ok', true, 'replay', true, 'subscription', public.premium_sub_json(v_row),
        'event', public.premium_event_json(v_event));
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- Cycles that came due before this change are paid first (catch-up), then the change applies.
  PERFORM public.premium_pay_cycles(p_user);

  SELECT * INTO v_prev FROM public.user_subscriptions WHERE user_id = p_user FOR UPDATE;
  v_had := FOUND;
  v_active := v_had AND v_prev.status = 'active' AND (v_prev.unlimited OR v_prev.ends_at > now());

  IF p_op IN ('grant', 'change_plan') THEN
    SELECT * INTO v_plan FROM public.premium_plans WHERE id = p_plan;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_plan'); END IF;
    IF v_plan.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'plan_archived'); END IF;
  END IF;
  IF p_op <> 'grant' AND NOT v_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_active');
  END IF;
  IF p_days IS NOT NULL AND (p_days < 1 OR p_days > 3650) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
  END IF;
  IF p_ends_at IS NOT NULL AND (p_ends_at <= now() OR p_ends_at > now() + interval '20 years') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_end');
  END IF;

  IF p_op = 'grant' THEN
    IF v_active THEN RETURN jsonb_build_object('ok', false, 'error', 'already_active'); END IF;
    IF coalesce(p_unlimited, false) THEN
      v_new_unl := true; v_new_ends := NULL;
    ELSIF p_days IS NOT NULL THEN
      v_new_unl := false; v_new_ends := now() + make_interval(days => p_days);
    ELSIF p_ends_at IS NOT NULL THEN
      v_new_unl := false; v_new_ends := p_ends_at;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
    END IF;
    INSERT INTO public.user_subscriptions AS t (user_id, plan_id, status, started_at, ends_at, unlimited, is_free,
      source, next_coin_at, coin_cycles_paid, created_at, updated_at)
    VALUES (p_user, v_plan.id, 'active', now(), v_new_ends, v_new_unl, coalesce(p_is_free, true), 'admin',
      now(), 0, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', started_at = EXCLUDED.started_at,
      ends_at = EXCLUDED.ends_at, unlimited = EXCLUDED.unlimited, is_free = EXCLUDED.is_free, source = 'admin',
      next_coin_at = EXCLUDED.next_coin_at, coin_cycles_paid = 0, updated_at = now()
    RETURNING * INTO v_row;
  ELSIF p_op = 'extend' THEN
    IF v_prev.unlimited THEN RETURN jsonb_build_object('ok', false, 'error', 'already_unlimited'); END IF;
    IF p_days IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration'); END IF;
    UPDATE public.user_subscriptions SET ends_at = ends_at + make_interval(days => p_days),
      is_free = coalesce(p_is_free, is_free), updated_at = now()
     WHERE user_id = p_user RETURNING * INTO v_row;
  ELSIF p_op = 'change_plan' THEN
    IF v_prev.plan_id = v_plan.id THEN RETURN jsonb_build_object('ok', false, 'error', 'same_plan'); END IF;
    UPDATE public.user_subscriptions SET plan_id = v_plan.id, is_free = coalesce(p_is_free, is_free), updated_at = now()
     WHERE user_id = p_user RETURNING * INTO v_row;
  ELSIF p_op = 'cancel' THEN
    UPDATE public.user_subscriptions SET status = 'cancelled', unlimited = false, ends_at = now(),
      next_coin_at = NULL, updated_at = now()
     WHERE user_id = p_user RETURNING * INTO v_row;
  ELSIF p_op = 'set_end' THEN
    IF p_ends_at IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_end'); END IF;
    UPDATE public.user_subscriptions SET unlimited = false, ends_at = p_ends_at,
      is_free = coalesce(p_is_free, is_free), updated_at = now()
     WHERE user_id = p_user RETURNING * INTO v_row;
  ELSIF p_op = 'set_unlimited' THEN
    IF coalesce(p_unlimited, true) THEN
      IF v_prev.unlimited THEN RETURN jsonb_build_object('ok', false, 'error', 'already_unlimited'); END IF;
      UPDATE public.user_subscriptions SET unlimited = true, ends_at = NULL,
        next_coin_at = coalesce(next_coin_at, now()), is_free = coalesce(p_is_free, is_free), updated_at = now()
       WHERE user_id = p_user RETURNING * INTO v_row;
    ELSE
      IF NOT v_prev.unlimited THEN RETURN jsonb_build_object('ok', false, 'error', 'not_unlimited'); END IF;
      v_new_ends := coalesce(p_ends_at, CASE WHEN p_days IS NOT NULL THEN now() + make_interval(days => p_days) END);
      IF v_new_ends IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_end'); END IF;
      UPDATE public.user_subscriptions SET unlimited = false, ends_at = v_new_ends,
        is_free = coalesce(p_is_free, is_free), updated_at = now()
       WHERE user_id = p_user RETURNING * INTO v_row;
    END IF;
  END IF;

  INSERT INTO public.subscription_events (user_id, kind, prev_plan, new_plan, prev_ends_at, new_ends_at,
    prev_unlimited, new_unlimited, actor_id, actor_kind, reason, note, is_free, batch_id, request_id)
  VALUES (p_user, p_op,
    CASE WHEN v_had THEN v_prev.plan_id END, v_row.plan_id,
    CASE WHEN v_had THEN v_prev.ends_at END, v_row.ends_at,
    CASE WHEN v_had THEN v_prev.unlimited END, v_row.unlimited,
    p_actor, 'admin', v_reason, v_note, v_row.is_free, p_batch, v_req)
  RETURNING * INTO v_event;

  -- The first gift is paid at the grant (and an unlimited switch may make a cycle due).
  v_coins := public.premium_pay_cycles(p_user);
  SELECT * INTO v_row FROM public.user_subscriptions WHERE user_id = p_user;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'subscription', public.premium_sub_json(v_row),
    'event', public.premium_event_json(v_event), 'coin_cycles_paid_now', v_coins);
END;
$$;

-- 6) Bulk: one batch row, each user applied on its own (a failure never undoes the others).
CREATE OR REPLACE FUNCTION public.premium_admin_bulk(
  p_actor uuid, p_user_ids uuid[], p_op text, p_plan text, p_days integer, p_ends_at timestamptz,
  p_unlimited boolean, p_is_free boolean, p_reason text, p_note text, p_request_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_req text := nullif(btrim(coalesce(p_request_id, '')), '');
  v_batch public.premium_bulk_batches;
  v_ids uuid[];
  v_uid uuid;
  v_res jsonb;
  v_ok integer := 0;
  v_failed integer := 0;
BEGIN
  IF v_req IS NULL OR v_req !~ '^[A-Za-z0-9:_.-]{8,100}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request_id');
  END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(coalesce(p_user_ids, '{}'::uuid[])) x WHERE x IS NOT NULL;
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'no_users'); END IF;
  IF cardinality(v_ids) > 500 THEN RETURN jsonb_build_object('ok', false, 'error', 'too_many_users'); END IF;

  PERFORM pg_advisory_xact_lock(hashtext('premium:bulk:' || v_req));
  SELECT * INTO v_batch FROM public.premium_bulk_batches WHERE request_id = v_req;
  IF NOT FOUND THEN
    INSERT INTO public.premium_bulk_batches (actor_id, plan_id, op, params, request_id, total)
    VALUES (p_actor, p_plan, coalesce(p_op, ''), jsonb_build_object('days', p_days, 'ends_at', p_ends_at,
      'unlimited', p_unlimited, 'is_free', p_is_free, 'reason', p_reason, 'note', p_note), v_req, cardinality(v_ids))
    RETURNING * INTO v_batch;
    FOREACH v_uid IN ARRAY v_ids LOOP
      BEGIN
        v_res := public.premium_admin_apply(p_actor, v_uid, p_op, p_plan, p_days, p_ends_at, p_unlimited,
          p_is_free, p_reason, p_note, v_req, v_batch.id);
      EXCEPTION WHEN OTHERS THEN
        v_res := jsonb_build_object('ok', false, 'error', 'server_error');
      END;
      INSERT INTO public.premium_bulk_results (batch_id, user_id, ok, error, event_id)
      VALUES (v_batch.id, v_uid, coalesce((v_res ->> 'ok')::boolean, false), v_res ->> 'error',
        nullif(v_res -> 'event' ->> 'id', '')::uuid);
      IF coalesce((v_res ->> 'ok')::boolean, false) THEN v_ok := v_ok + 1; ELSE v_failed := v_failed + 1; END IF;
    END LOOP;
    UPDATE public.premium_bulk_batches SET ok = v_ok, failed = v_failed WHERE id = v_batch.id RETURNING * INTO v_batch;
    RETURN public.premium_bulk_get(v_batch.id) || jsonb_build_object('replay', false);
  END IF;
  RETURN public.premium_bulk_get(v_batch.id) || jsonb_build_object('replay', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.premium_bulk_get(p_batch uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN b.id IS NULL THEN jsonb_build_object('ok', false, 'error', 'not_found') ELSE jsonb_build_object(
    'ok', true,
    'batch', jsonb_build_object('id', b.id, 'total', b.total, 'ok', b.ok, 'failed', b.failed, 'created_at', b.created_at,
      'op', b.op, 'plan_id', b.plan_id, 'actor_id', b.actor_id, 'request_id', b.request_id, 'params', b.params),
    'results', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id', r.user_id, 'ok', r.ok, 'error', r.error,
      'event_id', r.event_id) ORDER BY r.ok, r.user_id) FROM public.premium_bulk_results r WHERE r.batch_id = b.id), '[]'::jsonb)
  ) END
  FROM (SELECT p_batch AS want) w LEFT JOIN public.premium_bulk_batches b ON b.id = w.want;
$$;

-- 7) Sweeper side effects.
CREATE OR REPLACE FUNCTION public.premium_grant_due_coins(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  v_users integer := 0;
  v_cycles integer := 0;
  v_errors integer := 0;
  v_n integer;
BEGIN
  FOR r IN
    SELECT user_id FROM public.user_subscriptions
     WHERE status = 'active' AND next_coin_at IS NOT NULL AND next_coin_at <= now()
       AND (unlimited OR next_coin_at < ends_at)
       AND (p_user IS NULL OR user_id = p_user)
     ORDER BY next_coin_at
     LIMIT 500
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_n := public.premium_pay_cycles(r.user_id);
      v_users := v_users + 1;
      v_cycles := v_cycles + v_n;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('users', v_users, 'cycles', v_cycles, 'errors', v_errors);
END;
$$;

CREATE OR REPLACE FUNCTION public.premium_expire_due()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r public.user_subscriptions;
  v_ids uuid[] := '{}';
  v_errors integer := 0;
BEGIN
  -- Ended memberships, and memberships of deleted accounts (they would otherwise keep logging
  -- withheld gift cycles forever).
  FOR r IN
    SELECT s.* FROM public.user_subscriptions s
     WHERE s.status = 'active'
       AND ((NOT s.unlimited AND s.ends_at <= now())
         OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = s.user_id AND u.deleted_at IS NOT NULL))
     ORDER BY s.ends_at NULLS LAST
     LIMIT 500
     FOR UPDATE OF s SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.premium_pay_cycles(r.user_id);   -- cycles that started before the end are still owed
      UPDATE public.user_subscriptions SET status = 'expired', next_coin_at = NULL, updated_at = now()
       WHERE user_id = r.user_id;
      INSERT INTO public.subscription_events (user_id, kind, prev_plan, new_plan, prev_ends_at, new_ends_at,
        prev_unlimited, new_unlimited, actor_kind, reason, is_free)
      VALUES (r.user_id, 'expire', r.plan_id, r.plan_id, r.ends_at, r.ends_at, r.unlimited, r.unlimited, 'system',
        CASE WHEN NOT r.unlimited AND r.ends_at <= now() THEN 'ended' ELSE 'account_deleted' END, r.is_free);
      v_ids := v_ids || r.user_id;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('expired', cardinality(v_ids), 'user_ids', to_jsonb(v_ids), 'errors', v_errors);
END;
$$;

-- The backend interval calls this every 5 minutes; with several instances only one does the work.
CREATE OR REPLACE FUNCTION public.premium_run_scheduled()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_coins jsonb;
  v_exp jsonb;
  v_users jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('premium:scheduler')) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;
  SELECT coalesce(jsonb_agg(user_id), '[]'::jsonb) INTO v_users FROM public.user_subscriptions
   WHERE status = 'active' AND next_coin_at <= now() AND (unlimited OR next_coin_at < ends_at);
  v_coins := public.premium_grant_due_coins(NULL);
  v_exp := public.premium_expire_due();
  RETURN jsonb_build_object('skipped', false, 'coins', v_coins, 'expire', v_exp, 'coin_user_ids', v_users);
END;
$$;

-- 8) Campaign redeem (phase 1: free_membership only; percent / fixed change nothing).
CREATE OR REPLACE FUNCTION public.premium_campaign_redeem(p_user uuid, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  c public.premium_campaigns;
  v_prev public.user_subscriptions;
  v_had boolean;
  v_used integer;
  v_row public.user_subscriptions;
  v_event public.subscription_events;
  v_plan public.premium_plans;
BEGIN
  IF p_user IS NULL OR char_length(v_norm) NOT BETWEEN 4 AND 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('premium:user:' || p_user::text));
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user AND deleted_at IS NULL AND NOT coalesce(is_banned, false)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  SELECT * INTO c FROM public.premium_campaigns WHERE code = v_norm FOR UPDATE;
  IF NOT FOUND OR NOT c.active OR c.starts_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  IF c.allowed_user_ids IS NOT NULL AND cardinality(c.allowed_user_ids) > 0 AND NOT (p_user = ANY (c.allowed_user_ids)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  IF c.ends_at IS NOT NULL AND c.ends_at <= now() THEN RETURN jsonb_build_object('ok', false, 'error', 'expired'); END IF;
  IF c.kind <> 'free_membership' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_redeemable'); END IF;
  IF c.total_limit IS NOT NULL AND c.used_count >= c.total_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limit');
  END IF;
  SELECT count(*) INTO v_used FROM public.premium_campaign_redemptions WHERE campaign_id = c.id AND user_id = p_user;
  IF v_used >= c.per_user_limit THEN RETURN jsonb_build_object('ok', false, 'error', 'used'); END IF;
  SELECT * INTO v_plan FROM public.premium_plans WHERE id = c.plan_id;
  IF NOT FOUND OR v_plan.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'error', 'unavailable'); END IF;

  PERFORM public.premium_pay_cycles(p_user);
  SELECT * INTO v_prev FROM public.user_subscriptions WHERE user_id = p_user FOR UPDATE;
  v_had := FOUND;
  IF v_had AND v_prev.status = 'active' AND (v_prev.unlimited OR v_prev.ends_at > now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_active');
  END IF;

  UPDATE public.premium_campaigns SET used_count = used_count + 1, updated_at = now()
   WHERE id = c.id AND (total_limit IS NULL OR used_count < total_limit);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'limit'); END IF;

  INSERT INTO public.user_subscriptions AS t (user_id, plan_id, status, started_at, ends_at, unlimited, is_free,
    source, next_coin_at, coin_cycles_paid, created_at, updated_at)
  VALUES (p_user, v_plan.id, 'active', now(), now() + make_interval(days => c.duration_days), false, true, 'campaign',
    now(), 0, now(), now())
  ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', started_at = EXCLUDED.started_at,
    ends_at = EXCLUDED.ends_at, unlimited = false, is_free = true, source = 'campaign',
    next_coin_at = EXCLUDED.next_coin_at, coin_cycles_paid = 0, updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO public.subscription_events (user_id, kind, prev_plan, new_plan, prev_ends_at, new_ends_at,
    prev_unlimited, new_unlimited, actor_kind, reason, is_free, campaign_id, meta)
  VALUES (p_user, 'campaign_redeem', CASE WHEN v_had THEN v_prev.plan_id END, v_row.plan_id,
    CASE WHEN v_had THEN v_prev.ends_at END, v_row.ends_at, CASE WHEN v_had THEN v_prev.unlimited END, false,
    'campaign', 'campaign', true, c.id, jsonb_build_object('campaign', c.code))
  RETURNING * INTO v_event;

  INSERT INTO public.premium_campaign_redemptions (campaign_id, user_id, use_no, event_id)
  VALUES (c.id, p_user, v_used + 1, v_event.id);

  PERFORM public.premium_pay_cycles(p_user);
  SELECT * INTO v_row FROM public.user_subscriptions WHERE user_id = p_user;
  RETURN jsonb_build_object('ok', true, 'subscription', public.premium_sub_json(v_row),
    'event', public.premium_event_json(v_event), 'plan', v_plan.id, 'days', c.duration_days);
END;
$$;

-- 9) Read models.
CREATE OR REPLACE FUNCTION public.premium_me(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN s.user_id IS NULL OR NOT (s.status = 'active' AND (s.unlimited OR s.ends_at > now()))
    THEN jsonb_build_object('plan', NULL, 'status', coalesce(public.premium_sub_json(s) ->> 'status', 'none'),
      'ends_at', s.ends_at, 'unlimited', false, 'monthly_descoin', NULL, 'next_coin_at', NULL,
      'last_plan', s.plan_id)
    ELSE jsonb_build_object('plan', s.plan_id, 'status', 'active', 'ends_at', s.ends_at, 'unlimited', s.unlimited,
      'started_at', s.started_at, 'is_free', s.is_free, 'source', s.source,
      'monthly_descoin', p.monthly_descoin,
      'next_coin_at', CASE WHEN s.unlimited OR s.next_coin_at < s.ends_at THEN s.next_coin_at END)
  END
  FROM (SELECT p_user AS want) w
  LEFT JOIN public.user_subscriptions s ON s.user_id = w.want
  LEFT JOIN public.premium_plans p ON p.id = s.plan_id;
$$;

-- Several users at once (profile badges): only memberships active right now.
CREATE OR REPLACE FUNCTION public.premium_active_for(p_user_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id', s.user_id, 'plan', s.plan_id)), '[]'::jsonb)
    FROM public.user_subscriptions s
   WHERE s.user_id = ANY (coalesce(p_user_ids, '{}'::uuid[]))
     AND s.status = 'active' AND (s.unlimited OR s.ends_at > now());
$$;

CREATE OR REPLACE FUNCTION public.premium_admin_user_search(p_q text, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_q text := btrim(regexp_replace(coalesce(p_q, ''), '^@', ''));
  v_like text;
  v_id uuid;
BEGIN
  IF char_length(v_q) < 1 OR char_length(v_q) > 120 THEN RETURN '[]'::jsonb; END IF;
  v_like := '%' || replace(replace(replace(lower(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  IF v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_id := v_q::uuid; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x.j ORDER BY x.rank, x.uname)
      FROM (
        SELECT jsonb_build_object('id', u.id, 'username', u.username, 'display_name', u.display_name,
                 'avatar_url', u.avatar_url, 'email_masked', public.premium_mask_email(u.email),
                 'subscription', public.premium_sub_json(s)) AS j,
               lower(u.username) AS uname,
               CASE WHEN u.id = v_id THEN 0
                    WHEN lower(u.username) = lower(v_q) THEN 1
                    WHEN lower(coalesce(u.email, '')) = lower(v_q) THEN 1
                    WHEN lower(u.username) LIKE replace(v_like, '%', '') || '%' THEN 2
                    ELSE 3 END AS rank
          FROM public.users u
          LEFT JOIN public.user_subscriptions s ON s.user_id = u.id
         WHERE u.deleted_at IS NULL
           AND (u.id = v_id
             OR lower(u.username) LIKE v_like ESCAPE '\'
             OR lower(coalesce(u.display_name, '')) LIKE v_like ESCAPE '\'
             OR lower(coalesce(u.email, '')) LIKE v_like ESCAPE '\')
         ORDER BY 3, 2
         LIMIT greatest(1, least(coalesce(p_limit, 20), 50))
      ) x), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.premium_admin_user(p_user uuid, p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
    'user', jsonb_build_object('id', u.id, 'username', u.username, 'display_name', u.display_name,
      'avatar_url', u.avatar_url, 'email_masked', public.premium_mask_email(u.email),
      'created_at', (u.created_at AT TIME ZONE 'UTC'), 'deleted', u.deleted_at IS NOT NULL),
    'subscription', (SELECT public.premium_sub_json(s) FROM public.user_subscriptions s WHERE s.user_id = u.id),
    'events', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC) FROM (
       SELECT * FROM public.subscription_events WHERE user_id = u.id
        ORDER BY created_at DESC LIMIT greatest(1, least(coalesce(p_limit, 100), 500))) e), '[]'::jsonb)
  ) END
  FROM (SELECT p_user AS want) w LEFT JOIN public.users u ON u.id = w.want;
$$;

CREATE OR REPLACE FUNCTION public.premium_admin_dashboard()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH s AS (
    SELECT *, status = 'active' AND (unlimited OR ends_at > now()) AS live FROM public.user_subscriptions
  ), acq AS (
    SELECT user_id, created_at FROM public.subscription_events WHERE kind IN ('grant', 'campaign_redeem')
  )
  SELECT jsonb_build_object(
    'active_total', (SELECT count(*) FROM s WHERE live),
    'active_plus', (SELECT count(*) FROM s WHERE live AND plan_id = 'plus'),
    'active_ultra', (SELECT count(*) FROM s WHERE live AND plan_id = 'ultra'),
    'active_by_plan', coalesce((SELECT jsonb_object_agg(plan_id, n) FROM (
        SELECT plan_id, count(*) AS n FROM s WHERE live GROUP BY plan_id) x), '{}'::jsonb),
    'active_unlimited', (SELECT count(*) FROM s WHERE live AND unlimited),
    'expired', (SELECT count(*) FROM s WHERE NOT live AND status <> 'cancelled'),
    'cancelled', (SELECT count(*) FROM s WHERE status = 'cancelled'),
    'expiring_7d', (SELECT count(*) FROM s WHERE live AND NOT unlimited AND ends_at <= now() + interval '7 days'),
    'new_7d', (SELECT count(DISTINCT user_id) FROM acq WHERE created_at > now() - interval '7 days'),
    'new_30d', (SELECT count(DISTINCT user_id) FROM acq WHERE created_at > now() - interval '30 days'),
    'free_count', (SELECT count(*) FROM s WHERE live AND is_free),
    'paid_count', NULL,
    'payments_integrated', false,
    'coins_gifted_total', (SELECT coalesce(sum(coins), 0) FROM public.subscription_events WHERE kind = 'coin_grant'),
    'generated_at', now()
  );
$$;

-- Real series only: a metric without data is null, never a made-up value.
CREATE OR REPLACE FUNCTION public.premium_admin_analytics(p_from timestamptz, p_to timestamptz, p_bucket text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_bucket text := CASE WHEN p_bucket IN ('day', 'week', 'month') THEN p_bucket ELSE 'day' END;
  v_step interval := CASE coalesce(p_bucket, 'day') WHEN 'week' THEN interval '1 week' WHEN 'month' THEN interval '1 month' ELSE interval '1 day' END;
  v_to timestamptz := least(coalesce(p_to, now()), now());
  v_from timestamptz := coalesce(p_from, v_to - interval '30 days');
  v_series jsonb;
  v_any boolean;
  v_avg numeric;
  v_den integer;
  v_num integer;
BEGIN
  IF v_from >= v_to THEN RETURN jsonb_build_object('error', 'invalid_range'); END IF;
  IF v_to - v_from > interval '400 days' THEN v_from := v_to - interval '400 days'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.subscription_events) INTO v_any;

  WITH b AS (
    SELECT gs AS b_start, least(gs + v_step, v_to) AS b_end
      FROM generate_series(date_trunc(v_bucket, v_from), v_to, v_step) gs
  ), ev AS (
    SELECT e.*, coalesce(pp.sort, 0) AS prev_sort, coalesce(np.sort, 0) AS new_sort
      FROM public.subscription_events e
      LEFT JOIN public.premium_plans pp ON pp.id = e.prev_plan
      LEFT JOIN public.premium_plans np ON np.id = e.new_plan
     WHERE e.created_at >= date_trunc(v_bucket, v_from) AND e.created_at < v_to
  )
  SELECT jsonb_agg(jsonb_build_object(
      'bucket', b.b_start,
      'acquisitions', (SELECT count(*) FROM ev WHERE ev.kind IN ('grant', 'campaign_redeem') AND ev.created_at >= b.b_start AND ev.created_at < b.b_end),
      'acquisitions_by_plan', coalesce((SELECT jsonb_object_agg(new_plan, n) FROM (SELECT new_plan, count(*) n FROM ev
          WHERE ev.kind IN ('grant', 'campaign_redeem') AND ev.created_at >= b.b_start AND ev.created_at < b.b_end GROUP BY new_plan) z), '{}'::jsonb),
      'acquisitions_free', (SELECT count(*) FROM ev WHERE ev.kind IN ('grant', 'campaign_redeem') AND ev.is_free AND ev.created_at >= b.b_start AND ev.created_at < b.b_end),
      'cancellations', (SELECT count(*) FROM ev WHERE ev.kind = 'cancel' AND ev.created_at >= b.b_start AND ev.created_at < b.b_end),
      'expirations', (SELECT count(*) FROM ev WHERE ev.kind = 'expire' AND ev.created_at >= b.b_start AND ev.created_at < b.b_end),
      'renewals', (SELECT count(*) FROM ev WHERE ev.kind = 'extend' AND ev.created_at >= b.b_start AND ev.created_at < b.b_end),
      'coin_cycles', (SELECT count(*) FROM ev WHERE ev.kind = 'coin_grant' AND ev.created_at >= b.b_start AND ev.created_at < b.b_end),
      'upgrades', (SELECT count(*) FROM ev WHERE ev.kind = 'change_plan' AND ev.new_sort > ev.prev_sort AND ev.created_at >= b.b_start AND ev.created_at < b.b_end),
      'downgrades', (SELECT count(*) FROM ev WHERE ev.kind = 'change_plan' AND ev.new_sort < ev.prev_sort AND ev.created_at >= b.b_start AND ev.created_at < b.b_end),
      'active', (SELECT count(*) FROM (
          SELECT DISTINCT ON (e.user_id) e.kind, e.new_plan, e.new_unlimited, e.new_ends_at
            FROM public.subscription_events e
           WHERE e.kind <> 'coin_grant' AND e.created_at < b.b_end
           ORDER BY e.user_id, e.created_at DESC, e.id DESC) st
         WHERE st.kind NOT IN ('cancel', 'expire') AND st.new_plan IS NOT NULL
           AND (st.new_unlimited OR st.new_ends_at > b.b_end))
    ) ORDER BY b.b_start)
    INTO v_series FROM b;

  SELECT avg(extract(epoch FROM (s.ends_at - s.started_at)) / 86400.0) INTO v_avg
    FROM public.user_subscriptions s WHERE NOT s.unlimited AND s.ends_at IS NOT NULL;
  SELECT count(*) INTO v_den FROM public.users u
   WHERE u.deleted_at IS NULL AND (u.created_at AT TIME ZONE 'UTC') >= v_from AND (u.created_at AT TIME ZONE 'UTC') < v_to;
  SELECT count(DISTINCT e.user_id) INTO v_num FROM public.subscription_events e JOIN public.users u ON u.id = e.user_id
   WHERE e.kind IN ('grant', 'campaign_redeem') AND e.created_at >= v_from AND e.created_at < v_to
     AND u.deleted_at IS NULL AND (u.created_at AT TIME ZONE 'UTC') >= v_from AND (u.created_at AT TIME ZONE 'UTC') < v_to;

  RETURN jsonb_build_object(
    'from', v_from, 'to', v_to, 'bucket', v_bucket,
    'has_data', v_any,
    'series', CASE WHEN v_any THEN v_series END,
    'plan_split', CASE WHEN v_any THEN coalesce((SELECT jsonb_object_agg(plan_id, n) FROM (
        SELECT plan_id, count(*) n FROM public.user_subscriptions
         WHERE status = 'active' AND (unlimited OR ends_at > now()) GROUP BY plan_id) z), '{}'::jsonb) END,
    'free_paid', CASE WHEN v_any THEN jsonb_build_object(
        'free', (SELECT count(*) FROM public.user_subscriptions WHERE status = 'active' AND (unlimited OR ends_at > now()) AND is_free),
        'paid', NULL, 'payments_integrated', false) END,
    'average_duration_days', CASE WHEN v_avg IS NULL THEN NULL ELSE round(v_avg, 1) END,
    'unlimited_count', CASE WHEN v_any THEN (SELECT count(*) FROM public.user_subscriptions
        WHERE status = 'active' AND unlimited) END,
    'conversion', jsonb_build_object(
        'value', CASE WHEN v_den > 0 THEN round(v_num::numeric / v_den, 4) END,
        'numerator', v_num, 'denominator', v_den,
        'numerator_label', 'accounts_created_in_range_that_got_a_membership_in_range',
        'denominator_label', 'accounts_created_in_range'),
    'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'name', c.name, 'kind', c.kind, 'plan_id', c.plan_id, 'active', c.active,
        'used_total', c.used_count, 'total_limit', c.total_limit,
        'redemptions_in_range', (SELECT count(*) FROM public.premium_campaign_redemptions r
           WHERE r.campaign_id = c.id AND r.created_at >= v_from AND r.created_at < v_to),
        'active_now', (SELECT count(*) FROM public.user_subscriptions s
           WHERE s.source = 'campaign' AND s.status = 'active' AND (s.unlimited OR s.ends_at > now())
             AND EXISTS (SELECT 1 FROM public.premium_campaign_redemptions r2 WHERE r2.campaign_id = c.id AND r2.user_id = s.user_id))
      ) ORDER BY c.created_at DESC) FROM public.premium_campaigns c), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.premium_campaign_stats(p_campaign uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', c.id, 'code', c.code, 'kind', c.kind, 'plan_id', c.plan_id, 'active', c.active,
    'used_count', c.used_count, 'total_limit', c.total_limit, 'per_user_limit', c.per_user_limit,
    'remaining', CASE WHEN c.total_limit IS NULL THEN NULL ELSE greatest(0, c.total_limit - c.used_count) END,
    'unique_users', (SELECT count(DISTINCT r.user_id) FROM public.premium_campaign_redemptions r WHERE r.campaign_id = c.id),
    'active_now', (SELECT count(*) FROM public.user_subscriptions s
       WHERE s.source = 'campaign' AND s.status = 'active' AND (s.unlimited OR s.ends_at > now())
         AND EXISTS (SELECT 1 FROM public.premium_campaign_redemptions r2 WHERE r2.campaign_id = c.id AND r2.user_id = s.user_id)),
    'by_day', coalesce((SELECT jsonb_agg(jsonb_build_object('day', d, 'n', n) ORDER BY d) FROM (
        SELECT date_trunc('day', r.created_at) d, count(*) n FROM public.premium_campaign_redemptions r
         WHERE r.campaign_id = c.id GROUP BY 1) z), '[]'::jsonb),
    'recent', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id', r.user_id, 'username', u.username,
        'created_at', r.created_at) ORDER BY r.created_at DESC) FROM (
        SELECT * FROM public.premium_campaign_redemptions WHERE campaign_id = c.id ORDER BY created_at DESC LIMIT 50) r
        LEFT JOIN public.users u ON u.id = r.user_id), '[]'::jsonb)
  ) END
  FROM (SELECT p_campaign AS want) w LEFT JOIN public.premium_campaigns c ON c.id = w.want;
$$;

-- 10) Service role only.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.premium_mask_email(text)',
    'public.premium_sub_json(public.user_subscriptions)',
    'public.premium_event_json(public.subscription_events)',
    'public.premium_pay_cycles(uuid)',
    'public.premium_admin_apply(uuid, uuid, text, text, integer, timestamptz, boolean, boolean, text, text, text, uuid)',
    'public.premium_admin_bulk(uuid, uuid[], text, text, integer, timestamptz, boolean, boolean, text, text, text)',
    'public.premium_bulk_get(uuid)',
    'public.premium_grant_due_coins(uuid)',
    'public.premium_expire_due()',
    'public.premium_run_scheduled()',
    'public.premium_campaign_redeem(uuid, text)',
    'public.premium_me(uuid)',
    'public.premium_active_for(uuid[])',
    'public.premium_admin_user_search(text, integer)',
    'public.premium_admin_user(uuid, integer)',
    'public.premium_admin_dashboard()',
    'public.premium_admin_analytics(timestamptz, timestamptz, text)',
    'public.premium_campaign_stats(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
