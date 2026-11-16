-- Market 2.0 (Vitrin ve Setler, owner picks: user C + A, admin A + B, 15 Nov 2026).
-- Additive only. The backend (frontend/backend/lib/shop2) works before this is applied: the
-- shop2_* tables fall back to process memory per instance (wallet, ledger and inventory always
-- use the existing tables), so applying this migration is what makes Market 2.0 durable.
-- Every table is service-role only (RLS on, no policies, no grants to anon / authenticated).
-- Ledger rows reuse the existing reasons: shop_purchase (meta.shop2 = kind) and shop_refund.

-- ---------------------------------------------------------------- shop_items (new catalog)
-- s2 catalog rows carry their set, names / descriptions in 7 languages and tags.
-- Retired = retired_at set (or any non "s2-" row once the new catalog is seeded): owners keep
-- the item and it still renders; it is never sold again.
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS set_key text;
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS retired_at timestamptz;
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS i18n jsonb;
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS tags text[];
CREATE INDEX IF NOT EXISTS shop_items_set_key_idx ON public.shop_items (set_key) WHERE set_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS shop_items_sku_pattern_idx ON public.shop_items (sku text_pattern_ops);

-- ---------------------------------------------------------------- rule versions + settings
CREATE TABLE IF NOT EXISTS public.shop2_rule_versions (
  version integer PRIMARY KEY CHECK (version > 0),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'archived', 'cancelled')),
  note text,
  based_on integer,
  apply_at timestamptz,
  applied_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop2_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_value jsonb,
  version integer NOT NULL DEFAULT 1,
  reason text,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- daily storefronts
-- One row per user per Istanbul day. slots: [{ slot, itemId, locked, reasons }]; shown: every
-- item id shown that day (refreshes included) for the no-repeat rule.
CREATE TABLE IF NOT EXISTS public.shop2_storefronts (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  rule_version integer NOT NULL DEFAULT 0,
  refresh_count integer NOT NULL DEFAULT 0,
  regen integer NOT NULL DEFAULT 0,
  seed text NOT NULL,
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  shown jsonb NOT NULL DEFAULT '[]'::jsonb,
  excluded jsonb,
  lock_item_id uuid,
  lock_slot integer,
  refreshed_at timestamptz,
  refresh_paid integer,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS shop2_storefronts_day_idx ON public.shop2_storefronts (day);

CREATE TABLE IF NOT EXISTS public.shop2_user_state (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  free_refreshes integer NOT NULL DEFAULT 0 CHECK (free_refreshes >= 0),
  streak_days integer NOT NULL DEFAULT 0,
  last_view_day date,
  streak_reward_day date,
  gift_privacy text NOT NULL DEFAULT 'friends' CHECK (gift_privacy IN ('friends', 'nobody')),
  notify_night boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- purchases
CREATE TABLE IF NOT EXISTS public.shop2_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('item', 'piece', 'pieces', 'set', 'night')),
  set_key text,
  item_ids uuid[] NOT NULL DEFAULT '{}',
  amount integer NOT NULL DEFAULT 0 CHECK (amount >= 0),
  list_amount integer NOT NULL DEFAULT 0,
  source text,
  idempotency_key text,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded')),
  refundable_until timestamptz,
  refunded_at timestamptz,
  recipient_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  gift_id uuid,
  ab_test_id uuid,
  ab_arm text CHECK (ab_arm IS NULL OR ab_arm IN ('A', 'B')),
  owned_deducted integer NOT NULL DEFAULT 0,
  stock_reserved boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shop2_purchases_idem_uidx ON public.shop2_purchases (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS shop2_purchases_created_idx ON public.shop2_purchases (created_at DESC);
CREATE INDEX IF NOT EXISTS shop2_purchases_user_idx ON public.shop2_purchases (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shop2_purchases_set_idx ON public.shop2_purchases (set_key) WHERE set_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS shop2_purchases_ab_idx ON public.shop2_purchases (ab_test_id) WHERE ab_test_id IS NOT NULL;

-- 7-day partial price window: after buying a piece on its own, the rest of the set keeps the
-- set rate (discount_pct, the better of this and the live discount) until `until`.
CREATE TABLE IF NOT EXISTS public.shop2_set_locks (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  set_key text NOT NULL,
  discount_pct integer NOT NULL DEFAULT 0,
  until timestamptz NOT NULL,
  purchase_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, set_key)
);

CREATE TABLE IF NOT EXISTS public.shop2_set_completions (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  set_key text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, set_key)
);
CREATE INDEX IF NOT EXISTS shop2_set_completions_set_idx ON public.shop2_set_completions (set_key);

-- ---------------------------------------------------------------- sets (admin)
-- A theme without a row is live with the defaults (lib/shop2/themes.js). history keeps the last
-- 20 versions of the row for one-click restore; recall = { option, reason, undoUntil, ... }.
CREATE TABLE IF NOT EXISTS public.shop2_sets (
  set_key text PRIMARY KEY CHECK (set_key ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name jsonb NOT NULL DEFAULT '{}'::jsonb,
  palette text[] NOT NULL DEFAULT '{}',
  discount_pct integer NOT NULL DEFAULT 25 CHECK (discount_pct BETWEEN 5 AND 60),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'live', 'recalled', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  stock_limit integer CHECK (stock_limit IS NULL OR stock_limit >= 0),
  stock_sold integer NOT NULL DEFAULT 0 CHECK (stock_sold >= 0),
  piece_ids uuid[],
  note text,
  version integer NOT NULL DEFAULT 1,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  recall jsonb,
  undo jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.shop2_price_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_key text NOT NULL,
  price integer NOT NULL,
  reason text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop2_price_points_set_idx ON public.shop2_price_points (set_key, at);

-- ---------------------------------------------------------------- A/B price tests
CREATE TABLE IF NOT EXISTS public.shop2_ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_key text NOT NULL,
  discount_a integer NOT NULL,
  discount_b integer NOT NULL,
  split integer NOT NULL DEFAULT 50 CHECK (split BETWEEN 1 AND 99),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'stopped')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  winner text CHECK (winner IS NULL OR winner IN ('A', 'B')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS shop2_ab_tests_one_running_uidx ON public.shop2_ab_tests (set_key) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.shop2_ab_exposures (
  test_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  arm text NOT NULL CHECK (arm IN ('A', 'B')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (test_id, user_id)
);

-- ---------------------------------------------------------------- night market
-- Rows are admin nights; the weekly default nights (limits.nightMarket) need no row. A row with
-- overrides = 'auto-YYYY-MM-DD' replaces (or with status 'skipped' skips) that default night.
CREATE TABLE IF NOT EXISTS public.shop2_night_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'scheduled' CHECK (mode IN ('scheduled', 'random', 'manual')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'open', 'skipped', 'cancelled', 'closed')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  cards integer CHECK (cards IS NULL OR cards BETWEEN 1 AND 12),
  flips integer CHECK (flips IS NULL OR flips BETWEEN 1 AND 12),
  discount_min integer,
  discount_max integer,
  skew numeric,
  eligibility jsonb,
  note text,
  overrides text,
  undo_until timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS shop2_night_markets_time_idx ON public.shop2_night_markets (starts_at);

CREATE TABLE IF NOT EXISTS public.shop2_night_flips (
  night_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  card_index integer NOT NULL CHECK (card_index BETWEEN 0 AND 11),
  item_id uuid NOT NULL,
  discount_pct integer NOT NULL,
  price integer NOT NULL,
  list_price integer NOT NULL,
  kept boolean NOT NULL DEFAULT false,
  kept_at timestamptz,
  bought_at timestamptz,
  flipped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (night_id, user_id, card_index)
);
CREATE INDEX IF NOT EXISTS shop2_night_flips_night_idx ON public.shop2_night_flips (night_id);

-- ---------------------------------------------------------------- gifts
-- kind 'blocked' rows record refused attempts (daily cap, new account) for the admin limits
-- panel and the "what if yesterday" impact; they are never shown to users.
CREATE TABLE IF NOT EXISTS public.shop2_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('item', 'set', 'night', 'blocked')),
  set_key text,
  item_ids uuid[] NOT NULL DEFAULT '{}',
  amount integer NOT NULL DEFAULT 0 CHECK (amount >= 0),
  list_amount integer,
  message text CHECK (message IS NULL OR char_length(message) <= 501),
  anonymous boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  send_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'delivered' CHECK (status IN ('scheduled', 'delivered', 'opened', 'equipped', 'thanked', 'recalled', 'blocked')),
  delivered_at timestamptz,
  opened_at timestamptz,
  equipped_at timestamptz,
  thanked_at timestamptz,
  recalled_at timestamptz,
  idempotency_key text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shop2_gifts_idem_uidx ON public.shop2_gifts (from_user, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS shop2_gifts_to_idx ON public.shop2_gifts (to_user, created_at DESC);
CREATE INDEX IF NOT EXISTS shop2_gifts_from_idx ON public.shop2_gifts (from_user, created_at DESC);
CREATE INDEX IF NOT EXISTS shop2_gifts_due_idx ON public.shop2_gifts (send_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS shop2_gifts_created_idx ON public.shop2_gifts (created_at DESC);

CREATE TABLE IF NOT EXISTS public.shop2_gift_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id uuid,
  kind text NOT NULL DEFAULT 'ring' CHECK (kind IN ('ring', 'ping_pong')),
  users uuid[] NOT NULL DEFAULT '{}',
  amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'frozen')),
  resolution jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop2_gift_flags_status_idx ON public.shop2_gift_flags (status, created_at DESC);

-- ---------------------------------------------------------------- user log, outfits, wishlist
CREATE TABLE IF NOT EXISTS public.shop2_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  undo jsonb,
  undoable_until timestamptz,
  undone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop2_actions_user_idx ON public.shop2_actions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shop2_outfits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text CHECK (name IS NULL OR char_length(name) <= 40),
  kind text NOT NULL DEFAULT 'saved' CHECK (kind IN ('saved', 'previous')),
  look jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop2_outfits_user_idx ON public.shop2_outfits (user_id, created_at DESC);

-- item_id is an item uuid or "set:<set_key>".
CREATE TABLE IF NOT EXISTS public.shop2_wishlist (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS shop2_wishlist_item_idx ON public.shop2_wishlist (item_id);

-- ---------------------------------------------------------------- timeline + queue
CREATE TABLE IF NOT EXISTS public.shop2_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('rule_apply', 'set_publish', 'recall_finalize', 'limits_undo_close')),
  ref text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  error text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  cancelled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
CREATE INDEX IF NOT EXISTS shop2_queue_due_idx ON public.shop2_queue (run_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.shop2_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  kind text NOT NULL DEFAULT 'event',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- access: service role only
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'shop2_rule_versions', 'shop2_settings', 'shop2_storefronts', 'shop2_user_state', 'shop2_purchases',
    'shop2_set_locks', 'shop2_set_completions', 'shop2_sets', 'shop2_price_points', 'shop2_ab_tests',
    'shop2_ab_exposures', 'shop2_night_markets', 'shop2_night_flips', 'shop2_gifts', 'shop2_gift_flags',
    'shop2_actions', 'shop2_outfits', 'shop2_wishlist', 'shop2_queue', 'shop2_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;
