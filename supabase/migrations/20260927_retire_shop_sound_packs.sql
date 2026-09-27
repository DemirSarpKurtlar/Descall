-- Shop sound packs are removed from the catalog.
-- Anyone who had one equipped returns to the default message and call tones.
UPDATE users
SET equipped_sound_pack_id = NULL
WHERE equipped_sound_pack_id IS NOT NULL;

UPDATE shop_items
SET active = false
WHERE category = 'sound_pack'
  AND active = true;
