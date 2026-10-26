-- Promosyon Kodu → "Kodlarım" (2026-10-27). ADDITIVE ONLY and idempotent: one new table, three new
-- functions. Nothing existing is changed. Safe to run more than once.
--
-- GET /api/promo/available lists the codes this account can use right now. The list is decided
-- here, never in the client, and it only ever contains codes the account could redeem this
-- minute. Same audience rules as promo_popup_for:
--   * 'all' / 'active_7d' → only accounts created before the code (active_7d: seen in 7 days)
--   * 'selected'          → only the accounts in promo_popup_targets (1 target = personal code)
--   * 'none'              → NEVER listed (codes handed out elsewhere stay secret)
-- and only when the code is live (active, started, not expired, not full), not already used by
-- this account (once_per_user), the account is old enough, the wallet is not frozen for
-- DesCoin / item rewards, and a badge reward can still be given to this account.

CREATE TABLE IF NOT EXISTS public.promo_available_seen (
  code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code_id, user_id)
);
CREATE INDEX IF NOT EXISTS promo_available_seen_user_idx ON public.promo_available_seen (user_id);
CREATE INDEX IF NOT EXISTS promo_popup_targets_user_idx ON public.promo_popup_targets (user_id);
ALTER TABLE public.promo_available_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.promo_available_seen FROM anon, authenticated;

-- Can this account still receive this badge from a code? (special badges may not be deployed:
-- then no badge code is usable, same as promo_badges_available()).
CREATE OR REPLACE FUNCTION public.promo_badge_receivable(p_user_id uuid, p_badge_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NOT public.promo_badges_available() THEN RETURN false; END IF;
  IF to_regclass('public.special_badges') IS NULL OR to_regclass('public.user_special_badges') IS NULL THEN
    RETURN true;  -- grant function exists but no catalog tables: let promo_redeem decide
  END IF;
  EXECUTE $q$
    SELECT EXISTS (
      SELECT 1 FROM public.special_badges b
       WHERE b.id = $2 AND b.active AND b.grant_mode = 'promo'
         AND (b.max_holders IS NULL OR b.max_holders > (
               SELECT count(*) FROM public.user_special_badges h WHERE h.badge_id = b.id AND h.revoked_at IS NULL))
    ) AND NOT EXISTS (
      SELECT 1 FROM public.user_special_badges o
       WHERE o.user_id = $1 AND o.badge_id = $2 AND o.revoked_at IS NULL
    )$q$
    INTO v_ok USING p_user_id, p_badge_id;
  RETURN coalesce(v_ok, false);
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RETURN false;
END;
$$;

-- The list (newest rules first: personal, then soonest to expire, then newest). At most 50.
-- Returns { items: [...], count, unseen, serverNow }. Every item is redeemable by p_user_id now.
CREATE OR REPLACE FUNCTION public.promo_available_for(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT u.id,
           (u.created_at::timestamp AT TIME ZONE 'UTC') AS created_at,
           (coalesce(u.last_seen, u.created_at)::timestamp AT TIME ZONE 'UTC') AS last_seen,
           coalesce(u.descoin_frozen, false) AS frozen
      FROM public.users u
     WHERE u.id = p_user_id AND coalesce(u.is_banned, false) = false AND u.deleted_at IS NULL
  ),
  live AS (
    SELECT c.*,
           public.promo_reward_json(c) AS reward_json,
           (SELECT count(*) FROM public.promo_popup_targets t WHERE t.code_id = c.id) AS n_targets
      FROM public.promo_codes c, me
     WHERE c.active
       AND c.popup_audience IN ('all', 'active_7d', 'selected')
       AND c.starts_at <= now()
       AND (c.expires_at IS NULL OR c.expires_at > now())
       AND (c.max_uses IS NULL OR c.used_count < c.max_uses)
       AND (
         (c.popup_audience = 'all' AND me.created_at < c.created_at)
         OR (c.popup_audience = 'active_7d' AND me.created_at < c.created_at AND me.last_seen > now() - interval '7 days')
         OR (c.popup_audience = 'selected' AND EXISTS (
               SELECT 1 FROM public.promo_popup_targets t WHERE t.code_id = c.id AND t.user_id = me.id))
       )
       AND NOT (c.once_per_user AND EXISTS (
               SELECT 1 FROM public.promo_redemptions r WHERE r.code_id = c.id AND r.user_id = me.id))
       AND (c.min_account_age_days = 0 OR me.created_at <= now() - make_interval(days => c.min_account_age_days))
       AND NOT (c.reward_type IN ('descoin', 'shop_item') AND me.frozen)
       AND (c.reward_type <> 'shop_item' OR EXISTS (SELECT 1 FROM public.shop_items i WHERE i.id::text = c.reward_ref))
       AND (c.reward_type <> 'special_badge' OR public.promo_badge_receivable(me.id, c.reward_ref))
  ),
  rows AS (
    SELECT l.*,
           CASE WHEN l.popup_audience <> 'selected' THEN 'everyone'
                WHEN l.n_targets = 1 THEN 'personal' ELSE 'group' END AS scope,
           EXISTS (SELECT 1 FROM public.promo_available_seen s WHERE s.code_id = l.id AND s.user_id = p_user_id) AS seen
      FROM live l
     ORDER BY (l.popup_audience = 'selected' AND l.n_targets = 1) DESC,
              l.expires_at ASC NULLS LAST, l.created_at DESC
     LIMIT 50
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'code', r.code_norm,
        'scope', r.scope,
        'reward', r.reward_json,
        'message', r.message,
        'expiresAt', r.expires_at,
        'remaining', CASE WHEN r.max_uses IS NULL THEN NULL ELSE r.max_uses - r.used_count END,
        'seen', r.seen
      ) ORDER BY (r.scope = 'personal') DESC, r.expires_at ASC NULLS LAST, r.created_at DESC) FROM rows r), '[]'::jsonb),
    'count', (SELECT count(*) FROM rows),
    'unseen', (SELECT count(*) FROM rows WHERE NOT seen),
    'serverNow', now()
  );
$$;

-- p_code_ids: jsonb array of code ids (at most 50 read).
-- Mark listed codes as seen (clears the settings badge). Only codes that are in this account's
-- list right now are written; any other id is ignored, so this cannot probe for codes.
CREATE OR REPLACE FUNCTION public.promo_available_mark_seen(p_user_id uuid, p_code_ids jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_list jsonb := public.promo_available_for(p_user_id);
  v_ids uuid[];
BEGIN
  SELECT coalesce(array_agg((x->>'id')::uuid), '{}') INTO v_ids
    FROM jsonb_array_elements(v_list->'items') x
   WHERE jsonb_typeof(p_code_ids) = 'array'
     AND (x->>'id') IN (SELECT jsonb_array_elements_text(p_code_ids) LIMIT 50);
  INSERT INTO public.promo_available_seen (code_id, user_id)
  SELECT unnest(v_ids), p_user_id
  ON CONFLICT (code_id, user_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'marked', coalesce(array_length(v_ids, 1), 0),
    'unseen', greatest(0, (v_list->>'unseen')::int - coalesce(array_length(v_ids, 1), 0)));
END;
$$;

REVOKE ALL ON FUNCTION public.promo_badge_receivable(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_available_for(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_available_mark_seen(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promo_badge_receivable(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_available_for(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_available_mark_seen(uuid, jsonb) TO service_role;
