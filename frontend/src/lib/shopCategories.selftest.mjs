// node src/lib/shopCategories.selftest.mjs — 2.11.2: avatar frames (removed in 2.10.114) never
// appear as a shop tab on any platform. Web, Windows (Electron), iOS and Android all render
// the same ShopPanel from the same web build, so this checks every tab source they use.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REMOVED_SHOP_CATEGORIES,
  SHOP_CATEGORY_TABS,
  isRetiredShopCategory,
  visibleShopItems,
  visibleShopTabs,
} from "./shopCategories.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

// 1. The shared tab list.
assert.ok(REMOVED_SHOP_CATEGORIES.includes("avatar_frame"));
assert.ok(!SHOP_CATEGORY_TABS.some((t) => t.id === "avatar_frame"), "no frame tab in SHOP_CATEGORY_TABS");
assert.ok(!SHOP_CATEGORY_TABS.some((t) => /frame/i.test(t.label)), "no 'Frames' label");
assert.equal(SHOP_CATEGORY_TABS[0].id, "banner");
assert.equal(SHOP_CATEGORY_TABS[1].id, "avatar_effect", "Avatar Effects took the frames slot");

// 2. Filtering: frames are dropped even when a stale list / catalog still carries them.
const withFrame = [{ id: "banner" }, { id: "avatar_frame" }, { id: "theme" }];
const counts = new Map([["banner", 2], ["avatar_frame", 3], ["theme", 1]]);
assert.deepEqual(visibleShopTabs(withFrame, { counts }).map((t) => t.id), ["banner", "theme"]);
assert.deepEqual(visibleShopTabs(withFrame, { showEmpty: true }).map((t) => t.id), ["banner", "theme"], "phone glass (show all) still drops frames");
assert.deepEqual(visibleShopTabs(withFrame, { showEmpty: true, serverRetired: ["theme"] }).map((t) => t.id), ["banner"], "server-retired categories are hidden");
assert.deepEqual(visibleShopItems([{ category: "avatar_frame" }, { category: "banner" }]).map((i) => i.category), ["banner"]);
assert.ok(isRetiredShopCategory("sound_pack"));
assert.ok(!isRetiredShopCategory("banner", null));

// 3. Every tab source in the app uses the shared list and has no frame entry.
const panel = read("src/components/settings/ShopPanel.jsx");
assert.match(panel, /SHOP_CATEGORY_TABS/, "ShopPanel builds its tabs from lib/shopCategories.js");
assert.match(panel, /visibleShopTabs\(/, "ShopPanel filters tabs through visibleShopTabs");
assert.match(panel, /visibleShopItems\(/, "ShopPanel filters catalog items");
assert.doesNotMatch(panel, /id:\s*["']avatar_frame["']/, "no inline frame tab in ShopPanel");
assert.doesNotMatch(panel, /label:\s*["']Frames["']/);
const preview = read("src/components/settings/ShopProfilePreview.jsx");
assert.doesNotMatch(preview, /id:\s*["']avatar_frame["']/, "no frame slot in the profile preview");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs)$/.test(name) && !/selftest|\.test\./.test(name)) out.push(p);
  }
  return out;
}
const offenders = walk(join(root, "src")).filter((f) => /\{\s*id:\s*["']avatar_frame["']\s*,\s*label:/.test(readFileSync(f, "utf8")));
assert.deepEqual(offenders, [], "no other file defines a frame tab");

// 4. Native apps bundle the freshly built web app (no stale committed copy, no remote URL).
const cap = read("capacitor.config.ts");
assert.match(cap, /webDir:\s*"dist"/);
assert.doesNotMatch(cap, /server:\s*\{[^}]*\burl:/s, "native apps do not load a remote/stale web URL");
let tracked = "";
try {
  tracked = execFileSync("git", ["ls-files", "ios/App/App/public", "android/app/src/main/assets/public"], { cwd: root, encoding: "utf8" });
} catch {
  tracked = "";
}
assert.equal(tracked.trim(), "", "no committed (stale) web bundle inside the native projects");
const iosWf = join(root, "..", ".github", "workflows", "ios-testflight.yml");
if (existsSync(iosWf)) {
  const wf = readFileSync(iosWf, "utf8");
  assert.match(wf, /npm run build:prod/);
  assert.match(wf, /cap sync ios/, "TestFlight builds bundle the current web build");
}

// 5. Server side: frames are retired and announced to installed builds.
const shopLib = read("backend/lib/shop.js");
assert.match(shopLib, /REMOVED_COSMETIC_CATEGORIES = new Set\(\["avatar_frame"\]\)/);
const shopRoute = read("backend/routes/shop.js");
assert.match(shopRoute, /retiredCategories:\s*\[\.\.\.shop\.RETIRED_SHOP_CATEGORIES\]/);
console.log("shopCategories selftest OK");
