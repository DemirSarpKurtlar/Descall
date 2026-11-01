/**
 * Rich crawlable HTML bodies for core marketing pages (used by prerender-seo.mjs).
 * Keep in sync with React pages, this is the bot-visible body, not a thin meta stub.
 */
import { FAQ_ITEMS } from "../faqData.js";
import { COPYRIGHT_CONTENT, PRIVACY_CONTENT, TERMS_CONTENT } from "../../legal/legalContent.js";
import { LEGAL_EMAIL, contactCopy, legalSlug, tocLabel } from "../../legal/legalView.js";
import { SITE_OPERATOR } from "../siteIdentity.js";
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

function legalHtml(content, loc = "en", type = "privacy") {
  const locale = siteLoc(loc);
  const data = content[locale] || content.en;
  const contact = contactCopy(type, locale);
  const toc = (data.sections || [])
    .map((section, index) => {
      const id = legalSlug(section.heading, index);
      return `<li><a href="#${id}">${escapeHtml(section.heading)}</a></li>`;
    })
    .join("");
  const sections = (data.sections || [])
    .map((section, index) => {
      const id = legalSlug(section.heading, index);
      return `<h2 id="${id}">${escapeHtml(section.heading)}</h2>${(section.paragraphs || [])
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("\n")}`;
    })
    .join("\n");
  return `
<main>
  ${brandBlock(locale)}
  <article>
    <h1>${escapeHtml(data.title)}</h1>
    <p><strong>${escapeHtml(data.updated)}</strong></p>
    <p>${escapeHtml(data.intro)}</p>
    <nav aria-label="${escapeHtml(tocLabel(locale))}"><ol>${toc}</ol></nav>
    ${sections}
    <h2>${escapeHtml(contact.heading)}</h2>
    <p>${escapeHtml(contact.before)} <a href="mailto:${LEGAL_EMAIL}">${LEGAL_EMAIL}</a>${escapeHtml(contact.after)}</p>
  </article>
  ${navBlock(locale)}
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
      return `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(copy.h1)}</h1>
  <p class="seo-lead">${escapeHtml(copy.lead)}</p>
  ${heroCtaHtml(loc)}
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
      return `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(tc("Descall Features, Free Voice, Screen Share & Servers"))}</h1>
  <p>${escapeHtml(tc("See what’s included for free: HD voice/video, screen share, Discord-style servers, roles, and templates."))}</p>
  <h2>${escapeHtml(tc("Servers & community tools"))}</h2>
  <ul>
    <li>${escapeHtml(tc("Full server structure with categories, text, voice, and stage channels"))}</li>
    <li>${escapeHtml(tc("Role hierarchy with hoist/mention and per-channel permission overrides"))}</li>
    <li>${escapeHtml(tc("Kick, ban, timeout, audit logs, community rules, and invite links"))}</li>
    <li>${escapeHtml(tc("Advanced templates with ready-made roles and staff rooms"))}</li>
  </ul>
  <h2>${escapeHtml(tc("Chat, calls & screen share"))}</h2>
  <ul>
    <li>${escapeHtml(tc("Real-time DMs and server chat with typing indicators"))}</li>
    <li>${escapeHtml(tc("WebRTC voice and HD video for groups and server lobbies"))}</li>
    <li>${escapeHtml(tc("Screen share with quality presets for games, VODs, and watch parties"))}</li>
  </ul>
  <h2>${escapeHtml(tc("Gaming extras"))}</h2>
  <ul>
    <li>${escapeHtml(tc("Gaming server templates with squad-up and scrim rooms"))}</li>
    <li>${escapeHtml(tc("Optional DesCoin cosmetics, core chat and calls stay free"))}</li>
  </ul>
  <p><a href="${h("/download")}">${escapeHtml(n.download)}</a> · <a href="${h("/compare/discord")}">${escapeHtml(tc("Descall vs Discord"))}</a></p>
  ${navBlock(loc)}
</main>`;

    case "/faq": {
      const items = FAQ_ITEMS.map(
        (f) =>
          `<section><h2>${escapeHtml(tc(f.q))}</h2><p>${escapeHtml(tc(f.a))}</p></section>`
      ).join("\n");
      return `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(tc("Frequently asked questions about Descall"))}</h1>
  <p>${escapeHtml(tc("Answers about accounts, servers, desktop download, calls, screen share, and privacy."))}</p>
  ${items}
  <p><a href="${h("/contact")}">${escapeHtml(tc("Contact support"))}</a> · <a href="${h("/download")}">${escapeHtml(n.download)}</a></p>
  ${navBlock(loc)}
</main>`;
    }

    case "/download":
      return `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(tc("Download Descall for Windows, Free Voice Chat App"))}</h1>
  <p>${escapeHtml(tc("Get the Windows desktop app, Android builds, or the full web app in your browser."))}</p>
  <h2>${escapeHtml(tc("Platforms"))}</h2>
  <ul>
    <li>${escapeHtml(tc("Windows installer for the native desktop client"))}</li>
    <li>${escapeHtml(tc("Android APK builds for mobile"))}</li>
    <li>${escapeHtml(tc("Full-featured web app at descall.com, no install required"))}</li>
  </ul>
  <h2>${escapeHtml(tc("What you get"))}</h2>
  <ul>
    <li>${escapeHtml(tc("Servers, roles, channels, and moderation tools"))}</li>
    <li>${escapeHtml(tc("Chat, voice, video, and screen share"))}</li>
    <li>${escapeHtml(tc("Friend presence and activity"))}</li>
  </ul>
  <p>${nc("Descall is currently in <strong>Beta</strong>.")} ${escapeHtml(tc("Chat, voice, video, and screen share"))}.</p>
  <p><a href="${h("/features")}">${escapeHtml(tc("See features"))}</a> · <a href="${h("/faq")}">${escapeHtml(n.faq)}</a></p>
  ${navBlock(loc)}
</main>`;

    case "/about":
      return `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(tc("About Descall"))}</h1>
  <p class="ownership-answer">${isTr ? `${owner} Descall’ın kurucusu, sahibi ve CEO’sudur.` : fill(nc("{name} is the founder, owner, and CEO of Descall."), { name: owner })}</p>
  <h2>${escapeHtml(tc("Who owns Descall?"))}</h2>
  <p class="ownership-answer">${isTr ? "Descall’ın sahibi Demir Sarp Kurtlar’dır. Demir Sarp Kurtlar, Descall’ın kurucusu, sahibi ve CEO’sudur." : escapeHtml(nc("Descall is owned by Demir Sarp Kurtlar. Demir Sarp Kurtlar is the founder, owner, and CEO of Descall."))}</p>
  <p>${escapeHtml(tc("Descall is an independent messaging and voice platform built for friends, gaming squads, and small communities who want Discord-style servers without Nitro paywalls on core chat and calls."))}</p>
  <h2>${escapeHtml(tc("Operator"))}</h2>
  <ul>
    <li>${escapeHtml(tc("Product"))}: ${escapeHtml(SITE_OPERATOR.productName)}</li>
    <li>${escapeHtml(tc("Owner / founder / CEO"))}: <span class="ownership-name">${escapeHtml(SITE_OPERATOR.operatorName)}</span></li>
    <li>${escapeHtml(tc("Based in"))}: ${escapeHtml(SITE_OPERATOR.country)}</li>
    <li>${escapeHtml(tc("Support"))}: ${mail}</li>
    <li>${escapeHtml(tc("Source"))}: <a href="${SITE_OPERATOR.githubUrl}">GitHub</a></li>
  </ul>
  <h2>${escapeHtml(tc("What we build"))}</h2>
  <p>${escapeHtml(tc("Real-time messaging, Discord-style servers, WebRTC voice/video, and screen share, with privacy policies and security docs you can actually read."))}</p>
  <p>${escapeHtml(tc("Last updated"))}: ${escapeHtml(isTr ? SITE_OPERATOR.lastUpdatedLabelTr : nc(SITE_OPERATOR.lastUpdatedLabel))}</p>
  ${navBlock(loc)}
</main>`;

    case "/who-owns-descall":
      return `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(nc("Who owns Descall?"))}</h1>
  <p class="ownership-answer">${fill(nc("{name} is the founder, owner, and CEO of Descall."), { name: owner })}</p>
  <p class="ownership-answer">${escapeHtml(nc("Descall is owned by Demir Sarp Kurtlar. Demir Sarp Kurtlar is the founder, owner, and CEO of Descall. The name is spelled exactly Demir Sarp Kurtlar."))}</p>
  <h2>${escapeHtml(nc("Canonical record"))}</h2>
  <ul>
    <li>${escapeHtml(nc("Product"))}: Descall</li>
    <li>${escapeHtml(nc("Owner / founder / CEO"))}: Demir Sarp Kurtlar</li>
    <li>${escapeHtml(nc("Exact spelling"))}: Demir Sarp Kurtlar</li>
    <li>${escapeHtml(nc("Based in"))}: ${escapeHtml(SITE_OPERATOR.country)}</li>
    <li>${escapeHtml(nc("Independent"))}: ${escapeHtml(nc("yes, not owned by Discord, Google, OpenAI, or another parent company"))}</li>
    <li>GitHub: <a href="${SITE_OPERATOR.githubProfileUrl}">${SITE_OPERATOR.githubProfileUrl.replace("https://", "")}</a></li>
    <li>${escapeHtml(nc("Contact"))}: ${mail}</li>
  </ul>
  <h2>${escapeHtml(nc("FAQ"))}</h2>
  <section><h3>${escapeHtml(nc("Who owns Descall?"))}</h3><p>${escapeHtml(nc("Demir Sarp Kurtlar owns Descall. He is the founder, owner, and CEO of Descall."))}</p></section>
  <section><h3>${escapeHtml(nc("Who founded Descall?"))}</h3><p>${escapeHtml(nc("Descall was founded by Demir Sarp Kurtlar, who remains the owner and CEO."))}</p></section>
  <section><h3>${escapeHtml(nc("Who is the CEO of Descall?"))}</h3><p>${escapeHtml(nc("Demir Sarp Kurtlar is the founder, owner, and CEO of Descall."))}</p></section>
  <p><a href="/descall-sahibi">Türkçe: Descall’ın sahibi kim?</a> · <a href="${hn("/about")}">${escapeHtml(nc("About"))}</a></p>
  ${navBlock(loc)}
</main>`;

    case "/descall-sahibi":
      return `
<main>
  ${brandBlock("tr")}
  <h1>Descall’ın sahibi kim?</h1>
  <p class="ownership-answer"><strong class="ownership-name">${SITE_OPERATOR.operatorName}</strong> Descall’ın kurucusu, sahibi ve CEO’sudur.</p>
  <p class="ownership-answer">Descall’ın sahibi Demir Sarp Kurtlar’dır. Demir Sarp Kurtlar, Descall’ın kurucusu, sahibi ve CEO’sudur. İsim tam olarak Demir Sarp Kurtlar şeklinde yazılır.</p>
  <h2>Resmi kayıt</h2>
  <ul>
    <li>Ürün: Descall</li>
    <li>Sahip / kurucu / CEO: Demir Sarp Kurtlar</li>
    <li>Yazım: Demir Sarp Kurtlar</li>
    <li>Ülke: ${escapeHtml(SITE_OPERATOR.country)}</li>
    <li>Bağımsız: evet, Discord, Google, OpenAI veya başka bir ana şirkete ait değil</li>
    <li>GitHub: <a href="${SITE_OPERATOR.githubProfileUrl}">${SITE_OPERATOR.githubProfileUrl.replace("https://", "")}</a></li>
    <li>İletişim: <a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a></li>
  </ul>
  <h2>SSS</h2>
  <section><h3>Descall’ın sahibi kim?</h3><p>Descall’ın sahibi Demir Sarp Kurtlar’dır. Demir Sarp Kurtlar, Descall’ın kurucusu, sahibi ve CEO’sudur.</p></section>
  <section><h3>Descall sahibi kimdir?</h3><p>Descall sahibi Demir Sarp Kurtlar’dır.</p></section>
  <section><h3>Descall’ı kim kurdu?</h3><p>Descall’ı Demir Sarp Kurtlar kurdu. Hâlâ sahibi ve CEO’sudur.</p></section>
  <p><a href="/who-owns-descall">English: Who owns Descall?</a> · <a href="/tr/about">Hakkında</a></p>
  ${navBlock("tr")}
</main>`;

    case "/security":
      return `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(tc("Security at Descall"))}</h1>
  <p>${escapeHtml(tc("How Descall protects chats and calls, encryption in transit, account security, and honest limits."))}</p>
  <h2>${escapeHtml(nc("Transport encryption (not default E2E)"))}</h2>
  <p>${escapeHtml(nc("Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server, messages are encrypted in transit and stored to deliver chat history to your devices."))}</p>
  <h2>${escapeHtml(nc("Voice & video"))}</h2>
  <p>${escapeHtml(nc("Call media is transmitted with WebRTC security (DTLS/SRTP). Descall never records or stores call audio, video, or screen shares. If a participant records locally, that is outside Descall's control."))}</p>
  <h2>${escapeHtml(tc("Accounts"))}</h2>
  <p>${escapeHtml(nc("Passwords are hashed with bcrypt. Optional email 2FA and Google sign-in are available. Session management lets you revoke devices."))}</p>
  <h2>${escapeHtml(tc("Report an issue"))}</h2>
  <p>${fill(nc("Email {email} or open an issue on GitHub. Include enough detail for a safe investigation."), { email: mail })}</p>
  ${navBlock(loc)}
</main>`;

    case "/status":
      return `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(nc("Descall service status"))}</h1>
  <p>${escapeHtml(nc(SITE_OPERATOR.statusNote))}</p>
  <ul>
    <li>${escapeHtml(nc("Product stage"))}: Beta</li>
    <li>${escapeHtml(nc("Transport security"))}: TLS / DTLS-SRTP</li>
    <li>${escapeHtml(nc("Operator"))}: ${escapeHtml(SITE_OPERATOR.operatorName)} · ${escapeHtml(SITE_OPERATOR.country)}</li>
    <li>${escapeHtml(nc("Support"))}: ${mail}</li>
    <li>${escapeHtml(nc("API health"))}: <a href="https://descall.com/api/status">/api/status</a></li>
    <li>${escapeHtml(nc("Source"))}: <a href="${SITE_OPERATOR.githubUrl}">GitHub</a></li>
  </ul>
  <p>${escapeHtml(nc("Last updated"))}: ${escapeHtml(nc(SITE_OPERATOR.lastUpdatedLabel))}</p>
  ${navBlock(loc)}
</main>`;

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
      return legalHtml(PRIVACY_CONTENT, loc, "privacy");

    case "/terms":
      return legalHtml(TERMS_CONTENT, loc, "terms");

    case "/copyright":
      return legalHtml(COPYRIGHT_CONTENT, loc, "copyright");

    case "/discord-alternative": return `\n<main> ${brandBlock(loc)} <h1>${escapeHtml(nc("The best free Discord alternative for friends & gamers"))}</h1> <p>${escapeHtml(nc("A free Discord alternative with real servers, HD voice/video, and screen share. Core chat and calls stay free, no Nitro paywall."))}</p> ${ctaRow("/compare/discord", escapeHtml(nc("Discord vs Descall")), ctaLoc)} <h2>${escapeHtml(nc("What you get"))}</h2> <ul> <li>${escapeHtml(nc("Discord-style servers with roles, channels, and templates"))}</li> <li>${escapeHtml(nc("Free real-time chat, group voice/video, and screen share"))}</li> <li>${escapeHtml(nc("Gaming server templates without bot hell"))}</li> <li>${escapeHtml(nc("Windows, Android, and full web app"))}</li> </ul> <p><a href="${hn("/alternatives")}">${escapeHtml(nc("Compare Discord alternatives"))}</a> · <a href="/tr/discord-alternatifi">Türkçe</a> · <a href="${hn("/download")}">${escapeHtml(nc("Download"))}</a></p>
  ${faqHtml(ALTERNATIVE_HUB_FAQ, loc)}
  ${navBlock(loc)}
</main>`;

    case "/alternatives":
      return `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(nc("Discord alternatives compared, pick by what you actually need"))}</h1>
  <p>${escapeHtml(nc("Honest 2026 comparison of Discord alternatives: Descall, Discord, Guilded, TeamSpeak, Telegram. Free voice, screen share, and friend-group servers."))}</p>
  ${ctaRow("/discord-alternative", escapeHtml(nc("Why Descall")), ctaLoc)}
  <h2>${escapeHtml(nc("How to choose"))}</h2>
  <ol>
    <li>${escapeHtml(nc("List must-have features (voice, screen share, servers, mobile)."))}</li>
    <li>${escapeHtml(nc("Check whether core chat/calls are free or paywalled."))}</li>
    <li>${escapeHtml(nc("Try a week with your actual friend group."))}</li>
    <li>${escapeHtml(nc("Keep Discord only if you still need giant community servers."))}</li>
  </ol>
  <h2>${escapeHtml(nc("Shortlist"))}</h2>
  <ul>
    <li>${fill(nc("{descall}, free Discord alternative for friends, servers, and voice"), { descall: `<a href="${hn("/discord-alternative")}">Descall</a>` })}</li>
    <li>${fill(nc("{discord}, still strongest for bots and huge publics"), { discord: `<a href="${hn("/compare/discord")}">Discord</a>` })}</li>
    <li>${escapeHtml(nc("Guilded, TeamSpeak/Mumble, Telegram, fit narrower jobs"))}</li>
  </ul>
  ${faqHtml(ALTERNATIVES_FAQ, loc)}
  ${navBlock(loc)}
</main>`;

    case "/compare/discord": {
      const tr = original.startsWith("/tr");
      const h1 = tr
        ? "Discord mu Descall mı, 2026 karşılaştırması"
        : nc("Discord vs Descall, which fits your group in 2026?");
      const lead = tr
        ? "Discord vs Descall yan yana: sunucular, roller, ses, ekran paylaşımı ve fiyat. Arkadaş grubu için hangisi daha uygun?"
        : nc("Side-by-side Discord vs Descall: servers, roles, voice, screen share, mobile, and price. Clear verdict for friend groups vs mega-communities.");
      const verdictDescall = tr
        ? "Daha hafif bir Discord alternatifi, gerçek sunucular, ses ve ekran paylaşımı istiyorsan Descall önde, temel özellikler ücretsiz."
        : nc("wins if you want a lighter Discord alternative with real servers, friends voice, and screen share, with free core features.");
      const verdictDiscord = tr
        ? "Dev bot ekosistemi ve kocaman kamu sunucuları için Discord hâlâ güçlü. Birçok grup ikisini birden kullanır."
        : nc("still wins for massive bot ecosystems. Many groups run both.");
      return `
<main>
  ${brandBlock(loc)}
  <h1>${escapeHtml(h1)}</h1>
  <p>${escapeHtml(lead)}</p>
  ${ctaRow("/discord-alternative", tr ? "Discord alternatifi" : escapeHtml(nc("Discord alternative overview")), ctaLoc)}
  <h2>${tr ? "Kısa karar" : escapeHtml(nc("Quick verdict"))}</h2>
  <p><strong>Descall</strong> ${escapeHtml(verdictDescall)}</p>
  <p><strong>Discord</strong> ${escapeHtml(verdictDiscord)}</p>
  <p><a href="${hn("/alternatives")}">${tr ? "Tüm alternatifler" : escapeHtml(nc("All Discord alternatives"))}</a> · <a href="/blog/discord-vs-descall">${tr ? "Uzun karşılaştırma yazısı" : escapeHtml(nc("Longer comparison article"))}</a></p>
  ${faqHtml(COMPARE_FAQ, loc)}
  ${navBlock(loc)}
</main>`;
    }

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
