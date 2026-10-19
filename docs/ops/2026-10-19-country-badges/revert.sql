-- GERİ ALMA. 02-retire-titles-unequip.sql'i ve 01-countries-additive.sql'i geri sarar.
-- Kod tarafını da geri almak gerekir (profile_title tekrar RETIRED listesinden çıkmalı), yoksa DB geri gelse bile API unvanı göstermez.
BEGIN;

-- A) Unvan takma durumunu geri yükle (yalnızca hâlâ boş olanlara; sonradan başka şey takan olmaz çünkü kategori kapalıydı)
UPDATE public.users u
SET equipped_title_id = b.equipped_title_id
FROM ops_backup.b20261019_equipped_title b
WHERE u.id = b.user_id AND u.equipped_title_id IS NULL
  AND EXISTS (SELECT 1 FROM public.shop_items si WHERE si.id = b.equipped_title_id);

-- B) Unvan ürünlerinin active değerini geri yükle
UPDATE public.shop_items si SET active = b.active
FROM ops_backup.b20261019_title_items_active b
WHERE si.id = b.item_id;

-- C) Ülke ürünlerini satıştan kaldır (SİLME YOK: satın alan varsa envanter satırı ve DesCoin kaydı korunur)
UPDATE public.shop_items SET active = false WHERE category = 'countries';
UPDATE public.users SET equipped_country_id = NULL WHERE equipped_country_id IS NOT NULL;
-- D) Kullanılmamış ücretsiz ülke haklarını geri al (kullanılmış olanlar ve aldıkları ülke kalır; bakiye etkisi yok)
DELETE FROM public.shop_vouchers WHERE reason = 'title_retired_2026_10' AND redeemed_at IS NULL;
-- Not: country_* sütunları, equipped_country_id ve 'countries' kısıt değeri bırakılır (zararsız, ileri uyumlu).
-- Hiç satış olmadıysa ve tamamen temizlenmek istenirse (ayrı onay):
--   DELETE FROM public.shop_items WHERE category='countries' AND NOT EXISTS (SELECT 1 FROM public.user_inventory ui WHERE ui.item_id = shop_items.id);

SELECT (SELECT count(*) FROM public.users WHERE equipped_title_id IS NOT NULL) AS titles_equipped_again,
       (SELECT count(*) FROM public.shop_items WHERE category='countries' AND active) AS countries_active;
COMMIT;
-- Yedek tablolar (ops_backup.b20261019_*) 30 gün tutulur, sonra ayrı onayla DROP edilir.
