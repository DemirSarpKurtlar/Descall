/**
 * Run: node frontend/src/components/settings/ShopPanel.buttons.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(root, "ShopPanel.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/shop.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(panel.includes('className="btn-primary sm"'), "catalog cards still use the Buy action");
assert(
  /\.shop-item-footer \.ripple-btn[\s\S]{0,400}border-radius:\s*999px/.test(css),
  "shop catalog Buy/Equip buttons must be pill-shaped, not square",
);
assert(
  /\.shop-item-footer \.ripple-btn[\s\S]{0,400}white-space:\s*nowrap/.test(css),
  "shop catalog action labels must stay on one line",
);
assert(
  /\.shop-gift-actions \.ripple-btn[\s\S]{0,200}border-radius:\s*999px/.test(css),
  "shop gift Equip button must match the rounded catalog actions",
);

console.log("ShopPanel.buttons.selftest.mjs: ok");
