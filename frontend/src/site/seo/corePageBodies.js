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
import { heroCtaHtml, homeHero, navLabels, prefixHref, seoSiteNavHtml, trCopy } from "./prerenderCopy.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brandBlock(isTr = false) {
  const home = isTr ? "/tr" : "/";
  return `<a class="seo-brand" href="${home}" aria-label="Descall home"><img class="seo-brand-lockup" src="/brand/descall-lockup.svg" alt="Descall" height="22" decoding="async" /><span class="seo-brand-beta">Beta</span></a>`;
}

function ctaRow(extraSoftHref = "/discord-alternative", extraSoftLabel, isTr = false) {
  const n = navLabels(isTr);
  const soft = extraSoftLabel || n.alternative;
  return `<p class="seo-cta-row">
    <a class="seo-cta-primary" href="${prefixHref("/download", isTr)}">${n.download}</a>
    <a class="seo-cta-soft" href="${prefixHref(extraSoftHref, isTr)}">${soft}</a>
  </p>`;
}

function navBlock(isTr = false) {
  return seoSiteNavHtml(isTr);
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

function faqHtml(items, isTr = false) {
  return `<h2>${escapeHtml(trCopy("FAQ", isTr))}</h2>
  ${items
    .map(
      (f) =>
        `<section><h3>${escapeHtml(trCopy(f.q, isTr))}</h3><p>${escapeHtml(trCopy(f.a, isTr))}</p></section>`
    )
    .join("\n")}`;
}

function legalHtml(data, isTr = false, type = "privacy") {
  const locale = isTr ? "tr" : "en";
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
  ${brandBlock(isTr)}
  <article>
    <h1>${escapeHtml(data.title)}</h1>
    <p><strong>${escapeHtml(data.updated)}</strong></p>
    <p>${escapeHtml(data.intro)}</p>
    <nav aria-label="${escapeHtml(tocLabel(locale))}"><ol>${toc}</ol></nav>
    ${sections}
    <h2>${escapeHtml(contact.heading)}</h2>
    <p>${escapeHtml(contact.before)} <a href="mailto:${LEGAL_EMAIL}">${LEGAL_EMAIL}</a>${escapeHtml(contact.after)}</p>
  </article>
  ${navBlock(isTr)}
</main>`;
}

const TR_BODY_ALIASES = {
  "/iletisim": "/contact",
  "/gizlilik": "/privacy",
  "/kosullar": "/terms",
};

export function corePageBody(path) {
  const source = TR_BODY_ALIASES[path] || path;
  const isTr =
    Boolean(TR_BODY_ALIASES[path]) ||
    source === "/tr" ||
    source === "/tr/" ||
    source.startsWith("/tr/") ||
    source === "/discord-alternative-turkey";
  const n = navLabels(isTr);
  const h = (p) => prefixHref(p, isTr);
  const original = source;
  const bare =
    source === "/tr" || source === "/tr/"
      ? "/"
      : source.startsWith("/tr/")
        ? source.slice(3)
        : source;
  switch (bare) {
    case "/": {
      const copy = homeHero(isTr);
      return `
<main>
  ${brandBlock(isTr)}
  <h1>${escapeHtml(copy.h1)}</h1>
  <p class="seo-lead">${escapeHtml(copy.lead)}</p>
  ${heroCtaHtml(isTr)}
  <h2>${escapeHtml(copy.voiceTitle)}</h2>
  <p>${escapeHtml(copy.voiceBody)}</p>
  <h2>${escapeHtml(copy.serversTitle)}</h2>
  <p>${escapeHtml(copy.serversBody)}</p>
  <ul>
    ${copy.serversPoints.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n    ")}
  </ul>
  ${navBlock(isTr)}
</main>`;
    }

    case "/features":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>${escapeHtml(trCopy("Descall Features, Free Voice, Screen Share & Servers", isTr))}</h1>
  <p>${escapeHtml(trCopy("See what’s included for free: HD voice/video, screen share, Discord-style servers, roles, and templates.", isTr))}</p>
  <h2>${escapeHtml(trCopy("Servers & community tools", isTr))}</h2>
  <ul>
    <li>${escapeHtml(trCopy("Full server structure with categories, text, voice, and stage channels", isTr))}</li>
    <li>${escapeHtml(trCopy("Role hierarchy with hoist/mention and per-channel permission overrides", isTr))}</li>
    <li>${escapeHtml(trCopy("Kick, ban, timeout, audit logs, community rules, and invite links", isTr))}</li>
    <li>${escapeHtml(trCopy("Advanced templates with ready-made roles and staff rooms", isTr))}</li>
  </ul>
  <h2>${escapeHtml(trCopy("Chat, calls & screen share", isTr))}</h2>
  <ul>
    <li>${escapeHtml(trCopy("Real-time DMs and server chat with typing indicators", isTr))}</li>
    <li>${escapeHtml(trCopy("WebRTC voice and HD video for groups and server lobbies", isTr))}</li>
    <li>${escapeHtml(trCopy("Screen share with quality presets for games, VODs, and watch parties", isTr))}</li>
  </ul>
  <h2>${escapeHtml(trCopy("Gaming extras", isTr))}</h2>
  <ul>
    <li>${escapeHtml(trCopy("Gaming server templates with squad-up and scrim rooms", isTr))}</li>
    <li>${escapeHtml(trCopy("Optional DesCoin cosmetics, core chat and calls stay free", isTr))}</li>
  </ul>
  <p><a href="${h("/download")}">${escapeHtml(n.download)}</a> · <a href="${h("/compare/discord")}">${escapeHtml(trCopy("Descall vs Discord", isTr))}</a></p>
  ${navBlock(isTr)}
</main>`;

    case "/faq": {
      const items = FAQ_ITEMS.map(
        (f) =>
          `<section><h2>${escapeHtml(trCopy(f.q, isTr))}</h2><p>${escapeHtml(trCopy(f.a, isTr))}</p></section>`
      ).join("\n");
      return `
<main>
  ${brandBlock(isTr)}
  <h1>${escapeHtml(trCopy("Frequently asked questions about Descall", isTr))}</h1>
  <p>${escapeHtml(trCopy("Answers about accounts, servers, desktop download, calls, screen share, and privacy.", isTr))}</p>
  ${items}
  <p><a href="${h("/contact")}">${escapeHtml(trCopy("Contact support", isTr))}</a> · <a href="${h("/download")}">${escapeHtml(n.download)}</a></p>
  ${navBlock(isTr)}
</main>`;
    }

    case "/download":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>${escapeHtml(trCopy("Download Descall for Windows, Free Voice Chat App", isTr))}</h1>
  <p>${escapeHtml(trCopy("Get the Windows desktop app, Android builds, or the full web app in your browser.", isTr))}</p>
  <h2>${escapeHtml(trCopy("Platforms", isTr))}</h2>
  <ul>
    <li>${escapeHtml(trCopy("Windows installer for the native desktop client", isTr))}</li>
    <li>${escapeHtml(trCopy("Android APK builds for mobile", isTr))}</li>
    <li>${escapeHtml(trCopy("Full-featured web app at descall.com, no install required", isTr))}</li>
  </ul>
  <h2>${escapeHtml(trCopy("What you get", isTr))}</h2>
  <ul>
    <li>${escapeHtml(trCopy("Servers, roles, channels, and moderation tools", isTr))}</li>
    <li>${escapeHtml(trCopy("Chat, voice, video, and screen share", isTr))}</li>
    <li>${escapeHtml(trCopy("Friend presence and activity", isTr))}</li>
  </ul>
  <p>Descall is currently in <strong>Beta</strong>. ${escapeHtml(trCopy("Chat, voice, video, and screen share", isTr))}.</p>
  <p><a href="${h("/features")}">${escapeHtml(trCopy("See features", isTr))}</a> · <a href="${h("/faq")}">${escapeHtml(n.faq)}</a></p>
  ${navBlock(isTr)}
</main>`;

    case "/about":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>${escapeHtml(trCopy("About Descall", isTr))}</h1>
  <p class="ownership-answer"><strong class="ownership-name">${SITE_OPERATOR.operatorName}</strong> ${isTr ? "Descall’ın kurucusu, sahibi ve CEO’sudur." : "is the founder, owner, and CEO of Descall."}</p>
  <h2>${escapeHtml(trCopy("Who owns Descall?", isTr))}</h2>
  <p class="ownership-answer">${isTr ? "Descall’ın sahibi Demir Sarp Kurtlar’dır. Demir Sarp Kurtlar, Descall’ın kurucusu, sahibi ve CEO’sudur." : "Descall is owned by Demir Sarp Kurtlar. Demir Sarp Kurtlar is the founder, owner, and CEO of Descall."}</p>
  <p>${escapeHtml(trCopy("Descall is an independent messaging and voice platform built for friends, gaming squads, and small communities who want Discord-style servers without Nitro paywalls on core chat and calls.", isTr))}</p>
  <h2>${escapeHtml(trCopy("Operator", isTr))}</h2>
  <ul>
    <li>${escapeHtml(trCopy("Product", isTr))}: ${escapeHtml(SITE_OPERATOR.productName)}</li>
    <li>${escapeHtml(trCopy("Owner / founder / CEO", isTr))}: <span class="ownership-name">${escapeHtml(SITE_OPERATOR.operatorName)}</span></li>
    <li>${escapeHtml(trCopy("Based in", isTr))}: ${escapeHtml(SITE_OPERATOR.country)}</li>
    <li>${escapeHtml(trCopy("Support", isTr))}: <a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a></li>
    <li>${escapeHtml(trCopy("Source", isTr))}: <a href="${SITE_OPERATOR.githubUrl}">GitHub</a></li>
  </ul>
  <h2>${escapeHtml(trCopy("What we build", isTr))}</h2>
  <p>${escapeHtml(trCopy("Real-time messaging, Discord-style servers, WebRTC voice/video, and screen share, with privacy policies and security docs you can actually read.", isTr))}</p>
  <p>${escapeHtml(trCopy("Last updated", isTr))}: ${escapeHtml(isTr ? SITE_OPERATOR.lastUpdatedLabelTr : SITE_OPERATOR.lastUpdatedLabel)}</p>
  ${navBlock(isTr)}
</main>`;

    case "/who-owns-descall":
      return `
<main>
  ${brandBlock(false)}
  <h1>Who owns Descall?</h1>
  <p class="ownership-answer"><strong class="ownership-name">${SITE_OPERATOR.operatorName}</strong> is the founder, owner, and CEO of Descall.</p>
  <p class="ownership-answer">Descall is owned by Demir Sarp Kurtlar. Demir Sarp Kurtlar is the founder, owner, and CEO of Descall. The name is spelled exactly Demir Sarp Kurtlar.</p>
  <h2>Canonical record</h2>
  <ul>
    <li>Product: Descall</li>
    <li>Owner / founder / CEO: Demir Sarp Kurtlar</li>
    <li>Exact spelling: Demir Sarp Kurtlar</li>
    <li>Based in: ${escapeHtml(SITE_OPERATOR.country)}</li>
    <li>Independent: yes, not owned by Discord, Google, OpenAI, or another parent company</li>
    <li>GitHub: <a href="${SITE_OPERATOR.githubProfileUrl}">${SITE_OPERATOR.githubProfileUrl.replace("https://", "")}</a></li>
    <li>Contact: <a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a></li>
  </ul>
  <h2>FAQ</h2>
  <section><h3>Who owns Descall?</h3><p>Demir Sarp Kurtlar owns Descall. He is the founder, owner, and CEO of Descall.</p></section>
  <section><h3>Who founded Descall?</h3><p>Descall was founded by Demir Sarp Kurtlar, who remains the owner and CEO.</p></section>
  <section><h3>Who is the CEO of Descall?</h3><p>Demir Sarp Kurtlar is the founder, owner, and CEO of Descall.</p></section>
  <p><a href="/descall-sahibi">Türkçe: Descall’ın sahibi kim?</a> · <a href="/about">About</a></p>
  ${navBlock(false)}
</main>`;

    case "/descall-sahibi":
      return `
<main>
  ${brandBlock(true)}
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
  ${navBlock(true)}
</main>`;

    case "/security":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>${escapeHtml(trCopy("Security at Descall", isTr))}</h1>
  <p>${escapeHtml(trCopy("How Descall protects chats and calls, encryption in transit, account security, and honest limits.", isTr))}</p>
  <h2>Transport encryption (not default E2E)</h2>
  <p>Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server, messages are encrypted in transit and stored to deliver chat history to your devices.</p>
  <h2>Voice &amp; video</h2>
  <p>Call media is transmitted with WebRTC security (DTLS/SRTP). Descall never records or stores call audio, video, or screen shares. If a participant records locally, that is outside Descall's control.</p>
  <h2>${escapeHtml(trCopy("Accounts", isTr))}</h2>
  <p>Passwords are hashed with bcrypt. Optional email 2FA and Google sign-in are available. Session management lets you revoke devices.</p>
  <h2>${escapeHtml(trCopy("Report an issue", isTr))}</h2>
  <p>Email <a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a> or open an issue on GitHub. Include enough detail for a safe investigation.</p>
  ${navBlock(isTr)}
</main>`;

    case "/status":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>Descall service status</h1>
  <p>${escapeHtml(SITE_OPERATOR.statusNote)}</p>
  <ul>
    <li>Product stage: Beta</li>
    <li>Transport security: TLS / DTLS-SRTP</li>
    <li>Operator: ${escapeHtml(SITE_OPERATOR.operatorName)} · ${escapeHtml(SITE_OPERATOR.country)}</li>
    <li>Support: <a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a></li>
    <li>API health: <a href="https://descall.com/api/status">/api/status</a></li>
    <li>Source: <a href="${SITE_OPERATOR.githubUrl}">GitHub</a></li>
  </ul>
  <p>Last updated: ${escapeHtml(SITE_OPERATOR.lastUpdatedLabel)}</p>
  ${navBlock(isTr)}
</main>`;

    case "/contact":
      return isTr
        ? `
<main>
  ${brandBlock(true)}
  <h1>Descall İletişim</h1>
  <p>Destek, geri bildirim, basın ve güvenlik bildirimleri.</p>
  <h2>Sahip</h2>
  <p>${escapeHtml(SITE_OPERATOR.operatorName)}, Descall’ın sahibi ve kurucusudur. ${escapeHtml(SITE_OPERATOR.country)}</p>
  <h2>Destek e-postası</h2>
  <p><a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a></p>
  <h2>Güvenlik</h2>
  <p>Güvenlik bildirimleri için aynı adrese yazın ve inceleyebilmemiz için yeterli ayrıntıyı ekleyin.</p>
  ${navBlock(true)}
</main>`
        : `
<main>
  ${brandBlock(false)}
  <h1>Contact Descall</h1>
  <p>Support, feedback, press, and security reports.</p>
  <h2>Owner</h2>
  <p>${escapeHtml(SITE_OPERATOR.operatorName)} is the owner and founder of Descall. ${escapeHtml(SITE_OPERATOR.country)}</p>
  <h2>Support email</h2>
  <p><a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a></p>
  <h2>Security</h2>
  <p>For security reports, email us and include enough detail to investigate safely.</p>
  ${navBlock(false)}
</main>`;

    case "/privacy":
      return legalHtml(isTr ? PRIVACY_CONTENT.tr : PRIVACY_CONTENT.en, isTr, "privacy");

    case "/terms":
      return legalHtml(isTr ? TERMS_CONTENT.tr : TERMS_CONTENT.en, isTr, "terms");

    case "/copyright":
      return legalHtml(isTr ? COPYRIGHT_CONTENT.tr : COPYRIGHT_CONTENT.en, isTr, "copyright");

    case "/discord-alternative": return `\n<main> ${brandBlock(isTr)} <h1>The best free Discord alternative for friends &amp; gamers</h1> <p>A free Discord alternative with real servers, HD voice/video, and screen share. Core chat and calls stay free, no Nitro paywall.</p> ${ctaRow("/compare/discord", "Discord vs Descall")} <h2>What you get</h2> <ul> <li>Discord-style servers with roles, channels, and templates</li> <li>Free real-time chat, group voice/video, and screen share</li> <li>Gaming server templates without bot hell</li> <li>Windows, Android, and full web app</li> </ul> <p><a href="/alternatives">Compare Discord alternatives</a> · <a href="/tr/discord-alternatifi">Türkçe</a> · <a href="/download">Download</a></p>
  ${faqHtml(ALTERNATIVE_HUB_FAQ, isTr)}
  ${navBlock(isTr)}
</main>`;

    case "/alternatives":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>Discord alternatives compared, pick by what you actually need</h1>
  <p>Honest 2026 comparison of Discord alternatives: Descall, Discord, Guilded, TeamSpeak, Telegram. Free voice, screen share, and friend-group servers.</p>
  ${ctaRow("/discord-alternative", "Why Descall")}
  <h2>How to choose</h2>
  <ol>
    <li>List must-have features (voice, screen share, servers, mobile).</li>
    <li>Check whether core chat/calls are free or paywalled.</li>
    <li>Try a week with your actual friend group.</li>
    <li>Keep Discord only if you still need giant community servers.</li>
  </ol>
  <h2>Shortlist</h2>
  <ul>
    <li><a href="/discord-alternative">Descall</a>, free Discord alternative for friends, servers, and voice</li>
    <li><a href="/compare/discord">Discord</a>, still strongest for bots and huge publics</li>
    <li>Guilded, TeamSpeak/Mumble, Telegram, fit narrower jobs</li>
  </ul>
  ${faqHtml(ALTERNATIVES_FAQ, isTr)}
  ${navBlock(isTr)}
</main>`;

    case "/compare/discord": {
      const tr = original.startsWith("/tr");
      const h1 = tr
        ? "Discord mu Descall mı, 2026 karşılaştırması"
        : "Discord vs Descall, which fits your group in 2026?";
      const lead = tr
        ? "Discord vs Descall yan yana: sunucular, roller, ses, ekran paylaşımı ve fiyat. Arkadaş grubu için hangisi daha uygun?"
        : "Side-by-side Discord vs Descall: servers, roles, voice, screen share, mobile, and price. Clear verdict for friend groups vs mega-communities.";
      const verdictDescall = tr
        ? "Daha hafif bir Discord alternatifi, gerçek sunucular, ses ve ekran paylaşımı istiyorsan Descall önde, temel özellikler ücretsiz."
        : "wins if you want a lighter Discord alternative with real servers, friends voice, and screen share, with free core features.";
      const verdictDiscord = tr
        ? "Dev bot ekosistemi ve kocaman kamu sunucuları için Discord hâlâ güçlü. Birçok grup ikisini birden kullanır."
        : "still wins for massive bot ecosystems. Many groups run both.";
      return `
<main>
  ${brandBlock(isTr)}
  <h1>${escapeHtml(h1)}</h1>
  <p>${escapeHtml(lead)}</p>
  ${ctaRow("/discord-alternative", tr ? "Discord alternatifi" : "Discord alternative overview")}
  <h2>${tr ? "Kısa karar" : "Quick verdict"}</h2>
  <p><strong>Descall</strong> ${escapeHtml(verdictDescall)}</p>
  <p><strong>Discord</strong> ${escapeHtml(verdictDiscord)}</p>
  <p><a href="/alternatives">${tr ? "Tüm alternatifler" : "All Discord alternatives"}</a> · <a href="/blog/discord-vs-descall">${tr ? "Uzun karşılaştırma yazısı" : "Longer comparison article"}</a></p>
  ${faqHtml(COMPARE_FAQ, isTr)}
  ${navBlock(isTr)}
</main>`;
    }

    case "/discord-alternative-turkey": return `\n<main> ${brandBlock(isTr)} <h1>Türkiye için en iyi Discord alternatifi: Descall</h1> <p>Discord alternatifi, muadili veya benzeri uygulama mı arıyorsun? Descall: ücretsiz sohbet, sesli arama ve ekran paylaşımı. Türkçe arayüz.</p> ${ctaRow("/download", "Windows / Android indir")}
  <h2>Neden Türkiye’de Discord alternatifi aranıyor?</h2>
  <p>Nitro baskısı, ağır arayüz ve bot karmaşası istemeyen gruplar daha hafif bir uygulama arıyor. Descall klan, sınıf ve oyuncu toplulukları için tasarlandı.</p>
  <p><a href="/discord-alternative">English hub</a> · <a href="/alternatives">Alternatives list</a> · <a href="/tr">Türkçe ana sayfa</a></p>
  ${faqHtml(TURKEY_FAQ, isTr)}
  ${navBlock(isTr)}
</main>`;

    default:
      return null;
  }
}
