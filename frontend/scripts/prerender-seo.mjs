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
const { PUBLIC_ROUTES, localizeRouteMeta } = await import(pathToFileURL(path.join(root, "src/site/seoConfig.js")).href);
const { NICHE_LANDINGS } = await import(pathToFileURL(path.join(root, "src/site/seo/nicheLandings.js")).href);
const { BLOG_POSTS, BLOG_RELATED, ALTERNATIVE_HUB_FAQ, ALTERNATIVES_FAQ, COMPARE_FAQ, TURKEY_FAQ, BLOG_FAQ_BY_SLUG } = await import(
  pathToFileURL(path.join(root, "src/site/content/discordSeoContent.js")).href
);
const { BLOG_BODIES } = await import(pathToFileURL(path.join(root, "src/site/seo/blogBodies.js")).href);
const { corePageBody } = await import(pathToFileURL(path.join(root, "src/site/seo/corePageBodies.js")).href);
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
const { siteText } = await import(pathToFileURL(path.join(root, "src/site/siteText.js")).href);
const { formatDate } = await import(pathToFileURL(path.join(root, "src/i18n/format.js")).href);
const { registerSiteCatalogs } = await import(pathToFileURL(path.join(__dirname, "siteCatalogs.mjs")).href);

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
function seoTopHtml(loc = "en") {
  const l = loc;
  const n = navLabels(l);
  const h = (path) => prefixHref(path, l);
  const code = (l === "pt-BR" ? "pt" : l).split("-")[0].toUpperCase();
  const signIn = trCopy("Sign In", l);
  return `<header class="seo-top">
  <a class="seo-top-brand" href="${homeHref(l)}"><img src="/brand/descall-lockup.svg" alt="Descall" width="123" height="28" decoding="async" /><span class="seo-top-beta">Beta</span></a>
  <nav class="seo-top-nav" aria-label="${trCopy("Primary navigation", l)}"><a href="${h("/features")}">${n.features}</a><a href="${h("/download")}">${n.download}</a><a href="${h("/faq")}">${n.faq}</a></nav>
  <div class="seo-top-actions">
    <span class="seo-top-lang" aria-hidden="true">${code}</span>
    <a class="seo-top-btn" href="${authHref(l, "login")}" rel="nofollow" data-hydrate data-auth="login">${signIn}</a>
    <a class="seo-top-btn is-primary" href="${authHref(l, "register")}" rel="nofollow" data-hydrate data-auth="register">${n.startFree}</a>
    <a class="seo-top-icon seo-top-dl" href="${h("/download")}" aria-label="${n.download}" title="${n.download}">${ICON_DOWNLOAD}</a>
    <a class="seo-top-icon seo-top-menu" href="#seo-site-nav" aria-label="${trCopy("Open menu", l)}">${ICON_MENU}</a>
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

/** Same mapping as DiscordAlternativeNichePage previewForPath. */
function nichePreview(path) {
  if (path.includes("communities")) return "servers";
  if (path.includes("voice")) return "call";
  return "chat";
}

/** Same mapping as TrLandingPage previewForPath. */
function trPreview(path) {
  if (path.includes("oyuncu")) return "friends";
  if (path.includes("sesli")) return "call";
  if (path.includes("turk")) return "servers";
  return "chat";
}

/**
 * Hero of a landing page, twin of SeoLandingShell (breadcrumbs, title, lead, Start free +
 * Download, product shot): same boxes as the React page, see index.html .seo-lhero.
 */
function landingHeroHtml({ loc, crumbs, h1, lead, shot, alt }) {
  const n = navLabels(loc);
  const trail = crumbs
    .map(([href, label]) => (href ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : `<span aria-current="page">${escapeHtml(label)}</span>`))
    .join(" › ");
  const img = shot
    ? `<figure class="seo-lhero-shot"><img src="${shot}" width="1440" height="900" alt="${escapeHtml(alt)}" fetchpriority="high" decoding="async" /></figure>`
    : "";
  return `<header class="seo-lhero${shot ? "" : " is-single"}">
    <nav class="seo-crumbs" aria-label="Breadcrumb">${trail}</nav>
    <div class="seo-lhero-copy">
      <h1>${escapeHtml(h1)}</h1>
      <p class="seo-lhero-lead">${escapeHtml(lead)}</p>
      <p class="seo-cta-row"><a class="seo-cta-primary" href="${authHref(loc, "register")}" rel="nofollow" data-hydrate data-auth="register">${n.startFree}</a><a class="seo-cta-soft" href="${prefixHref("/download", loc)}">${n.download}</a></p>
    </div>
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

function crawlBody(route) {
  const body = crawlBodyInner(route);
  // Long-form extras, then the sections of a blog post merged into this page.
  const extra = pageExtrasHtml(route.path) + mergedGuideHtml(route.path, siteText);
  if (!extra) return body;
  return body.includes('<footer class="seo-footer">')
    ? body.replace('<footer class="seo-footer">', `${extra}\n<footer class="seo-footer">`)
    : body.replace(/<\/main>\s*$/, `${extra}\n</main>`);
}

function crawlBodyInner(route) {
  const isTr = routeIsTr(route);
  const loc = routeLocale(route);
  const n = navLabels(loc);
  const trLanding = TR_LANDINGS[route.path];
  if (trLanding) {
    const sections = trLanding.sections
      .map(
        (s) =>
          `<h2>${escapeHtml(s.h)}</h2>\n${s.p.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}${
            s.list?.length ? `\n<ul>${s.list.map((li) => `<li>${escapeHtml(li)}</li>`).join("")}</ul>` : ""
          }`
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
      [null, trLandingLabel(trLanding)],
    ],
    h1: trLanding.h1,
    lead: trLanding.lead,
    shot: PREVIEW_SHOTS[trPreview(route.path)],
    alt: trLanding.h1,
  })}
  ${trLanding.updatedLabel ? `<p class="seo-note"><time datetime="${trLanding.updated}">${escapeHtml(trLanding.updatedLabel)}</time></p>` : ""}
  ${sections}
  <h2>Sık sorulan sorular</h2>
  ${faq}
  <nav aria-label="İlgili sayfalar"><h2>İlgili sayfalar</h2><ul>${links}</ul></nav>
  </article>
  ${seoSiteNav(true)}
</main>`;
  }

  if (route.path === "/tr/blog") {
    const posts = TR_BLOG_POSTS.map(
      (p) =>
        `<li><a href="${escapeHtml(p.path)}"><strong>${escapeHtml(p.h1 || p.title)}</strong></a> — ${escapeHtml(p.description)}</li>`
    ).join("");
    const hubs = Object.values(TR_LANDINGS)
      .map((p) => `<li><a href="${p.path}">${escapeHtml(trLandingLabel(p))}</a></li>`)
      .join("");
    return `
<main>
  ${seoBrand()}
  <h1>Descall blog: Discord alternatifleri ve sesli sohbet rehberleri</h1>
  <p>Discord alternatifleri, Discord’dan geçiş, sesli sohbet ve topluluk yönetimi üzerine Türkçe, pratik rehberler.</p>
  <ul>${posts}</ul>
  <h2>Türkçe rehber sayfaları</h2>
  <ul>${hubs}</ul>
  ${seoCtaRow("/tr/download", n.download, true)}
  ${seoSiteNav(true)}
</main>`;
  }

  if (route.path.startsWith("/tr/blog/")) {
    const slug = route.path.slice("/tr/blog/".length);
    const post = TR_BLOG_POSTS.find((p) => p.slug === slug);
    const body = TR_BLOG_BODIES[slug];
    if (post && body) {
      const sections = body.sections
        .map((s) => `<h2>${escapeHtml(s.h)}</h2><p>${escapeHtml(s.p)}</p>`)
        .join("\n");
      const faq = (TR_BLOG_FAQ_BY_SLUG[slug] || [])
        .map((f) => `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`)
        .join("\n");
      const morePosts = TR_BLOG_POSTS.filter((p) => p.slug !== slug)
        .map((p) => `<li><a href="${escapeHtml(p.path)}">${escapeHtml(p.h1 || p.title)}</a></li>`)
        .join("");
      return `
<main>
  ${seoBrand()}
  <nav aria-label="Breadcrumb"><a href="/tr">Ana sayfa</a> › <a href="/tr/blog">Blog</a></nav>
  <article>
    <h1>${escapeHtml(post.h1 || post.title)}</h1>
    <p>${escapeHtml(post.description)}</p>
    ${postMetaHtml(post, "tr", { published: "Yayın", updated: "Güncelleme", author: "Yazar" }, "/descall-sahibi")}
    ${sections}
    ${faq ? `<h2>Sık sorulan sorular</h2>${faq}` : ""}
    <nav aria-label="İlgili yazılar"><h2>İlgili yazılar</h2><ul>${morePosts}<li><a href="/tr/discord-alternatifi">Discord alternatifi</a></li><li><a href="/tr/sesli-sohbet-uygulamasi">Sesli sohbet uygulaması</a></li></ul></nav>
    <p><a href="/blog/${slug}">English version</a></p>
    ${seoCtaRow("/tr/blog", "Tüm rehberler", true)}
  </article>
  ${seoSiteNav(true)}
</main>`;
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

  const niche = NICHE_LANDINGS[enPath];
  if (niche) {
    const sections = niche.sections
      .map((s) => `<h2>${escapeHtml(tx(s.h))}</h2><p>${escapeHtml(tx(s.p))}</p>`)
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
      [null, tx(niche.h1.split(" | ")[0].trim())],
    ],
    h1: tx(niche.h1),
    lead: tx(niche.lead),
    shot: PREVIEW_SHOTS[nichePreview(enPath)],
    alt: tx(niche.h1),
  })}
  <h2>${escapeHtml(tx(niche.answerTitle))}</h2>
  <p>${escapeHtml(tx(niche.answer))}</p>
  <ul>${niche.bullets.map((b) => `<li>${escapeHtml(tx(b))}</li>`).join("")}</ul>
  ${sections}
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
      const sections = body.sections
        .map((s) => `<h2>${escapeHtml(tx(s.h))}</h2><p>${escapeHtml(tx(s.p))}</p>`)
        .join("\n");
      // Publish / update dates and author in every language, written with Intl.
      const dates = `\n    ${postMetaHtml(post, loc, { published: tx("Published"), updated: tx("Updated"), author: tx("Author") }, hx("/who-owns-descall"))}`;
      // Related reading: the other posts, then the guides the merged posts live on.
      const related = [
        ...BLOG_POSTS.filter((p) => p.slug !== slug).map((p) => ({ to: p.path, label: p.title })),
        ...BLOG_RELATED.filter((l) => l.to !== "/status"),
      ]
        .map((l) => `<li><a href="${escapeHtml(hx(l.to))}">${escapeHtml(tx(l.label))}</a></li>`)
        .join("");
      // Same questions as the post's FAQPage JSON-LD, visible on the page.
      const postFaq = (BLOG_FAQ_BY_SLUG[slug] || [])
        .map((f) => `<h3>${escapeHtml(tx(f.q))}</h3><p>${escapeHtml(tx(f.a))}</p>`)
        .join("\n");
      return `
<main>
  ${brand}
  <article>
    <h1>${escapeHtml(tx(post.title))}</h1>
    <p>${escapeHtml(tx(post.description))}</p>${dates}
    ${sections}
    ${postFaq ? `<h2>${escapeHtml(tx("FAQ"))}</h2>\n${postFaq}` : ""}
    <nav aria-label="${escapeHtml(tx("Related guides"))}"><h2>${escapeHtml(tx("Related guides"))}</h2><ul>${related}</ul></nav>
    ${seoCtaRow("/blog", isTr ? "Tüm rehberler" : tx("All guides"), loc)}
  </article>
  ${seoSiteNav(loc)}
</main>`;
    }
  }

  if (enPath === "/blog") {
    const posts = BLOG_POSTS.map(
      (p) =>
        `<li><a href="${escapeHtml(hx(`/blog/${p.slug}`))}"><strong>${escapeHtml(tx(p.title))}</strong></a> — ${escapeHtml(tx(p.description))}</li>`
    ).join("");
    return `
<main>
  ${brand}
  <h1>${escapeHtml(tx("Descall Blog"))}</h1>
  <p>${escapeHtml(tx("Guides on Discord alternatives, servers, and voice chat."))}</p>
  <ul>${posts}</ul>
  ${seoCtaRow("/download", n.download, loc)}
  ${seoSiteNav(loc)}
</main>`;
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
          title: t(post.title),
          description: t(post.description),
          path: route.path,
          datePublished: post.date,
          dateModified: post.updated || post.date,
          inLanguage: loc,
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

  // SoftwareApplication already lives in the entity @graph (same @id) on every
  // page; a second standalone copy was a duplicate.

  if (route.path === "/faq") {
    graphs.push(buildFaqLd(FAQ_ITEMS));
  }
  if (route.path === "/tr/faq") {
    graphs.push(buildFaqLd(FAQ_ITEMS.map((f) => ({ q: trCopy(f.q, true), a: trCopy(f.a, true) }))));
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
          title: post.h1 || post.title,
          description: post.description,
          path: route.path,
          datePublished: post.date,
          dateModified: post.updated || post.date,
          inLanguage: "tr",
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
          title: post.title,
          description: post.description,
          path: route.path,
          datePublished: post.date,
          dateModified: post.updated || post.date,
          inLanguage: "en",
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

function stripStaleHeadSeo(html) {
  return html
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="keywords"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="robots"[^>]*>\s*/gi, "")
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

  const ldScripts = jsonLdForRoute(route)
    .map(
      (data) =>
        `<script type="application/ld+json" data-prerendered-jsonld="${route.path}">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`
    )
    .join("\n    ");

  const metaBlock = [
    `<meta name="description" content="${desc}" />`,
    keywords ? `<meta name="keywords" content="${keywords}" />` : "",
    `<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />`,
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
  const body = `${seoTopHtml(loc)}\n${crawlBody(route).replace(/<a class="seo-brand"[\s\S]*?<\/a>/, "")}`;
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
  const routes = PUBLIC_ROUTES.filter((r) => !r.noindex);
  for (const route of routes) {
    writeRoute(route, base);
  }
  console.log(`[prerender-seo] wrote ${routes.length} SEO shells with crawlable HTML`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
