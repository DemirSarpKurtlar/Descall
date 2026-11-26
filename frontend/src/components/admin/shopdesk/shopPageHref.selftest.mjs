// node src/components/admin/shopdesk/shopPageHref.selftest.mjs
// Sweep (Nov 2026): Shop desk "Open in shop" was a relative target=_blank link. In the
// desktop admin window it became descall://app/settings/shop, which the new-window handler
// (Electron setWindowOpenHandler, Tauri on_new_window) refuses: the button did nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "ItemDrawer.jsx"), "utf8");
const m = src.match(/export function shopPageHref\(desktop = isDesktopShell\(\)\) \{[\s\S]*?\n\}/);
assert.ok(m, "shopPageHref exists");
const shopPageHref = new Function("PUBLIC_SITE_ORIGIN", "isDesktopShell", `${m[0].replace("export ", "")}; return shopPageHref;`)("https://descall.com", () => false);
assert.equal(shopPageHref(true), "https://descall.com/settings/shop", "desktop: a web URL the browser can open");
assert.equal(shopPageHref(false), "/settings/shop", "web: same origin, new tab");
assert.doesNotMatch(src, /href="\/settings\/shop"/, "no relative new-window link left");
assert.match(src, /href=\{shopPageHref\(\)\} target="_blank"/);
console.log("shopPageHref selftest ok");
