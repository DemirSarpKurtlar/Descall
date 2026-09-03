/**
 * Run: node frontend/src/site/seo/corePageBodies.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { corePageBody } from "./corePageBodies.js";
import { authHref, seoSiteNavHtml } from "./prerenderCopy.js";

const homeTr = corePageBody("/tr");
const homeEn = corePageBody("/");

assert.equal(authHref(true, "register"), "/tr?auth=register");
assert.equal(authHref(false, "login"), "/?auth=login");

assert.match(homeTr, /href="\/tr\?auth=register"/);
assert.match(homeTr, /href="\/tr\?auth=login"/);
assert.match(homeEn, /href="\/\?auth=register"/);
assert.match(homeEn, /href="\/\?auth=login"/);

assert.doesNotMatch(
  homeTr,
  /<button[^>]*data-hydrate/,
  "auth CTAs must be real links, not dead buttons",
);
assert.match(homeTr, /data-hydrate data-auth="register"/);
assert.match(homeTr, /class="seo-card-grid"/);
assert.match(homeTr, /class="seo-footer-grid"/);
assert.doesNotMatch(homeTr, /seo-explore-label/);
assert.match(homeTr, /Birlikte konuşun/);
assert.match(homeTr, /Ücretsiz başla/);
assert.match(homeTr, /Giriş yap/);

assert.doesNotMatch(homeEn, /Ücretsiz başla/);
assert.doesNotMatch(homeEn, /Giriş yap/);

const footer = seoSiteNavHtml(true);
assert.match(footer, /<footer class="seo-footer">/);
assert.match(footer, /<h2>Ürün<\/h2>/);
assert.match(footer, /<h2>Keşfet<\/h2>/);
assert.match(footer, /<h2>Şirket<\/h2>/);

const root = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(root, "../../../index.html"), "utf8");
assert.match(indexHtml, /descall:open-auth/);
assert.match(indexHtml, /seo-footer-grid/);
assert.match(indexHtml, /seo-card-grid/);

console.log("corePageBodies.selftest.mjs: ok");
