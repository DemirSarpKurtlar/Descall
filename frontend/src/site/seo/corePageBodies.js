/**
 * Rich crawlable HTML bodies for core marketing pages (used by prerender-seo.mjs).
 * Keep in sync with React pages — this is the bot-visible body, not a thin meta stub.
 */
import { FAQ_ITEMS } from "../faqData.js";
import { PRIVACY_CONTENT, TERMS_CONTENT } from "../../legal/legalContent.js";
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
  return `<a class="seo-brand" href="${home}" aria-label="Descall home"><span class="seo-brand-mark" aria-hidden="true">D</span><span>Descall</span><span class="seo-brand-beta">Beta</span></a>`;
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

function legalHtml(data, isTr = false) {
  const sections = (data.sections || [])
    .map(
      (s) =>
        `<h2>${escapeHtml(s.heading)}</h2>${(s.paragraphs || [])
          .map((p) => `<p>${escapeHtml(p)}</p>`)
          .join("\n")}`
    )
    .join("\n");
  return `
<main>
  ${brandBlock(isTr)}
  <article>
    <h1>${escapeHtml(data.title)}</h1>
    <p><strong>${escapeHtml(data.updated)}</strong></p>
    <p>${escapeHtml(data.intro)}</p>
    ${sections}
    <p>${escapeHtml(trCopy("Contact", isTr))}: <a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a></p>
  </article>
  ${navBlock(isTr)}
</main>`;
}

export function corePageBody(path) {
  const isTr =
    path === "/tr" ||
    path === "/tr/" ||
    path.startsWith("/tr/") ||
    path === "/discord-alternative-turkey";
  const n = navLabels(isTr);
  const h = (p) => prefixHref(p, isTr);
  const original = path;
  const bare =
    path === "/tr" || path === "/tr/"
      ? "/"
      : path.startsWith("/tr/")
        ? path.slice(3)
        : path;
  switch (bare) {
    case "/": {
      const copy = homeHero(isTr);
      return `
<main>
  ${brandBlock(isTr)}
  <p class="seo-kicker"><span class="seo-brand-beta">Beta</span> ${escapeHtml(copy.statusNote)}</p>
  <h1>${escapeHtml(copy.h1)}</h1>
  <p class="seo-lead">${escapeHtml(copy.lead)}</p>
  ${heroCtaHtml(isTr)}
  <h2>${escapeHtml(copy.why)}</h2>
  ${cardGrid(copy.whyCards)}
  <h2>${escapeHtml(copy.core)}</h2>
  ${cardGrid(copy.featureCards)}
  ${navBlock(isTr)}
</main>`;
    }

    case "/features":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>${escapeHtml(trCopy("Descall Features — Free Voice, Screen Share & Servers", isTr))}</h1>
  <p>${escapeHtml(trCopy("See what’s included for free: HD voice/video, screen share, Discord-style servers, roles, templates, and Valorant LFG.", isTr))}</p>
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
    <li>${escapeHtml(trCopy("Valorant LFG lobbies, party codes, and Riot Name#TAG linking", isTr))}</li>
    <li>${escapeHtml(trCopy("Optional DesCoin cosmetics — core chat and calls stay free", isTr))}</li>
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
  <h1>${escapeHtml(trCopy("Download Descall for Windows — Free Voice Chat App", isTr))}</h1>
  <p>${escapeHtml(trCopy("Get the Windows desktop app, Android builds, or the full web app in your browser.", isTr))}</p>
  <h2>${escapeHtml(trCopy("Platforms", isTr))}</h2>
  <ul>
    <li>${escapeHtml(trCopy("Windows installer for the native desktop client", isTr))}</li>
    <li>${escapeHtml(trCopy("Android APK builds for mobile", isTr))}</li>
    <li>${escapeHtml(trCopy("Full-featured web app at descall.com — no install required", isTr))}</li>
  </ul>
  <h2>${escapeHtml(trCopy("What you get", isTr))}</h2>
  <ul>
    <li>${escapeHtml(trCopy("Servers, roles, channels, and moderation tools", isTr))}</li>
    <li>${escapeHtml(trCopy("Chat, voice, video, and screen share", isTr))}</li>
    <li>${escapeHtml(trCopy("Valorant LFG and friend presence", isTr))}</li>
  </ul>
  <p>Descall is currently in <strong>Beta</strong>. ${escapeHtml(trCopy("Chat, voice, video, and screen share", isTr))}.</p>
  <p><a href="${h("/features")}">${escapeHtml(trCopy("See features", isTr))}</a> · <a href="${h("/faq")}">${escapeHtml(n.faq)}</a></p>
  ${navBlock(isTr)}
</main>`;

    case "/dimaai":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>${escapeHtml(trCopy("DimaAI — Ask Dima anything", isTr))}</h1>
  <p>${escapeHtml(trCopy("A ChatGPT-style assistant built into Descall. Fast, Thinking, and Deep models for writing, explaining, and brainstorming with your squad.", isTr))}</p>
  <h2>${escapeHtml(trCopy("Three modes", isTr))}</h2>
  <ul>
    <li>${escapeHtml(trCopy("Dima 1.1 Fast — quick answers for everyday questions", isTr))}</li>
    <li>${escapeHtml(trCopy("Dima 1.2 Thinking — stronger reasoning when the problem needs a second look", isTr))}</li>
    <li>${escapeHtml(trCopy("Dima 1.3 Deep — long analysis and max quality", isTr))}</li>
  </ul>
  <p><a href="${h("/features")}">${escapeHtml(n.features)}</a> · <a href="${h("/download")}">${escapeHtml(n.download)}</a></p>
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
  <p>${escapeHtml(trCopy("Real-time messaging, Discord-style servers, WebRTC voice/video, screen share, and Valorant LFG — with privacy policies and security docs you can actually read.", isTr))}</p>
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
    <li>Independent: yes — not owned by Discord, Google, OpenAI, or another parent company</li>
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
    <li>Bağımsız: evet — Discord, Google, OpenAI veya başka bir ana şirkete ait değil</li>
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
  <p>${escapeHtml(trCopy("How Descall protects chats and calls — encryption in transit, account security, and honest limits.", isTr))}</p>
  <h2>Transport encryption (not default E2E)</h2>
  <p>Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server — messages are encrypted in transit and stored to deliver chat history to your devices.</p>
  <h2>Voice &amp; video</h2>
  <p>Call media is transmitted with WebRTC security (DTLS/SRTP). Descall does not record or store call audio/video by default. If a participant records locally, that is outside Descall's control.</p>
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
      return `
<main>
  ${brandBlock(isTr)}
  <h1>${escapeHtml(trCopy("Contact Descall", isTr))}</h1>
  <p>${escapeHtml(trCopy("Support, feedback, press, and security reports.", isTr))}</p>
  <h2>${escapeHtml(trCopy("Support & feedback", isTr))}</h2>
  <p>Email the Descall team at <a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a>.</p>
  <h2>${escapeHtml(trCopy("Operator", isTr))}</h2>
  <p>${escapeHtml(SITE_OPERATOR.operatorName)} · ${escapeHtml(SITE_OPERATOR.country)}</p>
  <h2>${escapeHtml(trCopy("Security", isTr))}</h2>
  <p>For security reports, contact us by email and include enough detail to investigate safely.</p>
  ${navBlock(isTr)}
</main>`;

    case "/privacy":
      return legalHtml(PRIVACY_CONTENT.en, isTr);

    case "/terms":
      return legalHtml(TERMS_CONTENT.en, isTr);

    case "/discord-alternative":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>The best free Discord alternative for friends &amp; gamers</h1>
  <p>A free Discord alternative with real servers, HD voice/video, screen share, and Valorant LFG. Core chat and calls stay free — no Nitro paywall.</p>
  ${ctaRow("/compare/discord", "Discord vs Descall")}
  <h2>What you get</h2>
  <ul>
    <li>Discord-style servers with roles, channels, and templates</li>
    <li>Free real-time chat, group voice/video, and screen share</li>
    <li>Built-in Valorant LFG without bot hell</li>
    <li>Windows, Android, and full web app</li>
  </ul>
  <p><a href="/alternatives">Compare Discord alternatives</a> · <a href="/discord-alternative-turkey">Türkçe</a> · <a href="/download">Download</a></p>
  ${faqHtml(ALTERNATIVE_HUB_FAQ, isTr)}
  ${navBlock(isTr)}
</main>`;

    case "/alternatives":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>Discord alternatives compared — pick by what you actually need</h1>
  <p>Honest 2026 comparison of Discord alternatives: Descall, Discord, Guilded, TeamSpeak, Telegram. Free voice, screen share, and friend-group servers.</p>
  ${ctaRow("/discord-alternative", "Why Descall")}
  <h2>How to choose</h2>
  <ol>
    <li>List must-have features (voice, screen share, LFG, mobile).</li>
    <li>Check whether core chat/calls are free or paywalled.</li>
    <li>Try a week with your actual friend group.</li>
    <li>Keep Discord only if you still need giant community servers.</li>
  </ol>
  <h2>Shortlist</h2>
  <ul>
    <li><a href="/discord-alternative">Descall</a> — free Discord alternative for friends, servers, and LFG</li>
    <li><a href="/compare/discord">Discord</a> — still strongest for bots and huge publics</li>
    <li>Guilded, TeamSpeak/Mumble, Telegram — fit narrower jobs</li>
  </ul>
  ${faqHtml(ALTERNATIVES_FAQ, isTr)}
  ${navBlock(isTr)}
</main>`;

    case "/compare/discord": {
      const tr = original.startsWith("/tr");
      const h1 = tr
        ? "Discord mu Descall mı — 2026 karşılaştırması"
        : "Discord vs Descall — which fits your group in 2026?";
      const lead = tr
        ? "Discord vs Descall yan yana: sunucular, roller, ses, ekran paylaşımı, LFG ve fiyat. Arkadaş grubu için hangisi daha uygun?"
        : "Side-by-side Discord vs Descall: servers, roles, voice, screen share, LFG, mobile, and price. Clear verdict for friend groups vs mega-communities.";
      const verdictDescall = tr
        ? "Daha hafif bir Discord alternatifi, gerçek sunucular, ses, ekran paylaşımı ve Valorant LFG istiyorsan Descall önde — temel özellikler ücretsiz."
        : "wins if you want a lighter Discord alternative with real servers, friends voice, screen share, and Valorant LFG — with free core features.";
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

    case "/discord-alternative-turkey":
      return `
<main>
  ${brandBlock(isTr)}
  <h1>Türkiye için en iyi Discord alternatifi: Descall</h1>
  <p>Discord alternatifi, muadili veya benzeri uygulama mı arıyorsun? Descall: ücretsiz sohbet, sesli arama, ekran paylaşımı ve Valorant LFG. Türkçe arayüz.</p>
  ${ctaRow("/download", "Windows / Android indir")}
  <h2>Neden Türkiye’de Discord alternatifi aranıyor?</h2>
  <p>Nitro baskısı, ağır arayüz ve LFG için bot karmaşası istemeyen gruplar daha hafif bir uygulama arıyor. Descall klan, sınıf ve oyuncu toplulukları için tasarlandı.</p>
  <p><a href="/discord-alternative">English hub</a> · <a href="/alternatives">Alternatives list</a> · <a href="/tr">Türkçe ana sayfa</a></p>
  ${faqHtml(TURKEY_FAQ, isTr)}
  ${navBlock(isTr)}
</main>`;

    default:
      return null;
  }
}
