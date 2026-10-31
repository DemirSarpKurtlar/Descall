-- 2026-10-31: remove the shop "Profil Arka Planları" catalog (category profile_background) and refund buyers.
-- Owner-approved. Prerequisite: the code that retires profile_background (3.7.12) (REMOVED_COSMETIC_CATEGORIES,
-- REMOVED_SHOP_CATEGORIES) is live on Render des-call.
-- Kart Renkleri (profile_color) takes the tab. Backup first: 00-backup.sql.
--
-- Refund rule: each user+item gets back exactly what the ledger says they paid
--   SUM(-amount) of reason 'shop_purchase' minus SUM(amount) of 'shop_refund' for meta.itemId.
-- Gifts / seeded rows have no purchase rows, so they get 0. A refund row carries meta.itemId,
-- so a re-run computes 0 for every pair (plus an explicit idempotency_key guard).
-- Balance + ledger are written the same way as public.promo_redeem: UPDATE users ... RETURNING
-- descoin_balance, then INSERT descoin_ledger with balance_after. created_at = clock_timestamp()
-- so two refunds of one user get distinct, ordered timestamps (reconciliation last_row check).
-- Catalog rows are deactivated, not deleted (DELETE would cascade the shop_purchases receipts).

BEGIN;
SELECT pg_advisory_xact_lock(hashtext('shop_backgrounds_removal_20261031'));

CREATE TEMP TABLE _sbg_due ON COMMIT DROP AS
WITH b AS (SELECT id, sku FROM public.shop_items WHERE category = 'profile_background'),
led AS (
  SELECT l.user_id, (l.meta->>'itemId')::uuid AS item_id,
         SUM(CASE WHEN l.reason = 'shop_purchase' THEN -l.amount ELSE 0 END) AS paid,
         SUM(CASE WHEN l.reason = 'shop_refund' THEN l.amount ELSE 0 END) AS refunded
    FROM public.descoin_ledger l
   WHERE l.reason IN ('shop_purchase', 'shop_refund')
     AND l.meta->>'itemId' IN (SELECT id::text FROM b)
   GROUP BY 1, 2
)
SELECT led.user_id, led.item_id, b.sku, (led.paid - led.refunded)::int AS amount,
       'shop_backgrounds_removal_20261031:' || led.user_id || ':' || led.item_id AS idem_key
  FROM led JOIN b ON b.id = led.item_id
 WHERE led.paid - led.refunded > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.descoin_ledger x
      WHERE x.user_id = led.user_id AND x.reason = 'shop_refund'
        AND x.meta->>'idempotency_key' = 'shop_backgrounds_removal_20261031:' || led.user_id || ':' || led.item_id);

DO $$
DECLARE r record; v_balance integer;
BEGIN
  FOR r IN SELECT * FROM _sbg_due ORDER BY user_id, item_id LOOP
    UPDATE public.users SET descoin_balance = coalesce(descoin_balance, 0) + r.amount
     WHERE id = r.user_id RETURNING descoin_balance INTO v_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'user % missing', r.user_id; END IF;
    INSERT INTO public.descoin_ledger (user_id, amount, reason, meta, balance_after, created_at)
    VALUES (r.user_id, r.amount, 'shop_refund',
            jsonb_build_object('itemId', r.item_id, 'sku', r.sku, 'reason', 'shop_backgrounds_removed',
                               'idempotency_key', r.idem_key),
            v_balance, clock_timestamp());
  END LOOP;
END $$;

UPDATE public.shop_purchases SET status = 'refunded'
 WHERE status = 'paid' AND item_id IN (SELECT id FROM public.shop_items WHERE category = 'profile_background');
UPDATE public.users SET equipped_background_id = NULL
 WHERE equipped_background_id IN (SELECT id FROM public.shop_items WHERE category = 'profile_background');
DELETE FROM public.user_inventory
 WHERE item_id IN (SELECT id FROM public.shop_items WHERE category = 'profile_background');
UPDATE public.shop_items SET active = false WHERE category = 'profile_background' AND active;

SELECT (SELECT count(*) FROM _sbg_due) AS refunds, (SELECT coalesce(sum(amount), 0) FROM _sbg_due) AS total,
       (SELECT count(DISTINCT user_id) FROM _sbg_due) AS users;
COMMIT;
