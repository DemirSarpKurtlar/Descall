/**
 * Prerendered twins of the React pages built on SeoLandingShell (SEO round 3, Nov 2026):
 * /compare/discord, /alternatives, /discord-alternative, the gamers page and the blog
 * index, in every site language (the Turkish blog index is TrBlogIndexPage).
 *
 * Same idea as seo/pageTwins.js: the React page's text through its own t() (pageT), its
 * order and its boxes (index.html: the landing hero ".seo-lhero" CSS, which the niche
 * landings already use, plus the "@twin-landing" block for the body), so the hand-over
 * to React moves nothing. The no-JS page stays complete: real links, FAQ answers in
 * <details>, the comparison table as a table.
 *
 * Keep in step with: components/SeoLandingShell.jsx, SeoProductPreview.jsx,
 * SeoRelatedLinks.jsx, SeoExtraContent.jsx, MergedGuideSections.jsx and the pages
 * (CompareDiscordPage, AlternativesPage, DiscordAlternativePage,
 * DiscordAlternativeGamersPage, BlogIndexPage, TrBlogIndexPage). Selftest:
 * pageTwins.selftest.mjs (every t() string of those pages is in the twin).
 */
import {
  ALTERNATIVE_HUB_FAQ,
  ALTERNATIVE_PILLARS,
  ALTERNATIVES_FAQ,
  BLOG_POSTS,
  COMPARE_FAQ,
  COMPARE_ROWS,
  GAMER_FAQ,
} from "../content/discordSeoContent.js";
import { PREVIEW_SIZES, previewSrcset } from "./featureGroups.js";
import { localizedPageExtras, numberedSteps } from "./pageExtras.js";
import { localizedMergedGuide } from "./mergedGuides.js";
import { TR_BLOG_POSTS } from "./trBlog.js";
import { TR_LANDINGS, trLandingLabel } from "./trLandings.js";
import { authHref } from "./prerenderCopy.js";
import { escapeHtml, hrefFor, pageT } from "./pageTwins.js";
import { isPrefixedLocale } from "../siteLocales.js";
import { formatDate } from "../../i18n/format.js";

const esc = escapeHtml;

/** SeoProductPreview SHOTS. */
const SHOTS = {
  chat: "/brand/previews/02-dm.webp",
  servers: "/brand/previews/06-server.webp",
  call: "/brand/previews/09-server-voice.webp",
  friends: "/brand/previews/11-friends.webp",
};

const CRUMB_CHEVRON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PILL_CHEVRON =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK_16 =
  '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>';

/**
 * A hero / bottom button. `auth`: opens the sign-in dialog (a real link to the auth URL
 * here, the hydrate hook picks it up); `button`: React renders a <button> (its line
 * height differs from a <Link>); otherwise a <Link> to `href`.
 */
function button(loc, { label, href, style = "primary", auth = null, button: isButton = false }) {
  const cls = `seo-lbtn is-${style}${isButton ? " is-btn" : ""}`;
  if (auth) return `<a class="${cls}" href="${authHref(loc, auth)}" rel="nofollow" data-hydrate data-auth="${auth}">${esc(label)}</a>`;
  return `<a class="${cls}" href="${esc(href)}">${esc(label)}</a>`;
}

/** SeoLandingShell header: breadcrumbs, H1, lead, buttons, tilted shot with caption. */
function heroHtml(loc, href, t, { crumbs, title, lead, tone = "default", shot = null, primary = null, secondary = null }) {
  const trail = crumbs
    .map((c, i) => `<li>${i > 0 ? CRUMB_CHEVRON : ""}<a href="${esc(href(c.to))}">${esc(t(c.label))}</a></li>`)
    .join("");
  const cta = primary || secondary ? `<p class="seo-lhero-cta">${primary ? button(loc, primary) : ""}${secondary ? button(loc, secondary) : ""}</p>` : "";
  const src = shot ? SHOTS[shot.mode] || SHOTS.chat : "";
  const img = shot
    ? `<figure class="seo-lhero-shot"><div class="seo-lhero-wrap"><div class="seo-lhero-halo" aria-hidden="true"></div><div class="seo-lhero-dev"><div class="seo-lhero-scr"><img src="${src}" srcset="${previewSrcset(src)}" sizes="${PREVIEW_SIZES}" width="1440" height="900" alt="${esc(shot.caption)}" fetchpriority="high" decoding="async" /></div></div></div><figcaption>${esc(shot.caption)}</figcaption></figure>`
    : "";
  const cls = !shot ? "is-single" : tone === "default" ? "is-plain" : `seo-tone-${tone}`;
  return `<header class="seo-lhero ${cls}">
    <nav class="seo-crumbs" aria-label="Breadcrumb"><ol>${trail}</ol></nav>
    <h1>${esc(title)}</h1>
    ${lead ? `<p class="seo-lhero-lead">${esc(lead)}</p>` : ""}
    ${cta}
    ${img}
  </header>`;
}

const sec = (h2, inner, cls = "") => `<section class="seo-tl-sec${cls}">${h2 ? `<h2>${esc(h2)}</h2>` : ""}${inner}</section>`;
const bullets = (items) => `<ul class="seo-tl-bullets">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const steps = (items) => `<ol class="seo-tl-steps">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`;
const checklist = (items) => `<ul class="seo-tl-check">${items.map((x) => `<li>${CHECK_16}<span>${esc(x)}</span></li>`).join("")}</ul>`;
const linkList = (items) => `<ul class="seo-tl-links">${items.map((l) => `<li><a href="${esc(l.to)}">${esc(l.label)}</a></li>`).join("")}</ul>`;

/** SeoRelatedLinks: small caps title, glass pills with a chevron. */
function relatedHtml(t, href, title, links) {
  return `<section class="seo-tl-sec seo-tl-related" aria-label="${esc(t(title))}"><h2>${esc(t(title))}</h2><ul>${links
    .map((l) => `<li><a href="${esc(href(l.to))}">${esc(t(l.label))}${PILL_CHEVRON}</a></li>`)
    .join("")}</ul></section>`;
}

function paragraphHtml(p) {
  const n = numberedSteps(p);
  if (!n) return `<p>${esc(p)}</p>`;
  return `<ol class="seo-tl-numbered">${n.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>${n.after ? `<p>${esc(n.after)}</p>` : ""}`;
}

/** SeoExtraContent (and MergedGuideSections): heading + body per section. */
function extrasHtml(loc, pathname, t, { showLinks = true } = {}) {
  const found = localizedPageExtras(pathname, { text: (s) => t(s), href: (to) => hrefFor(loc, pathname)(to) });
  let out = "";
  if (found) {
    const { extra } = found;
    out += `<section class="seo-tl-extra">${extra.sections
      .map(
        (s) =>
          `<div class="seo-tl-sec"><h2>${esc(s.h)}</h2><div class="seo-tl-body">${s.p.map(paragraphHtml).join("")}${
            s.list?.length ? `<ul class="seo-tl-plain">${s.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : ""
          }</div></div>`
      )
      .join("")}${showLinks && extra.links?.length ? linkList(extra.links) : ""}</section>`;
  }
  return out;
}

function mergedHtml(pathname, t) {
  const sections = localizedMergedGuide(pathname, (s) => t(s));
  if (!sections) return "";
  return `<section class="seo-tl-extra">${sections
    .map((s) => `<div class="seo-tl-sec"><h2>${esc(s.h)}</h2><div class="seo-tl-body"><p>${esc(s.p)}</p></div></div>`)
    .join("")}</section>`;
}

/** SeoLandingShell: hero, body, FAQ (<details>), bottom CTA. */
function shellHtml(loc, pathname, { hero, body, faq = [], tone = "default", primary = null }) {
  const t = pageT(loc);
  const href = hrefFor(loc, pathname);
  const faqHtml = faq.length
    ? `<section class="seo-tl-faq" aria-labelledby="seo-faq-heading"><h2 id="seo-faq-heading">${esc(t("Frequently asked questions"))}</h2><div class="seo-tl-faq-list">${faq
        .map((f) => `<details><summary>${esc(t(f.q))}</summary><p>${esc(t(f.a))}</p></details>`)
        .join("")}</div></section>`
    : "";
  // SeoLandingShell's own link to /register when the page has no primary button.
  const bottomPrimary = primary || { label: t("Start free"), auth: "register" };
  return `<article class="seo-landing seo-tl seo-tone-${tone}">
  ${heroHtml(loc, href, t, { ...hero, tone, primary: hero.primary === undefined ? primary : hero.primary })}
  <div class="seo-tl-main">
    ${body}
  </div>
  ${faqHtml}
  <section class="seo-tl-bottom"><h2>${esc(t("Ready to try a lighter Discord alternative?"))}</h2><p>${esc(
    t("Create a free account. Chat, voice, screen share, and servers stay on the same account.")
  )}</p><p class="seo-tl-cta">${button(loc, bottomPrimary)}${button(loc, { label: t("Download Descall"), href: href("/download"), style: "soft" })}${button(loc, {
    label: t("Explore features"),
    href: href("/features"),
    style: "ghost",
  })}</p></section>
</article>`;
}

/** Links of useMirrorCopy: the /<prefix> twin on prefixed locales, as written otherwise. */
function mirrorHref(loc, pathname) {
  return isPrefixedLocale(loc) ? hrefFor(loc, pathname) : (to) => to;
}

export function compareTwin(loc, pathname) {
  const t = pageT(loc);
  const href = hrefFor(loc, pathname);
  const mirror = mirrorHref(loc, pathname);
  const primary = { label: t("Try Descall free"), auth: "login", button: true };
  const table = `<div class="seo-tl-table"><table class="is-compare"><thead><tr><th>${esc(t("Feature"))}</th><th>Descall</th><th>Discord</th></tr></thead><tbody>${COMPARE_ROWS.map(
    (r) => `<tr><td>${esc(t(r.feature))}</td><td>${esc(t(r.descall))}</td><td>${esc(t(r.discord))}</td></tr>`
  ).join("")}</tbody></table></div>`;
  const body = [
    sec(
      t("Quick verdict"),
      `<div class="seo-tl-verdict"><p><strong>Descall</strong> ${esc(
        t("wins if you want a lighter Discord alternative with real servers (roles, channels, templates), friends voice, and screen share, with free core features.")
      )}</p><p><strong>Discord</strong> ${esc(
        t("still wins for massive bot ecosystems and the widest platform matrix. Many groups run both: Discord for huge public communities with bots, Descall for the squad server and nightly calls.")
      )}</p></div>`
    ),
    sec(t("Feature-by-feature comparison"), table),
    sec(
      t("Where Descall is the better Discord alternative"),
      bullets([
        t("Real servers with roles, channels, and ready-made templates"),
        t("Friend-group chat and voice without Nitro friction"),
        t("Ready-made gaming templates instead of fragile bot setups"),
        t("Screen-share quality controls tuned for calls"),
        t("Modern UI focused on speed, servers without endless chrome"),
      ])
    ),
    sec(
      t("Where Discord still leads"),
      bullets([t("Massive bot / integration ecosystem"), t("Huge public communities with decades of ecosystem tooling"), t("Broader native client coverage historically")])
    ),
    sec(
      t("How to migrate a friend group"),
      `${steps([
        t("Create a Descall server from a template (or start from scratch) and invite your core squad."),
        t("Assign roles and tune channel permissions for staff / announcements."),
        t("Pin the Download link for Windows / Android users."),
        t("Move nightly voice to Descall for two weeks."),
        t("Keep Discord only for bot-heavy communities you still need."),
      ])}<p class="seo-tl-note"><a href="${esc(mirror("/blog/leave-nitro-keep-voice-chat"))}">${esc(t("Read the full migration guide"))}</a></p>`
    ),
    extrasHtml(loc, pathname, t, { showLinks: false }),
    mergedHtml(pathname, t),
    relatedHtml(t, href, "More comparisons", [
      { to: "/alternatives", label: "Discord alternatives hub" },
      { to: "/apps-like-discord", label: "Apps like Discord" },
      { to: "/blog/discord-competitors", label: "Discord competitors 2026" },
      { to: "/blog/best-discord-alternatives-2026", label: "Best Discord alternatives in 2026 | honest shortlist" },
      { to: "/discord-replacement", label: "Discord replacement" },
      { to: "/features", label: "Descall features" },
      { to: "/tr/discord-acildi-mi", label: "Discord in Türkiye: dated reports (Turkish)" },
    ]),
  ].join("\n    ");
  return shellHtml(loc, pathname, {
    primary,
    hero: {
      crumbs: [
        { label: "Home", to: "/" },
        { label: "Compare", to: "/alternatives" },
        { label: "Descall vs Discord", to: "/compare/discord" },
      ],
      title: t("Discord vs Descall, which fits your group in 2026?"),
      lead: t(
        "An honest Descall vs Discord comparison for servers, roles, channels, chat, voice, video, screen share, desktop apps, and pricing. Use this when evaluating Descall as a Discord alternative in 2026."
      ),
      secondary: { label: t("Discord alternative overview"), href: "/discord-alternative", style: "soft" },
      shot: { mode: "chat", caption: t("Descall vs Discord, product preview") },
    },
    body,
    faq: COMPARE_FAQ,
  });
}

const ALTERNATIVE_OPTIONS = [
  { name: "Descall", blurb: "Best free Discord alternative for friend groups: chat, voice, video, screen share, Windows + Android.", href: "/discord-alternative", highlight: true },
  { name: "Discord", blurb: "Still the default for huge communities and bots. Heavy for small groups that only need calls and a small server.", href: "/compare/discord" },
  { name: "Guilded", blurb: "Servers + calendars with a gaming tilt. More structure than friend DMs need; Descall stays lighter for daily voice.", href: "/best-discord-alternative-for-gamers" },
  { name: "TeamSpeak / Mumble", blurb: "Voice-first classics. Weak for modern chat, presence, and mobile.", href: "/best-discord-alternative-for-gamers" },
  { name: "Telegram", blurb: "Great messengers and channels. Not a drop-in Discord alternative for persistent group voice + screen share habits.", href: "/discord-alternative" },
  { name: "Slack", blurb: "Work-first chat. Huddles exist, but gamers looking for a Discord alternative usually want evenings, not tickets.", href: "/compare/discord" },
];

export function alternativesTwin(loc, pathname) {
  const t = pageT(loc);
  const href = hrefFor(loc, pathname);
  const mirror = mirrorHref(loc, pathname);
  const options = `<div class="seo-tl-cards">${ALTERNATIVE_OPTIONS.map(
    (o) => `<article class="seo-tl-card${o.highlight ? " is-highlight" : ""}"><h3>${esc(o.name)}</h3><p>${esc(t(o.blurb))}</p><a href="${esc(mirror(o.href))}">${esc(t("Learn more"))}</a></article>`
  ).join("")}</div>`;
  const body = [
    sec(
      t("How to choose a Discord alternative"),
      `<p>${esc(
        t(
          "Start with your real job-to-be-done: friend DMs, group voice, screen share, or a gaming server. If you need mega-servers and bot ecosystems, Discord still leads. If you want a lighter Discord alternative that keeps communication free, Descall is built for you."
        )
      )}</p>${steps([
        t("List must-have features (voice, screen share, servers, mobile)."),
        t("Check whether core chat/calls are free or paywalled."),
        t("Try a week with your actual friend group, not a demo account."),
        t("Keep Discord only if you still need giant community servers."),
      ])}`
    ),
    sec(t("Top Discord alternatives compared"), options),
    sec(
      t("Deep dives"),
      linkList([
        { to: "/compare/discord", label: t("Descall vs Discord") },
        { to: mirror("/best-discord-alternative-for-gamers"), label: t("Best for gamers") },
        { to: "/tr/discord-alternatifi", label: t("Türkiye / Turkish") },
        { to: mirror("/blog/leave-nitro-keep-voice-chat"), label: t("Leave Nitro guide") },
      ])
    ),
    extrasHtml(loc, pathname, t, { showLinks: false }),
    relatedHtml(t, href, "Related comparisons", [
      { to: "/discord-alternative", label: "Free Discord alternative" },
      { to: "/compare/discord", label: "Discord vs Descall" },
      { to: "/apps-like-discord", label: "Apps like Discord" },
      { to: "/discord-replacement", label: "Discord replacement" },
      { to: "/tr/discord-alternatifi", label: "Discord alternatifi (TR)" },
      { to: "/tr/discord-acildi-mi", label: "Discord in Türkiye: dated reports (Turkish)" },
      { to: "/download", label: "Download" },
    ]),
  ].join("\n    ");
  const primary = { label: t("Why Descall"), href: "/discord-alternative" };
  return shellHtml(loc, pathname, {
    primary,
    hero: {
      crumbs: [
        { label: "Home", to: "/" },
        { label: "Alternatives", to: "/alternatives" },
      ],
      title: t("Discord alternatives compared, pick by what you actually need"),
      lead: t(
        "Searching for Discord alternatives? Most lists recycle the same voice apps. Here’s a clearer take, and why Descall wins for friends, servers, and free core chat/calls."
      ),
      secondary: { label: t("Download"), href: "/download", style: "ghost" },
    },
    body,
    faq: ALTERNATIVES_FAQ,
  });
}

export function discordAlternativeTwin(loc, pathname) {
  const t = pageT(loc);
  const href = hrefFor(loc, pathname);
  const sw = (a, b) => `<li><strong>${esc(t(a))}</strong><span>${esc(t(b))}</span></li>`;
  const audience = [
    ["Friend groups", "DMs plus a ready-made friends server, lounge chat, plans, and always-on voice."],
    ["Gamers & squads", "Gaming server templates with squad-up, scrim, and clip channels in one app."],
    ["Communities & creators", "Announcements, support, events, stage, and a full staff ladder, without Nitro pressure."],
    ["Anyone tired of Nitro pressure", "Keep premium cosmetics optional. Servers, chat, and calls stay free."],
  ];
  const body = [
    sec(
      t("Switch in three steps"),
      `<ol class="seo-tl-switch">${[
        sw("Create a free account", "Sign in with Google or email, no installer required to try the web app."),
        sw("Spin up a server", "Pick a template (friends, gaming) or start empty. Roles and channels ship ready."),
        sw("Invite the squad", "Share a link, hop into voice, and keep Discord only if you still need the giant bot stack."),
      ].join("")}</ol>`
    ),
    sec(
      t("Why people search for a Discord alternative"),
      `<p>${esc(
        t(
          "Discord is powerful, and heavy. Friend groups and communities often want a lighter Discord alternative: real servers with roles and channels, fewer Nitro prompts, faster calls, and gaming servers without installing a dozen bots. Descall is built for that."
        )
      )}</p>${checklist(
        [
          "Servers with roles, text & voice channels",
          "Advanced templates (gaming, community…)",
          "Free chat, voice, video, and screen share",
          "Ready-made gaming server templates",
          "Windows desktop + web + Android",
          "Cosmetics via DesCoin, core stays free",
        ].map((x) => t(x))
      )}`
    ),
    sec(
      t("What makes Descall a stronger Discord alternative"),
      `<div class="seo-tl-cards">${ALTERNATIVE_PILLARS.map((p) => `<article class="seo-tl-card"><h3>${esc(t(p.title))}</h3><p>${esc(t(p.body))}</p></article>`).join("")}</div>`
    ),
    sec(
      t("Descall vs Discord at a glance"),
      `<div class="seo-tl-table"><table><thead><tr><th>${esc(t("Capability"))}</th><th>Descall</th><th>Discord</th></tr></thead><tbody>${COMPARE_ROWS.map(
        (r) => `<tr><td>${esc(t(r.feature))}</td><td>${esc(t(r.descall))}</td><td>${esc(t(r.discord))}</td></tr>`
      ).join("")}</tbody></table></div><p class="seo-tl-note"><a href="/compare/discord">${esc(t("Read the full Descall vs Discord comparison"))}</a></p>`
    ),
    sec(
      t("Who should switch to this Discord alternative?"),
      `<div class="seo-tl-cards is-audience">${audience.map(([h, p]) => `<article class="seo-tl-card"><h3>${esc(t(h))}</h3><p>${esc(t(p))}</p></article>`).join("")}</div>`
    ),
    extrasHtml(loc, pathname, t, { showLinks: false }),
    relatedHtml(t, href, "Related Discord alternative guides", [
      { to: "/alternatives", label: "All Discord alternatives, hub" },
      { to: "/apps-like-discord", label: "Apps like Discord" },
      { to: "/discord-replacement", label: "Discord replacement" },
      { to: "/best-discord-alternative-for-gamers", label: "Best Discord alternative for gamers" },
      { to: "/discord-alternative-for-communities", label: "For communities" },
      { to: "/discord-alternative-for-voice-chat", label: "Voice chat alternative" },
      { to: "/discord-alternative-for-friends", label: "For friends" },
      { to: "/tr/discord-alternatifi", label: "Discord alternatifi (Türkiye)" },
      { to: "/tr/discord-acildi-mi", label: "Discord in Türkiye: dated reports (Turkish)" },
      { to: "/blog", label: "Descall blog" },
    ]),
  ].join("\n    ");
  const primary = { label: t("Start free"), auth: "register", button: true };
  return shellHtml(loc, pathname, {
    primary,
    tone: "compare",
    hero: {
      crumbs: [
        { label: "Home", to: "/" },
        { label: "Discord alternative", to: "/discord-alternative" },
      ],
      title: t("The best free Discord alternative for friends & gamers"),
      lead: t(
        "Descall is a free Discord alternative with real servers (roles, channels, templates), real-time chat, voice and video calls, and screen share, without Nitro paywalls for the features you actually use."
      ),
      secondary: { label: t("Compare with Discord"), href: "/compare/discord", style: "soft" },
      shot: { mode: "servers", caption: t("Descall UI, servers, chat, and voice in one app") },
    },
    body,
    faq: ALTERNATIVE_HUB_FAQ,
  });
}

export function gamersTwin(loc, pathname) {
  const t = pageT(loc);
  const mirror = mirrorHref(loc, pathname);
  const body = [
    sec(t("Why gamers leave Discord"), `<p>${esc(t("A classic Discord gaming server means bots, roles, and channel spam."))}</p>`),
    sec(
      t("Gamer checklist"),
      checklist(
        ["Group voice/video with screen share", "Gaming templates with squad-up rooms", "Desktop app for low-friction gaming sessions", "Free core, cosmetics optional"].map((x) => t(x))
      )
    ),
    extrasHtml(loc, pathname, t),
    sec(
      t("Keep reading"),
      linkList([
        { to: mirror("/compare/discord"), label: t("Descall vs Discord") },
        { to: mirror("/features"), label: t("All features") },
      ])
    ),
  ].join("\n    ");
  const primary = { label: t("Open Descall"), auth: "login", button: true };
  return shellHtml(loc, pathname, {
    primary,
    tone: "gaming",
    hero: {
      crumbs: [
        { label: "Home", to: "/" },
        { label: "Discord alternative", to: "/discord-alternative" },
        { label: "For gamers", to: "/best-discord-alternative-for-gamers" },
      ],
      title: t("Best Discord alternative for gamers"),
      lead: t(
        "Gamers don’t need another bloated server, they need voice and screen share that actually work. Descall is the Discord alternative built around squads and playing together."
      ),
      secondary: { label: t("Download for Windows"), href: mirror("/download"), style: "soft" },
      shot: { mode: "friends", caption: t("Friends and presence inside Descall") },
    },
    body,
    faq: GAMER_FAQ,
  });
}

/** "2026-08-11" as useMirrorCopy.date shows it: Intl on prefixed locales, ISO otherwise. */
function postDate(iso, loc) {
  if (!isPrefixedLocale(loc)) return iso;
  return formatDate(`${iso}T00:00:00Z`, loc, { dateStyle: "long", timeZone: "UTC" }) || iso;
}

function blogCard({ date, label, href, title, description, tags }) {
  return `<article class="seo-tl-post"><time datetime="${date}">${esc(label)}</time><h2><a href="${esc(href)}">${esc(title)}</a></h2><p>${esc(description)}</p><div class="seo-tl-tags">${tags
    .map((x) => `<span>${esc(x)}</span>`)
    .join("")}</div></article>`;
}

export function blogIndexTwin(loc, pathname) {
  const t = pageT(loc);
  const prefixed = isPrefixedLocale(loc);
  const text = prefixed ? t : (s) => s;
  const mirror = mirrorHref(loc, pathname);
  const cards = BLOG_POSTS.map((p) =>
    blogCard({ date: p.date, label: postDate(p.date, loc), href: mirror(p.path), title: text(p.title), description: text(p.description), tags: p.tags.map(text) })
  ).join("");
  return shellHtml(loc, pathname, {
    hero: {
      primary: null,
      crumbs: [
        { label: "Home", to: "/" },
        { label: "Blog", to: "/blog" },
      ],
      title: t("Descall blog, Discord alternatives & voice chat"),
      lead: t("Practical guides on Discord alternatives, voice chat, and moving friend groups to Descall."),
    },
    body: sec("", `<div class="seo-tl-posts">${cards}</div>`),
  });
}

/** TrBlogIndexPage: Turkish posts (ISO dates, as the React page), then the Turkish hubs. */
export function trBlogIndexTwin() {
  const loc = "tr";
  const t = pageT(loc);
  const cards = TR_BLOG_POSTS.map((p) =>
    blogCard({ date: p.date, label: p.date, href: p.path, title: p.h1 || p.title, description: p.description, tags: p.tags })
  ).join("");
  const hubs = Object.values(TR_LANDINGS).map((p) => ({ to: p.path, label: trLandingLabel(p) }));
  return shellHtml(loc, "/tr/blog", {
    hero: {
      primary: null,
      crumbs: [
        { label: "Ana sayfa", to: "/tr" },
        { label: "Blog", to: "/tr/blog" },
      ],
      title: "Descall blog: Discord alternatifleri ve sesli sohbet rehberleri",
      lead: "Discord alternatifleri, Discord’dan geçiş, sesli sohbet ve topluluk yönetimi üzerine Türkçe, pratik rehberler.",
    },
    body: [sec("", `<div class="seo-tl-posts">${cards}</div>`), relatedHtml(t, hrefFor(loc, "/tr/blog"), "Türkçe rehber sayfaları", hubs)].join("\n    "),
  });
}

/** Twin of an English landing path (or the Turkish blog index), or null. */
export function landingTwinFor(bare) {
  return (
    {
      "/compare/discord": compareTwin,
      "/alternatives": alternativesTwin,
      "/discord-alternative": discordAlternativeTwin,
      "/best-discord-alternative-for-gamers": gamersTwin,
      "/blog": blogIndexTwin,
    }[bare] || null
  );
}
