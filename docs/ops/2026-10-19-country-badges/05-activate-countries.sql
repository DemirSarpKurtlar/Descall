-- TASLAK - LANSMAN ANINDA, DEMİR ONAYIYLA. Ülkeleri satışa açar. Geri alma: revert.sql (C bölümü).
BEGIN;
UPDATE public.shop_items SET active = true WHERE category = 'countries' AND active = false AND price_descoin = 250;
SELECT count(*) FILTER (WHERE active) AS countries_active, min(price_descoin), max(price_descoin) FROM public.shop_items WHERE category = 'countries';
COMMIT;
