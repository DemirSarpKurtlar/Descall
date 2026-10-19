-- TASLAK - YALNIZCA DEMİR ONAYLADIKTAN SONRA. Unvanları herkesten çıkarır + kataloğu emekliye ayırır.
-- Ön koşul: kod tarafı (RETIRED_SHOP_CATEGORIES + REMOVED_COSMETIC_CATEGORIES'e 'profile_title') yayında.
-- Satın alınmış unvanlar (user_inventory) SİLİNMEZ. DesCoin bakiyelerine DOKUNULMAZ. Ödeyen 3 kullanıcıya ücretsiz ülke hakkı (shop_vouchers).
BEGIN;

-- 1) Yedek: API'ye (PostgREST) açık olmayan ayrı şemada. Bir kez oluşturulur; tekrar çalıştırmada üzerine yazmaz.
CREATE SCHEMA IF NOT EXISTS ops_backup;
REVOKE ALL ON SCHEMA ops_backup FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS ops_backup.b20261019_equipped_title AS
  SELECT id AS user_id, equipped_title_id, now() AS backed_up_at
  FROM public.users
  WHERE equipped_title_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ops_backup.b20261019_title_items_active AS
  SELECT id AS item_id, active, now() AS backed_up_at
  FROM public.shop_items
  WHERE category = 'profile_title';

-- Kontrol: 19.10.2026 itibarıyla beklenen 3 kullanıcı / 58 ürün
SELECT (SELECT count(*) FROM ops_backup.b20261019_equipped_title) AS backed_up_users,
       (SELECT count(*) FROM ops_backup.b20261019_title_items_active) AS backed_up_items;

-- 2) Herkesten çıkar
UPDATE public.users SET equipped_title_id = NULL WHERE equipped_title_id IS NOT NULL;

-- 3) Satıştan kaldır (sound_pack ile aynı yol)
UPDATE public.shop_items SET active = false WHERE category = 'profile_title' AND active = true;

-- 4) Unvan için DesCoin ÖDEMİŞ kullanıcılara (acquired_via='purchase') bir ücretsiz ülke hakkı. Hediye alanlar hariç.
--    Beklenen: tam 3 kullanıcı (sn1pez53, admin, alexdemo). DesCoin bakiyesi DEĞİŞMEZ.
INSERT INTO public.shop_vouchers (user_id, category, reason)
SELECT DISTINCT ui.user_id, 'countries', 'title_retired_2026_10'
FROM public.user_inventory ui JOIN public.shop_items si ON si.id = ui.item_id
WHERE si.category = 'profile_title' AND ui.acquired_via = 'purchase'
ON CONFLICT (user_id, category, reason) DO NOTHING;
SELECT u.username FROM public.shop_vouchers v JOIN public.users u ON u.id = v.user_id
WHERE v.reason = 'title_retired_2026_10' ORDER BY 1;

-- Kontrol: 0 / 0 olmalı
SELECT (SELECT count(*) FROM public.users WHERE equipped_title_id IS NOT NULL) AS still_equipped,
       (SELECT count(*) FROM public.shop_items WHERE category = 'profile_title' AND active) AS still_active;
COMMIT;
