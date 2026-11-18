-- Market 2.0: every set gets a matching profile aura (owner, Nov 2026).
--
-- The 16 aura rows themselves (sku s2-profile_aura-<slug>, set_key = the set) are catalog items:
-- the catalog seeder (backend/lib/shop2/catalogSeed.js) inserts them on deploy, on sale, at the
-- catalog price. A set without an admin row (shop2_sets) picks its pieces by set_key, so it shows
-- the aura as soon as the row exists.
--
-- A set an admin saved in Yönetici Paneli keeps an explicit piece list (shop2_sets.piece_ids),
-- which predates the aura. This migration appends the set's own aura to that list, so the set,
-- its "full set" completion and its bundle price (sum of pieces minus the set discount) include
-- it everywhere. Additive only: nothing is removed, a list that already holds a profile aura is
-- left alone, and a set whose aura row does not exist yet is skipped. Apply it after the deploy
-- that seeds the catalog; running it again changes nothing.

BEGIN;

UPDATE public.shop2_sets AS s
SET piece_ids = s.piece_ids || a.id,
    version = s.version + 1,
    updated_at = now()
FROM public.shop_items AS a
WHERE a.set_key = s.set_key
  AND a.category = 'profile_aura'
  AND a.sku LIKE 's2-profile_aura-%'
  AND a.active
  AND a.retired_at IS NULL
  AND s.piece_ids IS NOT NULL
  AND cardinality(s.piece_ids) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.shop_items AS x
    WHERE x.id = ANY (s.piece_ids)
      AND x.category = 'profile_aura'
  );

COMMIT;
