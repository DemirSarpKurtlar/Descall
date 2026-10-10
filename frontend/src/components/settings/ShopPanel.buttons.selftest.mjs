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
assert(
  panel.includes('busyAction === "buy"') && panel.includes('t("Buying…")'),
  "purchase stays on Buying until the item is owned",
);
assert(panel.includes("buyLockRef"), "a second tap cannot start another purchase before the first returns");
const buyFn = panel.slice(panel.indexOf("const handleBuy"), panel.indexOf("const handleEquip"));
assert(buyFn.length > 0 && !buyFn.includes("onEquippedChange"), "buying must not equip or refresh cosmetics");
assert(
  /flex-direction:\s*column/.test(css) && !/overflow-x:\s*auto/.test(css.split(".shop-category-tab:hover")[0]),
  "category tabs are a vertical list without a horizontal scroller",
);
const admin = readFileSync(join(root, "../../../backend/routes/admin.js"), "utf8");
assert(
  /user_credits[\s\S]{0,500}onConflict:\s*"user_id"/.test(admin),
  "credit updates must upsert on user_id",
);

console.log("ShopPanel.buttons.selftest.mjs: ok");
