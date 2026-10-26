-- Promosyon kodları (2026-10-26). ADDITIVE ONLY: new tables + new functions, and two CHECK
-- constraints widened to a strict superset of their current values. Nothing is dropped or renamed.
--
-- Redemption, admin create/update, popup delivery and history all run inside Postgres functions
-- called from the backend with the service role (supabase.rpc). One call = one transaction, so a
-- redemption either lands completely (code counter, redemption row, ledger row, balance, item)
-- or not at all, and two concurrent calls can never spend the same use twice:
--   * the code row is locked FOR UPDATE before any check,
--   * used_count only moves under `used_count < max_uses`,
--   * UNIQUE (code_id, user_id, use_no) makes a second "once per person" use impossible,
--   * the per-user attempt limiter is serialised with a transaction advisory lock.
--
-- Not applied anywhere yet: applying this to production needs Demir's approval.

-- 1) Widen existing CHECK constraints (superset; every existing row stays valid).
--    'shop_refund' is already written by lib/shopPurchase.js but was missing from the production
--    constraint; it is included here so the widened list matches what the backend writes.
ALTER TABLE public.descoin_ledger DROP CONSTRAINT IF EXISTS descoin_ledger_reason_check;
ALTER TABLE public.descoin_ledger ADD CONSTRAINT descoin_ledger_reason_check
  CHECK (reason IN (
    'voice_activity', 'screenshare_activity', 'message_activity',
    'shop_purchase', 'admin_grant', 'admin_revoke',
    'referral_invite', 'referral_welcome', 'daily_claim', 'streak_bonus',
    'shop_refund', 'promo'
  )) NOT VALID;
ALTER TABLE public.descoin_ledger VALIDATE CONSTRAINT descoin_ledger_reason_check;

ALTER TABLE public.user_inventory DROP CONSTRAINT IF EXISTS user_inventory_acquired_via_check;
ALTER TABLE public.user_inventory ADD CONSTRAINT user_inventory_acquired_via_check
  CHECK (acquired_via IN ('purchase', 'gift', 'voucher', 'promo')) NOT VALID;
ALTER TABLE public.user_inventory VALIDATE CONSTRAINT user_inventory_acquired_via_check;

-- 2) Tables.
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_norm            text NOT NULL UNIQUE CHECK (code_norm ~ '^[A-Z0-9]{16}$'),
  reward_type          text NOT NULL CHECK (reward_type IN ('descoin', 'shop_item', 'special_badge')),
  reward_amount        integer CHECK (reward_amount IS NULL OR (reward_amount > 0 AND reward_amount <= 100000)),
  reward_ref           text CHECK (reward_ref IS NULL OR char_length(reward_ref) <= 120),
  message              text CHECK (message IS NULL OR char_length(message) <= 140),
  max_uses             integer CHECK (max_uses IS NULL OR max_uses > 0),
  used_count           integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  min_account_age_days integer NOT NULL DEFAULT 0 CHECK (min_account_age_days BETWEEN 0 AND 3650),
  once_per_user        boolean NOT NULL DEFAULT true,
  active               boolean NOT NULL DEFAULT true,
  starts_at            timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  popup_audience       text NOT NULL DEFAULT 'none' CHECK (popup_audience IN ('none', 'all', 'active_7d', 'selected')),
  created_by           uuid NOT NULL REFERENCES public.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_uses_within_limit CHECK (max_uses IS NULL OR used_count <= max_uses),
  CONSTRAINT promo_codes_reward_shape CHECK (
    (reward_type = 'descoin' AND reward_amount IS NOT NULL)
    OR (reward_type IN ('shop_item', 'special_badge') AND reward_ref IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS promo_codes_created_idx ON public.promo_codes (created_at DESC);

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id    uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  use_no     integer NOT NULL DEFAULT 1 CHECK (use_no > 0),
  reward     jsonb NOT NULL DEFAULT '{}'::jsonb,
  descoin_credited integer NOT NULL DEFAULT 0,
  withheld   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_id, user_id, use_no)
);
CREATE INDEX IF NOT EXISTS promo_redemptions_user_idx ON public.promo_redemptions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS promo_redemptions_code_idx ON public.promo_redemptions (code_id, created_at DESC);

-- 'selected' audience: popup targets, and the only accounts allowed to use the code
-- (this is how a personal, single-use code is made: one target + limit 1).
CREATE TABLE IF NOT EXISTS public.promo_popup_targets (
  code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (code_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.promo_popup_seen (
  code_id       uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seen_at       timestamptz NOT NULL DEFAULT now(),
  snoozed_until timestamptz,
  shown_count   integer NOT NULL DEFAULT 1,
  PRIMARY KEY (code_id, user_id)
);

-- Every redeem attempt (ok or not). ip_hash is an HMAC of the address, never the address.
CREATE TABLE IF NOT EXISTS public.promo_attempts (
  id         bigserial PRIMARY KEY,
  user_id    uuid,
  ip_hash    text,
  ok         boolean NOT NULL,
  result     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_attempts_user_idx ON public.promo_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS promo_attempts_ip_idx ON public.promo_attempts (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS promo_attempts_created_idx ON public.promo_attempts (created_at DESC);

-- Admin audit trail for every promo admin action.
CREATE TABLE IF NOT EXISTS public.promo_audit (
  id         bigserial PRIMARY KEY,
  admin_id   uuid,
  action     text NOT NULL,
  code_id    uuid,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_audit_code_idx ON public.promo_audit (code_id, created_at DESC);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_popup_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_popup_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.promo_codes, public.promo_redemptions, public.promo_popup_targets,
  public.promo_popup_seen, public.promo_attempts, public.promo_audit FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.promo_attempts_id_seq, public.promo_audit_id_seq FROM anon, authenticated;

-- 3) Helpers.

-- Upper-case, drop everything that is not A-Z / 0-9 (dashes, spaces, en dashes).
CREATE OR REPLACE FUNCTION public.promo_normalize(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
$$;

-- Anti-bot risk gate (descoin-antibot Faz 0 owns public.descoin_risk). Returns true when the code's
-- DesCoin must be withheld. Score >= 70 withholds unless the account is marked trusted. When the
-- table or the row is missing, p_unknown decides ('allow' by default; 'withhold' is the strict mode).
CREATE OR REPLACE FUNCTION public.promo_risk_withhold(p_user_id uuid, p_unknown text DEFAULT 'allow')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_score numeric;
  v_trusted boolean;
BEGIN
  IF to_regclass('public.descoin_risk') IS NULL THEN
    RETURN coalesce(p_unknown, 'allow') = 'withhold';
  END IF;
  BEGIN
    EXECUTE 'SELECT score::numeric, coalesce(trusted, false) FROM public.descoin_risk WHERE user_id = $1'
      INTO v_score, v_trusted USING p_user_id;
  EXCEPTION WHEN undefined_column OR undefined_table OR invalid_text_representation THEN
    RETURN coalesce(p_unknown, 'allow') = 'withhold';
  END;
  IF v_trusted THEN RETURN false; END IF;
  IF v_score IS NULL THEN RETURN coalesce(p_unknown, 'allow') = 'withhold'; END IF;
  RETURN v_score >= 70;
END;
$$;

-- Display shape of one code (admin + user).
CREATE OR REPLACE FUNCTION public.promo_reward_json(c public.promo_codes)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item record;
BEGIN
  IF c.reward_type = 'descoin' THEN
    RETURN jsonb_build_object('type', 'descoin', 'amount', c.reward_amount);
  ELSIF c.reward_type = 'shop_item' THEN
    SELECT id, name, category, price_descoin INTO v_item FROM public.shop_items WHERE id::text = c.reward_ref;
    RETURN jsonb_build_object('type', 'shop_item', 'itemId', c.reward_ref,
      'name', v_item.name, 'category', v_item.category, 'price', v_item.price_descoin);
  END IF;
  -- special_badge: the badge catalog (separate task) may describe the badge; otherwise just the ref.
  RETURN jsonb_build_object('type', 'special_badge', 'badgeId', c.reward_ref);
END;
$$;

-- Badge extension point. The special-badge task ships
--   public.promo_grant_special_badge(p_user_id uuid, p_badge_id text, p_code_id uuid) RETURNS boolean
-- (true = granted now, false = already owned). Until it exists, badge codes cannot be created or used.
CREATE OR REPLACE FUNCTION public.promo_badges_available()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT to_regprocedure('public.promo_grant_special_badge(uuid, text, uuid)') IS NOT NULL;
$$;

-- 4) Redeem.
CREATE OR REPLACE FUNCTION public.promo_redeem(
  p_user_id uuid,
  p_code text,
  p_ip_hash text DEFAULT NULL,
  p_risk_unknown text DEFAULT 'allow'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_norm text := public.promo_normalize(p_code);
  v_user record;
  v_code public.promo_codes%ROWTYPE;
  v_fail_user int;
  v_fail_ip int;
  v_lock_until timestamptz;
  v_err text;
  v_extra jsonb := '{}'::jsonb;
  v_use_no int := 1;
  v_withhold boolean := false;
  v_credit int := 0;
  v_balance bigint;
  v_reward jsonb;
  v_item record;
  v_inv_id uuid;
  v_refund int := 0;
  v_badge_new boolean;
  v_redemption_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  -- One attempt at a time per account, so the 5-per-10-minutes limit cannot be raced.
  PERFORM pg_advisory_xact_lock(hashtext('promo_redeem'), hashtext(p_user_id::text));

  -- Wrong-try limits: 5 per account in 10 minutes, 30 per IP hash in an hour; then a 10-minute lock
  -- counted from the last wrong try. 'locked' rows are logged but never extend the lock.
  SELECT count(*), max(created_at) INTO v_fail_user, v_lock_until
    FROM public.promo_attempts
   WHERE user_id = p_user_id AND NOT ok AND result IN ('invalid', 'expired')
     AND created_at > v_now - interval '10 minutes';
  IF v_fail_user >= 5 THEN
    v_lock_until := v_lock_until + interval '10 minutes';
  ELSE
    v_lock_until := NULL;
  END IF;
  IF v_lock_until IS NULL AND p_ip_hash IS NOT NULL THEN
    SELECT count(*), max(created_at) INTO v_fail_ip, v_lock_until
      FROM public.promo_attempts
     WHERE ip_hash = p_ip_hash AND NOT ok AND result IN ('invalid', 'expired')
       AND created_at > v_now - interval '1 hour';
    IF v_fail_ip >= 30 THEN
      v_lock_until := v_lock_until + interval '10 minutes';
    ELSE
      v_lock_until := NULL;
    END IF;
  END IF;
  IF v_lock_until IS NOT NULL AND v_lock_until > v_now THEN
    INSERT INTO public.promo_attempts (user_id, ip_hash, ok, result) VALUES (p_user_id, p_ip_hash, false, 'locked');
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited',
      'retryAfter', greatest(1, ceil(extract(epoch FROM (v_lock_until - v_now)))::int));
  END IF;

  SELECT id, created_at, coalesce(is_banned, false) AS banned, deleted_at, coalesce(descoin_frozen, false) AS frozen
    INTO v_user FROM public.users WHERE id = p_user_id;

  IF NOT FOUND OR v_user.banned OR v_user.deleted_at IS NOT NULL OR length(v_norm) <> 16 THEN
    v_err := 'invalid';
  ELSE
    SELECT * INTO v_code FROM public.promo_codes WHERE code_norm = v_norm FOR UPDATE;
    IF NOT FOUND THEN
      v_err := 'invalid';
    ELSIF v_code.popup_audience = 'selected'
      AND NOT EXISTS (SELECT 1 FROM public.promo_popup_targets t WHERE t.code_id = v_code.id AND t.user_id = p_user_id) THEN
      v_err := 'invalid';              -- personal codes: someone else's code looks like a wrong code
    ELSIF NOT v_code.active OR v_code.starts_at > v_now THEN
      v_err := 'invalid';
    ELSIF v_code.expires_at IS NOT NULL AND v_code.expires_at <= v_now THEN
      v_err := 'expired';
    ELSIF v_code.once_per_user AND EXISTS (
      SELECT 1 FROM public.promo_redemptions r WHERE r.code_id = v_code.id AND r.user_id = p_user_id) THEN
      v_err := 'used';
    ELSIF v_code.max_uses IS NOT NULL AND v_code.used_count >= v_code.max_uses THEN
      v_err := 'limit';
    ELSIF v_code.min_account_age_days > 0
      AND (v_user.created_at::timestamp AT TIME ZONE 'UTC') > v_now - make_interval(days => v_code.min_account_age_days) THEN
      v_err := 'age';
      v_extra := jsonb_build_object('days', v_code.min_account_age_days,
        'availableAt', (v_user.created_at::timestamp AT TIME ZONE 'UTC') + make_interval(days => v_code.min_account_age_days));
    ELSIF v_code.reward_type = 'special_badge' AND NOT public.promo_badges_available() THEN
      v_err := 'unavailable';
    ELSIF v_code.reward_type IN ('descoin', 'shop_item') AND v_user.frozen THEN
      v_err := 'wallet_frozen';
    END IF;
  END IF;

  IF v_err IS NOT NULL THEN
    INSERT INTO public.promo_attempts (user_id, ip_hash, ok, result) VALUES (p_user_id, p_ip_hash, false, v_err);
    RETURN jsonb_build_object('ok', false, 'error', v_err) || v_extra;
  END IF;

  -- All checks passed. Everything below commits together or not at all.
  BEGIN
    IF NOT v_code.once_per_user THEN
      SELECT coalesce(max(use_no), 0) + 1 INTO v_use_no
        FROM public.promo_redemptions WHERE code_id = v_code.id AND user_id = p_user_id;
    END IF;

    UPDATE public.promo_codes
       SET used_count = used_count + 1, updated_at = v_now
     WHERE id = v_code.id AND (max_uses IS NULL OR used_count < max_uses);
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promo:limit';
    END IF;

    v_reward := public.promo_reward_json(v_code);
    v_withhold := v_code.reward_type IN ('descoin', 'shop_item') AND public.promo_risk_withhold(p_user_id, p_risk_unknown);

    INSERT INTO public.promo_redemptions (code_id, user_id, use_no, reward, withheld)
    VALUES (v_code.id, p_user_id, v_use_no, v_reward, false)
    RETURNING id INTO v_redemption_id;

    IF v_code.reward_type = 'descoin' THEN
      v_credit := v_code.reward_amount;
    ELSIF v_code.reward_type = 'shop_item' THEN
      SELECT id, name, category, coalesce(price_descoin, 0) AS price INTO v_item
        FROM public.shop_items WHERE id::text = v_code.reward_ref;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promo:unavailable';
      END IF;
      INSERT INTO public.user_inventory (user_id, item_id, acquired_via)
      VALUES (p_user_id, v_item.id, 'promo')
      ON CONFLICT (user_id, item_id) DO NOTHING
      RETURNING id INTO v_inv_id;
      IF v_inv_id IS NULL THEN
        v_refund := v_item.price;      -- already owned: the item's price comes back as DesCoin
        v_credit := v_refund;
      END IF;
      v_reward := v_reward || jsonb_build_object('alreadyOwned', v_inv_id IS NULL, 'refund', v_refund);
    ELSIF v_code.reward_type = 'special_badge' THEN
      EXECUTE 'SELECT public.promo_grant_special_badge($1, $2, $3)'
        INTO v_badge_new USING p_user_id, v_code.reward_ref, v_code.id;
      IF NOT coalesce(v_badge_new, false) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promo:badge_owned';
      END IF;
    END IF;

    IF v_credit > 0 AND v_withhold THEN
      v_credit := 0;                   -- risk 70+: silent withhold, no ledger row, balance unchanged
    END IF;
    IF v_credit > 0 THEN
      UPDATE public.users SET descoin_balance = coalesce(descoin_balance, 0) + v_credit
       WHERE id = p_user_id RETURNING descoin_balance INTO v_balance;
      INSERT INTO public.descoin_ledger (user_id, amount, reason, meta, balance_after)
      VALUES (p_user_id, v_credit, 'promo',
        jsonb_build_object('promo_code_id', v_code.id, 'redemption_id', v_redemption_id,
          'kind', CASE WHEN v_refund > 0 THEN 'owned_item_refund' ELSE 'reward' END),
        v_balance);
    ELSE
      SELECT coalesce(descoin_balance, 0) INTO v_balance FROM public.users WHERE id = p_user_id;
    END IF;

    UPDATE public.promo_redemptions
       SET descoin_credited = v_credit, withheld = v_withhold AND (v_code.reward_type = 'descoin' OR v_refund > 0),
           reward = v_reward
     WHERE id = v_redemption_id;

    -- Using the code closes its popup for good.
    INSERT INTO public.promo_popup_seen (code_id, user_id, seen_at, snoozed_until, shown_count)
    VALUES (v_code.id, p_user_id, v_now, NULL, 1)
    ON CONFLICT (code_id, user_id) DO UPDATE SET snoozed_until = NULL, seen_at = EXCLUDED.seen_at;

    INSERT INTO public.promo_attempts (user_id, ip_hash, ok, result) VALUES (p_user_id, p_ip_hash, true, 'ok');
  EXCEPTION
    WHEN unique_violation THEN
      v_err := 'used';
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'promo:%' THEN
        v_err := substr(SQLERRM, 7);
      ELSE
        RAISE;
      END IF;
  END;

  IF v_err IS NOT NULL THEN
    INSERT INTO public.promo_attempts (user_id, ip_hash, ok, result) VALUES (p_user_id, p_ip_hash, false, v_err);
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;

  -- A withheld reward still reads as a normal success (silent, like the anti-bot earn path),
  -- but the reported balance is the real one.
  RETURN jsonb_build_object(
    'ok', true,
    'codeId', v_code.id,
    'reward', v_reward || CASE WHEN v_code.reward_type = 'descoin' THEN jsonb_build_object('amount', v_code.reward_amount) ELSE '{}'::jsonb END,
    'balance', v_balance
  );
END;
$$;

-- 5) User history (Ayarlar → Promosyon Kodu).
CREATE OR REPLACE FUNCTION public.promo_history(p_user_id uuid, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'at') DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object('id', r.id, 'code', c.code_norm, 'reward', r.reward, 'at', r.created_at) AS x
      FROM public.promo_redemptions r JOIN public.promo_codes c ON c.id = r.code_id
     WHERE r.user_id = p_user_id
     ORDER BY r.created_at DESC
     LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  ) s;
$$;

-- 6) Popup: which code (if any) should this person see now?
--    Shown once; "Sonra" snoozes it 24 hours and it comes back exactly once more.
--    'all' and 'active_7d' never reach accounts created after the code.
CREATE OR REPLACE FUNCTION public.promo_popup_for(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
           'id', c.id, 'code', c.code_norm, 'message', c.message,
           'reward', public.promo_reward_json(c), 'expiresAt', c.expires_at)
    FROM public.promo_codes c
    JOIN public.users u ON u.id = p_user_id
    LEFT JOIN public.promo_popup_seen s ON s.code_id = c.id AND s.user_id = p_user_id
   WHERE c.active
     AND c.popup_audience <> 'none'
     AND c.starts_at <= now()
     AND (c.expires_at IS NULL OR c.expires_at > now())
     AND (c.max_uses IS NULL OR c.used_count < c.max_uses)
     AND coalesce(u.is_banned, false) = false AND u.deleted_at IS NULL
     AND (c.reward_type <> 'special_badge' OR public.promo_badges_available())
     AND NOT EXISTS (SELECT 1 FROM public.promo_redemptions r WHERE r.code_id = c.id AND r.user_id = p_user_id)
     AND (
       (c.popup_audience = 'all' AND (u.created_at::timestamp AT TIME ZONE 'UTC') < c.created_at)
       OR (c.popup_audience = 'active_7d' AND (u.created_at::timestamp AT TIME ZONE 'UTC') < c.created_at
           AND (coalesce(u.last_seen, u.created_at)::timestamp AT TIME ZONE 'UTC') > now() - interval '7 days')
       OR (c.popup_audience = 'selected' AND EXISTS (
             SELECT 1 FROM public.promo_popup_targets t WHERE t.code_id = c.id AND t.user_id = p_user_id))
     )
     AND (s.code_id IS NULL OR (s.snoozed_until IS NOT NULL AND s.snoozed_until <= now() AND s.shown_count < 2))
   ORDER BY c.created_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.promo_popup_mark(p_user_id uuid, p_code_id uuid, p_snooze boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.promo_popup_seen%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.promo_popup_seen WHERE code_id = p_code_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.promo_codes WHERE id = p_code_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;
    INSERT INTO public.promo_popup_seen (code_id, user_id, seen_at, snoozed_until, shown_count)
    VALUES (p_code_id, p_user_id, now(),
            CASE WHEN p_snooze THEN now() + interval '24 hours' END, 1);
  ELSIF v_row.snoozed_until IS NOT NULL AND v_row.snoozed_until <= now() AND v_row.shown_count < 2 THEN
    -- The one comeback: whatever the answer, it does not come back again.
    UPDATE public.promo_popup_seen SET seen_at = now(), snoozed_until = NULL, shown_count = 2
     WHERE code_id = p_code_id AND user_id = p_user_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7) Admin.
CREATE OR REPLACE FUNCTION public.promo_admin_create(p_admin_id uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_norm text := public.promo_normalize(p->>'code');
  v_type text := p->>'rewardType';
  v_amount int;
  v_ref text := nullif(trim(coalesce(p->>'rewardRef', '')), '');
  v_audience text := coalesce(p->>'popupAudience', 'none');
  v_targets uuid[];
  v_id uuid;
  v_row public.promo_codes%ROWTYPE;
BEGIN
  IF length(v_norm) <> 16 THEN RETURN jsonb_build_object('ok', false, 'error', 'code_format'); END IF;
  IF v_type NOT IN ('descoin', 'shop_item', 'special_badge') THEN RETURN jsonb_build_object('ok', false, 'error', 'reward_type'); END IF;
  IF v_type = 'descoin' THEN
    v_amount := (p->>'rewardAmount')::int;
    IF v_amount IS NULL OR v_amount <= 0 OR v_amount > 100000 THEN RETURN jsonb_build_object('ok', false, 'error', 'reward_amount'); END IF;
    v_ref := NULL;
  ELSIF v_type = 'shop_item' THEN
    IF v_ref IS NULL OR NOT EXISTS (SELECT 1 FROM public.shop_items WHERE id::text = v_ref) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reward_item');
    END IF;
  ELSE
    IF NOT public.promo_badges_available() THEN RETURN jsonb_build_object('ok', false, 'error', 'badges_unavailable'); END IF;
    IF v_ref IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'reward_badge'); END IF;
  END IF;
  IF v_audience NOT IN ('none', 'all', 'active_7d', 'selected') THEN RETURN jsonb_build_object('ok', false, 'error', 'audience'); END IF;
  IF v_audience = 'selected' THEN
    SELECT array_agg(DISTINCT u.id) INTO v_targets
      FROM jsonb_array_elements_text(coalesce(p->'targetUserIds', '[]'::jsonb)) e(v)
      JOIN public.users u ON u.id::text = e.v;
    IF v_targets IS NULL OR cardinality(v_targets) = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'targets'); END IF;
    IF cardinality(v_targets) > 500 THEN RETURN jsonb_build_object('ok', false, 'error', 'targets'); END IF;
  END IF;
  IF (p->>'expiresAt') IS NOT NULL AND (p->>'expiresAt')::timestamptz <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expires_past');
  END IF;

  INSERT INTO public.promo_codes (code_norm, reward_type, reward_amount, reward_ref, message, max_uses,
    min_account_age_days, once_per_user, active, expires_at, popup_audience, created_by)
  VALUES (v_norm, v_type, v_amount, v_ref, nullif(trim(coalesce(p->>'message', '')), ''),
    nullif((p->>'maxUses')::int, 0), coalesce((p->>'minAccountAgeDays')::int, 0),
    coalesce((p->>'oncePerUser')::boolean, true), coalesce((p->>'active')::boolean, true),
    (p->>'expiresAt')::timestamptz, v_audience, p_admin_id)
  ON CONFLICT (code_norm) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'code_taken'); END IF;

  IF v_targets IS NOT NULL THEN
    INSERT INTO public.promo_popup_targets (code_id, user_id) SELECT v_row.id, unnest(v_targets);
  END IF;
  INSERT INTO public.promo_audit (admin_id, action, code_id, detail)
  VALUES (p_admin_id, 'create', v_row.id, jsonb_build_object(
    'rewardType', v_type, 'rewardAmount', v_amount, 'rewardRef', v_ref, 'maxUses', v_row.max_uses,
    'expiresAt', v_row.expires_at, 'audience', v_audience, 'targets', coalesce(cardinality(v_targets), 0)));
  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'code', v_row.code_norm,
    'targets', coalesce(cardinality(v_targets), 0));
EXCEPTION
  WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
END;
$$;

CREATE OR REPLACE FUNCTION public.promo_admin_update(p_admin_id uuid, p_code_id uuid, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.promo_codes%ROWTYPE;
  v_max int;
BEGIN
  SELECT * INTO v_row FROM public.promo_codes WHERE id = p_code_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF p ? 'maxUses' THEN
    v_max := nullif((p->>'maxUses')::int, 0);
    IF v_max IS NOT NULL AND v_max < v_row.used_count THEN
      RETURN jsonb_build_object('ok', false, 'error', 'max_below_used');
    END IF;
  ELSE
    v_max := v_row.max_uses;
  END IF;
  UPDATE public.promo_codes SET
    active     = CASE WHEN p ? 'active' THEN (p->>'active')::boolean ELSE active END,
    max_uses   = v_max,
    expires_at = CASE WHEN p ? 'expiresAt' THEN (p->>'expiresAt')::timestamptz ELSE expires_at END,
    message    = CASE WHEN p ? 'message' THEN nullif(trim(coalesce(p->>'message', '')), '') ELSE message END,
    updated_at = now()
  WHERE id = p_code_id;
  INSERT INTO public.promo_audit (admin_id, action, code_id, detail) VALUES (p_admin_id, 'update', p_code_id, p);
  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
END;
$$;

CREATE OR REPLACE FUNCTION public.promo_admin_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'activeCodes', (SELECT count(*) FROM public.promo_codes c WHERE c.active
                        AND (c.expires_at IS NULL OR c.expires_at > now())
                        AND (c.max_uses IS NULL OR c.used_count < c.max_uses)),
      'totalUses', (SELECT count(*) FROM public.promo_redemptions),
      'descoinOut', (SELECT coalesce(sum(descoin_credited), 0) FROM public.promo_redemptions),
      'rejected24h', (SELECT count(*) FROM public.promo_attempts WHERE NOT ok AND created_at > now() - interval '24 hours')
    ),
    'badgesAvailable', public.promo_badges_available(),
    -- Reach estimates for the popup audience picker ("son 7 günde giriş yapan ~N kişi görecek").
    'audience', jsonb_build_object(
      'all', (SELECT count(*) FROM public.users u WHERE coalesce(u.is_banned, false) = false AND u.deleted_at IS NULL),
      'active7d', (SELECT count(*) FROM public.users u WHERE coalesce(u.is_banned, false) = false AND u.deleted_at IS NULL
                     AND (coalesce(u.last_seen, u.created_at)::timestamp AT TIME ZONE 'UTC') > now() - interval '7 days')
    ),
    'codes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code_norm, 'reward', public.promo_reward_json(c),
        'message', c.message, 'maxUses', c.max_uses, 'usedCount', c.used_count,
        'minAccountAgeDays', c.min_account_age_days, 'oncePerUser', c.once_per_user,
        'active', c.active, 'startsAt', c.starts_at, 'expiresAt', c.expires_at,
        'popupAudience', c.popup_audience,
        'targets', (SELECT count(*) FROM public.promo_popup_targets t WHERE t.code_id = c.id),
        'createdAt', c.created_at,
        'status', CASE
          WHEN c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN 'full'
          WHEN c.expires_at IS NOT NULL AND c.expires_at <= now() THEN 'expired'
          WHEN NOT c.active THEN 'stopped'
          ELSE 'active' END
      ) ORDER BY c.created_at DESC)
      FROM public.promo_codes c), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.promo_admin_redemptions(p_code_id uuid, p_q text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.promo_redemptions WHERE code_id = p_code_id),
    'items', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('id', r.id, 'at', r.created_at, 'descoin', r.descoin_credited, 'reward', r.reward,
                 'withheld', r.withheld,
                 'user', jsonb_build_object('id', u.id, 'username', u.username, 'displayName', u.display_name, 'avatarUrl', u.avatar_url)) AS x
          FROM public.promo_redemptions r JOIN public.users u ON u.id = r.user_id
         WHERE r.code_id = p_code_id
           AND (p_q IS NULL OR p_q = '' OR u.username ILIKE '%' || p_q || '%' OR coalesce(u.display_name, '') ILIKE '%' || p_q || '%')
         ORDER BY r.created_at DESC
         LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0))
      ) s), '[]'::jsonb)
  );
$$;

-- 8) Service role only.
REVOKE ALL ON FUNCTION public.promo_normalize(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_risk_withhold(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_reward_json(public.promo_codes) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_badges_available() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_redeem(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_history(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_popup_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_popup_mark(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_admin_create(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_admin_update(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_admin_overview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_admin_redemptions(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promo_normalize(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_risk_withhold(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_reward_json(public.promo_codes) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_badges_available() TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_redeem(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_history(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_popup_for(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_popup_mark(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_admin_create(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_admin_update(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_admin_overview() TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_admin_redemptions(uuid, text, integer, integer) TO service_role;
