-- Profile card colours (3.7.10): shop category profile_color.
-- One equipped colour repaints the body of the profile card (lib/profileColors.js on the client).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS equipped_profile_color_id UUID REFERENCES public.shop_items(id) ON DELETE SET NULL;

ALTER TABLE public.shop_items DROP CONSTRAINT IF EXISTS shop_items_category_check;
ALTER TABLE public.shop_items ADD CONSTRAINT shop_items_category_check CHECK (category IN (
  'banner','avatar_frame','profile_background','theme',
  'profile_badge','profile_title','name_effect','avatar_effect','chat_bubble',
  'presence_flare','profile_aura','sound_pack',
  'typing_flare','reaction_burst','call_overlay','countries','profile_color'));

INSERT INTO public.shop_items
  (sku, name, description, category, asset_url, preview_url, price_descoin, effect_key, rarity, sort_order, active)
VALUES
  ('profile-color-graphite', 'Graphite', 'Profile card color — Graphite. A calm deep grey, one step richer than the default card.', 'profile_color', 'data:,', NULL, 200, 'graphite', 'common', 1500, true),
  ('profile-color-midnight', 'Midnight', 'Profile card color — Midnight. A quiet fall from night blue to black.', 'profile_color', 'data:,', NULL, 200, 'midnight', 'common', 1501, true),
  ('profile-color-ocean', 'Ocean', 'Profile card color — Ocean. Deep sea blue that darkens toward the bottom.', 'profile_color', 'data:,', NULL, 220, 'ocean', 'common', 1502, true),
  ('profile-color-forest', 'Forest', 'Profile card color — Forest. Moss green fading into a dark forest.', 'profile_color', 'data:,', NULL, 220, 'forest', 'common', 1503, true),
  ('profile-color-obsidian', 'Obsidian', 'Profile card color — Obsidian. Near-black, glassy and deep.', 'profile_color', 'data:,', NULL, 240, 'obsidian', 'common', 1504, true),
  ('profile-color-emerald', 'Emerald', 'Profile card color — Emerald. Rich emerald green with gemstone depth.', 'profile_color', 'data:,', NULL, 280, 'emerald', 'rare', 1505, true),
  ('profile-color-ruby', 'Ruby', 'Profile card color — Ruby. Dark ruby red, warm and bold.', 'profile_color', 'data:,', NULL, 280, 'ruby', 'rare', 1506, true),
  ('profile-color-rose', 'Rose', 'Profile card color — Rose. A soft fall from dusty rose to deep pink.', 'profile_color', 'data:,', NULL, 280, 'rose', 'rare', 1507, true),
  ('profile-color-copper', 'Copper', 'Profile card color — Copper. Warm brown-orange like heated copper.', 'profile_color', 'data:,', NULL, 300, 'copper', 'rare', 1508, true),
  ('profile-color-glacier', 'Glacier', 'Profile card color — Glacier. Ice blue and teal, cool and clean.', 'profile_color', 'data:,', NULL, 300, 'glacier', 'rare', 1509, true),
  ('profile-color-lavender', 'Lavender', 'Profile card color — Lavender. Lavender fading into night purple.', 'profile_color', 'data:,', NULL, 300, 'lavender', 'rare', 1510, true),
  ('profile-color-amethyst', 'Amethyst', 'Profile card color — Amethyst. Deep amethyst purple, mysterious and bright.', 'profile_color', 'data:,', NULL, 380, 'amethyst', 'epic', 1511, true),
  ('profile-color-sunset', 'Sunset', 'Profile card color — Sunset. A sunset sliding from red-orange into purple.', 'profile_color', 'data:,', NULL, 400, 'sunset', 'epic', 1512, true),
  ('profile-color-aurora', 'Aurora', 'Profile card color — Aurora. A northern-lights blend from teal to violet.', 'profile_color', 'data:,', NULL, 520, 'aurora', 'legendary', 1513, true),
  ('profile-color-gold', 'Gold', 'Profile card color — Gold. Dark gold and amber, a regal glow for your card.', 'profile_color', 'data:,', NULL, 560, 'gold', 'legendary', 1514, true)
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_descoin = EXCLUDED.price_descoin,
  effect_key = EXCLUDED.effect_key,
  rarity = EXCLUDED.rarity,
  sort_order = EXCLUDED.sort_order,
  active = true;

SELECT count(*) AS profile_colors FROM public.shop_items WHERE category = 'profile_color' AND active;
