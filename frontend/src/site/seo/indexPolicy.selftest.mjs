// noindex,follow policy (seo/indexPolicy.js): flags, sitemaps, prerender and React.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NOINDEX_FOLLOW_PAGES,
  ROBOTS_INDEX,
  ROBOTS_NOINDEX_FOLLOW,
  isNoindexFollowPath,
  prerenderedNoindexPath,
  robotsContent,
} from "./indexPolicy.js";
import { PUBLIC_ROUTES, routeMeta, routeMetaForLocale } from "../seoConfig.js";
import { allSitemapEntries, indexableRoutes } from "../sitemapCatalog.js";
import { PREFIXED_SITE_LOCALES, withLocalePrefix } from "../siteLocales.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// Paths: English page and every prefixed copy; nothing else.
for (const p of Object.keys(NOINDEX_FOLLOW_PAGES)) {
  assert.ok(isNoindexFollowPath(p), p);
  assert.ok(isNoindexFollowPath(`${p}/`), `${p}/`);
  for (const id of PREFIXED_SITE_LOCALES) assert.ok(isNoindexFollowPath(withLocalePrefix(p, id)), `${id} ${p}`);
}
for (const p of ["/", "/tr", "/download", "/terms", "/de/terms", "/contact", "/statusx", "/blog/status"]) {
  assert.ok(!isNoindexFollowPath(p), `${p} stays indexable`);
}

// Routes: flagged, still public (prerendered), out of every sitemap.
const flagged = PUBLIC_ROUTES.filter((r) => r.noindexFollow).map((r) => r.path);
assert.ok(flagged.includes("/status") && flagged.includes("/de/copyright"), "status and copyright are flagged in every language");
assert.equal(flagged.length, PUBLIC_ROUTES.filter((r) => isNoindexFollowPath(r.path)).length);
const indexable = new Set(indexableRoutes().map((r) => r.path));
const inSitemaps = new Set(allSitemapEntries().map((e) => e.path));
for (const p of flagged) {
  assert.ok(!indexable.has(p) && !inSitemaps.has(p), `${p} is in no sitemap`);
  assert.equal(routeMeta(p).noindexFollow, true, `routeMeta keeps the flag for ${p}`);
}
assert.equal(routeMetaForLocale("/status", "tr").noindexFollow, true, "the Turkish title override keeps the flag");
assert.ok(inSitemaps.has("/terms") && inSitemaps.has("/") && inSitemaps.has("/tr"), "core pages stay in the sitemaps");

// Robots content.
assert.equal(robotsContent({}), ROBOTS_INDEX);
assert.equal(robotsContent({ noindexFollow: true }), ROBOTS_NOINDEX_FOLLOW);
assert.equal(robotsContent({ forceNoindex: true, noindexFollow: true }), "noindex,nofollow");
assert.equal(robotsContent({ metaNoindex: true }), "noindex,nofollow");

// The prerendered marker is read from the head.
const fakeDoc = (attr) => ({ head: { querySelector: (sel) => (sel.includes("data-noindex-path") && attr ? { getAttribute: () => attr } : null) } });
assert.equal(prerenderedNoindexPath(fakeDoc("/communities/gaming")), "/communities/gaming");
assert.equal(prerenderedNoindexPath(fakeDoc(null)), null);
assert.equal(prerenderedNoindexPath(null), null);

// React and the prerender use the same policy (before Nov 13, SeoHead rewrote the
// prerendered noindex of thin directory pages to index,follow on hydration).
const seoHead = fs.readFileSync(path.join(here, "../SeoHead.jsx"), "utf8");
assert.ok(seoHead.includes("prerenderedNoindexPath()") && seoHead.includes("robotsContent("), "SeoHead keeps the prerendered noindex");
assert.ok(!/"index,follow,max-image-preview/.test(seoHead), "SeoHead takes the robots string from indexPolicy.js");
const prerender = fs.readFileSync(path.join(here, "../../../scripts/prerender-seo.mjs"), "utf8");
assert.ok(prerender.includes("data-noindex-path") && prerender.includes("ROBOTS_NOINDEX_FOLLOW"), "prerender marks noindex,follow shells");

console.log("indexPolicy.selftest: ok");
