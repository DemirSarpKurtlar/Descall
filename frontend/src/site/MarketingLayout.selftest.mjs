/**
 * Run: node frontend/src/site/MarketingLayout.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const layout = readFileSync(join(root, "MarketingLayout.jsx"), "utf8");
const css = readFileSync(join(root, "site.css"), "utf8");
const app = readFileSync(join(root, "MarketingApp.jsx"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(layout.includes("mkt-footer-grid"), "hydrated footer must use a column grid");
assert(layout.includes('t("Product")'), "footer needs a Product column");
assert(layout.includes('t("Company")'), "footer needs a Company column");
assert(css.includes(".mkt-footer-grid"), "footer grid styles must exist");
assert(
  css.includes(".mkt *::before") && css.includes(".mkt *::after") && /box-sizing:\s*border-box/.test(css),
  "marketing shell must use border-box so footer padding stays on-screen",
);
assert(/\.mkt-waitlist\s*\{[\s\S]*width:\s*100%/.test(css), "newsletter form can shrink inside the footer column");
assert(
  /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.mkt-footer\s*\{[^}]*padding:/.test(css),
  "footer must tighten side padding on mobile",
);
assert(
  /\.mkt-footer-copy[\s\S]*overflow-wrap:\s*anywhere/.test(css),
  "copyright line must wrap instead of overflowing the viewport",
);
assert(
  /\.mkt-footer-trust[\s\S]*overflow-wrap:\s*anywhere/.test(css),
  "trust line must wrap instead of overflowing the viewport",
);
assert(
  /@media\s*\(max-width:\s*720px\)\s*\{\s*\.mkt-waitlist-row\s*\{[^}]*flex-direction:\s*column/.test(css),
  "footer notify button stacks under the email field on mobile",
);
assert(app.includes("descall:open-auth"), "auth modal must listen for seo-static CTA events");
assert(app.includes("/tr/register"), "TR register route must exist");

console.log("MarketingLayout.selftest.mjs: ok");
