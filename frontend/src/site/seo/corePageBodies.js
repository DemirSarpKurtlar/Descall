/**
 * Rich crawlable HTML bodies for core marketing pages (used by prerender-seo.mjs).
 * Keep in sync with React pages, this is the bot-visible body, not a thin meta stub.
 */
import { COPYRIGHT_CONTENT, PRIVACY_CONTENT, TERMS_CONTENT } from "../../legal/legalContent.js";
import { SITE_OPERATOR } from "../siteIdentity.js";
import { OWNERSHIP_FAQ_EN, OWNERSHIP_FAQ_TR } from "../ownershipFacts.js";
import { downloadTwin, faqTwin, featuresTwin, legalTwin, statusTwin, twinIcon } from "./pageTwins.js";
import { alternativesTwin, compareTwin, discordAlternativeTwin } from "./landingTwins.js";
import { aboutTwin, securityTwin, whoOwnsTwin } from "./infoTwins.js";
import {
  ALTERNATIVE_HUB_FAQ,
  ALTERNATIVES_FAQ,
  COMPARE_FAQ,
  TURKEY_FAQ,
} from "../content/discordSeoContent.js";
import {
  heroCtaHtml,
  homeHero,
  homeHref,
  navLabels,
  newCopy,
  prefixHref,
  seoSiteNavHtml,
  siteLoc,
  trCopy,
} from "./prerenderCopy.js";
import {
  PREFIXABLE_LOCALES,
  isMirrorPath,
  isPrefixedLocale,
  prefixedLocaleFromPath,
  stripPrefixedLocale,
} from "../siteLocales.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escaped text with {name} placeholders replaced by ready HTML. */
function fill(text, html = {}) {
  return escapeHtml(text).replace(/\{(\w+)\}/g, (m, key) => (html[key] != null ? html[key] : m));
}

function brandBlock(loc = "en") {
  const home = homeHref(loc);
  return `<a class="seo-brand" href="${home}" aria-label="${escapeHtml(newCopy("Descall home", loc))}"><img class="seo-brand-lockup" src="/brand/descall-lockup.svg" alt="Descall" height="22" decoding="async" /><span class="seo-brand-beta">Beta</span></a>`;
}

function ctaRow(extraSoftHref = "/discord-alternative", extraSoftLabel, loc = "en") {
  const n = navLabels(loc);
  const soft = extraSoftLabel || n.alternative;
  return `<p class="seo-cta-row">
    <a class="seo-cta-primary" href="${prefixHref("/download", loc)}">${n.download}</a>
    <a class="seo-cta-soft" href="${prefixHref(extraSoftHref, loc)}">${soft}</a>
  </p>`;
}

function navBlock(loc = "en") {
  return seoSiteNavHtml(loc);
}

function cardGrid(items = []) {
  return `<div class="seo-card-grid">
    ${items
      .map(
        (item) =>
          `<article class="seo-card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`
      )
      .join("\n    ")}
  </div>`;
}

function faqHtml(items, loc = "en") {
  return `<h2>${escapeHtml(trCopy("FAQ", loc))}</h2>
  ${items
    .map(
      (f) =>
        `<section><h3>${escapeHtml(trCopy(f.q, loc))}</h3><p>${escapeHtml(trCopy(f.a, loc))}</p></section>`
    )
    .join("\n")}`;
}

/**
 * Page twin (seo/pageTwins.js) inside the shell <main>: the brand line is stripped by the
 * prerender (the header replaces it), the site footer follows the twin.
 */
function twinMain(kind, html, loc) {
  return `
<main class="seo-twin seo-twin-${kind}">
  ${brandBlock(loc)}
  ${html}
  ${navBlock(loc)}
</main>`;
}

/**
 * Twin of a SeoLandingShell page (seo/landingTwins.js): the landing column and hero CSS
 * plus the "@twin-landing" block. The twin prints the page extras itself, in React's
 * markup, so the prerender adds none ("seo-extras-inline").
 */
export function landingTwinMain(html, brand, nav) {
  return `
<main class="seo-main-landing seo-twin-landing">
  ${brand}
  ${html}
  <!--seo-extras-inline-->
  ${nav}
</main>`;
}

const TR_BODY_ALIASES = {
  "/iletisim": "/contact",
  "/gizlilik": "/privacy",
  "/kosullar": "/terms",
};

/**
 * Locale and English page of a body path: "/tr/faq" -> tr + /faq, "/de/faq" -> de + /faq.
 * Prefixed locales are parsed whether or not they are still site drafts, so the string
 * export can render them; routing decides what is actually served.
 */
function bodyTarget(path) {
  const source = TR_BODY_ALIASES[path] || path;
  const isTr =
    Boolean(TR_BODY_ALIASES[path]) ||
    source === "/tr" ||
    source === "/tr/" ||
    source.startsWith("/tr/") ||
    source === "/discord-alternative-turkey";
  if (isTr) {
    const bare =
      source === "/tr" || source === "/tr/"
        ? "/"
        : source.startsWith("/tr/")
          ? source.slice(3)
          : source;
    return { loc: "tr", bare, original: source };
  }
  const prefixed = prefixedLocaleFromPath(path, PREFIXABLE_LOCALES);
  if (prefixed) {
    const bare = stripPrefixedLocale(path, [prefixed]);
    return isMirrorPath(bare) ? { loc: prefixed, bare, original: path } : null;
  }
  return { loc: "en", bare: source, original: source };
}

export function corePageBody(path) {
  const target = bodyTarget(path);
  if (!target) return null;
  const { loc, bare, original } = target;
  const isTr = loc === "tr";
  const isNew = isPrefixedLocale(loc);
  const n = navLabels(loc);
  const h = (p) => prefixHref(p, loc);
  // Links and CTA rows that stayed English on the Turkish shells: localized for prefixed locales only.
  const hn = (p) => (isNew ? prefixHref(p, loc) : p);
  const ctaLoc = isNew ? loc : "en";
  const tc = (s) => trCopy(s, loc);
  const nc = (s) => newCopy(s, loc);
  const owner = `<strong class="ownership-name">${SITE_OPERATOR.operatorName}</strong>`;
  const mail = `<a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a>`;
  switch (bare) {
    case "/": {
      const copy = homeHero(loc);
      const n = navLabels(loc);
      // Same grid, copy and product shot as HomePage.jsx (.mkt-hh), see index.html .seo-hh.
      return `
<main class="seo-main-home">
  <section class="seo-hh">
    <div class="seo-hh-copy">
      <h1>${escapeHtml(copy.h1)}</h1>
      <p class="seo-hh-lead"><span class="seo-hh-lead-long">${escapeHtml(copy.lead)}</span><span class="seo-hh-lead-short">${escapeHtml(tc("Voice chat, screen sharing, and servers."))}</span></p>
      <p class="seo-hh-cta"><a class="seo-hh-btn is-primary" href="${homeHref(loc)}?auth=register" rel="nofollow" data-hydrate data-auth="register">${escapeHtml(n.startFree)}</a><a class="seo-hh-btn is-secondary" href="${h("/download")}">${twinIcon("Windows", 18)}${escapeHtml(tc("Download the desktop app"))}</a></p>
      <ul class="seo-hh-platforms"><li>${twinIcon("Apple", 16)}iPhone</li><li>${twinIcon("Android", 16)}Android</li><li>${twinIcon("Windows", 16)}Windows</li><li>${twinIcon("Browser", 16)}Web</li></ul>
    </div>
    <figure class="seo-pf"><div class="seo-pf-glass"><picture><source media="(max-width: 768px)" srcset="/brand/previews/hero-ios-chats-480.webp 480w, /brand/previews/hero-ios-chats.webp 780w" sizes="min(220px, 60vw)" width="780" height="1688" /><img class="seo-pf-screen" src="/brand/previews/hero-desktop-dm.webp" width="1440" height="900" alt="${escapeHtml(tc("Descall chat, with servers and a voice channel in the same window"))}" fetchpriority="high" decoding="async" /></picture></div></figure>
  </section>
  <h2>${escapeHtml(copy.voiceTitle)}</h2>
  <p>${escapeHtml(copy.voiceBody)}</p>
  <h2>${escapeHtml(copy.serversTitle)}</h2>
  <p>${escapeHtml(copy.serversBody)}</p>
  <ul>
    ${copy.serversPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n    ")}
  </ul>
  ${navBlock(loc)}
</main>`;
    }

    case "/features":
      return twinMain("features", featuresTwin(loc, path), loc);

    case "/faq":
      return twinMain("faq", faqTwin(loc, path), loc);

    case "/download":
      return twinMain("download", downloadTwin(loc, path), loc);

    // AboutPage and the InfoPage template pages: twins of the React page (seo/infoTwins.js).
    case "/about":
      return twinMain("about", aboutTwin(loc, path), loc);

    case "/who-owns-descall":
      return twinMain("info", whoOwnsTwin(loc, path), loc);

    case "/descall-sahibi":
      return twinMain("info", whoOwnsTwin("tr", "/descall-sahibi"), "tr");

    case "/security":
      return twinMain("info", securityTwin(loc), loc);

    case "/status":
      return twinMain("status", statusTwin(loc, path), loc);

    case "/contact":
      return isTr
        ? `
<main>
  ${brandBlock("tr")}
  <h1>Descall İletişim</h1>
  <p>Destek, geri bildirim, basın ve güvenlik bildirimleri.</p>
  <h2>Sahip</h2>
  <p>${escapeHtml(SITE_OPERATOR.operatorName)}, Descall’ın sahibi ve kurucusudur. ${escapeHtml(SITE_OPERATOR.country)}</p>
  <h2>Destek e-postası</h2>
  <p><a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a></p>
  <h2>Güvenlik</h2>
  <p>Güvenlik bildirimleri için aynı adrese yazın ve inceleyebilmemiz için yeterli ayrıntıyı ekleyin.</p>
  ${navBlock("tr")}
</main>`
        : `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(nc("Contact Descall"))}</h1>
  <p>${escapeHtml(nc("Support, feedback, press, and security reports."))}</p>
  <h2>${escapeHtml(nc("Owner"))}</h2>
  <p>${fill(nc("{name} is the owner and founder of Descall."), { name: escapeHtml(SITE_OPERATOR.operatorName) })} ${escapeHtml(SITE_OPERATOR.country)}</p>
  <h2>${escapeHtml(nc("Support email"))}</h2>
  <p>${mail}</p>
  <h2>${escapeHtml(nc("Security"))}</h2>
  <p>${escapeHtml(nc("For security reports, email us and include enough detail to investigate safely."))}</p>
  ${navBlock(loc)}
</main>`;

    case "/privacy":
      return twinMain("legal", legalTwin(PRIVACY_CONTENT, siteLoc(loc), "privacy"), loc);

    case "/terms":
      return twinMain("legal", legalTwin(TERMS_CONTENT, siteLoc(loc), "terms"), loc);

    case "/copyright":
      return twinMain("legal", legalTwin(COPYRIGHT_CONTENT, siteLoc(loc), "copyright"), loc);

    // SeoLandingShell pages: twins of the React page (seo/landingTwins.js).
    case "/discord-alternative":
      return landingTwinMain(discordAlternativeTwin(loc, path), brandBlock(loc), navBlock(loc));

    case "/alternatives":
      return landingTwinMain(alternativesTwin(loc, path), brandBlock(loc), navBlock(loc));

    case "/compare/discord":
      return landingTwinMain(compareTwin(loc, path), brandBlock(loc), navBlock(loc));

    case "/discord-alternative-turkey": return `\n<main> ${brandBlock(loc)} <h1>Türkiye için en iyi Discord alternatifi: Descall</h1> <p>Discord alternatifi, muadili veya benzeri uygulama mı arıyorsun? Descall: ücretsiz sohbet, sesli arama ve ekran paylaşımı. Türkçe arayüz.</p> ${ctaRow("/download", "Windows / Android indir")}
  <h2>Neden Türkiye’de Discord alternatifi aranıyor?</h2>
  <p>Nitro baskısı, ağır arayüz ve bot karmaşası istemeyen gruplar daha hafif bir uygulama arıyor. Descall klan, sınıf ve oyuncu toplulukları için tasarlandı.</p>
  <p><a href="/discord-alternative">English hub</a> · <a href="/alternatives">Alternatives list</a> · <a href="/tr">Türkçe ana sayfa</a></p>
  ${faqHtml(TURKEY_FAQ, loc)}
  ${navBlock(loc)}
</main>`;

    default:
      return null;
  }
}
