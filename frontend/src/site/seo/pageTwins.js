/**
 * Prerendered twins of the React pages /features, /faq, /download, /status and the
 * legal reader (/privacy, /terms, /copyright and their translations).
 *
 * The prerendered page is the first paint; React takes over with a 180 ms cross-fade
 * (MarketingApp RevealMarketingShell). A twin uses the same text (the React t() keys,
 * translated the way MarketingLocaleProvider does), the same order and the same boxes
 * as the React page (index.html, the "@twin-*" CSS blocks), so the hand-over does not
 * move anything. The no-JS page stays complete: links are real links, FAQ answers sit
 * in <details>, the download buttons point at the latest release.
 *
 * Keep in step with: pages/FeaturesPage.jsx, pages/FaqPage.jsx,
 * pages/MarketingDownloadPage.jsx, pages/StatusPage.jsx,
 * components/legal/LegalDocument.jsx (selftest: pageTwins.selftest.mjs).
 */
import { FAQ_GROUPS } from "../faqData.js";
import { MARKETING_TR } from "../marketingPhrases.tr.js";
import { siteText } from "../siteText.js";
import { isPrefixedLocale } from "../siteLocales.js";
import { marketingHref } from "../marketingHref.js";
import { SITE_OPERATOR } from "../siteIdentity.js";
import { SEO_DEFAULT_RELATED, SEO_PILLARS } from "../seoHubLinks.js";
import { FEATURE_GROUPS, PREVIEW_SHOT_FILES, PREVIEW_SIZES, previewSrcset } from "./featureGroups.js";
import { authHref } from "./prerenderCopy.js";
import { formatDate } from "../../i18n/format.js";
import { DESKTOP_RELEASE_FALLBACK } from "../../lib/desktopRelease.js";
import {
  LEGAL_EMAIL,
  briefLabel,
  contactCopy,
  isRightsHeading,
  jumpLabel,
  legalSlug,
  summaryCards,
  tocLabel,
} from "../../legal/legalView.js";

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_, a, b) => (vars[a || b] != null ? String(vars[a || b]) : ""));
}

/**
 * t() of a site language, as the React page sees it on its first render:
 * English as written, Turkish from the marketing phrases, prefixed languages from
 * the site catalog (then the app catalog).
 */
export function pageT(loc) {
  return (key, vars) => {
    if (key == null) return "";
    const k = String(key);
    let out = k;
    if (loc === "tr") out = MARKETING_TR[k] || k;
    else if (isPrefixedLocale(loc)) out = siteText(k, loc);
    return interpolate(out, vars);
  };
}

/** useMarketingHref() of the page at `pathname`. */
export function hrefFor(loc, pathname) {
  return (to) => marketingHref(to, { locale: loc, pathname });
}

// Phosphor Regular paths, the same as site/icons.jsx (pageTwins.selftest.mjs compares them).
export const TWIN_ICON_PATHS = {
  Monitor: "M208,40H48A24,24,0,0,0,24,64V176a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V64A24,24,0,0,0,208,40Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H208a8,8,0,0,1,8,8Zm-48,48a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,224Z",
  Smartphone: "M176,16H80A24,24,0,0,0,56,40V216a24,24,0,0,0,24,24h96a24,24,0,0,0,24-24V40A24,24,0,0,0,176,16ZM72,64H184V192H72Zm8-32h96a8,8,0,0,1,8,8v8H72V40A8,8,0,0,1,80,32Zm96,192H80a8,8,0,0,1-8-8v-8H184v8A8,8,0,0,1,176,224Z",
  Check: "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z",
  Apple: "M223.3,169.59a8.07,8.07,0,0,0-2.8-3.4C203.53,154.53,200,134.64,200,120c0-17.67,13.47-33.06,21.5-40.67a8,8,0,0,0,0-11.62C208.82,55.74,187.82,48,168,48a72.2,72.2,0,0,0-40,12.13,71.56,71.56,0,0,0-90.71,9.09A74.63,74.63,0,0,0,16,123.4a127.06,127.06,0,0,0,40.14,89.73A39.8,39.8,0,0,0,83.59,224h87.68a39.84,39.84,0,0,0,29.12-12.57,125,125,0,0,0,17.82-24.6C225.23,174,224.33,172,223.3,169.59Zm-34.63,30.94a23.76,23.76,0,0,1-17.4,7.47H83.59a23.82,23.82,0,0,1-16.44-6.51A111.14,111.14,0,0,1,32,123,58.5,58.5,0,0,1,48.65,80.47,54.81,54.81,0,0,1,88,64h.78A55.45,55.45,0,0,1,123,76.28a8,8,0,0,0,10,0A55.44,55.44,0,0,1,168,64a70.64,70.64,0,0,1,36,10.35c-13,14.52-20,30.47-20,45.65,0,23.77,7.64,42.73,22.18,55.3A105.82,105.82,0,0,1,188.67,200.53ZM128.23,30A40,40,0,0,1,167,0h1a8,8,0,0,1,0,16h-1a24,24,0,0,0-23.24,18,8,8,0,1,1-15.5-4Z",
  Android: "M176,148a12,12,0,1,1-12-12A12,12,0,0,1,176,148ZM92,136a12,12,0,1,0,12,12A12,12,0,0,0,92,136Zm148,24v24a16,16,0,0,1-16,16H32a16,16,0,0,1-16-16V161.13A113.38,113.38,0,0,1,51.4,78.72L26.34,53.66A8,8,0,0,1,37.66,42.34L63.82,68.5a111.43,111.43,0,0,1,128.55-.19l26-26a8,8,0,0,1,11.32,11.32L204.82,78.5c.75.71,1.5,1.43,2.24,2.17A111.25,111.25,0,0,1,240,160Zm-16,0a96,96,0,0,0-96-96h-.34C74.91,64.18,32,107.75,32,161.13V184H224Z",
  Windows: "M208,136H128a8,8,0,0,0-8,8v57.45a8,8,0,0,0,6.57,7.88l80,14.54A7.61,7.61,0,0,0,208,224a8,8,0,0,0,8-8V144A8,8,0,0,0,208,136Zm-8,70.41-64-11.63V152h64ZM96,136H32a8,8,0,0,0-8,8v40a8,8,0,0,0,6.57,7.87l64,11.64a8.54,8.54,0,0,0,1.43.13,8,8,0,0,0,8-8V144A8,8,0,0,0,96,136Zm-8,50.05-48-8.73V152H88ZM213.13,33.86a8,8,0,0,0-6.56-1.73l-80,14.55A8,8,0,0,0,120,54.55V112a8,8,0,0,0,8,8h80a8,8,0,0,0,8-8V40A8,8,0,0,0,213.13,33.86ZM200,104H136V61.22l64-11.63ZM101.13,54.22a8,8,0,0,0-6.56-1.73l-64,11.64A8,8,0,0,0,24,72v40a8,8,0,0,0,8,8H96a8,8,0,0,0,8-8V60.36A8,8,0,0,0,101.13,54.22ZM88,104H40V78.68L88,70Z",
  Browser: "M208,40H48A24,24,0,0,0,24,64V176a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V64A24,24,0,0,0,208,40Zm8,136a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H208a8,8,0,0,1,8,8Zm-48,48a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,224Z",
  Download: "M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z",
};

export function twinIcon(name, size) {
  const d = TWIN_ICON_PATHS[name];
  return `<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

/** SeoProductPreview frame="flat": glass device, screenshot, caption. */
function shotHtml(mode, caption, { priority = false } = {}) {
  const src = PREVIEW_SHOT_FILES[mode] || PREVIEW_SHOT_FILES.chat;
  const load = priority ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<figure class="seo-tw-shot"><div class="seo-tw-dev"><div class="seo-tw-scr"><img src="${src}" srcset="${previewSrcset(src)}" sizes="${PREVIEW_SIZES}" alt="${escapeHtml(caption)}" width="1440" height="900" ${load} decoding="async" /></div></div><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

const CHEVRON =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** SeoRelatedLinks: small caps title, glass pills. */
function relatedHtml(t, href, title, links) {
  return `<section class="seo-tw-related" aria-label="${escapeHtml(t(title))}"><h2>${escapeHtml(t(title))}</h2><ul>${links
    .map((l) => `<li><a href="${escapeHtml(href(l.to))}">${escapeHtml(t(l.label))}${CHEVRON}</a></li>`)
    .join("")}</ul></section>`;
}

export function featuresTwin(loc, pathname) {
  const t = pageT(loc);
  const href = hrefFor(loc, pathname);
  const rows = FEATURE_GROUPS.map(
    (g, i) => `<div class="seo-tw-row${g.flip ? " is-flip" : ""}">
    ${shotHtml(g.mode, t(g.caption), { priority: i === 0 })}
    <div class="seo-tw-copy"><h2>${escapeHtml(t(g.title))}</h2><ul class="seo-tw-list">${g.items.map((it) => `<li>${escapeHtml(t(it))}</li>`).join("")}</ul></div>
  </div>`
  ).join("\n  ");
  return `<section class="seo-tw-features">
  <h1>${escapeHtml(t("Features of a modern Discord alternative"))}</h1>
  <p class="seo-tw-lead">${escapeHtml(t("Servers, direct messages, voice, and screen share. Chat and calls stay free."))}</p>
  ${rows}
  <p class="seo-tw-cta"><a class="seo-tw-btn is-primary" href="${href("/download")}">${escapeHtml(t("Download"))}</a><a class="seo-tw-btn is-soft" href="${href("/discord-alternative")}">${escapeHtml(t("Discord alternative"))}</a><a class="seo-tw-btn is-ghost" href="${href("/faq")}">${escapeHtml(t("FAQ"))}</a></p>
  ${relatedHtml(t, href, "Explore by use case", SEO_DEFAULT_RELATED)}
</section>`;
}

export function faqTwin(loc, pathname) {
  const t = pageT(loc);
  const href = hrefFor(loc, pathname);
  const jump = FAQ_GROUPS.map((g) => `<a href="#faq-${g.id}">${escapeHtml(t(g.title))}<span>${g.items.length}</span></a>`).join("");
  const groups = FAQ_GROUPS.map(
    (g) => `<div class="seo-tw-faq-group" id="faq-${g.id}"><h2>${escapeHtml(t(g.title))}</h2><div class="seo-tw-faq">${g.items
      .map((it) => `<details><summary>${escapeHtml(t(it.q))}</summary><p>${escapeHtml(t(it.a))}</p></details>`)
      .join("")}</div></div>`
  ).join("\n    ");
  return `<section class="seo-tw-faq-layout">
  <aside class="seo-tw-faq-nav">
    <h1>${escapeHtml(t("FAQ"))}</h1>
    <p class="seo-tw-lead">${escapeHtml(t("Accounts, the Windows and Android downloads, calls, screen share, and what we store."))}</p>
    <nav class="seo-tw-faq-jump" aria-label="${escapeHtml(t("FAQ"))}">${jump}</nav>
    <a class="seo-tw-btn is-soft" href="${href("/contact")}">${escapeHtml(t("Contact"))}</a>
  </aside>
  <div>
    ${groups}
  </div>
</section>`;
}

const ANDROID_RELEASES_PAGE_URL = "https://github.com/DemirSarpKurtlar/Descall/releases/latest";

export function downloadTwin(loc, pathname) {
  const t = pageT(loc);
  const href = hrefFor(loc, pathname);
  const win = DESKTOP_RELEASE_FALLBACK.windowsDownloadUrl;
  // The React page starts with "Checking for updates…" and the Windows card selected.
  const versionLine = t("Checking for updates…");
  const platform = (name, iconName, tone, sub, active, url) => `<a class="seo-tw-plat${active ? " is-active" : ""}" href="${url}" rel="noopener noreferrer"><span class="seo-tw-plat-top"><span class="seo-tw-ico is-${tone}">${twinIcon(iconName, 20)}</span><span class="seo-tw-check" aria-hidden="true">${twinIcon("Check", 14)}</span></span><strong>${name}</strong><span class="seo-tw-plat-sub">${escapeHtml(sub)}</span></a>`;
  const check = twinIcon("Check", 16);
  return `<section class="seo-tw-dl-hero">
  <div class="seo-tw-dl-copy">
    <h1>${escapeHtml(t("Download Descall"))}</h1>
    <p>${escapeHtml(t("Windows installer and the Android APK. The browser app is the same account, with no install."))}</p>
    <p class="seo-tw-cta"><a class="seo-tw-btn is-soft seo-tw-dl-start" href="${authHref(loc, "register")}" rel="nofollow" data-hydrate data-auth="register">${escapeHtml(t("Start free"))}</a><a class="seo-tw-btn is-ghost" href="${href("/")}">${escapeHtml(t("Open the web app"))}</a></p>
  </div>
  <div class="seo-tw-dl-panel">
    <p class="seo-tw-dl-kicker">${escapeHtml(t("Platform"))}</p>
    <div class="seo-tw-dl-plats" aria-label="${escapeHtml(t("Platform"))}">${platform("Windows", "Monitor", "blue", t("Desktop app"), true, win)}${platform("Android", "Smartphone", "slate", "APK", false, ANDROID_RELEASES_PAGE_URL)}</div>
    <p class="seo-tw-dl-version"><span class="seo-tw-pulse" aria-hidden="true"></span><span>${escapeHtml(versionLine)}</span></p>
    <a class="seo-tw-btn is-primary seo-tw-dl-cta" href="${win}" rel="noopener noreferrer">${twinIcon("Download", 18)}${escapeHtml(t("Download for Windows"))}</a>
  </div>
</section>
<p class="seo-tw-dl-os">${escapeHtml(t("Works on Windows, Android, iPhone and the web."))}</p>
<section class="seo-tw-row">
  ${shotHtml("chat", t("The download and the website show the same servers and chats"))}
  <div class="seo-tw-copy">
    <h2>${escapeHtml(t("What you get"))}</h2>
    <p class="seo-tw-copy-lead">${escapeHtml(versionLine)}</p>
    <ul class="seo-tw-checklist"><li>${check} ${escapeHtml(t("No Nitro paywall on core chat & calls"))}</li><li>${check}<span>${escapeHtml(t("Servers, roles, and channels"))}</span></li><li>${check}<a href="${href("/discord-alternative")}">${escapeHtml(t("Discord alternative"))}</a></li></ul>
    <p class="seo-tw-cta"><a class="seo-tw-btn is-soft" href="${win}" rel="noopener noreferrer">${twinIcon("Download", 18)}${escapeHtml(t("Download for Windows"))}</a><a class="seo-tw-btn is-soft" href="${href("/features")}">${escapeHtml(t("See all features"))}</a></p>
  </div>
</section>
<!--seo-extras-->
${relatedHtml(t, href, "Keep exploring", SEO_PILLARS)}`;
}

/** Long date in the page language, as StatusPage (UTC noon, so every zone agrees). */
function statusDate(loc) {
  const iso = SITE_OPERATOR.statusReviewedIso;
  return formatDate(`${iso}T12:00:00Z`, loc, { dateStyle: "long", timeZone: "UTC" }) || iso;
}

export function statusTwin(loc, pathname) {
  const t = pageT(loc);
  const href = hrefFor(loc, pathname);
  const row = (dt, dd, cls = "") => `<div class="seo-tw-st-row${cls}"><dt>${dt}</dt><dd>${dd}</dd></div>`;
  return `<div class="seo-tw-status">
  <nav class="seo-tw-crumbs" aria-label="Breadcrumb"><span><a href="${href("/")}">${escapeHtml(t("Home"))}</a></span><span> / <a href="${href("/status")}">${escapeHtml(t("Status"))}</a></span></nav>
  <h1>${escapeHtml(t("Descall service status"))}</h1>
  <p class="seo-tw-st-lead">${escapeHtml(t(SITE_OPERATOR.statusNote))} ${escapeHtml(t("Last updated"))}: <time datetime="${SITE_OPERATOR.statusReviewedIso}">${escapeHtml(statusDate(loc))}</time>.</p>
  <dl class="seo-tw-st-list">
    ${row(escapeHtml(t("API / realtime")), `<span class="seo-tw-st-dot" aria-hidden="true"></span>${escapeHtml(t("Checking…"))}`, " is-checking")}
    ${row(escapeHtml(t("Product stage")), escapeHtml(t("Beta")))}
    ${row(escapeHtml(t("Transport security")), "TLS / DTLS-SRTP")}
    ${row(escapeHtml(t("Operator")), escapeHtml(`${SITE_OPERATOR.operatorName} · ${SITE_OPERATOR.country}`))}
    ${row(escapeHtml(t("Support")), `<a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a>`)}
    ${row("GitHub", `<a href="${SITE_OPERATOR.githubUrl}" rel="noopener noreferrer">${SITE_OPERATOR.githubUrl.replace("https://", "")}</a>`)}
  </dl>
  <p class="seo-tw-note">${escapeHtml(t("The API row is checked live from your browser each time you open this page."))}</p>
  <p class="seo-tw-note"><a href="${href("/security")}">${escapeHtml(t("Security details"))}</a> · <a href="${href("/contact")}">${escapeHtml(t("Contact"))}</a></p>
</div>`;
}

const LEGAL_ICONS = [
  "M12 3l7 3v6c0 4.2-2.8 7.4-7 8.8C7.8 19.4 5 16.2 5 12V6l7-3z",
  "M6 7h12M6 12h12M6 17h8",
  "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0",
  "M5 19V5h9l5 5v9H5z",
  "M4 8h16M4 16h10",
  "M12 3v18M5 8h14",
  "M8 11V7a4 4 0 118 0v4M6 11h12v9H6z",
  "M4 6h16v12H4zM8 6V4h8v2",
];

/** LegalDocument: hero, intro, "In short" cards, contents + sections, contact. */
export function legalTwin(content, loc, type) {
  const data = content[loc] || content.en;
  const enData = content.en;
  const cards = summaryCards(type, data, loc, enData);
  const contact = contactCopy(type, loc);
  const current = cards[0]?.id || "";
  const sections = data.sections || [];
  const ids = sections.map((s, i) => legalSlug(s.heading, i));
  const brief = cards.length
    ? `<section class="seo-tw-lg-brief" aria-label="${escapeHtml(briefLabel(loc))}"><h2>${escapeHtml(briefLabel(loc))}</h2><div class="seo-tw-lg-cards">${cards
        .map((c) => `<a class="seo-tw-lg-card" href="#${c.id}"><span>${escapeHtml(c.label)}</span><strong>${escapeHtml(c.heading)}</strong><em>${escapeHtml(c.excerpt)}</em></a>`)
        .join("")}</div></section>`
    : "";
  const toc = sections
    .map((s, i) => `<li><a href="#${ids[i]}"${ids[i] === current ? ' class="is-current" aria-current="location"' : ""}>${escapeHtml(s.heading)}</a></li>`)
    .join("");
  const options = sections.map((s, i) => `<option value="${ids[i]}"${ids[i] === current ? " selected" : ""}>${escapeHtml(s.heading)}</option>`).join("");
  const body = sections
    .map((s, i) => {
      const rights = isRightsHeading(s.heading, i, enData);
      const ps = (s.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join("");
      return `<section id="${ids[i]}" class="seo-tw-lg-sec${rights ? " is-rights" : ""}"><h2><svg class="seo-tw-lg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${LEGAL_ICONS[i % LEGAL_ICONS.length]}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${escapeHtml(s.heading)}</span></h2>${rights ? `<div class="seo-tw-lg-rights">${ps}</div>` : ps}</section>`;
    })
    .join("\n    ");
  return `<article class="seo-tw-legal">
  <div class="seo-tw-lg-hero"><div><p class="seo-tw-lg-kicker">Descall</p><h1>${escapeHtml(data.title)}</h1><p class="seo-tw-lg-updated">${escapeHtml(data.updated)}</p></div></div>
  <p class="seo-tw-lg-intro">${escapeHtml(data.intro)}</p>
  ${brief}
  <div class="seo-tw-lg-layout">
    <nav class="seo-tw-lg-toc" aria-label="${escapeHtml(tocLabel(loc))}"><p>${escapeHtml(tocLabel(loc))}</p><ol>${toc}</ol></nav>
    <label class="seo-tw-lg-jump"><span>${escapeHtml(jumpLabel(loc))}</span><select>${options}</select></label>
    <div class="seo-tw-lg-main">
    ${body}
    <section class="seo-tw-lg-contact" id="legal-contact"><h2>${escapeHtml(contact.heading)}</h2><p>${contact.before ? `${escapeHtml(contact.before)} ` : ""}<a href="mailto:${LEGAL_EMAIL}">${LEGAL_EMAIL}</a>${escapeHtml(contact.after)}</p></section>
    </div>
  </div>
</article>`;
}

/** Twin kind of an English page path, or null. */
export function twinKind(bare) {
  if (bare === "/features") return "features";
  if (bare === "/faq") return "faq";
  if (bare === "/download") return "download";
  if (bare === "/status") return "status";
  if (bare === "/privacy" || bare === "/terms" || bare === "/copyright") return "legal";
  return null;
}

