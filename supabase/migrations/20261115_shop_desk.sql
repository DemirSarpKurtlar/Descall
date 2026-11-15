-- Yönetici Paneli › Mağaza (remake, owner pick Draft A + B, Nov 2026).
-- Additive only: limited stock, sale windows and availability windows on shop_items, campaigns,
-- storefront sections, shop updates feed, reconciliation fix log, and a ledger reason for the
-- correcting row. Backend degrades gracefully until this is applied (features hidden, no crash).

-- ---------------------------------------------------------------- shop_items
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS stock_limit integer;
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS stock_sold integer NOT NULL DEFAULT 0;
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS available_from timestamptz;
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS available_until timestamptz;
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS sale_pct integer;
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS sale_starts_at timestamptz;
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS sale_ends_at timestamptz;
ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_items_stock_check') THEN
    ALTER TABLE public.shop_items ADD CONSTRAINT shop_items_stock_check
      CHECK (stock_sold >= 0 AND (stock_limit IS NULL OR stock_limit >= 0)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_items_sale_pct_check') THEN
    ALTER TABLE public.shop_items ADD CONSTRAINT shop_items_sale_pct_check
      CHECK (sale_pct IS NULL OR (sale_pct BETWEEN 1 AND 95)) NOT VALID;
  END IF;
END $$;

-- Race-safe stock: one conditional UPDATE, so two buyers on two instances can never sell
-- the last unit twice. Returns the new sold count, or NULL when the item is sold out.
CREATE OR REPLACE FUNCTION public.shop_reserve_stock(p_item_id uuid)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  UPDATE public.shop_items
     SET stock_sold = stock_sold + 1
   WHERE id = p_item_id
     AND (stock_limit IS NULL OR stock_sold < stock_limit)
  RETURNING stock_sold;
$$;

CREATE OR REPLACE FUNCTION public.shop_release_stock(p_item_id uuid)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  UPDATE public.shop_items
     SET stock_sold = GREATEST(stock_sold - 1, 0)
   WHERE id = p_item_id
  RETURNING stock_sold;
$$;

REVOKE ALL ON FUNCTION public.shop_reserve_stock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shop_release_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shop_reserve_stock(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.shop_release_stock(uuid) TO service_role;

-- ---------------------------------------------------------------- campaigns
-- kind: discount (pct off for the scope), drop (scope items visible only in the window),
-- storefront (a storefront section shown only in the window).
-- scope: {"all": true} | {"categories": ["banner"]} | {"itemIds": ["..."]} | {"sectionId": "..."}
CREATE TABLE IF NOT EXISTS public.shop_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  kind text NOT NULL DEFAULT 'discount' CHECK (kind IN ('discount', 'drop', 'storefront')),
  discount_pct integer CHECK (discount_pct IS NULL OR discount_pct BETWEEN 1 AND 95),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_shop_campaigns_window ON public.shop_campaigns (ends_at DESC, starts_at);
ALTER TABLE public.shop_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shop_campaigns FROM anon, authenticated;
GRANT ALL ON TABLE public.shop_campaigns TO service_role;

-- ---------------------------------------------------------------- storefront sections
-- kind: manual (item_ids in order), rotating (weekly pick from a pool), new, bestsellers,
-- limited (stock / time-limited / on sale), category (one category).
CREATE TABLE IF NOT EXISTS public.shop_storefront_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  subtitle text,
  kind text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'rotating', 'new', 'bestsellers', 'limited', 'category')),
  item_ids uuid[] NOT NULL DEFAULT '{}',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  visible_from timestamptz,
  visible_until timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_storefront_sections_order ON public.shop_storefront_sections (sort_order, created_at);
ALTER TABLE public.shop_storefront_sections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shop_storefront_sections FROM anon, authenticated;
GRANT ALL ON TABLE public.shop_storefront_sections TO service_role;

-- ---------------------------------------------------------------- shop updates feed
-- Short public notes ("price change", "new drop") shown at the top of the user shop.
CREATE TABLE IF NOT EXISTS public.shop_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
  item_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shop_updates_created ON public.shop_updates (created_at DESC);
ALTER TABLE public.shop_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shop_updates FROM anon, authenticated;
GRANT ALL ON TABLE public.shop_updates TO service_role;

-- ---------------------------------------------------------------- reconciliation fixes
-- mode: balance_to_ledger (balance set to the ledger sum, no ledger row),
-- ledger_to_balance (one reconcile_adjust ledger row, balance unchanged), note (nothing changed).
CREATE TABLE IF NOT EXISTS public.descoin_reconcile_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  run_id uuid,
  mode text NOT NULL CHECK (mode IN ('balance_to_ledger', 'ledger_to_balance', 'note')),
  drift bigint NOT NULL,
  balance_before bigint NOT NULL,
  balance_after bigint NOT NULL,
  ledger_sum_before bigint NOT NULL,
  ledger_id uuid,
  reason text NOT NULL,
  admin_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_descoin_reconcile_actions_user ON public.descoin_reconcile_actions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_descoin_reconcile_actions_created ON public.descoin_reconcile_actions (created_at DESC);
ALTER TABLE public.descoin_reconcile_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.descoin_reconcile_actions FROM anon, authenticated;
GRANT ALL ON TABLE public.descoin_reconcile_actions TO service_role;

-- Reconciliation schedule (single row): run every N hours, aligned to an hour of day (Istanbul).
CREATE TABLE IF NOT EXISTS public.descoin_reconcile_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  interval_hours integer NOT NULL DEFAULT 24 CHECK (interval_hours IN (6, 12, 24)),
  hour_of_day integer NOT NULL DEFAULT 4 CHECK (hour_of_day BETWEEN 0 AND 23),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.descoin_reconcile_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.descoin_reconcile_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.descoin_reconcile_settings TO service_role;

-- ---------------------------------------------------------------- ledger reason
-- Add 'reconcile_adjust' to whatever reasons the live constraint already allows.
DO $$
DECLARE
  def text;
  reasons text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
   WHERE conname = 'descoin_ledger_reason_check' AND conrelid = 'public.descoin_ledger'::regclass;
  IF def IS NULL OR position('reconcile_adjust' IN def) > 0 THEN
    RETURN;
  END IF;
  SELECT array_agg(DISTINCT m[1]) INTO reasons FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
  reasons := array_append(reasons, 'reconcile_adjust');
  ALTER TABLE public.descoin_ledger DROP CONSTRAINT descoin_ledger_reason_check;
  EXECUTE format(
    'ALTER TABLE public.descoin_ledger ADD CONSTRAINT descoin_ledger_reason_check CHECK (reason = ANY (%L::text[])) NOT VALID',
    reasons
  );
  ALTER TABLE public.descoin_ledger VALIDATE CONSTRAINT descoin_ledger_reason_check;
END $$;

-- ---------------------------------------------------------------- read helpers
CREATE INDEX IF NOT EXISTS idx_shop_purchases_created ON public.shop_purchases (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_purchases_item_created ON public.shop_purchases (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_inventory_item ON public.user_inventory (item_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_gifts ON public.user_inventory (acquired_at DESC) WHERE acquired_via = 'gift';

-- Circulating DesCoin for the KPI strip (one aggregate instead of paging every wallet).
CREATE OR REPLACE FUNCTION public.shop_desk_totals()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'circulating', COALESCE(SUM(descoin_balance), 0),
    'holders', COUNT(*) FILTER (WHERE descoin_balance > 0)
  ) FROM public.users;
$$;
REVOKE ALL ON FUNCTION public.shop_desk_totals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shop_desk_totals() TO service_role;
