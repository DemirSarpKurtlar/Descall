// 2.10.114 cosmetics rules:
//  - an equipped catalog chat bubble always beats the theme bubble paint;
//  - avatar frames are removed (never rendered, sold, equipped, or listed);
//  - the phone call stage is opaque on every theme.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

// Bubbles: every glass rule that paints a .message-bubble background must skip cosmetics.
for (const file of ["glass-desktop/chat.css", "glass/chat.css"]) {
  const css = read(file);
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = m[1].trim();
    if (!/\.message-bubble(?![-\w])/.test(sel) || !/(^|[;\s])background(-color|-image)?\s*:/.test(m[2])) continue;
    for (const part of sel.split(",")) {
      if (!/\.message-bubble(?![-\w])/.test(part)) continue;
      if (/is-editing|data-pressed|menu-open|has-media|has-slash-embed/.test(part)) continue;
      assert.match(part, /:not\(\.cosmetic-chat-bubble\)/, `${file}: "${part.trim()}" paints bubbles and must yield to an equipped catalog bubble`);
    }
  }
}

// Frames.
const avatar = read("../components/ui/Avatar.jsx");
assert.doesNotMatch(avatar, /equippedAvatarFrame|ui-avatar-frame-overlay/, "Avatar never paints a frame");
const shopPanel = read("../components/settings/ShopPanel.jsx");
// 2.11.2: the tab list lives in lib/shopCategories.js (shared by every platform).
assert.match(shopPanel, /SHOP_CATEGORY_TABS/);
const shopCategories = read("../lib/shopCategories.js");
const tabsSrc = shopCategories.slice(shopCategories.indexOf("SHOP_CATEGORY_TABS"));
const tabs = [...tabsSrc.slice(0, tabsSrc.indexOf("]);")).matchAll(/id: "([a-z_]+)"/g)].map((m) => m[1]);
assert.equal(tabs.includes("avatar_frame"), false, "no Çerçeveler tab");
assert.deepEqual(tabs.slice(0, 2), ["banner", "avatar_effect"], "Avatar efektleri takes the second slot");
const shopLib = read("../../backend/lib/shop.js");
assert.match(shopLib, /REMOVED_COSMETIC_CATEGORIES = new Set\(\["avatar_frame", "profile_title", "profile_badge", "profile_background"\]\)/);
assert.match(shopLib, /RETIRED_SHOP_CATEGORIES = new Set\(\["sound_pack", \.\.\.REMOVED_COSMETIC_CATEGORIES\]\)/, "frames leave the catalog and cannot be bought");
assert.match(shopLib, /avatarFrame: null, \/\/ frames removed/, "profiles never return an equipped frame");
assert.match(shopLib, /avatarFrameId: null,/);
assert.doesNotMatch(shopLib, /update\(\{ equipped_avatar_frame_id/, "no data migration of stored frames");
const shopRoute = read("../../backend/routes/shop.js");
assert.match(shopRoute, /REMOVED_COSMETIC_CATEGORIES\.has\(category\)\) \{\s*return res\.status\(410\)/, "equip rejects frames");
const admin = read("../../backend/routes/admin.js");
assert.match(admin, /REMOVED_COSMETIC_CATEGORIES\.has\(item\.category\)\) \{\s*return res\.status\(410\)/, "admin gift rejects frames");

// Call stage.
const call = read("glass/call.css");
assert.match(call, /html\.glass-ui \.call-overlay-root\.g-call \{\s*background-color: #0b0c12 !important;/, "call stage has an opaque base color");
const scenes = read("glass/theme-scenes.css");
const callRule = scenes.slice(scenes.indexOf('html.glass-ui[data-theme="lagoon"] .call-overlay-root.g-call'));
const body = callRule.slice(callRule.indexOf("{"), callRule.indexOf("}"));
assert.doesNotMatch(body, /transparent/, "theme scenes keep the call stage opaque");
assert.match(read("frost.css"), /\.call-overlay-minimized/, "minimized call pill is heavy frost");
console.log("cosmeticPrecedence.selftest ok");
