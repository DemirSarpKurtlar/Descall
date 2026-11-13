/**
 * Run: node frontend/scripts/seoStructuredData.selftest.mjs
 * The structured-data rules of seo-validate --dist, on real prerendered shells
 * (injectMeta on index.html) and on broken copies of them.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const { checkStructuredData } = await import("./seoStructuredData.mjs");
const { registerSiteCatalogs } = await import("./siteCatalogs.mjs");
await registerSiteCatalogs();
const { injectMeta, breadcrumbsForRoute } = await import(pathToFileURL(path.join(here, "prerender-seo.mjs")).href);
const { PUBLIC_ROUTES } = await import(pathToFileURL(path.join(root, "src/site/seoConfig.js")).href);
const template = fs.readFileSync(path.join(root, "index.html"), "utf8");

const route = (p) => PUBLIC_ROUTES.find((r) => r.path === p);
const pageOf = (p, lang, home, isBlogPost = false) => ({ path: p, canonical: `https://descall.com${p === "/" ? "/" : p}`, lang, home, isBlogPost });
const shell = (p) => injectMeta(template, route(p));

// Real pages pass.
for (const [p, lang, home, blog] of [
  ["/", "en", "/"],
  ["/features", "en", "/"],
  ["/faq", "en", "/"],
  ["/de/faq", "de", "/de"],
  ["/gizlilik", "tr", "/tr"],
  ["/discord-alternative-for-friends", "en", "/"],
  ["/blog/discord-competitors", "en", "/", true],
  ["/pt-br/blog/discord-competitors", "pt-BR", "/pt-br", true],
  ["/tr/blog/discord-competitors", "tr", "/tr", true],
  ["/tr/discord-alternatifi", "tr", "/tr"],
]) {
  assert.ok(route(p), `${p} is a route`);
  assert.deepEqual(checkStructuredData(shell(p), pageOf(p, lang, home, blog)), [], `${p} structured data`);
}

// Breadcrumb trails.
assert.equal(breadcrumbsForRoute(route("/")), null, "no trail on a home page");
assert.deepEqual(breadcrumbsForRoute(route("/discord-alternative-for-friends")).map((c) => c.path), ["/", "/discord-alternative", "/discord-alternative-for-friends"]);
assert.deepEqual(breadcrumbsForRoute(route("/gizlilik")).map((c) => c.path), ["/tr", "/gizlilik"]);
assert.equal(breadcrumbsForRoute(route("/de/features"))[0].path, "/de");

// Broken copies fail.
const features = shell("/features");
const fpage = pageOf("/features", "en", "/");
const noCrumbs = features.replace(/<script type="application\/ld\+json"[^>]*>\{"@context":"https:\/\/schema.org","@type":"BreadcrumbList"[\s\S]*?<\/script>/, "");
assert.notEqual(noCrumbs, features, "test removed the breadcrumb block");
assert.match(checkStructuredData(noCrumbs, fpage).join("\n"), /expected 1 BreadcrumbList, found 0/);
const rated = features.replace('"@type":"SoftwareApplication"', '"@type":"SoftwareApplication","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9"}');
assert.match(checkStructuredData(rated, fpage).join("\n"), /rating \/ review markup/);
const noIos = features.replace(/"operatingSystem":"[^"]*"/, '"operatingSystem":"Windows, Android, Web"');
assert.match(checkStructuredData(noIos, fpage).join("\n"), /operatingSystem misses iOS/);

// Brand entity: App Store in Organization.sameAs, square logo, no WebSite.logo, no fake search.
const home = shell("/");
const hpage = pageOf("/", "en", "/");
assert.deepEqual(checkStructuredData(home, hpage), [], "home structured data");
const ldNodes = [...home.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap((m) => {
  const j = JSON.parse(m[1]);
  return j["@graph"] || [j];
});
const orgNode = ldNodes.find((n) => n["@type"] === "Organization");
assert.ok(orgNode.sameAs.includes("https://apps.apple.com/app/id6820558264"), "Organization.sameAs lists the App Store app");
assert.ok(!/free Discord alternative/i.test(JSON.stringify(ldNodes)), "the entity graph describes Descall, not a competitor");
const noStore = home.replace('"sameAs":["https://apps.apple.com/app/id6820558264",', '"sameAs":[');
assert.notEqual(noStore, home, "test removed the App Store sameAs");
assert.match(checkStructuredData(noStore, hpage).join("\n"), /Organization.sameAs has no App Store URL/);
const siteLogo = home.replace('"@type":"WebSite",', '"@type":"WebSite","logo":"https://descall.com/favicon-512.png",');
assert.match(checkStructuredData(siteLogo, hpage).join("\n"), /WebSite.logo/);
const search = home.replace('"@type":"WebSite",', '"@type":"WebSite","potentialAction":{"@type":"SearchAction"},');
assert.match(checkStructuredData(search, hpage).join("\n"), /SearchAction/);

const faq = shell("/faq");
const hiddenQ = faq.replace(/<summary>Is Descall free\?<\/summary>/, "<summary>Gone</summary>");
assert.match(checkStructuredData(hiddenQ, pageOf("/faq", "en", "/")).join("\n"), /FAQPage question not on the page: "Is Descall free\?"/);

const post = shell("/blog/discord-competitors");
const ppage = pageOf("/blog/discord-competitors", "en", "/", true);
assert.match(checkStructuredData(post.replace('"@type":"BlogPosting"', '"@type":"Article"'), ppage).join("\n"), /BlogPosting JSON-LD missing/);
assert.match(checkStructuredData(post, { ...ppage, lang: "de" }).join("\n"), /BlogPosting.inLanguage en on a de page/);
assert.match(checkStructuredData(post.replace('"@type":"BlogPosting"', ',"@type":"BlogPosting"'), ppage).join("\n"), /does not parse/);

console.log("seoStructuredData.selftest.mjs: ok");
