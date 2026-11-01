// Site languages: URL prefixes, hreflang sets for all seven locales, locale resolution,
// marketing links, prerender copy for a prefixed locale (tiny fake catalog) and the
// sitemap alternates. Run: node src/site/siteLocales.selftest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const registry = JSON.parse(fs.readFileSync(path.join(root, "src/i18n/locales.json"), "utf8"));
const sl = await imp("src/site/siteLocales.js");
const lp = await imp("src/site/localePaths.js");
const { SITE_DRAFT_LOCALES } = await imp("src/site/siteDraftLocales.js");
const { resolveMarketingLocale, initialMarketingLocale } = await imp("src/site/resolveMarketingLocale.js");
const { marketingHref } = await imp("src/site/marketingHref.js");
const text = await imp("src/site/siteText.js");
const copy = await imp("src/site/seo/prerenderCopy.js");
const { corePageBody } = await imp("src/site/seo/corePageBodies.js");
const { pageExtrasHtml } = await imp("src/site/seo/pageExtras.js");
const seo = await imp("src/site/seoConfig.js");

const LIVE = registry.locales.filter((l) => l.status === "live").map((l) => l.id);
const ALL = { locales: LIVE }; // every live locale served, as if no site drafts were left

// --- registry and draft gating -------------------------------------------------
assert.deepEqual(sl.PREFIXABLE_LOCALES, LIVE.filter((id) => id !== "en" && id !== "tr"));
assert.deepEqual(sl.SITE_LOCALES, LIVE.filter((id) => !SITE_DRAFT_LOCALES.includes(id)));
assert.deepEqual(sl.PREFIXED_SITE_LOCALES, sl.SITE_LOCALES.filter((id) => id !== "en" && id !== "tr"));
assert.ok(sl.SITE_LOCALES.includes("en") && sl.SITE_LOCALES.includes("tr"), "en and tr are never drafts");
assert.deepEqual(sl.siteLocaleIds({ includeDrafts: true }), LIVE);
assert.deepEqual(sl.siteLocaleIds({ drafts: [] }), LIVE);
assert.equal(sl.localePrefix("de"), "/de");
assert.equal(sl.localePrefix("pt-BR"), "/pt-br", "prefix is the lowercase id");
assert.equal(sl.withLocalePrefix("/", "de"), "/de");
assert.equal(sl.withLocalePrefix("/compare/discord", "pt-BR"), "/pt-br/compare/discord");
assert.equal(sl.prefixedLocaleFromPath("/pt-br/faq", ["pt-BR"]), "pt-BR");
assert.equal(sl.prefixedLocaleFromPath("/PT-BR", ["pt-BR"]), "pt-BR");
assert.equal(sl.prefixedLocaleFromPath("/descall-sahibi", ["de"]), null, "/de is a segment, not a string prefix");
assert.equal(sl.prefixedLocaleFromPath("/download", ["de"]), null);
assert.equal(sl.stripPrefixedLocale("/de/faq/", ["de"]), "/faq");
assert.equal(sl.stripPrefixedLocale("/de", ["de"]), "/");
assert.equal(sl.ogLocaleTag("pt-BR"), "pt_BR");
assert.equal(sl.ogLocaleTag("en"), "en_US");
assert.equal(sl.localeNativeName("de"), "Deutsch");
assert.equal(sl.SITE_MIRROR_PATHS.length, 15);
for (const id of SITE_DRAFT_LOCALES) {
  assert.ok(!sl.SITE_LOCALES.includes(id), `${id} is a draft and not served`);
  assert.ok(!seo.PUBLIC_ROUTES.some((r) => r.locale === id), `${id} draft routes are not public`);
}
// Served locale paths only: a draft prefix is not stripped (the URL is a 404 there).
if (SITE_DRAFT_LOCALES.includes("de")) assert.equal(lp.stripLocalePrefix("/de/faq"), "/de/faq");
assert.equal(lp.stripLocalePrefix("/tr/faq"), "/faq");

// --- locale of a URL, English page behind it, counterparts -------------------------
assert.equal(lp.forcedLocaleForPath("/de/faq", ALL), "de");
assert.equal(lp.forcedLocaleForPath("/pt-br", ALL), "pt-BR");
assert.equal(lp.forcedLocaleForPath("/tr/features", ALL), "tr");
assert.equal(lp.forcedLocaleForPath("/gizlilik", ALL), "tr");
assert.equal(lp.forcedLocaleForPath("/features", ALL), null);
assert.equal(lp.englishPathFor("/ru/privacy", ALL), "/privacy");
assert.equal(lp.englishPathFor("/iletisim", ALL), "/contact");
assert.equal(lp.englishPathFor("/tr/discord-acildi-mi", ALL), null, "Turkish-only page");
assert.equal(lp.localizedPathFor("/features", "de", ALL), "/de/features");
assert.equal(lp.localizedPathFor("/privacy", "tr", ALL), "/gizlilik");
assert.equal(lp.localizedPathFor("/blog", "de", ALL), null, "blog is English-only for prefixed locales");
assert.equal(lp.localizedPathFor("/de/status", "es", ALL), "/es/status");
assert.equal(lp.localizedPathFor("/features", "de", { locales: ["en", "tr"] }), null, "a draft has no twin");
assert.equal(lp.localeHomePath("fr"), "/fr");
assert.equal(lp.localeHomePath("tr"), "/tr");
assert.equal(lp.localeHomePath("en"), "/");

// Language picker destinations.
assert.equal(lp.destinationForLocale("/features", "de", ALL), "/de/features");
assert.equal(lp.destinationForLocale("/blog/discord-vs-descall", "de", ALL), "/de", "no twin -> that language's home");
assert.equal(lp.destinationForLocale("/tr/discord-acildi-mi", "fr", ALL), "/fr");
assert.equal(lp.destinationForLocale("/de/features", "en", ALL), "/features");
assert.equal(lp.destinationForLocale("/de/privacy", "tr", ALL), "/gizlilik");
assert.equal(lp.destinationForLocale("/de/status", "tr", ALL), "/status", "no Turkish twin -> English page, Turkish chrome");
assert.equal(lp.destinationForLocale("/apps-like-discord", "tr", ALL), "/apps-like-discord", "Turkish keeps its old rule");
assert.equal(lp.destinationForLocale("/tr/discord-acildi-mi", "en", ALL), "/");
assert.equal(lp.destinationForLocale("/tr/features", "en", ALL), "/features");

// --- hreflang sets ----------------------------------------------------------------
const set = (p, opts = ALL) => Object.fromEntries(lp.hreflangAlternates(p, opts).map((a) => [a.hreflang, a.path]));
assert.deepEqual(set("/features"), {
  en: "/features",
  tr: "/tr/features",
  de: "/de/features",
  es: "/es/features",
  fr: "/fr/features",
  "pt-BR": "/pt-br/features",
  ru: "/ru/features",
  "x-default": "/features",
});
assert.deepEqual(set("/"), { en: "/", tr: "/tr", de: "/de", es: "/es", fr: "/fr", "pt-BR": "/pt-br", ru: "/ru", "x-default": "/" });
assert.equal(set("/contact").tr, "/iletisim", "Turkish pairs keep their Turkish URLs");
assert.equal(set("/de/privacy").tr, "/gizlilik");
assert.equal(set("/who-owns-descall").tr, "/descall-sahibi");
assert.equal(set("/es/discord-alternative").tr, "/tr/discord-alternatifi");
assert.equal(set("/ru/status").tr, undefined, "/status has no Turkish twin");
assert.equal(set("/ru/status")["x-default"], "/status");
assert.deepEqual(set("/blog"), { en: "/blog", tr: "/tr/blog", "x-default": "/blog" }, "blog: en/tr only");
assert.deepEqual(set("/apps-like-discord"), {}, "English-only niche");
assert.deepEqual(set("/tr/discord-acildi-mi"), {}, "Turkish-only landing");
for (const p of sl.SITE_MIRROR_PATHS) {
  const alts = lp.hreflangAlternates(p, ALL);
  for (const a of alts) {
    if (a.hreflang === "x-default") continue;
    assert.deepEqual(lp.hreflangAlternates(a.path, ALL), alts, `reciprocal set for ${a.path}`);
  }
}
// Today's served set (drafts excluded) is the old en/tr pair.
assert.deepEqual(
  lp.hreflangAlternates("/features").map((a) => a.hreflang),
  ["en", ...sl.SITE_LOCALES.filter((id) => id !== "en"), "x-default"]
);

// --- resolveMarketingLocale ---------------------------------------------------------
assert.equal(resolveMarketingLocale({ pathname: "/de/faq", stored: "en", ...ALL }), "de", "a prefix forces its locale");
assert.equal(resolveMarketingLocale({ pathname: "/features", stored: "de", ...ALL }), "de");
assert.equal(resolveMarketingLocale({ pathname: "/tr", stored: "de", ...ALL }), "tr");
assert.equal(resolveMarketingLocale({ pathname: "/", stored: "en", ...ALL }), "en");
assert.equal(resolveMarketingLocale({ pathname: "/", stored: "de", locales: ["en", "tr"] }), null, "a site draft is not used");
assert.equal(initialMarketingLocale({ pathname: "/", stored: null, detected: "de-AT", ...ALL }), "de");
assert.equal(initialMarketingLocale({ pathname: "/", stored: null, detected: "de", locales: ["en", "tr"] }), "en");
assert.equal(initialMarketingLocale({ pathname: "/pt-br/about", stored: "tr", detected: "en", ...ALL }), "pt-BR");

// --- marketingHref -----------------------------------------------------------------------
const href = (to, locale, pathname = "/", locales = ["de", "pt-BR"]) => marketingHref(to, { locale, pathname, locales });
assert.equal(href("/features", "de"), "/de/features");
assert.equal(href("/", "de"), "/de");
assert.equal(href("/?auth=register", "de"), "/de?auth=register");
assert.equal(href("/privacy#rights", "pt-BR"), "/pt-br/privacy#rights");
assert.equal(href("/blog", "de"), "/blog", "no twin: English URL");
assert.equal(href("/de/faq", "de"), "/de/faq", "already localized");
assert.equal(href("/features", "en", "/de/faq"), "/de/features", "the URL locale wins");
assert.equal(href("/features", "es"), "/features", "es is not served in this call");
assert.equal(href("https://example.com", "de"), "https://example.com");
assert.equal(marketingHref("/contact", { locale: "tr", pathname: "/" }), "/iletisim", "Turkish unchanged");
assert.equal(marketingHref("/features", { locale: "en", pathname: "/tr/faq" }), "/tr/features", "Turkish URL unchanged");
assert.equal(marketingHref("/features", { locale: "en", pathname: "/" }), "/features");

// --- prerender copy with a tiny fake catalog ------------------------------------------
text.resetSiteCatalogs();
text.registerSiteCatalog("de", {
  site: {
    Features: "Funktionen (site)",
    "Start free": "Kostenlos starten (site)",
    "Talk together": "Gemeinsam reden",
    "Optional analytics only. Essentials stay on.": "Nur optionale Analyse.",
    "Descall Features, Free Voice, Screen Share & Servers": "Descall Funktionen",
    "{name} is the founder, owner, and CEO of Descall.": "{name} hat Descall gegründet.",
    "Why people look for a Discord alternative": "Warum eine Discord-Alternative",
  },
  app: { Features: "Funktionen (app)", FAQ: "Häufige Fragen", Download: "Herunterladen" },
});
assert.equal(text.siteText("Features", "de"), "Funktionen (site)", "site catalog first");
assert.equal(text.siteText("FAQ", "de"), "Häufige Fragen", "then the app catalog");
assert.equal(text.siteText("Untranslated", "de"), "Untranslated", "then English");
assert.equal(text.siteLookupSource("FAQ", "de"), "app");

assert.equal(copy.trCopy("Features", false), "Features");
assert.equal(copy.trCopy("Features", true), "Özellikler", "boolean true still means Turkish");
assert.equal(copy.trCopy("Features", "tr"), "Özellikler");
assert.equal(copy.trCopy("Features", "de"), "Funktionen (site)");
assert.equal(copy.newCopy("Features", "tr"), "Features", "newCopy leaves Turkish alone");
assert.equal(copy.navLabels("de").features, "Funktionen (site)");
assert.equal(copy.navLabels("de").faq, "Häufige Fragen");
assert.equal(copy.navLabels("de").turkish, "Türkçe", "native names are not translated");
assert.deepEqual(copy.navLabels(true), copy.navLabels("tr"));
assert.deepEqual(copy.navLabels(false), copy.navLabels("en"));
assert.equal(copy.homeHero("de").h1, "Gemeinsam reden");
assert.equal(copy.homeHero("tr").h1, "Birlikte konuşun");
assert.equal(copy.cookieCopy("de").body, "Nur optionale Analyse.");
assert.equal(copy.prefixHref("/features", "de"), "/de/features");
assert.equal(copy.prefixHref("/blog", "de"), "/blog");
assert.equal(copy.prefixHref("/contact", true), "/iletisim");
assert.equal(copy.authHref("de", "register"), "/de?auth=register");
assert.match(copy.cookieBannerHtml("de"), /href="\/de\/privacy">Datenschutz|href="\/de\/privacy">Privacy/);
assert.match(copy.cookieBannerHtml("de"), /Nur optionale Analyse\./);
assert.match(copy.cookieBannerHtml(true), /href="\/gizlilik"/);
const nav = copy.seoSiteNavHtml("de");
assert.match(nav, /href="\/de\/features">Funktionen \(site\)</);
assert.match(nav, /href="\/de\/who-owns-descall"/);
assert.match(nav, /href="\/apps-like-discord"/, "English-only pages keep English URLs");
assert.match(nav, /href="\/de\?auth=register"[^>]*>Kostenlos starten \(site\)</);
assert.match(copy.noscriptNavHtml("de"), /<a href="\/de">Descall<\/a>/);

const features = corePageBody("/de/features");
assert.match(features, /<h1>Descall Funktionen<\/h1>/);
assert.match(features, /href="\/de"/, "brand links to the locale home");
const about = corePageBody("/de/about");
assert.match(about, /<strong class="ownership-name">Demir Sarp Kurtlar<\/strong> hat Descall gegründet\./);
assert.match(corePageBody("/de/privacy"), /<h1>Datenschutz/, "legal pages use the translated legal document");
assert.equal(corePageBody("/de/descall-sahibi"), null, "only mirrored pages exist under a prefix");
assert.equal(corePageBody("/de/blog"), null);
assert.match(pageExtrasHtml("/de/discord-alternative"), /<h2>Warum eine Discord-Alternative<\/h2>/);
assert.match(pageExtrasHtml("/de/discord-alternative"), /href="\/de\/compare\/discord"/);
assert.equal(pageExtrasHtml("/de/apps-like-discord"), "", "not a mirror");
// English and Turkish bodies do not change with a catalog registered.
assert.match(corePageBody("/features"), /<h1>Descall Features, Free Voice, Screen Share &amp; Servers<\/h1>/);
assert.match(corePageBody("/tr/features"), /Descall Özellikleri/);

// Routes and the prerendered shell of a prefixed locale.
const deRoutes = seo.localeMirrorRoutes("de");
assert.equal(deRoutes.length, sl.SITE_MIRROR_PATHS.length);
assert.deepEqual(deRoutes.map((r) => r.enPath), sl.SITE_MIRROR_PATHS);
const deFeatures = deRoutes.find((r) => r.enPath === "/features");
assert.equal(deFeatures.path, "/de/features");
assert.equal(deFeatures.lang, "de");
assert.equal(deFeatures.keywords, undefined, "English keywords are dropped");
assert.equal(seo.localizeRouteMeta(deFeatures, (s) => `[de] ${s}`).title, `[de] ${deFeatures.title}`);
const { injectMeta } = await imp("scripts/prerender-seo.mjs");
const shell = injectMeta(fs.readFileSync(path.join(root, "index.html"), "utf8"), deFeatures);
assert.match(shell, /<html lang="de"/);
assert.match(shell, /<link rel="canonical" href="https:\/\/descall\.com\/de\/features" \/>/);
assert.match(shell, /<meta property="og:locale" content="de_DE" \/>/);
assert.match(shell, /<h1>Descall Funktionen<\/h1>/);
assert.match(shell, /<div id="mkt-consent-static"[^>]*>\s*<p>\s*Nur optionale Analyse\./);

// --- sitemap alternates -------------------------------------------------------------------
const { alternateLinks } = await imp("scripts/generate-seo-files.mjs");
const xml = alternateLinks("https://descall.com/features", ALL);
assert.equal((xml.match(/<xhtml:link /g) || []).length, 8, "7 languages + x-default");
assert.match(xml, /hreflang="pt-BR" href="https:\/\/descall\.com\/pt-br\/features"/);
assert.match(xml, /hreflang="x-default" href="https:\/\/descall\.com\/features"/);
assert.match(alternateLinks("https://descall.com/de/contact", ALL), /hreflang="tr" href="https:\/\/descall\.com\/iletisim"/);
assert.equal(alternateLinks("https://descall.com/apps-like-discord", ALL), "");
const served = alternateLinks("https://descall.com/features");
assert.equal((served.match(/<xhtml:link /g) || []).length, sl.SITE_LOCALES.length + 1, "served set only");

text.resetSiteCatalogs();
console.log("siteLocales.selftest ok");
