// Profile card colours (3.7.10): palette, catalogue migration, Turkish names and wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROFILE_COLORS, profileColorKey, profileColorStyle, profileColorClass, profileColorSwatch } from "./profileColors.js";
import { SHOP_CATEGORY_TABS } from "./shopCategories.js";
import { PURCHASE_MODAL_CATEGORIES } from "./storePurchaseState.js";
import { SHOP_ITEM_TR } from "./shopItemI18n.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const keys = Object.keys(PROFILE_COLORS);

assert.ok(keys.length >= 10 && keys.length <= 15, "10-15 colours");

// Every colour is dark enough for white text (relative luminance of both stops).
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
for (const [key, [a, b, accent, angle]] of Object.entries(PROFILE_COLORS)) {
  for (const hex of [a, b, accent]) assert.match(hex, /^#[0-9a-f]{6}$/, `${key} hex`);
  for (const hex of [a, b]) assert.ok((1.05 / (lum(hex) + 0.05)) >= 7, `${key} ${hex} keeps white text AAA`);
  assert.ok(Number.isFinite(angle), `${key} angle`);
}

assert.equal(profileColorKey({ equippedProfileColor: { effect_key: "ocean" } }), "ocean");
assert.equal(profileColorKey({ effect_key: "gold" }), "gold");
assert.equal(profileColorKey("nope"), null);
assert.equal(profileColorKey({ equippedProfileColor: { effect_key: "constructor" } }), null);
assert.equal(profileColorStyle(null), null);
assert.equal(profileColorClass({}), "");
assert.equal(profileColorClass({ equippedProfileColor: { effect_key: "ruby" } }), "has-pcolor");
assert.deepEqual(profileColorStyle("ruby"), { "--pc-a": "#6a1428", "--pc-b": "#2a0910", "--pc-accent": "#ff5c7a", "--pc-angle": "180deg" });
assert.match(profileColorSwatch("aurora"), /^linear-gradient\(155deg, #0f5a5e 0%, #3b1d6e 100%\)$/);

// Catalogue migration ships exactly the palette, and each item has a Turkish name.
const sql = read("../../../supabase/migrations/20261103_profile_colors.sql");
const skus = [...sql.matchAll(/\('profile-color-([a-z]+)'/g)].map((m) => m[1]);
assert.deepEqual([...skus].sort(), [...keys].sort(), "migration items = palette");
for (const k of keys) {
  assert.match(sql, new RegExp(`'profile-color-${k}'[^\\n]*'profile_color'[^\\n]*'${k}'`), `${k} effect_key`);
  assert.ok(SHOP_ITEM_TR[`profile-color-${k}`]?.[0], `${k} Turkish name`);
}
assert.match(sql, /equipped_profile_color_id UUID REFERENCES public\.shop_items/);
assert.match(sql, /'countries','profile_color'\)\)/);

// Wiring: tab, purchase modal, shop card, card surfaces, backend slots.
assert.ok(SHOP_CATEGORY_TABS.some((t) => t.id === "profile_color"), "shop tab");
assert.ok(PURCHASE_MODAL_CATEGORIES.includes("profile_color"), "purchase modal");
assert.match(read("../components/settings/ShopPanel.jsx"), /category === "profile_color"\) return equipped\?\.profileColorId/);
assert.match(read("../components/social/UserProfileModal.jsx"), /pfs-heavy \$\{profileColorClass\(fetched\)\}/);
assert.match(read("./hoverProfile.js"), /colorClass: backgroundUrl \? "" : profileColorClass\(user\)/);
assert.match(read("../styles/profile-color.css"), /\.has-pcolor:is\(\.pfs-heavy, \.user-hover-card, \.user-profile-card/);
const shop = read("../../backend/lib/shop.js");
assert.match(shop, /profile_color: "equipped_profile_color_id"/);
assert.match(shop, /profileColor: pick\("equipped_profile_color_id"\)/);
assert.match(read("../../backend/lib/userProfile.js"), /equippedProfileColor: equipped\.profileColor/);
const tr = read("../i18n/locales/tr.js");
assert.match(tr, /"Card Colors": "Kart Renkleri"/);

console.log("profileColors.selftest.mjs: ok");
