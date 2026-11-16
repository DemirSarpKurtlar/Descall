-- Market 2.0: "Tüm ürünler" is browse only (owner request, 16 Nov 2026).
-- Every item stays visible in the classic catalog tab, but only the items an admin allows here
-- can be bought straight from it (POST /api/shop/purchase). Everything else is sold through
-- the Market 2.0 paths (daily storefront, sets, night market), which ignore this column.
-- Admin: Yönetici Paneli > Vitrin ve Setler > "Tüm ürünlerde satış" (PUT /api/admin/shop2/direct-sale).
--
-- Additive. Until this runs the backend treats every s2- item as not directly buyable and
-- keeps the old behaviour for the rest (lib/shopDirectSale.js).
--
-- Country flags are sold only in that tab, so they start allowed. The UPDATE runs only when
-- the column is created, so running this file again never resets an admin's choices.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shop_items' AND column_name = 'direct_sale'
  ) THEN
    ALTER TABLE public.shop_items ADD COLUMN direct_sale boolean NOT NULL DEFAULT false;
    UPDATE public.shop_items SET direct_sale = true WHERE category = 'countries';
  END IF;
END $$;

-- The catalog reads the few allowed rows; the admin panel counts them.
CREATE INDEX IF NOT EXISTS shop_items_direct_sale_idx ON public.shop_items (direct_sale) WHERE direct_sale;

COMMENT ON COLUMN public.shop_items.direct_sale IS
  'True: can be bought directly from the "Tüm ürünler" tab (POST /api/shop/purchase). Market 2.0 storefront, sets and night market ignore it.';
