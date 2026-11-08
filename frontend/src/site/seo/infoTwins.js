/**
 * Prerendered twins of the info pages (SEO round 3, Nov 2026): /about (AboutPage) and the
 * InfoPage template pages /security and /who-owns-descall (+ /descall-sahibi), in every
 * site language; then /contact (+ /iletisim), whose form is drawn with disabled fields
 * until React's form replaces it. Same idea as seo/pageTwins.js: React's own t() text,
 * order and boxes, so the hand-over to React moves nothing. CSS: index.html "@twin-about",
 * "@twin-info" and "@twin-contact" (the info pages also keep the legal reader and FAQ
 * blocks, see prerender-seo.mjs).
 *
 * Keep in step with: pages/AboutPage.jsx, pages/SecurityPage.jsx,
 * pages/WhoOwnsDescallPage.jsx, pages/ContactPage.jsx, components/InfoPage.jsx,
 * components/SeoRelatedLinks.jsx (selftest: pageTwins.selftest.mjs).
 */
import { SITE_OPERATOR } from "../siteIdentity.js";
import { OWNER_NAME, OWNERSHIP_FAQ_EN, OWNERSHIP_FAQ_TR } from "../ownershipFacts.js";
import { isPrefixedLocale } from "../siteLocales.js";
import { briefLabel } from "../../legal/legalView.js";
import { escapeHtml, hrefFor, pageT } from "./pageTwins.js";

const esc = escapeHtml;
const mail = `<a href="mailto:${SITE_OPERATOR.supportEmail}">${SITE_OPERATOR.supportEmail}</a>`;
const PILL_CHEVRON =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** components/InfoPage.jsx firstSentence. */
export function firstSentence(text) {
  const s = String(text || "").trim();
  const m = s.match(/^.*?[.!?](\s|$)/);
  return m ? m[0].trim() : s;
}

export function aboutTwin(loc, pathname) {
  const t = pageT(loc);
  const href = hrefFor(loc, pathname);
  const updated =
    loc === "tr" ? SITE_OPERATOR.lastUpdatedLabelTr : isPrefixedLocale(loc) ? t(SITE_OPERATOR.lastUpdatedLabel) : SITE_OPERATOR.lastUpdatedLabel;
  const record = loc === "tr" ? SITE_OPERATOR.personPathTr : href(SITE_OPERATOR.personPath);
  const li = (label, value) => `<li><strong>${esc(t(label))}:</strong> ${value}</li>`;
  return `<section class="seo-tw-about">
  <p role="status">${esc(t("Beta"))}. ${esc(t(SITE_OPERATOR.statusNote))}</p>
  <h1>${esc(t("About Descall"))}</h1>
  <p class="seo-tw-ab-lead ownership-answer">${esc(t("Descall is owned by Demir Sarp Kurtlar. Demir Sarp Kurtlar is the founder, owner, and CEO of Descall."))}</p>
  <p class="seo-tw-ab-lead">${esc(
    t(
      "Descall is an independent messaging and voice platform for friends, gaming squads, and small communities who want Discord-style servers without Nitro paywalls on core chat and calls."
    )
  )}</p>
  <h2>${esc(t("Who owns Descall?"))}</h2>
  <p class="ownership-answer">${esc(
    t("Demir Sarp Kurtlar owns Descall. He is the founder, owner, and CEO of Descall. The name is spelled exactly Demir Sarp Kurtlar.")
  )} <a href="${esc(record)}">${esc(t("Read the ownership record"))}</a></p>
  <h2>${esc(t("Operator"))}</h2>
  <ul>${li("Product", esc(SITE_OPERATOR.productName))}${li("Owner / founder / CEO", `<span class="ownership-name">${esc(SITE_OPERATOR.operatorName)}</span>`)}${li(
    "Based in",
    esc(SITE_OPERATOR.country)
  )}${li("Support", mail)}${li("Source", `<a href="${SITE_OPERATOR.githubUrl}" rel="noopener noreferrer">GitHub</a>`)}</ul>
  <h2>${esc(t("What we build"))}</h2>
  <p>${esc(
    t("Real-time messaging, Discord-style servers, WebRTC voice/video, and screen share, with privacy policies and security docs you can actually read.")
  )}</p>
  <p>${esc(t("Last updated"))}: ${esc(updated)}</p>
  <p class="seo-tw-ab-cta"><a class="seo-tw-btn is-soft" href="${esc(href("/security"))}">${esc(t("Security"))}</a><a class="seo-tw-btn is-soft" href="${esc(
    href("/contact")
  )}">${esc(t("Contact"))}</a><a class="seo-tw-btn is-primary" href="${esc(href("/download"))}">${esc(t("Download"))}</a></p>
</section>`;
}

/** InfoPage: Descall kicker + H1, intro, summary, then the sections. */
function infoPageHtml({ title, intro, summary = "", body }) {
  return `<article class="seo-tw-legal seo-tw-info">
  <div class="seo-tw-lg-hero"><div><p class="seo-tw-lg-kicker">Descall</p><h1>${esc(title)}</h1></div></div>
  <div class="seo-tw-lg-intro">${intro}</div>
  ${summary}
  <div class="seo-tw-lg-main seo-tw-info-main">
    ${body}
  </div>
</article>`;
}

const infoSection = (id, title, inner) => `<section id="${id}" class="seo-tw-lg-sec seo-tw-info-sec">${title ? `<h2><span>${esc(title)}</span></h2>` : ""}${inner}</section>`;

/** InfoSummary: label, cards that jump to their section. */
function summaryHtml(label, cards) {
  return `<section class="seo-tw-lg-brief" aria-label="${esc(label)}"><h2>${esc(label)}</h2><div class="seo-tw-lg-cards">${cards
    .map((c) => `<a class="seo-tw-lg-card" href="#${c.id}"><span>${esc(c.label)}</span><strong>${esc(c.heading)}</strong><em>${esc(c.excerpt)}</em></a>`)
    .join("")}</div></section>`;
}

/** SeoRelatedLinks inside the info template. */
function relatedHtml(t, href, title, links) {
  return `<section class="seo-tw-related" aria-label="${esc(t(title))}"><h2>${esc(t(title))}</h2><ul>${links
    .map((l) => `<li><a href="${esc(href(l.to))}">${esc(t(l.label))}${PILL_CHEVRON}</a></li>`)
    .join("")}</ul></section>`;
}

export function securityTwin(loc) {
  const t = pageT(loc);
  const sections = [
    {
      id: "transport",
      title: t("Transport encryption (not default E2E)"),
      body: t(
        "Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server, messages are encrypted in transit and stored so your devices can load chat history."
      ),
    },
    {
      id: "voice-video",
      title: t("Voice & video"),
      body: t(
        "Call media is transmitted with WebRTC security (DTLS/SRTP). Descall never records or stores call audio, video, or screen shares. If a participant records locally on their device, that recording is outside Descall's control."
      ),
    },
    {
      id: "accounts",
      title: t("Accounts"),
      body: t(
        "Passwords are hashed with bcrypt. Optional email 2FA and Google sign-in are available where configured. Session management lets you revoke devices. Keep credentials private on shared computers."
      ),
    },
  ];
  const cards = [
    ...sections.map((s, i) => ({ id: s.id, label: String(i + 1).padStart(2, "0"), heading: s.title, excerpt: firstSentence(s.body) })),
    { id: "report", label: String(sections.length + 1).padStart(2, "0"), heading: t("Report an issue"), excerpt: SITE_OPERATOR.supportEmail },
  ];
  const body = [
    ...sections.map((s) => infoSection(s.id, s.title, `<p>${esc(s.body)}</p>`)),
    infoSection(
      "report",
      t("Report an issue"),
      `<p>${esc(t("Email"))} ${mail} ${esc(t("or open an issue on GitHub. Include enough detail for a safe investigation."))}</p>`
    ),
  ].join("\n    ");
  return infoPageHtml({
    title: t("Security at Descall"),
    intro: esc(t("How Descall protects your chats and calls, encryption in transit, account security, and honest limits about what we do not claim.")),
    summary: summaryHtml(briefLabel(loc), cards),
    body,
  });
}

/** WhoOwnsDescallPage: English, Turkish (/descall-sahibi) or a prefixed language. */
export function whoOwnsTwin(loc, pathname) {
  const t = pageT(loc);
  const href = hrefFor(loc, pathname);
  const tr = pathname === "/descall-sahibi" || loc === "tr";
  const isNew = !tr && isPrefixedLocale(loc);
  const x = (s) => (isNew ? t(s) : s);
  const faq = tr ? OWNERSHIP_FAQ_TR : isNew ? OWNERSHIP_FAQ_EN.map((f) => ({ q: t(f.q), a: t(f.a) })) : OWNERSHIP_FAQ_EN;
  const name = `<strong class="ownership-name">${esc(OWNER_NAME)}</strong>`;
  let intro;
  if (isNew) {
    const [before, after = ""] = String(x("{name} is the founder, owner, and CEO of Descall.")).split("{name}");
    intro = `${esc(before)}${name}${esc(after)}`;
  } else {
    intro = `${name}${esc(tr ? " Descall’ın kurucusu, sahibi ve CEO’sudur." : " is the founder, owner, and CEO of Descall.")}`;
  }
  const row = (dt, dd) => `<div><dt>${esc(dt)}</dt><dd>${dd}</dd></div>`;
  const record = `<dl class="seo-tw-founder-list">${[
    row(tr ? "Ürün" : x("Product"), esc(SITE_OPERATOR.productName)),
    row(tr ? "Yazım" : x("Exact spelling"), "Demir Sarp Kurtlar"),
    row(tr ? "Ülke" : x("Based in"), esc(SITE_OPERATOR.country)),
    row(
      tr ? "Bağımsız mı?" : x("Independent?"),
      esc(tr ? "Evet. Discord, Google, OpenAI veya başka bir ana şirkete ait değildir." : x("Yes. Not a subsidiary of Discord, Google, OpenAI, or another parent company."))
    ),
    row("GitHub", `<a href="${SITE_OPERATOR.githubProfileUrl}" rel="noopener noreferrer">${SITE_OPERATOR.githubProfileUrl.replace("https://", "")}</a>`),
    row(tr ? "İletişim" : x("Contact"), mail),
  ].join("")}</dl>`;
  const faqHtml = `<div class="seo-tw-faq">${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>`;
  const more = `<p class="seo-tw-founder-more">${esc(tr ? "İngilizce kayıt: " : `${x("Turkish record:")} `)}<a href="${tr ? "/who-owns-descall" : "/descall-sahibi"}">${esc(
    tr ? "Who owns Descall?" : "Descall’ın sahibi kim?"
  )}</a> · <a href="${esc(tr ? "/tr/about" : href("/about"))}">${esc(tr ? "Hakkında" : x("About Descall"))}</a></p>`;
  const body = [
    infoSection("record", tr ? "Kısa kayıt" : x("Canonical record"), record),
    infoSection("faq", tr ? "Sık sorulan sorular" : x("Frequently asked questions"), faqHtml),
    more,
    relatedHtml(t, href, "Keep exploring", [
      { to: "/about", label: "About" },
      { to: "/faq", label: "FAQ" },
      { to: "/contact", label: "Contact" },
      { to: "/security", label: "Security" },
    ]),
  ].join("\n    ");
  const summary = `<div class="seo-tw-founder"><span class="seo-tw-founder-avatar" aria-hidden="true">DK</span><div><strong class="ownership-name">${esc(OWNER_NAME)}</strong><span>${esc(
    tr ? "Sahip / kurucu / CEO" : x("Owner / founder / CEO")
  )} · ${esc(SITE_OPERATOR.country)}</span></div></div>`;
  return infoPageHtml({
    title: tr ? "Descall’ın sahibi kim?" : x("Who owns Descall?"),
    intro: `<p class="ownership-answer">${intro}</p>`,
    summary,
    body,
  });
}

/**
 * ContactPage before anything is sent: H1, lead, the support / security column and the
 * form. The fields and the button are disabled (text typed before the hand-over would be
 * lost); React's form takes their place. Field ids differ from React's, which renders its
 * own while the two cross-fade.
 */
export function contactTwin(loc) {
  const t = pageT(loc);
  // <label> and its disabled control (attributes as ContactPage.jsx, ids prefixed).
  const field = (id, label, tag, attrs) =>
    `<label for="seo-contact-${id}">${esc(t(label))}</label><${tag} id="seo-contact-${id}" name="${id}" ${attrs} disabled${tag === "textarea" ? "></textarea>" : " />"}`;
  return `<section class="seo-tw-contact">
  <h1>${esc(t("Contact"))}</h1>
  <p class="seo-tw-ct-lead">${esc(t("Get in touch with the Descall team, support, feedback, and press."))}</p>
  <div class="seo-tw-ct-grid">
    <aside class="seo-tw-ct-aside">
      <h2>${esc(t("Support email"))}</h2>
      <p>${mail}</p>
      <p class="seo-tw-ct-owner">${esc(t("Descall is developed by Demir Sarp Kurtlar."))}</p>
      <h2>${esc(t("Security"))}</h2>
      <p>${esc(t("For security reports, contact us by email and include enough detail for us to investigate safely."))}</p>
    </aside>
    <form class="seo-tw-ct-form" novalidate>
      ${field("name", "Your name (optional)", "input", 'type="text" autocomplete="name" maxlength="80"')}
      ${field("email", "Email", "input", 'type="email" autocomplete="email" required maxlength="254"')}
      ${field("message", "Message", "textarea", 'required rows="6" maxlength="2000"')}
      <button type="submit" class="seo-tw-btn is-primary" disabled>${esc(t("Send message"))}</button>
    </form>
  </div>
</section>`;
}
