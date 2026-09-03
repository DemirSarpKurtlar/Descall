/**
 * Run: node frontend/src/lib/shopIcons.selftest.mjs
 * Note: JSX module — assert via source scan (no JSX transform in plain node).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, "shopIcons.jsx"), "utf8");

function assert(c, m) {
  if (!c) throw new Error(m);
}

const requiredKeys = ["crown", "diamond", "star", "flame", "skull", "rocket", "trophy", "ghost", "butterfly", "comet", "shield", "gamepad"];
for (const k of requiredKeys) {
  assert(new RegExp(`${k}:\\s*\\w+`).test(src), `missing shop icon key ${k}`);
}
const requiredEmoji = ["👑", "💎", "⭐", "🔥", "💀", "🚀", "🏆", "👻", "🦋", "☄️"];
for (const e of requiredEmoji) {
  assert(src.includes(`"${e}"`), `missing emoji map for ${e}`);
}
assert(/export function resolveShopBadgeIcon/.test(src), "resolveShopBadgeIcon export");
assert(/export function ShopBadgeIcon/.test(src), "ShopBadgeIcon export");
assert(/export function ShopTitleTag/.test(src), "ShopTitleTag export");
assert(/export function ActivityTypeIcon/.test(src), "ActivityTypeIcon export");
assert(/from "lucide-react"/.test(src), "must use lucide-react");
assert(!/👑/.test(src.split("SHOP_ICON_BY_EMOJI")[0] || ""), "keys map must not use raw crown emoji as values");

console.log("shopIcons.selftest.mjs: ok");
