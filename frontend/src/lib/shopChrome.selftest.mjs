/**
 * Run: node frontend/src/lib/shopChrome.selftest.mjs
 * Shop wallet sits on the header's bottom edge at real safe-area insets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shopChromeLayout, shopHeaderHeight } from "./shopChrome.js";

const here = dirname(fileURLToPath(import.meta.url));

for (const inset of [0, 20, 47, 59, 62]) {
  const layout = shopChromeLayout({ safeAreaTop: inset });
  assert.equal(layout.gap, 0, `inset ${inset} leaves no gap`);
  assert.equal(layout.walletTop, layout.headerH);
  assert.equal(layout.headerH, shopHeaderHeight(inset));
  assert.equal(layout.contentPad, layout.headerH + 46);
}
assert.equal(shopHeaderHeight(62), 120, "62pt island: chrome-top 60 + 60px of header");
assert.equal(shopHeaderHeight(59), 117, "59pt island");
assert.equal(shopHeaderHeight(0), 58);

/* A device header that is taller than the formula still pins flush. */
{
  const layout = shopChromeLayout({ safeAreaTop: 62, measuredHeader: 128 });
  assert.equal(layout.formula, 120);
  assert.equal(layout.headerH, 128);
  assert.equal(layout.walletTop, 128);
  assert.equal(layout.gap, 0);
}

const css = readFileSync(join(here, "../styles/glass/shop.css"), "utf8");
const panel = readFileSync(join(here, "../components/layout/UserPanel.jsx"), "utf8");
assert.match(css, /--g-shop-header-h, calc\(var\(--g-chrome-top\) \+ 60px\)/);
assert.match(css, /\.g-shop-chrome \{/);
assert.match(css, /top: var\(--g-shop-header-h, calc\(var\(--g-chrome-top\) \+ 60px\)\)/);
assert.match(css, /top: calc\(-1 \* var\(--g-shop-header-h/);
assert.match(css, /mask-image: linear-gradient\(180deg, #000 0%, #000 70%, transparent 100%\)/);
assert.doesNotMatch(css, /shop-wallet-bar::before/);
assert.match(panel, /g-shop-open/);
assert.match(panel, /--g-shop-header-h/);
assert.match(panel, /className="g-shop-chrome"/);
assert.match(readFileSync(join(here, "../components/settings/ShopPanel.jsx"), "utf8"), /g-shop-chrome/);

console.log("shopChrome.selftest ok");
