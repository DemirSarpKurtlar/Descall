-- 2026-10-31: backup before removing the shop "Profil Arka Planları" catalog (category profile_background).
-- Owner-approved ("arkaplanlari sil, yerine kart renkleri"). Read-only copies, access revoked.
CREATE SCHEMA IF NOT EXISTS ops_backup;
CREATE TABLE ops_backup.b20261031_bg_items AS
  SELECT * FROM public.shop_items WHERE category = 'profile_background';
CREATE TABLE ops_backup.b20261031_bg_inventory AS
  SELECT * FROM public.user_inventory WHERE item_id IN (SELECT id FROM public.shop_items WHERE category = 'profile_background');
CREATE TABLE ops_backup.b20261031_bg_purchases AS
  SELECT * FROM public.shop_purchases WHERE item_id IN (SELECT id FROM public.shop_items WHERE category = 'profile_background');
CREATE TABLE ops_backup.b20261031_bg_equipped AS
  SELECT id AS user_id, equipped_background_id FROM public.users WHERE equipped_background_id IS NOT NULL;
REVOKE ALL ON ops_backup.b20261031_bg_items, ops_backup.b20261031_bg_inventory,
              ops_backup.b20261031_bg_purchases, ops_backup.b20261031_bg_equipped FROM anon, authenticated;
SELECT (SELECT count(*) FROM ops_backup.b20261031_bg_items) items,
       (SELECT count(*) FROM ops_backup.b20261031_bg_inventory) inventory,
       (SELECT count(*) FROM ops_backup.b20261031_bg_purchases) purchases,
       (SELECT count(*) FROM ops_backup.b20261031_bg_equipped) equipped;
