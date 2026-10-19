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
const OG = `${SITE}/og-default.png`;

const { PUBLIC_ROUTES } = await import(pathToFileURL(path.join(root, "src/site/seoConfig.js")).href);
const { NICHE_LANDINGS } = await import(pathToFileURL(path.join(root, "src/site/seo/nicheLandings.js")).href);
const { BLOG_POSTS, ALTERNATIVE_HUB_FAQ, ALTERNATIVES_FAQ, COMPARE_FAQ, TURKEY_FAQ, BLOG_FAQ_BY_SLUG } = await import(
  pathToFileURL(path.join(root, "src/site/content/discordSeoContent.js")).href
);
const { BLOG_BODIES } = await import(pathToFileURL(path.join(root, "src/site/seo/blogBodies.js")).href);
const { corePageBody } = await import(pathToFileURL(path.join(root, "src/site/seo/corePageBodies.js")).href);
const { pageExtrasHtml } = await import(pathToFileURL(path.join(root, "src/site/seo/pageExtras.js")).href);
const { TR_LANDINGS } = await import(pathToFileURL(path.join(root, "src/site/seo/trLandings.js")).href);
const { TR_BLOG_POSTS, TR_BLOG_BODIES, TR_BLOG_FAQ_BY_SLUG } = await import(
  pathToFileURL(path.join(root, "src/site/seo/trBlog.js")).href
);
const { cookieBannerHtml, navLabels, noscriptNavHtml, prefixHref, seoSiteNavHtml, trCopy } = await import(
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
const { hreflangPair } = await import(
  pathToFileURL(path.join(root, "src/site/localePaths.js")).href
);

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

function routeIsTr(route) {
  return route.lang === "tr" || route.path === "/tr" || route.path.startsWith("/tr/");
}

function seoCtaRow(softHref = "/discord-alternative", softLabel, isTr = false) {
  const n = navLabels(isTr);
  const label = softLabel || n.alternative;
  return `<p class="seo-cta-row"><a class="seo-cta-primary" href="${prefixHref("/download", isTr)}">${n.download}</a><a class="seo-cta-soft" href="${prefixHref(softHref, isTr)}">${label}</a></p>`;
}

function seoSiteNav(isTr = false) {
  return seoSiteNavHtml(isTr);
}

function stripBootSplash(html) {
  // Nested divs — remove the whole splash block + its dismiss script.
  return html
    .replace(
      /<div id="boot-splash"[\s\S]*?<\/div>\s*<script>\s*\(function \(\) \{\s*var el = document\.getElementById\("boot-splash"\)[\s\S]*?<\/script>\s*/i,
      ""
    )
    .replace(/<div id="boot-splash"[\s\S]*?data-shown-at=""[\s\S]*?<\/script>\s*/i, "");
}

function crawlBody(route) {
  const body = crawlBodyInner(route);
  const extra = pageExtrasHtml(route.path);
  if (!extra) return body;
  return body.includes('<footer class="seo-footer">')
    ? body.replace('<footer class="seo-footer">', `${extra}\n<footer class="seo-footer">`)
    : body.replace(/<\/main>\s*$/, `${extra}\n</main>`);
}

function crawlBodyInner(route) {
  const isTr = routeIsTr(route);
  const n = navLabels(isTr);
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
<main>
  ${seoBrand()}
  <h1>${escapeHtml(trLanding.h1)}</h1>
  ${trLanding.updatedLabel ? `<p class="seo-note"><time datetime="${trLanding.updated}">${escapeHtml(trLanding.updatedLabel)}</time></p>` : ""}
  <p>${escapeHtml(trLanding.lead)}</p>
  ${seoCtaRow("/tr/discord-alternatifleri", "Alternatifleri karşılaştır", true)}
  ${sections}
  <h2>Sık sorulan sorular</h2>
  ${faq}
  <nav aria-label="İlgili sayfalar"><h2>İlgili sayfalar</h2><ul>${links}</ul></nav>
  ${seoSiteNav(true)}
</main>`;
  }

  if (route.path === "/tr/blog") {
    const posts = TR_BLOG_POSTS.map(
      (p) =>
        `<li><a href="${escapeHtml(p.path)}"><strong>${escapeHtml(p.title)}</strong></a> — ${escapeHtml(p.description)}</li>`
    ).join("");
    const hubs = Object.values(TR_LANDINGS)
      .map((p) => `<li><a href="${p.path}">${escapeHtml(p.h1.split(":")[0].trim())}</a></li>`)
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
      return `
<main>
  ${seoBrand()}
  <nav aria-label="Breadcrumb"><a href="/tr">Ana sayfa</a> › <a href="/tr/blog">Blog</a></nav>
  <article>
    <h1>${escapeHtml(post.title)}</h1>
    <p>${escapeHtml(post.description)}</p>
    <p class="seo-note">Yayın: ${post.date} · Güncelleme: ${post.updated}</p>
    ${sections}
    ${faq ? `<h2>Sık sorulan sorular</h2>${faq}` : ""}
    <p><a href="/blog/${slug}">English version</a></p>
    ${seoCtaRow("/tr/blog", "Tüm rehberler", true)}
  </article>
  ${seoSiteNav(true)}
</main>`;
    }
  }

  const core = corePageBody(route.path);
  if (core) return core;

  const niche = NICHE_LANDINGS[route.path];
  if (niche) {
    const sections = niche.sections
      .map((s) => `<h2>${escapeHtml(s.h)}</h2><p>${escapeHtml(s.p)}</p>`)
      .join("\n");
    const links = niche.related
      .map((l) => `<li><a href="${escapeHtml(l.to)}">${escapeHtml(l.label)}</a></li>`)
      .join("");
    const faq =
      Array.isArray(niche.faq) && niche.faq.length
        ? `<h2>FAQ</h2>${niche.faq
            .map((f) => `<h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p>`)
            .join("\n")}`
        : "";
    return `
<main>
  ${seoBrand()}
  <h1>${escapeHtml(niche.h1)}</h1>
  <p>${escapeHtml(niche.lead)}</p>
  ${seoCtaRow("/discord-alternative", n.alternative, isTr)}
  <h2>${escapeHtml(niche.answerTitle)}</h2>
  <p>${escapeHtml(niche.answer)}</p>
  <ul>${niche.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
  ${sections}
  ${faq}
  <nav aria-label="Related"><ul>${links}</ul></nav>
  ${seoSiteNav(isTr)}
</main>`;
  }

  if (route.path.startsWith("/blog/") && route.path !== "/blog") {
    const slug = route.path.replace("/blog/", "");
    const post = BLOG_POSTS.find((p) => p.slug === slug);
    const body = BLOG_BODIES[slug];
    if (post && body) {
      const sections = body.sections
        .map((s) => `<h2>${escapeHtml(s.h)}</h2><p>${escapeHtml(s.p)}</p>`)
        .join("\n");
      return `
<main>
  ${seoBrand()}
  <article>
    <h1>${escapeHtml(post.title)}</h1>
    <p>${escapeHtml(post.description)}</p>
    ${sections}
    ${seoCtaRow("/blog", isTr ? "Tüm rehberler" : "All guides", isTr)}
  </article>
  ${seoSiteNav(isTr)}
</main>`;
    }
  }

  if (route.path === "/blog") {
    const posts = BLOG_POSTS.map(
      (p) =>
        `<li><a href="/blog/${escapeHtml(p.slug)}"><strong>${escapeHtml(p.title)}</strong></a> — ${escapeHtml(p.description)}</li>`
    ).join("");
    return `
<main>
  ${seoBrand()}
  <h1>Descall Blog</h1>
  <p>Guides on Discord alternatives, servers, and voice chat.</p>
  <ul>${posts}</ul>
  ${seoCtaRow("/download", n.download, isTr)}
  ${seoSiteNav(isTr)}
</main>`;
  }

  const h1 = route.h1 || route.title.replace(/\s*\|\s*Descall\s*$/i, "").replace(/\s*—\s*Descall\s*$/i, "");
  return `
<main>
  ${seoBrand()}
  <h1>${escapeHtml(h1)}</h1>
  <p>${escapeHtml(route.description)}</p>
  ${seoCtaRow("/discord-alternative", n.alternative, isTr)}
  <h2>What you get with Descall</h2>
  <ul>
    <li>Discord-style servers with roles, channels, and templates</li>
    <li>Free real-time chat, group voice/video, and screen share</li>
    <li>Gaming server templates without bot hell</li>
    <li>Windows, Android, and full web app</li>
  </ul>
  ${seoSiteNav(isTr)}
</main>`;
}

function jsonLdForRoute(route) {
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
  if (route.path === "/compare/discord" || route.path === "/tr/compare/discord") {
    graphs.push(buildFaqLd(COMPARE_FAQ));
  }
  const trLanding = TR_LANDINGS[route.path];
  if (trLanding) {
    graphs.push(
      buildFaqLd(trLanding.faq),
      buildBreadcrumbLd([
        { name: "Ana sayfa", path: "/tr" },
        { name: trLanding.h1.split(":")[0].trim(), path: route.path },
      ])
    );
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
          title: post.title,
          description: post.description,
          path: route.path,
          datePublished: post.date,
          dateModified: post.updated || post.date,
          inLanguage: "tr",
        }),
        buildBreadcrumbLd([
          { name: "Ana sayfa", path: "/tr" },
          { name: "Blog", path: "/tr/blog" },
          { name: post.title, path: route.path },
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
        faqs: OWNERSHIP_FAQ_EN,
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
        faqs: OWNERSHIP_FAQ_TR,
      }),
      buildFaqLd(OWNERSHIP_FAQ_TR)
    );
  }
  if (route.path === "/about" || route.path === "/tr/about") {
    graphs.push(buildFaqLd(route.path.startsWith("/tr") ? OWNERSHIP_FAQ_TR : OWNERSHIP_FAQ_EN));
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
          datePublished: post.date || post.publishedAt || "2026-01-01",
          dateModified: post.updatedAt || post.date || "2026-01-01",
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

function injectMeta(html, route, { keepBootSplash = false } = {}) {
  const url = `${SITE}${route.path === "/" ? "/" : route.path}`;
  const title = escapeHtml(route.title);
  const desc = escapeHtml(route.description);
  const keywords = route.keywords ? escapeHtml(route.keywords) : "";
  const lang = route.lang || (routeIsTr(route) ? "tr" : "en");
  const ogType = route.ogType || "website";

  // Vercel rewrites authenticated deep links (/calls, /direct, …) to dist/index.html
  // (the "/" prerender). Stripping #boot-splash there caused 2–4s empty black screens
  // on hard nav. Keep splash on the SPA shell; strip only on niche marketing HTML.
  let out = keepBootSplash ? html : stripBootSplash(html);
  out = stripStaleHeadSeo(out);
  out = out.replace(/<html\s+lang="[^"]*"/i, `<html lang="${lang}"`);
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);

  // hreflang only for true 1:1 EN/TR translations; reciprocal, x-default → EN.
  const isTr = lang === "tr";
  const pair = hreflangPair(route.path);
  const hreflang = [];
  if (pair) {
    const enHref = `${SITE}${pair.en === "/" ? "/" : pair.en}`;
    const trHref = `${SITE}${pair.tr}`;
    hreflang.push(
      `<link rel="alternate" hreflang="en" href="${enHref}" />`,
      `<link rel="alternate" hreflang="tr" href="${trHref}" />`,
      `<link rel="alternate" hreflang="x-default" href="${enHref}" />`
    );
  }

  const ldScripts = jsonLdForRoute(route)
    .map(
      (data) =>
        `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`
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
    `<meta property="og:image" content="${route.image ? `${SITE}${route.image.startsWith("/") ? route.image : `/${route.image}`}` : OG}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${isTr ? "tr_TR" : "en_US"}" />`,
    pair ? `<meta property="og:locale:alternate" content="${isTr ? "en_US" : "tr_TR"}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
    `<meta name="twitter:image" content="${route.image ? `${SITE}${route.image.startsWith("/") ? route.image : `/${route.image}`}` : OG}" />`,
    ldScripts,
  ]
    .filter(Boolean)
    .join("\n    ");

  out = out.replace(/<\/title>/i, `</title>\n    ${metaBlock}`);

  const body = crawlBody(route);
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

  const noscript = noscriptNavHtml(isTr);
  if (/<noscript>[\s\S]*?<\/noscript>/i.test(out)) {
    out = out.replace(/<noscript>[\s\S]*?<\/noscript>/i, noscript);
  }

  if (/<div id="mkt-consent-static"[^>]*>[\s\S]*?<div class="actions">[\s\S]*?<\/div>\s*<\/div>/i.test(out)) {
    out = out.replace(
      /<div id="mkt-consent-static"[^>]*>[\s\S]*?<div class="actions">[\s\S]*?<\/div>\s*<\/div>/i,
      cookieBannerHtml(isTr)
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

function main() {
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

main();
