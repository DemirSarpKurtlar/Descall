/**
 * Post-build SEO HTML shells for crawlers.
 * - Route meta from src/site/seoConfig.js (single source of truth)
 * - Injects crawlable <main> into #root so HTML responses aren't empty SPA shells
 * - Strips boot splash "Loading" chrome from SEO shells (bots must not see Loading)
 * - Injects route-specific JSON-LD (FAQPage, SoftwareApplication, Organization, Article)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const indexPath = path.join(distDir, "index.html");

const SITE = "https://descall.com";

const { ogImageFor } = await import(pathToFileURL(path.join(root, "src/site/ogImages.js")).href);
const { SMART_APP_BANNER_META } = await import(pathToFileURL(path.join(root, "src/site/appStoreLink.js")).href);
const { PUBLIC_ROUTES, localizeRouteMeta } = await import(pathToFileURL(path.join(root, "src/site/seoConfig.js")).href);
const { NICHE_LANDINGS } = await import(pathToFileURL(path.join(root, "src/site/seo/nicheLandings.js")).href);
const { BLOG_POSTS, BLOG_RELATED, ALTERNATIVE_HUB_FAQ, ALTERNATIVES_FAQ, COMPARE_FAQ, TURKEY_FAQ, BLOG_FAQ_BY_SLUG, GAMER_FAQ } = await import(
  pathToFileURL(path.join(root, "src/site/content/discordSeoContent.js")).href
);
const { PREVIEW_SIZES, previewSrcset } = await import(pathToFileURL(path.join(root, "src/site/seo/featureGroups.js")).href);
const { TR_BLOG_RELATED, relatedForPost } = await import(pathToFileURL(path.join(root, "src/site/seo/blogLinks.js")).href);
const { BLOG_BODIES } = await import(pathToFileURL(path.join(root, "src/site/seo/blogBodies.js")).href);
const { corePageBody, landingTwinMain } = await import(pathToFileURL(path.join(root, "src/site/seo/corePageBodies.js")).href);
const { blogIndexTwin, gamersTwin, trBlogIndexTwin } = await import(pathToFileURL(path.join(root, "src/site/seo/landingTwins.js")).href);
const { pageT } = await import(pathToFileURL(path.join(root, "src/site/seo/pageTwins.js")).href);
const { pageExtrasHtml } = await import(pathToFileURL(path.join(root, "src/site/seo/pageExtras.js")).href);
const { mergedGuideHtml } = await import(pathToFileURL(path.join(root, "src/site/seo/mergedGuides.js")).href);
const { TR_LANDINGS, trLandingLabel } = await import(pathToFileURL(path.join(root, "src/site/seo/trLandings.js")).href);
const { TR_BLOG_POSTS, TR_BLOG_BODIES, TR_BLOG_FAQ_BY_SLUG } = await import(
  pathToFileURL(path.join(root, "src/site/seo/trBlog.js")).href
);
const { cookieBannerHtml, homeHref, navLabels, newCopy, noscriptNavHtml, prefixHref, seoSiteNavHtml, trCopy, authHref } = await import(
  pathToFileURL(path.join(root, "src/site/seo/prerenderCopy.js")).href
);
const { FAQ_ITEMS } = await import(pathToFileURL(path.join(root, "src/site/faqData.js")).href);
const {
  buildEntityGraphLd,
  buildSoftwareApplicationLd,
  buildFaqLd,
  buildArticleLd,
  buildBreadcrumbLd,
  buildOwnershipWebPageLd,
} = await import(pathToFileURL(path.join(root, "src/site/jsonLdBuilders.js")).href);
const {
  OWNERSHIP_FAQ_EN,
  OWNERSHIP_FAQ_TR,
  OWNERSHIP_STATEMENT_EN,
  OWNERSHIP_STATEMENT_TR,
} = await import(pathToFileURL(path.join(root, "src/site/ownershipFacts.js")).href);
const { hreflangAlternates } = await import(
  pathToFileURL(path.join(root, "src/site/localePaths.js")).href
);
const { ogLocaleTag, isPrefixedLocale, withLocalePrefix } = await import(
  pathToFileURL(path.join(root, "src/site/siteLocales.js")).href
);
const { SITE_OPERATOR } = await import(pathToFileURL(path.join(root, "src/site/siteIdentity.js")).href);
const { siteText } = await import(pathToFileURL(path.join(root, "src/site/siteText.js")).href);
const { formatDate } = await import(pathToFileURL(path.join(root, "src/i18n/format.js")).href);
const { registerSiteCatalogs } = await import(pathToFileURL(path.join(__dirname, "siteCatalogs.mjs")).href);
const { loadDirectoryData, emptyDirectoryData, writeDirectoryManifest, directoryBodyHtml, directoryJsonLd } = await import(
  pathToFileURL(path.join(__dirname, "directoryPrerender.mjs")).href
);

/** Public server directory (item 8): build-time data and the category pages left noindex. */
let directoryData = null;
let directoryThin = new Set();
function currentDirectoryData() {
  if (!directoryData) directoryData = emptyDirectoryData("fallback");
  return directoryData;
}

/** "2026-08-11" in the page language, same rule as useMirrorCopy.js (Intl, UTC). */
function formatPostDate(iso, loc) {
  return formatDate(`${iso}T00:00:00Z`, loc, { dateStyle: "long", timeZone: "UTC" }) || iso;
}

/** "Published · Updated · Author" line of a post with <time> elements (Intl dates, UTC). */
function postMetaHtml(post, loc, labels, authorHref) {
  const parts = [`${escapeHtml(labels.published)}: <time datetime="${post.date}">${escapeHtml(formatPostDate(post.date, loc))}</time>`];
  if (post.updated && post.updated !== post.date) {
    parts.push(`${escapeHtml(labels.updated)}: <time datetime="${post.updated}">${escapeHtml(formatPostDate(post.updated, loc))}</time>`);
  }
  parts.push(`${escapeHtml(labels.author)}: <a href="${authorHref}">Demir Sarp Kurtlar</a>`);
  return `<p class="seo-note">${parts.join(" · ")}</p>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function seoBrand() {
  return `<a class="seo-brand" href="/" aria-label="Descall home"><img class="seo-brand-lockup" src="/brand/descall-lockup.svg" alt="Descall" height="22" decoding="async" /><span class="seo-brand-beta">Beta</span></a>`;
}

/** Brand link of a prefixed-locale shell: that language's home, translated label. */
function seoBrandFor(loc) {
  return `<a class="seo-brand" href="${homeHref(loc)}" aria-label="${escapeHtml(newCopy("Descall home", loc))}"><img class="seo-brand-lockup" src="/brand/descall-lockup.svg" alt="Descall" height="22" decoding="async" /><span class="seo-brand-beta">Beta</span></a>`;
}

const ICON_DOWNLOAD =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_MENU =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/**
 * Header of every prerendered page: the same pill, brand, nav and buttons as the React
 * MarketingLayout header (sizes in index.html #seo-static .seo-top), so nothing moves
 * when React takes over. Works without JavaScript: the buttons are real links, the
 * menu button jumps to the footer navigation.
 */
/** MarketingLayout NAV (+ NAV_TR_EXTRA on Turkish pages). */
const TOP_NAV = [
  { to: "/features", label: "Features" },
  { to: "/download", label: "Download" },
  { to: "/faq", label: "FAQ" },
];
const TOP_NAV_TR_EXTRA = [
  { to: "/tr/discord-alternatifi", label: "Discord alternatifi" },
  { to: "/tr/blog", label: "Blog" },
];

function seoTopHtml(loc = "en", path = "/") {
  const l = loc;
  const t = pageT(l);
  const h = (p) => prefixHref(p, l);
  const code = (l === "pt-BR" ? "pt" : l).split("-")[0].toUpperCase();
  const items = l === "tr" ? [...TOP_NAV, ...TOP_NAV_TR_EXTRA] : TOP_NAV;
  const nav = items
    .map((item) => {
      const to = h(item.to);
      const active = to === path || item.to === path;
      return `<a href="${to}"${active ? ' class="is-active" aria-current="page"' : ""}>${escapeHtml(t(item.label))}</a>`;
    })
    .join("");
  return `<header class="seo-top">
  <a class="seo-top-brand" href="${homeHref(l)}"><img src="/brand/descall-lockup.svg" alt="Descall" width="123" height="28" decoding="async" /><span class="seo-top-beta">${escapeHtml(t("Beta"))}</span></a>
  <nav class="seo-top-nav" aria-label="${escapeHtml(t("Primary navigation"))}">${nav}</nav>
  <div class="seo-top-actions">
    <span class="seo-top-lang" aria-hidden="true"><span>${code}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    <a class="seo-top-btn" href="${authHref(l, "login")}" rel="nofollow" data-hydrate data-auth="login">${escapeHtml(t("Sign In"))}</a>
    <a class="seo-top-btn is-primary" href="${authHref(l, "register")}" rel="nofollow" data-hydrate data-auth="register">${escapeHtml(t("Start free"))}</a>
    <a class="seo-top-icon seo-top-dl" href="${h("/download")}" aria-label="${escapeHtml(t("Download"))}" title="${escapeHtml(t("Download"))}">${ICON_DOWNLOAD}</a>
    <a class="seo-top-icon seo-top-menu" href="#seo-site-nav" aria-label="${escapeHtml(t("Open menu"))}">${ICON_MENU}</a>
  </div>
</header>`;
}

/** Product shots of SeoProductPreview (same files and sizes). */
const PREVIEW_SHOTS = {
  chat: "/brand/previews/02-dm.webp",
  servers: "/brand/previews/06-server.webp",
  call: "/brand/previews/09-server-voice.webp",
  friends: "/brand/previews/11-friends.webp",
};

/** Same mapping as DiscordAlternativeNichePage previewForPath: hero tone and shot. */
function nichePreview(path) {
  if (path.includes("gamers")) return { tone: "gaming", mode: "friends" };
  if (path.includes("communities")) return { tone: "community", mode: "servers" };
  if (path.includes("voice")) return { tone: "voice", mode: "call" };
  if (path.includes("friends")) return { tone: "friends", mode: "chat" };
  return { tone: "compare", mode: "chat" };
}

/** Same mapping as TrLandingPage previewForPath. */
function trPreview(path) {
  if (path.includes("oyuncu")) return { tone: "gaming", mode: "friends" };
  if (path.includes("sesli")) return { tone: "voice", mode: "call" };
  if (path.includes("turk")) return { tone: "community", mode: "servers" };
  return { tone: "compare", mode: "chat" };
}

const CRUMB_CHEVRON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK_16 =
  '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>';

/** SeoLandingShell .seo-checklist (check icon + text). */
function checklistHtml(items) {
  return `<ul class="seo-lcheck">${items.map((li) => `<li>${CHECK_16}<span>${escapeHtml(li)}</span></li>`).join("")}</ul>`;
}

/**
 * A blog post, twin of BlogPostPage / TrBlogPostPage (SeoLandingShell without a shot):
 * breadcrumbs, title, lead, two buttons, then the date line, sections, related guides and
 * the way back, then the FAQ (the questions of the post's FAQPage JSON-LD).
 */
function blogPostHtml({ hero, meta, sections, relatedTitle, related, backHref, backLabel, faqTitle, faq, after = "" }) {
  return `
<main class="seo-main-landing">
  <article class="seo-landing">
  ${landingHeroHtml(hero)}
  <div class="seo-lbody">
    ${meta}
    ${sections.map((s) => `<section class="seo-lsec"><h2>${escapeHtml(s.h)}</h2><p>${escapeHtml(s.p)}</p></section>`).join("\n    ")}
    <nav class="seo-lrelated" aria-label="${escapeHtml(relatedTitle)}"><h2>${escapeHtml(relatedTitle)}</h2><ul>${related
      .map((l) => `<li><a href="${escapeHtml(l.to)}">${escapeHtml(l.label)}</a></li>`)
      .join("")}</ul></nav>
    <section class="seo-lsec"><p class="seo-note"><a href="${backHref}">${escapeHtml(backLabel)}</a></p></section>
  </div>
  ${faq.length ? `<section class="seo-lfaq"><h2>${escapeHtml(faqTitle)}</h2>${faq.map((f) => `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`).join("\n")}</section>` : ""}
  ${after}
  </article>
</main>`;
}

/**
 * Hero of a landing page, twin of SeoLandingShell (breadcrumbs, title, lead, Start free +
 * Download, tilted product shot with its caption): the same grid and boxes as the React
 * page, see index.html .seo-lhero.
 */
function landingHeroHtml({ loc, crumbs, h1, lead, shot, alt, tone = "compare", startLabel, downloadLabel, secondary = null }) {
  const t = pageT(loc);
  const trail = crumbs
    .map(([href, label], i) => `<li>${i > 0 ? CRUMB_CHEVRON : ""}<a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`)
    .join("");
  const img = shot
    ? `<figure class="seo-lhero-shot"><div class="seo-lhero-wrap"><div class="seo-lhero-halo" aria-hidden="true"></div><div class="seo-lhero-dev"><div class="seo-lhero-scr"><img src="${shot}" srcset="${previewSrcset(shot)}" sizes="${PREVIEW_SIZES}" width="1440" height="900" alt="${escapeHtml(alt)}" fetchpriority="high" decoding="async" /></div></div></div><figcaption>${escapeHtml(alt)}</figcaption></figure>`
    : "";
  return `<header class="seo-lhero ${shot ? `seo-tone-${tone}` : "is-single"}">
    <nav class="seo-crumbs" aria-label="Breadcrumb"><ol>${trail}</ol></nav>
    <h1>${escapeHtml(h1)}</h1>
    <p class="seo-lhero-lead">${escapeHtml(lead)}</p>
    <p class="seo-lhero-cta"><a class="seo-lbtn is-primary" href="${authHref(loc, "register")}" rel="nofollow" data-hydrate data-auth="register">${escapeHtml(startLabel || t("Start free"))}</a>${
      secondary
        ? `<a class="seo-lbtn is-ghost" href="${escapeHtml(secondary.href)}">${escapeHtml(secondary.label)}</a>`
        : `<a class="seo-lbtn is-soft" href="${prefixHref("/download", loc)}">${escapeHtml(downloadLabel || t("Download"))}</a>`
    }</p>
    ${img}
  </header>`;
}

function routeIsTr(route) {
  return route.lang === "tr" || route.path === "/tr" || route.path.startsWith("/tr/");
}

/** "en", "tr" or the prefixed locale of a route (/de/... routes carry `locale`). */
function routeLocale(route) {
  if (route.locale) return route.locale;
  return routeIsTr(route) ? "tr" : "en";
}

function seoCtaRow(softHref = "/discord-alternative", softLabel, loc = "en") {
  const n = navLabels(loc);
  const label = softLabel || n.alternative;
  return `<p class="seo-cta-row"><a class="seo-cta-primary" href="${prefixHref("/download", loc)}">${n.download}</a><a class="seo-cta-soft" href="${prefixHref(softHref, loc)}">${label}</a></p>`;
}

function seoSiteNav(loc = "en") {
  return seoSiteNavHtml(loc);
}

function stripBootSplash(html) {
  // The splash template and the script after it (only "/" keeps them: the app shell).
  // Older templates had a bare #boot-splash div; both forms are handled.
  return html
    .replace(/<!-- The boot splash is an inert template[\s\S]*?-->\s*/i, "")
    .replace(/<template id="boot-splash-tpl">[\s\S]*?<\/template>\s*<script>[\s\S]*?<\/script>\s*/i, "")
    .replace(
      /<div id="boot-splash"[\s\S]*?<\/div>\s*<script>\s*\(function \(\) \{\s*var el = document\.getElementById\("boot-splash"\)[\s\S]*?<\/script>\s*/i,
      ""
    )
    .replace(/<div id="boot-splash"[\s\S]*?data-shown-at=""[\s\S]*?<\/script>\s*/i, "");
}

/**
 * The native app's splash CSS (index.html, between the @native-splash markers) is only
 * used by the app shell at "/": the native app never boots another file. Every other
 * page sheds it (about 9 KB of inline CSS per page).
 */
function stripNativeSplashCss(html) {
  return html.replace(/[ \t]*\/\* @native-splash-start[\s\S]*?\/\* @native-splash-end \*\/\n?/, "");
}

/**
 * Page-twin CSS (index.html, "@twin-<kind>-start" ... "@twin-<kind>-end" blocks) is kept
 * only on the page that renders that twin (<main class="... seo-twin-<kind>">) with the
 * blocks of TWIN_CSS_WITH (the shared "base" by default). Other pages shed all of it.
 */
/**
 * Blocks a twin kind uses besides its own: "base" by default; the info pages also reuse
 * the legal reader and FAQ blocks; landing twins sit on the landing hero CSS (always
 * present) and need no base.
 */
const TWIN_CSS_WITH = { info: ["base", "legal", "faq"], landing: [] };

export function stripTwinCss(html, kind) {
  const keep = new Set(kind ? [kind, ...(TWIN_CSS_WITH[kind] || ["base"])] : []);
  return html.replace(/[ \t]*\/\* @twin-([a-z]+)-start[\s\S]*?\/\* @twin-\1-end \*\/\n?/g, (block, name) => (keep.has(name) ? block : ""));
}

/**
 * <link rel="preload"> for the first-viewport product shot of a page (the img with
 * fetchpriority="high" and a srcset): the browser starts it with the HTML head instead of
 * after parsing ~60 KB of body, and picks the same candidate (imagesrcset / imagesizes).
 * The home hero is a <picture> with a phone and a desktop source and is left alone.
 */
export function lcpImagePreload(body) {
  const m = body.match(/<img src="([^"]+)" srcset="([^"]+)" sizes="([^"]+)"[^>]*fetchpriority="high"/);
  if (m) return `<link rel="preload" as="image" href="${m[1]}" imagesrcset="${m[2]}" imagesizes="${m[3]}" fetchpriority="high" />`;
  // Home hero: <picture> with one phone source (max-width query) and the desktop img.
  const pic = body.match(/<picture><source media="\(max-width: (\d+)px\)" srcset="([^"]+)" sizes="([^"]+)"[^>]*><img [^>]*src="([^"]+)"[^>]*fetchpriority="high"/);
  if (!pic) return "";
  const [, max, phoneSet, phoneSizes, desktop] = pic;
  return [
    `<link rel="preload" as="image" imagesrcset="${phoneSet}" imagesizes="${phoneSizes}" media="(max-width: ${max}px)" fetchpriority="high" />`,
    `<link rel="preload" as="image" href="${desktop}" media="(min-width: ${Number(max) + 1}px)" fetchpriority="high" />`,
  ].join("\n    ");
}

/**
 * Inter in the shell head: the faces of src/site/fonts-inter.css (font-display: optional)
 * with the hashed files Vite emitted, a metric-matched local fallback, and a preload of
 * the weights the first viewport uses most. The React page renders with the same faces.
 * Without it the shell painted in Segoe UI / Roboto and React in Inter, so text re-wrapped
 * at the hand-over on Windows, Android and Linux (up to 30 px in the lab).
 */
export function interFontFaceCss(assetsDir = path.join(distDir, "assets")) {
  let files = [];
  try {
    files = fs.readdirSync(assetsDir);
  } catch {
    return { style: "", preload: "" };
  }
  const src = fs.readFileSync(path.join(root, "src/site/fonts-inter.css"), "utf8");
  const missing = [];
  const css = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/url\("[^"]*\/(inter-[a-z-]+-\d+-normal)\.woff2"\)/g, (m, name) => {
      const hit = files.find((f) => f.startsWith(`${name}-`) && f.endsWith(".woff2"));
      if (!hit) missing.push(name);
      return `url("/assets/${hit}")`;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (missing.length) return { style: "", preload: "" };
  // Metric-matched local fallback (Arial scaled to Inter), only drawn when a font file has
  // not arrived within the 3 s block period. Latin only: Cyrillic and other scripts fall
  // through to the system font, as on the React page.
  const fallback =
    '@font-face { font-family: "Inter Fallback"; src: local("Arial"), local("Helvetica"), local("Roboto"), local("Liberation Sans"); size-adjust: 107.4%; ascent-override: 90.2%; descent-override: 22.48%; line-gap-override: 0%; unicode-range: U+0000-02FF, U+1E00-1EFF, U+2000-206F, U+20AC, U+2122, U+2190-2193, U+2212, U+2215; }';
  const links = (names) =>
    names
      .map((name) => files.find((f) => f.startsWith(`${name}-`) && f.endsWith(".woff2")))
      .filter(Boolean)
      .map((f) => `<link rel="preload" as="font" type="font/woff2" href="/assets/${f}" crossorigin />`)
      .join("\n    ");
  const preload = links(["inter-latin-400-normal", "inter-latin-700-normal"]);
  // Turkish pages (lang tr) also preload the latin-ext files: ş, ğ, İ are in every header.
  const preloadExt = links(["inter-latin-ext-400-normal", "inter-latin-ext-700-normal"]);
  return { style: `<style id="shell-fonts">${css} ${fallback}</style>`, preload, preloadExt };
}

let shellFonts = { style: "", preload: "", preloadExt: "" };

const { sitePartsForPath } = await import(pathToFileURL(path.join(root, "src/site/siteCatalogParts.js")).href);

/**
 * modulepreload of the site catalog a prefixed page waits for before React renders
 * (src/site/loadSiteCatalog.js): the part loaders and the page's parts (core + its own,
 * chunks site-<id>-<part>-<hash>.js). They download with the HTML instead of after the
 * hydrate chain asked for them. Empty for English and Turkish pages.
 */
export function siteCatalogPreload(route, files = assetFileList()) {
  if (!route.locale) return "";
  // Vite hashes are 8 characters: "site-de-blog" must not pick "site-de-blog-discord-...".
  const pick = (name) => files.find((f) => f.startsWith(`${name}-`) && /^[\w-]{8}\.js$/.test(f.slice(name.length + 1)));
  return ["siteCatalogLoaders", ...sitePartsForPath(route.path).map((part) => `site-${route.locale}-${part}`)]
    .map(pick)
    .filter(Boolean)
    .map((f) => `<link rel="modulepreload" crossorigin href="/assets/${f}" />`)
    .join("\n    ");
}

let assetFiles = null;
function assetFileList() {
  if (!assetFiles) {
    try {
      assetFiles = fs.readdirSync(path.join(distDir, "assets"));
    } catch {
      assetFiles = [];
    }
  }
  return assetFiles;
}

function twinKindOf(body) {
  return body.match(/<main class="[^"]*\bseo-twin-([a-z]+)\b/)?.[1] || null;
}

function crawlBody(route) {
  const body = crawlBodyInner(route);
  // A landing twin prints the extras itself, in the React page's markup.
  if (body.includes("<!--seo-extras-inline-->")) return body;
  // Long-form extras, then the sections of a blog post merged into this page.
  const extra = pageExtrasHtml(route.path) + mergedGuideHtml(route.path, siteText);
  // A page twin marks where the React page renders its extras (seo/pageTwins.js).
  if (body.includes("<!--seo-extras-->")) return body.replace("<!--seo-extras-->", extra);
  if (!extra) return body;
  return body.includes('<footer class="seo-footer">')
    ? body.replace('<footer class="seo-footer">', `${extra}\n<footer class="seo-footer">`)
    : body.replace(/<\/main>\s*$/, `${extra}\n</main>`);
}

function crawlBodyInner(route) {
  if (route.directory) {
    return directoryBodyHtml(route, currentDirectoryData(), { landingHeroHtml, seoSiteNav, brand: seoBrand() });
  }
  const isTr = routeIsTr(route);
  const loc = routeLocale(route);
  const n = navLabels(loc);
  const trLanding = TR_LANDINGS[route.path];
  if (trLanding) {
    const sections = trLanding.sections
      .map(
        (s) =>
          `<section class="seo-lsec"><h2>${escapeHtml(s.h)}</h2>\n${s.p.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}${
            s.list?.length ? `\n${checklistHtml(s.list)}` : ""
          }</section>`
      )
      .join("\n");
    const faq = trLanding.faq
      .map((f) => `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`)
      .join("\n");
    const links = trLanding.related
      .map((l) => `<li><a href="${escapeHtml(l.to)}">${escapeHtml(l.label)}</a></li>`)
      .join("");
    return `
<main class="seo-main-landing">
  ${seoBrand()}
  <article class="seo-landing">
  ${landingHeroHtml({
    loc: "tr",
    crumbs: [
      ["/tr", "Ana sayfa"],
      [route.path, trLandingLabel(trLanding)],
    ],
    h1: trLanding.h1,
    lead: trLanding.lead,
    shot: PREVIEW_SHOTS[trPreview(route.path).mode],
    tone: trPreview(route.path).tone,
    alt: trLanding.h1,
    startLabel: "Ücretsiz başla",
    downloadLabel: "İndir",
  })}
  <div class="seo-lbody">
  ${trLanding.updatedLabel ? `<p class="seo-note"><time datetime="${trLanding.updated}">${escapeHtml(trLanding.updatedLabel)}</time></p>` : ""}
  ${sections}
  </div>
  <h2>Sık sorulan sorular</h2>
  ${faq}
  <nav aria-label="İlgili sayfalar"><h2>İlgili sayfalar</h2><ul>${links}</ul></nav>
  </article>
  ${seoSiteNav(true)}
</main>`;
  }

  if (route.path === "/tr/blog") return landingTwinMain(trBlogIndexTwin(), seoBrand(), seoSiteNav("tr"));

  if (route.path.startsWith("/tr/blog/")) {
    const slug = route.path.slice("/tr/blog/".length);
    const post = TR_BLOG_POSTS.find((p) => p.slug === slug);
    const body = TR_BLOG_BODIES[slug];
    if (post && body) {
      const title = post.h1 || post.title;
      return blogPostHtml({
        hero: {
          loc: "tr",
          crumbs: [
            ["/tr", "Ana sayfa"],
            ["/tr/blog", "Blog"],
            [post.path, title],
          ],
          h1: title,
          lead: post.description,
          startLabel: "Descall’ı dene",
          secondary: { href: "/tr/discord-alternatifi", label: "Discord alternatifi" },
        },
        meta: postMetaHtml(post, "tr", { published: "Yayın", updated: "Güncelleme", author: trCopy("Author", "tr") }, SITE_OPERATOR.personPathTr),
        sections: body.sections,
        relatedTitle: "İlgili rehberler",
        related: relatedForPost(post, TR_BLOG_POSTS, TR_BLOG_RELATED, { labelOf: (p) => p.h1 || p.title }),
        backHref: "/tr/blog",
        backLabel: "← Bloga dön",
        faqTitle: trCopy("Frequently asked questions", "tr"),
        faq: TR_BLOG_FAQ_BY_SLUG[slug] || [],
        after: `<p class="seo-note"><a href="/blog/${slug}">English version</a></p>`,
      });
    }
  }

  const core = corePageBody(route.path);
  if (core) return core;

  // Niche landings and the blog: English routes, and their /<prefix> twins (route.enPath),
  // whose text goes through the site catalog. tx / hx are the identity for English.
  const enPath = route.enPath || route.path;
  const tx = (s) => newCopy(s, loc);
  const hx = (href) => prefixHref(href, loc);
  const brand = route.locale ? seoBrandFor(loc) : seoBrand();

  // SeoLandingShell twins of the gamers page and the blog index (seo/landingTwins.js).
  if (enPath === "/best-discord-alternative-for-gamers") return landingTwinMain(gamersTwin(loc, route.path), brand, seoSiteNav(loc));
  if (enPath === "/blog") return landingTwinMain(blogIndexTwin(loc, route.path), brand, seoSiteNav(loc));

  const niche = NICHE_LANDINGS[enPath];
  if (niche) {
    const sections = niche.sections
      .map((s) => `<section class="seo-lsec"><h2>${escapeHtml(tx(s.h))}</h2><p>${escapeHtml(tx(s.p))}</p></section>`)
      .join("\n");
    const links = niche.related
      .map((l) => `<li><a href="${escapeHtml(hx(l.to))}">${escapeHtml(tx(l.label))}</a></li>`)
      .join("");
    const faq =
      Array.isArray(niche.faq) && niche.faq.length
        ? `<h2>${escapeHtml(tx("FAQ"))}</h2>${niche.faq
            .map((f) => `<h3>${escapeHtml(tx(f.q))}</h3><p>${escapeHtml(tx(f.a))}</p>`)
            .join("\n")}`
        : "";
    return `
<main class="seo-main-landing">
  ${brand}
  <article class="seo-landing">
  ${landingHeroHtml({
    loc,
    crumbs: [
      [homeHref(loc), tx("Home")],
      [hx("/discord-alternative"), tx("Discord alternative")],
      [hx(enPath), tx(niche.h1.split(" | ")[0].trim())],
    ],
    h1: tx(niche.h1),
    lead: tx(niche.lead),
    shot: PREVIEW_SHOTS[nichePreview(enPath).mode],
    tone: nichePreview(enPath).tone,
    alt: tx(niche.h1),
  })}
  <div class="seo-lbody">
  <section class="seo-lsec"><h2>${escapeHtml(tx(niche.answerTitle))}</h2>
  <p>${escapeHtml(tx(niche.answer))}</p>
  ${checklistHtml(niche.bullets.map(tx))}</section>
  ${sections}
  </div>
  ${faq}
  <nav aria-label="${escapeHtml(tx("Related"))}"><ul>${links}</ul></nav>
  </article>
  ${seoSiteNav(loc)}
</main>`;
  }

  if (enPath.startsWith("/blog/") && enPath !== "/blog") {
    const slug = enPath.replace("/blog/", "");
    const post = BLOG_POSTS.find((p) => p.slug === slug);
    const body = BLOG_BODIES[slug];
    if (post && body) {
      const t = pageT(loc);
      const faq = BLOG_FAQ_BY_SLUG[slug] || GAMER_FAQ.slice(0, 2);
      return blogPostHtml({
        hero: {
          loc,
          crumbs: [
            [homeHref(loc), t("Home")],
            [hx("/blog"), t("Blog")],
            [hx(post.path), t(post.title)],
          ],
          h1: t(post.title),
          lead: t(post.description),
          startLabel: t("Try Descall"),
          secondary: { href: hx("/discord-alternative"), label: t("Discord alternative") },
        },
        // Publish / update dates and author in every language, written with Intl.
        meta: postMetaHtml(post, loc, { published: t("Published"), updated: t("Updated"), author: t("Author") }, hx("/who-owns-descall")),
        sections: body.sections.map((s) => ({ h: t(s.h), p: t(s.p) })),
        relatedTitle: t("Related guides"),
        // The closest posts, then two guides (as BlogPostPage).
        related: relatedForPost(post, BLOG_POSTS, BLOG_RELATED.filter((l) => l.to !== "/status")).map((l) => ({ to: hx(l.to), label: t(l.label) })),
        backHref: hx("/blog"),
        backLabel: t("← Back to blog"),
        faqTitle: t("Frequently asked questions"),
        // Same questions as the post's FAQPage JSON-LD, visible on the page.
        faq: faq.map((f) => ({ q: t(f.q), a: t(f.a) })),
      });
    }
  }

  const h1 = route.h1 || route.title.replace(/\s*\|\s*Descall\s*$/i, "").replace(/\s*—\s*Descall\s*$/i, "");
  return `
<main>
  ${brand}
  <h1>${escapeHtml(h1)}</h1>
  <p>${escapeHtml(route.description)}</p>
  ${seoCtaRow("/discord-alternative", n.alternative, loc)}
  <h2>${escapeHtml(newCopy("What you get with Descall", loc))}</h2>
  <ul>
    <li>${escapeHtml(newCopy("Discord-style servers with roles, channels, and templates", loc))}</li>
    <li>${escapeHtml(newCopy("Free real-time chat, group voice/video, and screen share", loc))}</li>
    <li>${escapeHtml(newCopy("Gaming server templates without bot hell", loc))}</li>
    <li>${escapeHtml(newCopy("Windows, Android, and full web app", loc))}</li>
  </ul>
  ${seoSiteNav(loc)}
</main>`;
}

/** JSON-LD of a prefixed-locale route: the English page's graphs, text translated. */
function localizedJsonLd(route) {
  const loc = route.locale;
  const t = (s) => siteText(s, loc);
  const faq = (items) => buildFaqLd(items.map((f) => ({ q: t(f.q), a: t(f.a) })));
  const graphs = [buildEntityGraphLd()];
  switch (route.enPath) {
    case "/faq":
      graphs.push(faq(FAQ_ITEMS));
      break;
    case "/discord-alternative":
      graphs.push(faq(ALTERNATIVE_HUB_FAQ));
      break;
    case "/alternatives":
      graphs.push(faq(ALTERNATIVES_FAQ));
      break;
    case "/compare/discord":
      graphs.push(faq(COMPARE_FAQ));
      break;
    case "/who-owns-descall":
      graphs.push(
        buildOwnershipWebPageLd({
          path: route.path,
          name: t("Who owns Descall?"),
          description: t(OWNERSHIP_STATEMENT_EN),
          inLanguage: loc,
        }),
        faq(OWNERSHIP_FAQ_EN)
      );
      break;
    default:
      break;
  }
  const niche = NICHE_LANDINGS[route.enPath];
  if (niche?.faq?.length) graphs.push(faq(niche.faq));
  if (route.enPath.startsWith("/blog/")) {
    const slug = route.enPath.slice("/blog/".length);
    const post = BLOG_POSTS.find((p) => p.slug === slug);
    if (post) {
      const home = withLocalePrefix("/", loc);
      graphs.push(
        buildArticleLd({
          type: "BlogPosting",
          title: t(post.title),
          description: t(post.description),
          path: route.path,
          datePublished: post.date,
          dateModified: post.updated || post.date,
          inLanguage: loc,
          image: route.image,
        }),
        buildBreadcrumbLd([
          { name: t("Home"), path: home },
          { name: t("Blog"), path: withLocalePrefix("/blog", loc) },
          { name: t(post.title), path: route.path },
        ])
      );
      const blogFaq = BLOG_FAQ_BY_SLUG[slug];
      if (blogFaq?.length) graphs.push(faq(blogFaq));
    }
  }
  return graphs;
}

function jsonLdForRoute(route) {
  if (route.locale) return localizedJsonLd(route);
  const graphs = [buildEntityGraphLd()];
  if (route.directory) {
    graphs.push(...directoryJsonLd(route, currentDirectoryData(), buildBreadcrumbLd));
    return graphs;
  }

  // SoftwareApplication already lives in the entity @graph (same @id) on every
  // page; a second standalone copy was a duplicate.

  if (route.path === "/faq") {
    graphs.push(buildFaqLd(FAQ_ITEMS));
  }
  if (route.path === "/tr/faq") {
    // Same text as the visible questions (the page twin reads React's t()).
    const t = pageT("tr");
    graphs.push(buildFaqLd(FAQ_ITEMS.map((f) => ({ q: t(f.q), a: t(f.a) }))));
  }
  if (route.path === "/discord-alternative") {
    graphs.push(buildFaqLd(ALTERNATIVE_HUB_FAQ));
  }
  if (route.path === "/alternatives") {
    graphs.push(buildFaqLd(ALTERNATIVES_FAQ));
  }
  if (route.path === "/compare/discord") {
    graphs.push(buildFaqLd(COMPARE_FAQ));
  }
  // The Turkish compare page shows the questions in Turkish (corePageBodies faqHtml).
  if (route.path === "/tr/compare/discord") {
    graphs.push(buildFaqLd(COMPARE_FAQ.map((f) => ({ q: trCopy(f.q, "tr"), a: trCopy(f.a, "tr") }))));
  }
  const trLanding = TR_LANDINGS[route.path];
  if (trLanding) {
    graphs.push(
      buildFaqLd(trLanding.faq),
      buildBreadcrumbLd([
        { name: "Ana sayfa", path: "/tr" },
        { name: trLandingLabel(trLanding), path: route.path },
      ])
    );
    // Dated pages (the Discord access status) are articles with a real dateModified.
    if (trLanding.published && trLanding.updated) {
      graphs.push(
        buildArticleLd({
          title: trLanding.h1,
          description: route.description,
          path: route.path,
          datePublished: trLanding.published,
          dateModified: trLanding.updated,
          inLanguage: "tr",
        })
      );
    }
  }
  if (route.path === "/tr/blog") {
    graphs.push(buildBreadcrumbLd([{ name: "Ana sayfa", path: "/tr" }, { name: "Blog", path: "/tr/blog" }]));
  }
  if (route.path.startsWith("/tr/blog/")) {
    const slug = route.path.slice("/tr/blog/".length);
    const post = TR_BLOG_POSTS.find((p) => p.slug === slug);
    if (post) {
      graphs.push(
        buildArticleLd({
          type: "BlogPosting",
          title: post.h1 || post.title,
          description: post.description,
          path: route.path,
          datePublished: post.date,
          dateModified: post.updated || post.date,
          inLanguage: "tr",
          image: route.image,
        }),
        buildBreadcrumbLd([
          { name: "Ana sayfa", path: "/tr" },
          { name: "Blog", path: "/tr/blog" },
          { name: post.h1 || post.title, path: route.path },
        ])
      );
      const faq = TR_BLOG_FAQ_BY_SLUG[slug];
      if (faq?.length) graphs.push(buildFaqLd(faq));
    }
  }
  if (route.path === "/who-owns-descall") {
    graphs.push(
      buildOwnershipWebPageLd({
        path: "/who-owns-descall",
        name: "Who owns Descall?",
        description: OWNERSHIP_STATEMENT_EN,
        inLanguage: "en",
      }),
      buildFaqLd(OWNERSHIP_FAQ_EN)
    );
  }
  if (route.path === "/descall-sahibi") {
    graphs.push(
      buildOwnershipWebPageLd({
        path: "/descall-sahibi",
        name: "Descall’ın sahibi kim?",
        description: OWNERSHIP_STATEMENT_TR,
        inLanguage: "tr",
      }),
      buildFaqLd(OWNERSHIP_FAQ_TR)
    );
  }

  const niche = NICHE_LANDINGS[route.path];
  if (niche?.faq?.length) {
    graphs.push(buildFaqLd(niche.faq));
  }

  if (route.path.startsWith("/blog/") && route.path !== "/blog") {
    const slug = route.path.replace("/blog/", "");
    const post = BLOG_POSTS.find((p) => p.slug === slug);
    if (post && typeof buildArticleLd === "function") {
      graphs.push(
        buildArticleLd({
          type: "BlogPosting",
          title: post.title,
          description: post.description,
          path: route.path,
          datePublished: post.date,
          dateModified: post.updated || post.date,
          inLanguage: "en",
          image: route.image,
        })
      );
    }
    graphs.push(
      buildBreadcrumbLd([
        { name: "Home", path: "/" },
        { name: "Blog", path: "/blog" },
        { name: post?.title || slug, path: route.path },
      ])
    );
    const blogFaq = BLOG_FAQ_BY_SLUG[slug];
    if (blogFaq?.length) graphs.push(buildFaqLd(blogFaq));
  }

  return graphs;
}

/** Short page names for the breadcrumb trail (React t() keys, translated per language). */
const CRUMB_LABELS = {
  "/features": "Features",
  "/download": "Download",
  "/faq": "FAQ",
  "/status": "Status",
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/copyright": "Copyright",
  "/about": "About",
  "/contact": "Contact",
  "/security": "Security",
  "/compare/discord": "Descall vs Discord",
  "/alternatives": "Alternatives",
  "/discord-alternative": "Discord alternative",
  "/who-owns-descall": "Who owns Descall?",
  "/blog": "Blog",
  "/best-discord-alternative-for-gamers": "For gamers",
};
const TR_ALIAS_BARE = { "/iletisim": "/contact", "/gizlilik": "/privacy", "/kosullar": "/terms", "/descall-sahibi": "/who-owns-descall" };

/** Home > (Discord alternative >) page, in the page language; null for a home page. */
export function breadcrumbsForRoute(route) {
  const loc = routeLocale(route);
  const home = homeHref(loc);
  if (route.path === home || route.path === "/") return null;
  const t = pageT(loc);
  const bare =
    route.enPath ||
    TR_ALIAS_BARE[route.path] ||
    (route.path.startsWith("/tr/") ? route.path.slice(3) : route.path);
  const crumbs = [{ name: loc === "tr" ? "Ana sayfa" : t("Home"), path: home }];
  const niche = NICHE_LANDINGS[bare];
  if (niche) {
    crumbs.push({ name: t("Discord alternative"), path: prefixHref("/discord-alternative", loc) });
    crumbs.push({ name: t(niche.h1.split(" | ")[0].trim()), path: route.path });
    return crumbs;
  }
  const label = CRUMB_LABELS[bare];
  const name = label
    ? loc === "tr" && route.path === "/descall-sahibi"
      ? "Descall’ın sahibi kim?"
      : t(label)
    : (route.h1 || route.title || "").replace(/\s*[|—-]\s*Descall\s*$/i, "");
  crumbs.push({ name, path: route.path });
  return crumbs;
}

function stripStaleHeadSeo(html) {
  return html
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="keywords"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="robots"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="apple-itunes-app"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="alternate"[^>]*hreflang="[^"]*"[^>]*>\s*/gi, "")
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="author"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="citation_author"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="author"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="describedby"[^>]*>\s*/gi, "")
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, "");
}

export function injectMeta(html, sourceRoute, { keepBootSplash = false } = {}) {
  const route = localizeRouteMeta(sourceRoute, siteText);
  const url = `${SITE}${route.path === "/" ? "/" : route.path}`;
  const title = escapeHtml(route.title);
  const desc = escapeHtml(route.description);
  const keywords = route.keywords ? escapeHtml(route.keywords) : "";
  const lang = route.lang || routeLocale(route);
  const ogType = route.ogType || "website";

  // Vercel rewrites authenticated deep links (/calls, /direct, …) to dist/index.html
  // (the "/" prerender). Stripping #boot-splash there caused 2–4s empty black screens
  // on hard nav. Keep splash on the SPA shell; strip only on niche marketing HTML.
  let out = keepBootSplash ? html : stripNativeSplashCss(stripBootSplash(html));
  out = stripStaleHeadSeo(out);
  out = out.replace(/<html\s+lang="[^"]*"/i, `<html lang="${lang}"`);
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);

  // hreflang only for real translations (served site languages); reciprocal, x-default → EN.
  const loc = routeLocale(route);
  const ogUrl = `${SITE}${ogImageFor(route.image, loc)}`;
  const alternates = hreflangAlternates(route.path);
  const hreflang = alternates.map(
    (alt) => `<link rel="alternate" hreflang="${alt.hreflang}" href="${SITE}${alt.path}" />`
  );
  const ogAlternates = alternates
    .filter((alt) => alt.hreflang !== "x-default" && alt.hreflang !== loc)
    .map((alt) => `<meta property="og:locale:alternate" content="${ogLocaleTag(alt.hreflang)}" />`);

  const ldGraphs = jsonLdForRoute(route);
  // Every page below a home gets a BreadcrumbList (React's own copy is dropped when the
  // prerendered JSON-LD is present, see JsonLd.jsx).
  if (!ldGraphs.some((g) => g["@type"] === "BreadcrumbList")) {
    const crumbs = breadcrumbsForRoute(route);
    if (crumbs) ldGraphs.push(buildBreadcrumbLd(crumbs));
  }
  const ldScripts = ldGraphs
    .map(
      (data) =>
        `<script type="application/ld+json" data-prerendered-jsonld="${route.path}">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`
    )
    .join("\n    ");

  // The page body first: its LCP image is preloaded from the head.
  const inner = crawlBody(route);
  const metaBlock = [
    // The LCP image first: it is the largest paint on most pages and must not queue
    // behind the font files.
    lcpImagePreload(inner),
    shellFonts.preload,
    // Turkish pages always set latin-ext letters in bold (header "Giriş Yap", titles).
    lang === "tr" ? shellFonts.preloadExt : "",
    shellFonts.style,
    siteCatalogPreload(route),
    `<meta name="description" content="${desc}" />`,
    keywords ? `<meta name="keywords" content="${keywords}" />` : "",
    // Directory category pages with fewer than 3 listed servers stay out of the index.
    directoryThin.has(route.path)
      ? `<meta name="robots" content="noindex,follow" />`
      : `<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />`,
    // iOS Smart App Banner: every marketing shell this list emits (thin directory pages included).
    SMART_APP_BANNER_META,
    `<meta name="author" content="Demir Sarp Kurtlar" />`,
    `<meta name="citation_author" content="Demir Sarp Kurtlar" />`,
    `<link rel="canonical" href="${url}" />`,
    `<link rel="author" href="${SITE}/who-owns-descall" />`,
    `<link rel="describedby" href="${SITE}/llms.txt" type="text/plain" title="Facts for language models" />`,
    ...hreflang,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:site_name" content="Descall" />`,
    `<meta property="og:image" content="${ogUrl}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${title}" />`,
    `<meta property="og:locale" content="${ogLocaleTag(loc)}" />`,
    ...ogAlternates,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
    `<meta name="twitter:image" content="${ogUrl}" />`,
    ldScripts,
  ]
    .filter(Boolean)
    .join("\n    ");

  out = out.replace(/<\/title>/i, `</title>\n    ${metaBlock}`);

  // The page header (React twin) replaces the old brand-only line at the top of each body.
  out = stripTwinCss(out, twinKindOf(inner));
  const body = `${seoTopHtml(loc, route.path)}\n${inner.replace(/<a class="seo-brand"[\s\S]*?<\/a>/, "")}`;
  if (/<div id="seo-static"><\/div>/i.test(out)) {
    out = out.replace(
      /<div id="seo-static"><\/div>/i,
      `<div id="seo-static" aria-hidden="false">${body}</div>`
    );
  } else if (/<div id="seo-static"[^>]*>[\s\S]*?<\/div>/i.test(out)) {
    out = out.replace(
      /<div id="seo-static"[^>]*>[\s\S]*?<\/div>/i,
      `<div id="seo-static" aria-hidden="false">${body}</div>`
    );
  } else if (/<div id="root"><\/div>/i.test(out)) {
    // Backward compatible fallback for older templates
    out = out.replace(
      /<div id="root"><\/div>/i,
      `<div id="seo-static" aria-hidden="false">${body}</div><div id="root"></div>`
    );
  } else if (/<div id="root">[\s\S]*?<\/div>/i.test(out)) {
    out = out.replace(
      /<div id="root">[\s\S]*?<\/div>/i,
      `<div id="seo-static" aria-hidden="false">${body}</div><div id="root"></div>`
    );
  }

  const noscript = noscriptNavHtml(loc);
  if (/<noscript>[\s\S]*?<\/noscript>/i.test(out)) {
    out = out.replace(/<noscript>[\s\S]*?<\/noscript>/i, noscript);
  }

  if (/<div id="mkt-consent-static"[^>]*>[\s\S]*?<div class="actions">[\s\S]*?<\/div>\s*<\/div>/i.test(out)) {
    out = out.replace(
      /<div id="mkt-consent-static"[^>]*>[\s\S]*?<div class="actions">[\s\S]*?<\/div>\s*<\/div>/i,
      cookieBannerHtml(loc)
    );
  }

  return out;
}

/**
 * Cloudflare Pages serves /download from dist/download.html with 200 and
 * 308-redirects /download/ (and /download.html) to /download. A folder
 * index (dist/download/index.html) would instead 308 /download → /download/,
 * which contradicts our no-slash canonicals. So: "/" → dist/index.html,
 * everything else → dist/<route>.html.
 */
export function distFileForRoute(routePath) {
  if (routePath === "/") return path.join(distDir, "index.html");
  return path.join(distDir, `${routePath.replace(/^\//, "")}.html`);
}

function writeRoute(route, html) {
  const file = distFileForRoute(route.path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Remove any stale folder-index shell from older builds.
  if (route.path !== "/") {
    const stale = path.join(distDir, route.path.replace(/^\//, ""), "index.html");
    if (fs.existsSync(stale)) fs.rmSync(stale);
  }
  // Keep boot splash on "/" — it is also the SPA fallback shell for app routes.
  fs.writeFileSync(file, injectMeta(html, route, { keepBootSplash: route.path === "/" }), "utf8");
  console.log(`[prerender-seo] ${route.path} -> ${path.relative(distDir, file)}`);
}

async function main() {
  await registerSiteCatalogs();
  if (!fs.existsSync(indexPath)) {
    console.error("[prerender-seo] dist/index.html missing — run vite build first");
    process.exit(1);
  }
  const base = fs.readFileSync(indexPath, "utf8");
  shellFonts = interFontFaceCss();
  if (!shellFonts.style) console.warn("[prerender-seo] Inter woff2 files not found in dist/assets: the shell paints in the system font");
  directoryData = await loadDirectoryData();
  directoryThin = new Set(directoryData.thin);
  const routes = PUBLIC_ROUTES.filter((r) => !r.noindex);
  for (const route of routes) {
    writeRoute(route, base);
  }
  const manifest = writeDirectoryManifest(distDir, directoryData);
  console.log(`[prerender-seo] directory: ${manifest.source}, ${manifest.thin.length} category pages noindex (dist/directory-manifest.json)`);
  console.log(`[prerender-seo] wrote ${routes.length} SEO shells with crawlable HTML`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
