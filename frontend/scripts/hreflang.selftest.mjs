/**
 * Run: node frontend/scripts/hreflang.selftest.mjs
 * hreflang sets of every indexable route (src/site/localePaths.js hreflangAlternates, the
 * same function the prerender and both sitemaps use), without a build: self reference,
 * x-default to the English page, every alternate an indexable route whose own set points
 * back (reciprocal), one URL per language. seo-validate --dist checks the built HTML too.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { PUBLIC_ROUTES } = await import(pathToFileURL(path.join(root, "src/site/seoConfig.js")).href);
const { hreflangAlternates } = await import(pathToFileURL(path.join(root, "src/site/localePaths.js")).href);

const routes = PUBLIC_ROUTES.filter((r) => !r.noindex);
const indexable = new Set(routes.map((r) => r.path));
const sets = new Map(routes.map((r) => [r.path, hreflangAlternates(r.path)]));
let pairs = 0;

for (const [page, alts] of sets) {
  if (!alts.length) continue;
  const byLang = new Map();
  for (const a of alts) {
    assert.ok(!byLang.has(a.hreflang), `${page}: two URLs for ${a.hreflang}`);
    byLang.set(a.hreflang, a.path);
    assert.ok(indexable.has(a.path), `${page}: alternate ${a.hreflang} ${a.path} is not an indexable route`);
  }
  assert.ok([...byLang.values()].includes(page), `${page}: its own URL is missing from its hreflang set`);
  assert.ok(byLang.has("x-default"), `${page}: no x-default`);
  assert.ok(byLang.has("en") && byLang.get("x-default") === byLang.get("en"), `${page}: x-default is not the English page`);
  for (const [lang, target] of byLang) {
    if (lang === "x-default" || target === page) continue;
    const back = sets.get(target) || [];
    assert.ok(back.some((b) => b.path === page), `${page} -> ${target} (${lang}) is not reciprocal`);
    pairs += 1;
  }
}
assert.ok(pairs > 500, `expected hundreds of hreflang pairs, got ${pairs}`);
console.log(`hreflang.selftest.mjs: ok (${routes.length} routes, ${pairs} reciprocal pairs)`);
