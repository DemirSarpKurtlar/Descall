/**
 * Public server page "Vitrin" (descall.com/s/<slug>, UI-BRIEF draft A): server-rendered
 * HTML for people and crawlers, served by the Pages worker (_worker.js) when the owner
 * turned on "Google'da göster". Off: the worker keeps the invite landing (noindex).
 *
 * Only the default export of _worker.js may exist, so the helpers live here. The owner
 * desk (src/components/servers/publicPage) renders the same HTML in its live preview.
 * Every value is escaped. Data: GET /api/public-pages/s/:slug (backend
 * lib/serverPublicPage.js buildPublicPayload, an allow-list). Tests:
 * src/site/serverPage.selftest.mjs.
 */

import { PAGE_COPY, acceptLang, categoryLabel, copyFor, fill, languageLabel, pageLang } from "./server-page-copy.js";

export const SITE_ORIGIN = "https://descall.com";
export const DEFAULT_API_ORIGIN = "https://des-call.onrender.com";
export const APP_STORE_ID = "6820558264";
export const PAGE_TTL_SECONDS = 60;
export const MISSING_TTL_SECONDS = 60;
export const PAGE_BOT_TIMEOUT_MS = 3000;
export const PAGE_VISITOR_TIMEOUT_MS = 1500;
const VANITY_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;

/** Directory category -> URL slug per site language (src/site/directory/directoryPaths.js). */
const DIRECTORY_SLUGS = {
  "gaming-minecraft": { en: "minecraft", tr: "minecraft" },
  "gaming-fps": { en: "fps", tr: "fps" },
  "gaming-cs2": { en: "cs2", tr: "cs2" },
  "gaming-lol": { en: "league-of-legends", tr: "league-of-legends" },
  "gaming-other": { en: "gaming", tr: "oyun" },
  study: { en: "study", tr: "ders-calisma" },
  music: { en: "music", tr: "muzik" },
  art: { en: "art", tr: "sanat" },
  tech: { en: "tech", tr: "teknoloji" },
  anime: { en: "anime", tr: "anime" },
  sports: { en: "sports", tr: "spor" },
  "chat-friends": { en: "chat-and-friends", tr: "sohbet-arkadaslik" },
  other: { en: "other", tr: "diger" },
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON inside <script type="application/ld+json"> / application/json: no "</script" break-out. */
export function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function oneLine(value, max) {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function httpsUrl(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function directoryHref(lang, category) {
  const l = lang === "tr" ? "tr" : "en";
  const home = l === "tr" ? "/tr/topluluklar" : "/communities";
  const slug = category ? DIRECTORY_SLUGS[category]?.[l] : null;
  return slug ? `${home}/${slug}` : home;
}

/** Small stable hash (FNV-1a, base36) for ?v= on generated images. */
export function versionOf(value) {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function ogImageUrl(kind, code, { version = "", lang = "en" } = {}) {
  const q = new URLSearchParams();
  if (version) q.set("v", version);
  if (lang && lang !== "en") q.set("lang", lang);
  const qs = q.toString();
  const path = kind === "invalid" ? "/og/invalid.png" : `/og/${kind}/${encodeURIComponent(code)}.png`;
  return `${SITE_ORIGIN}${path}${qs ? `?${qs}` : ""}`;
}

/** Text the page and Google use, with the owner's overrides. */
export function pageMeta(page, lang) {
  const c = copyFor(lang);
  const cat = page.category ? categoryLabel(lang, page.category) : null;
  const title =
    oneLine(page.seo?.title, 70) ||
    (cat ? fill(c.catTitle, { name: page.name, cat }) : fill(c.defaultTitle, { name: page.name }));
  const description =
    oneLine(page.seo?.description, 170) ||
    oneLine(page.description, 155) ||
    fill(c.defaultDescription, { name: page.name });
  return { title, description, category: cat };
}

/**
 * schema.org graph: the community (Organization), its breadcrumb, and one Event per
 * upcoming event (Google can show them as date rows under the result).
 */
export function jsonLd(page, lang) {
  const c = copyFor(lang);
  const meta = pageMeta(page, lang);
  const image = ogImageUrl("s", page.slug, { version: page.version, lang: pageLang(lang) });
  const org = {
    "@type": "Organization",
    "@id": `${page.url}#community`,
    name: page.name,
    url: page.url,
    description: meta.description,
    ...(page.iconUrl ? { logo: page.iconUrl } : {}),
    image,
  };
  if (page.counts?.members) {
    org.interactionStatistic = {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/JoinAction",
      userInteractionCount: page.counts.members,
    };
  }
  if (page.language) org.knowsLanguage = page.language;
  const crumbs = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: c.navCommunities, item: `${SITE_ORIGIN}${directoryHref(lang, null)}` },
      ...(page.category && meta.category
        ? [{ "@type": "ListItem", position: 2, name: meta.category, item: `${SITE_ORIGIN}${directoryHref(lang, page.category)}` }]
        : []),
      { "@type": "ListItem", position: page.category && meta.category ? 3 : 2, name: page.name, item: page.url },
    ],
  };
  const events = (page.events || []).map((e) => ({
    "@type": "Event",
    name: e.title,
    startDate: e.startsAt,
    ...(e.endsAt ? { endDate: e.endsAt } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    location: { "@type": "VirtualLocation", url: page.url },
    image: [image],
    description: e.place ? `${e.title} · ${e.place}` : e.title,
    organizer: { "@type": "Organization", name: page.name, url: page.url },
    isAccessibleForFree: true,
  }));
  return { "@context": "https://schema.org", "@graph": [org, crumbs, ...events] };
}

const IP = {
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  vol: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  pin: '<path d="M12 17v5M5 17h14l-2-4V6h1V2H6v4h1v7z"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
};
const icon = (n, s = 16) => `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${IP[n] || ""}</svg>`;

const MARK_PATH =
  "M67.58 62.5A27.25 27.25 0 1 1 37.5 32.42A5.75 5.75 0 0 1 38.76 43.85A15.75 15.75 0 1 0 56.15 61.24A5.75 5.75 0 0 1 67.58 62.5ZM32.42 37.5A27.25 27.25 0 1 1 62.5 67.58A5.75 5.75 0 0 1 61.24 56.15A15.75 15.75 0 1 0 43.85 38.76A5.75 5.75 0 0 1 32.42 37.5ZM44.25 50a5.75 5.75 0 1 0 11.5 0a5.75 5.75 0 1 0 -11.5 0Z";
const mark = (s) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 1024 1024" aria-hidden="true" class="mk"><rect width="1024" height="1024" rx="230" fill="#393C4D"/><path transform="translate(87.07 87.07) scale(8.5)" fill="#587AF5" d="${MARK_PATH}"/></svg>`;
const lockup = (s, h) => `<a class="lk" href="/" aria-label="Descall">${mark(s)}<img class="wm" src="/brand/descall-wordmark-white.svg" alt="" width="${Math.round(h * 4.32)}" height="${h}"></a>`;

function initialOf(name) {
  const ch = Array.from(String(name || "").replace(/[^\p{L}\p{N}]/gu, ""))[0];
  return ch ? ch.toLocaleUpperCase("tr-TR") : "D";
}

function dateParts(iso, c) {
  const d = new Date(iso);
  let mon = "";
  let when = "";
  try {
    mon = new Intl.DateTimeFormat(c.intl, { month: "short", timeZone: "Europe/Istanbul" }).format(d).replace(".", "").toLocaleUpperCase(c.intl);
    when = new Intl.DateTimeFormat(c.intl, { day: "numeric", month: "long", weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(d);
  } catch {
    mon = "";
    when = d.toISOString().slice(0, 16).replace("T", " ");
  }
  const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", timeZone: "Europe/Istanbul" }).format(d);
  return { mon, day, when };
}

function num(c, n) {
  try {
    return new Intl.NumberFormat(c.intl).format(n);
  } catch {
    return String(n);
  }
}

/** The page body (also used, inside an iframe, by the owner desk preview). */
export function renderBody(page, lang) {
  const c = copyFor(lang);
  const a = escapeHtml;
  const meta = pageMeta(page, lang);
  const counts = page.counts;
  const langName = page.language ? languageLabel(lang, page.language) : null;
  const bannerUrl = httpsUrl(page.bannerUrl);
  const iconUrl = httpsUrl(page.iconUrl);
  const stats = [];
  if (counts) {
    stats.push(`<span class="st on" data-s="count"><i class="dot" aria-hidden="true"></i><b>${a(num(c, counts.online))}</b> ${a(c.online)}</span>`);
    stats.push(`<span class="st" data-s="count"><b>${a(num(c, counts.members))}</b> ${a(c.members)}</span>`);
    if (counts.voice > 0) stats.push(`<span class="st" data-s="count"><b>${a(num(c, counts.voice))}</b> ${a(c.inVoice)}</span>`);
  }
  const langStat = langName ? `<span class="lgw"><span class="sep" aria-hidden="true"></span><span class="st">${icon("globe", 13)} ${a(langName)}</span></span>` : "";
  const tags = [];
  if (meta.category) tags.push(`<a class="tg c" href="${a(directoryHref(lang, page.category))}">${a(meta.category)}</a>`);
  if (langName) tags.push(`<span class="tg c ph-only">${a(langName)}</span>`);
  for (const t of page.tags || []) tags.push(`<span class="tg">#${a(t)}</span>`);

  const events = (page.events || []).map((e, i) => {
    const p = dateParts(e.startsAt, c);
    return `<div class="ev${i ? " ev2" : ""}"><div class="date${i ? " b" : ""}"><i>${a(p.mon)}</i><b>${a(p.day)}</b></div><div><strong>${a(e.title)}</strong><small>${a(p.when)}${e.place ? ` · ${a(e.place)}` : ""}</small></div></div>`;
  });
  const boxes = [];
  if (events.length) boxes.push(`<section class="box" data-s="ev"><h2>${icon("cal", 15)} ${a(c.upcoming)}</h2>${events.slice(0, 3).join("")}</section>`);
  if ((page.rules || []).length) boxes.push(`<section class="box" data-s="rules"><h2>${icon("book", 15)} ${a(c.rules)}</h2><ol class="rules">${page.rules.map((r) => `<li>${a(r)}</li>`).join("")}</ol></section>`);
  if (page.pin) boxes.push(`<section class="box pinb" data-s="pin"><h2>${icon("pin", 15)} ${a(c.pinned)}</h2><p class="pin">${a(page.pin).replace(/\n/g, "<br>")}</p></section>`);

  const ch = page.channels;
  const chans = ch && ch.total
    ? `<section class="box" data-s="chan"><h2>${icon("hash", 15)} ${a(c.channels)} <span class="mut">${a(fill(c.publicCount, { n: ch.total }))}</span></h2>
      ${ch.text.length ? `<div class="chh">${a(c.textChannels)}</div>${ch.text.map((x) => `<div class="ch">${icon("hash", 15)}<span>${a(x.name)}</span></div>`).join("")}` : ""}
      ${ch.voice.length ? `<div class="chh">${a(c.voiceChannels)}</div>${ch.voice.map((x) => `<div class="ch v">${icon("vol", 15)}<span>${a(x.name)}</span>${x.count ? `<small>${a(fill(c.people, { n: num(c, x.count) }))}</small>` : ""}</div>`).join("")}` : ""}
      <p class="note">${a(c.channelsNote)}</p></section>`
    : "";
  // The QR SVG comes from the backend (qrcode package) and is checked by normalizePage.
  const qr = page.qrSvg ? `<section class="box qrbox"><div class="qr" aria-hidden="true">${page.qrSvg}</div><div><b>${a(c.qrTitle)}</b>${a(c.qrBody)}</div></section>` : "";
  const joinBtn = (cls) => `<a class="btn pri ${cls}" href="/app?sv=${a(page.slug)}" data-join>${icon("arrow", 18)} <span>${a(c.join)}</span></a>`;
  const reportHref = `mailto:contact@descall.com?subject=${encodeURIComponent(`${c.reportSubject}: ${page.url}`)}`;

  return `<div class="pa">
  <header class="nav">${lockup(26, 14)}<nav class="links"><a href="${a(directoryHref(lang, null))}">${a(c.navCommunities)}</a><a href="/features">${a(c.navFeatures)}</a><a href="/download">${a(c.navDownload)}</a></nav><span class="sp"></span>
    <a class="btn sm ghost dk-only" href="/login">${a(c.login)}</a><a class="btn sm dk-only" href="/register">${a(c.signup)}</a><a class="btn sm pri ph-only" href="/app?sv=${a(page.slug)}" data-open>${a(c.openInApp)}</a></header>
  <nav class="crumb dk-only" aria-label="breadcrumb"><a href="${a(directoryHref(lang, null))}">${a(c.navCommunities)}</a>${page.category && meta.category ? `${icon("chev", 12)}<a href="${a(directoryHref(lang, page.category))}">${a(meta.category)}</a>` : ""}${icon("chev", 12)}<span>${a(page.name)}</span></nav>
  <div class="hero">
    <div class="bn${bannerUrl ? "" : " nob"}" data-s="banner">${bannerUrl ? `<img src="${a(bannerUrl)}" alt="" fetchpriority="high" decoding="async">` : ""}</div>
    <div class="head">
      <div class="icn">${iconUrl ? `<img src="${a(iconUrl)}" alt="${a(page.name)}" width="104" height="104">` : `<span>${a(initialOf(page.name))}</span>`}</div>
      <div class="ttl"><h1>${a(page.name)}</h1><div class="stats">${stats.join('<span class="sep" aria-hidden="true"></span>')}${stats.length ? langStat : langStat.replace('<span class="sep" aria-hidden="true"></span>', "")}</div></div>
      <div class="cta dk-only"><div class="row1"><button class="btn ghost ic-btn" type="button" data-share title="${a(c.share)}" aria-label="${a(c.share)}">${icon("share", 16)}</button>${joinBtn("lg")}</div><small>${a(c.joinSub)}</small></div>
    </div>
  </div>
  ${tags.length ? `<div class="tags" data-s="tags">${tags.join("")}</div>` : ""}
  <main class="grid">
    <div class="maincol">
      ${page.description ? `<section class="about" data-s="desc"><h2>${a(c.about)}</h2><p>${a(page.description).replace(/\n/g, "<br>")}</p></section>` : ""}
      ${boxes.length ? `<div class="hl n${boxes.length}">${boxes.join("")}</div>` : ""}
    </div>
    <aside class="side">${chans}${qr}</aside>
  </main>
  <footer class="foot"><span class="fl">${mark(18)}<span class="dk-only">${a(c.footer)}</span><span class="ph-only">${a(c.footerShort)}</span></span><span><a href="${a(reportHref)}" rel="nofollow">${a(c.report)}</a> · <a href="/privacy">${a(c.privacy)}</a></span></footer>
  <div class="stick ph-only">${joinBtn("lg")}</div>
  <div class="toast" role="status" aria-live="polite" hidden></div>
</div>`;
}

export const PAGE_CSS = `
:root{color-scheme:dark;--bg:#08090d;--text:#f4f6fb;--muted:#d4dbe6;--accent:#8eacff;--border:rgba(255,255,255,.12);--surface:rgba(255,255,255,.04);--t3:rgba(235,238,255,.68);--t4:rgba(235,238,255,.45);--ok:#3DDC84;--brand:#587AF5;--nav:rgba(8,9,13,.82);--hair:rgba(255,255,255,.06);--chip:rgba(255,255,255,.05);--date:#fff;--date-t:#111;--btn:rgba(255,255,255,.09);--btn-h:rgba(255,255,255,.14);--btn-t:rgba(255,255,255,.96);--shadow:rgba(0,0,0,.5);
--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",Inter,"Segoe UI Variable","Segoe UI",system-ui,sans-serif}
@media (prefers-color-scheme:light){:root:not([data-theme=dark]){color-scheme:light;--bg:#f6f7fb;--text:#10131c;--muted:#3b4255;--accent:#3355d8;--border:rgba(16,19,28,.12);--surface:#fff;--t3:rgba(16,19,28,.62);--t4:rgba(16,19,28,.45);--ok:#1a7f43;--nav:rgba(246,247,251,.86);--hair:rgba(16,19,28,.08);--chip:rgba(16,19,28,.04);--date:#fff;--date-t:#111;--btn:rgba(16,19,28,.06);--btn-h:rgba(16,19,28,.1);--btn-t:#10131c;--shadow:rgba(16,19,28,.18)}
:root:not([data-theme=dark]) .wm{filter:invert(1) brightness(.2)}}
:root[data-theme=light]{color-scheme:light;--bg:#f6f7fb;--text:#10131c;--muted:#3b4255;--accent:#3355d8;--border:rgba(16,19,28,.12);--surface:#fff;--t3:rgba(16,19,28,.62);--t4:rgba(16,19,28,.45);--ok:#1a7f43;--nav:rgba(246,247,251,.86);--hair:rgba(16,19,28,.08);--chip:rgba(16,19,28,.04);--btn:rgba(16,19,28,.06);--btn-h:rgba(16,19,28,.1);--btn-t:#10131c;--shadow:rgba(16,19,28,.18)}
:root[data-theme=light] .wm{filter:invert(1) brightness(.2)}
*{box-sizing:border-box}[hidden]{display:none!important}
html,body{margin:0;background:var(--bg)}
body{font-family:var(--font);color:var(--text);-webkit-font-smoothing:antialiased;font-size:14px;line-height:1.4}
a{color:inherit}
svg.i{flex:none;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle}
.pa{max-width:1200px;margin:0 auto;position:relative;min-height:100vh;display:flex;flex-direction:column}
.nav{display:flex;align-items:center;gap:22px;padding:14px 28px;border-bottom:1px solid var(--hair);background:var(--nav);position:sticky;top:0;z-index:6;backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%)}
.nav .lk{display:inline-flex;align-items:center;gap:8px;text-decoration:none}
.nav .wm{height:14px;width:auto;display:block}
.nav .mk{display:block;border-radius:6px}
.nav .links{display:flex;gap:22px}
.nav .links a{color:var(--muted);font-size:13px;text-decoration:none;opacity:.85}
.nav .links a:hover{opacity:1}
.nav .sp{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:36px;padding:0 14px;border-radius:12px;border:0;font:inherit;font-size:13px;font-weight:600;white-space:nowrap;background:var(--btn);color:var(--btn-t);box-shadow:inset 0 0 0 1px var(--border);text-decoration:none;cursor:pointer}
.btn:hover{background:var(--btn-h)}
.btn:focus-visible,a:focus-visible{outline:2px solid #8FA6FF;outline-offset:2px}
.btn.pri{background:linear-gradient(180deg,rgba(120,150,255,.98),rgba(80,112,240,.98));color:#fff;box-shadow:0 6px 18px rgba(88,122,245,.35),inset 0 1px 0 rgba(255,255,255,.25)}
.btn.pri:hover{filter:brightness(1.06)}
.btn.sm{height:30px;padding:0 10px;font-size:12px;border-radius:10px}
.btn.lg{height:48px;padding:0 22px;font-size:15px;border-radius:14px}
.btn.ghost{background:transparent;box-shadow:none;color:var(--muted)}
.btn.ic-btn{width:40px;padding:0}
.btn[aria-busy=true]{opacity:.75;pointer-events:none}
.crumb{padding:14px 28px 0;font-size:12px;color:var(--t3);display:flex;gap:6px;align-items:center}
.crumb a{color:var(--accent);text-decoration:none}
.hero{margin:12px 28px 0;position:relative}
.bn{height:210px;border-radius:20px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(88,122,245,.22),rgba(88,122,245,.06)),#393C4D}
.bn img{width:100%;height:100%;object-fit:cover;display:block}
.head{display:flex;gap:18px;align-items:flex-end;padding:0 6px 0 22px;margin-top:-34px;position:relative}
.icn{width:104px;height:104px;border-radius:26px;border:5px solid var(--bg);flex:none;box-shadow:0 10px 30px var(--shadow);overflow:hidden;background:linear-gradient(135deg,#587AF5,#393C4D);display:grid;place-items:center}
.icn img{width:100%;height:100%;object-fit:cover;display:block}
.icn span{color:#fff;font-size:42px;font-weight:800}
.ttl{flex:1;min-width:0;padding-bottom:2px}
h1{margin:0;font-size:30px;letter-spacing:-.025em;line-height:1.1;overflow-wrap:anywhere}
.stats{display:flex;gap:6px 14px;flex-wrap:wrap;margin-top:8px;font-size:13px;color:var(--muted);align-items:center}
.stats .st{display:inline-flex;gap:6px;align-items:center}
.stats b{color:var(--text);font-weight:700;font-variant-numeric:tabular-nums}
.stats .sep{width:3px;height:3px;border-radius:50%;background:var(--t4)}
.stats .lgw{display:inline-flex;gap:14px;align-items:center}
.dot{width:8px;height:8px;border-radius:50%;background:#23A55A;display:inline-block;flex:none;animation:pl 2s infinite}
@keyframes pl{0%{box-shadow:0 0 0 0 rgba(35,165,90,.55)}70%{box-shadow:0 0 0 8px rgba(35,165,90,0)}100%{box-shadow:0 0 0 0 rgba(35,165,90,0)}}
@media (prefers-reduced-motion:reduce){.dot{animation:none}}
.cta{display:flex;flex-direction:column;align-items:flex-end;gap:6px;padding-bottom:4px;position:relative}
.cta .row1{display:flex;gap:8px;align-items:center}
.cta small{position:absolute;right:2px;top:calc(100% + 2px);white-space:nowrap;font-size:11.5px;color:var(--t3)}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin:16px 28px 0}
.tg{font-size:12px;padding:4px 10px;border-radius:999px;background:var(--chip);border:1px solid var(--border);color:var(--muted);text-decoration:none}
.tg.c{background:rgba(142,172,255,.12);border-color:rgba(142,172,255,.3);color:var(--accent)}
.grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;padding:20px 28px 10px;flex:1;align-items:start}
h2{font-size:14px;margin:0 0 10px;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}
h2 .mut{font-weight:500;font-size:12px;margin-left:auto;color:var(--t3)}
.about p{margin:0;color:var(--muted);font-size:14px;line-height:1.6;overflow-wrap:anywhere}
.hl{display:grid;grid-template-columns:1.05fr 1fr;gap:12px;margin-top:18px}
.hl.n1 .box,.hl .pinb:nth-child(3),.hl.n2 .pinb:only-child{grid-column:1/3}
.box{border-radius:16px;background:var(--surface);border:1px solid var(--border);padding:14px;min-width:0}
.ev{display:flex;gap:12px;align-items:center}
.ev2{margin-top:10px;opacity:.85}
.date{width:54px;flex:none;border-radius:12px;overflow:hidden;text-align:center;background:var(--date);color:var(--date-t);box-shadow:0 0 0 1px var(--border)}
.date i{display:block;font-style:normal;font-size:10px;font-weight:800;background:#E8457A;color:#fff;padding:2px 0;letter-spacing:.06em}
.date.b i{background:#587AF5}
.date b{display:block;font-size:22px;padding:2px 0 4px}
.ev small{display:block;color:var(--t3);font-size:12px}
.ev strong{display:block;font-size:14px}
ol.rules{margin:0;padding-left:18px;color:var(--muted);font-size:13px;line-height:1.55}
.pin{margin:0;color:var(--muted);font-size:13px;line-height:1.5;overflow-wrap:anywhere}
.side{display:flex;flex-direction:column;gap:12px;min-width:0}
.ch{display:flex;align-items:center;gap:8px;padding:6px;border-radius:8px;font-size:13px;color:var(--muted)}
.ch span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ch svg{color:var(--t4)}
.ch small{margin-left:auto;font-size:11px;color:var(--ok);white-space:nowrap}
.chh{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--t4);font-weight:700;margin:10px 6px 4px}
.note{font-size:11.5px;color:var(--t3);line-height:1.45;margin:8px 6px 0}
.qrbox{display:flex;gap:12px;align-items:center}
.qrbox .qr{width:76px;height:76px;flex:none;border-radius:8px;overflow:hidden;background:#fff}
.qrbox .qr svg{width:100%;height:100%;display:block}
.qrbox div:last-child{font-size:12.5px;color:var(--muted);line-height:1.45}
.qrbox b{color:var(--text);display:block;font-size:13px}
.foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 28px 18px;border-top:1px solid var(--hair);margin-top:10px;font-size:12px;color:var(--t3)}
.foot .fl{display:inline-flex;align-items:center;gap:10px}
.foot a{color:var(--accent);text-decoration:none}
.stick{position:sticky;bottom:0;z-index:5;padding:10px 14px calc(14px + env(safe-area-inset-bottom));background:linear-gradient(180deg,transparent,var(--bg) 30%);display:flex;gap:8px}
.stick .btn{flex:1}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:20;background:#1B1C24;color:#fff;border-radius:12px;padding:10px 14px;font-size:13px;box-shadow:0 12px 32px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.1);max-width:calc(100vw - 28px)}
.toast a{color:#8FA6FF;margin-left:8px}
.ph-only{display:none!important}
@media (max-width:760px){
.dk-only{display:none!important}.ph-only{display:inline-flex!important}.stick.ph-only{display:flex!important}
.nav{padding:8px 16px;gap:10px}.nav .links{display:none}
.hero{margin:10px 12px 0}.bn{height:128px;border-radius:16px}
.head{flex-direction:column;align-items:flex-start;padding:0 8px;margin-top:-40px;gap:10px}
.icn{width:78px;height:78px;border-radius:20px;border-width:4px}.icn span{font-size:32px}
h1{font-size:24px}.stats{gap:6px 10px;font-size:12.5px}.stats .lgw{display:none}
.tags{margin:12px 20px 0}
.grid{display:block;padding:16px 14px 8px}
.hl{display:flex;overflow-x:auto;gap:10px;margin:14px -14px 0;padding:0 14px 2px;scrollbar-width:none;scroll-snap-type:x mandatory}
.hl::-webkit-scrollbar{display:none}
.hl .box{min-width:250px;scroll-snap-align:start}
.side{margin-top:14px}.qrbox{display:none}
.about p{font-size:13.5px}
.foot{flex-direction:column;gap:6px;align-items:flex-start;padding-bottom:12px}
.toast{bottom:92px}
}
`;

/**
 * Whole document. opts: { lang, apiOrigin, preview } (preview: owner desk iframe,
 * no client script, no beacons).
 */
export function renderServerPage(page, { lang, apiOrigin = DEFAULT_API_ORIGIN, preview = false } = {}) {
  const l = pageLang(lang);
  const c = PAGE_COPY[l];
  const a = escapeHtml;
  const meta = pageMeta(page, l);
  const image = ogImageUrl("s", page.slug, { version: page.version, lang: l });
  const imageAlt = `${page.name} · Descall`;
  const appArg = page.url;
  const data = {
    slug: page.slug,
    url: page.url,
    name: page.name,
    api: String(apiOrigin || DEFAULT_API_ORIGIN).replace(/\/$/, ""),
    t: { copied: c.copied, opening: c.opening, continueWeb: c.continueWeb, share: c.share },
  };
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`,
    `<title>${a(meta.title)}</title>`,
    `<meta name="description" content="${a(meta.description)}">`,
    `<meta name="robots" content="${preview ? "noindex, nofollow" : "index, follow, max-image-preview:large"}">`,
    `<link rel="canonical" href="${a(page.url)}">`,
    // One URL per server in the server's own language: a self-referencing alternate.
    `<link rel="alternate" hreflang="${a(l === "pt-BR" ? "pt-BR" : l)}" href="${a(page.url)}">`,
    `<link rel="alternate" hreflang="x-default" href="${a(page.url)}">`,
    `<meta name="theme-color" content="#08090d">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Descall">`,
    `<meta property="og:title" content="${a(meta.title)}">`,
    `<meta property="og:description" content="${a(meta.description)}">`,
    `<meta property="og:url" content="${a(page.url)}">`,
    `<meta property="og:image" content="${a(image)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${a(imageAlt)}">`,
    `<meta property="og:locale" content="${a(c.ogLocale)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${a(meta.title)}">`,
    `<meta name="twitter:description" content="${a(meta.description)}">`,
    `<meta name="twitter:image" content="${a(image)}">`,
    `<meta name="twitter:image:alt" content="${a(imageAlt)}">`,
    `<meta name="apple-itunes-app" content="${a(`app-id=${APP_STORE_ID}, app-argument=${appArg}`)}">`,
    `<script type="application/ld+json">${safeJson(jsonLd(page, l))}</script>`,
    `<style>${PAGE_CSS}</style>`,
  ];
  if (preview) head.push(`<style>a,button{pointer-events:none}.stick{position:relative}</style>`);
  if (!preview) {
    head.push(`<script type="application/json" id="sp-data">${safeJson(data)}</script>`);
    head.push(`<script src="/server-page-client.js" defer></script>`);
  }
  return `<!doctype html>
<html lang="${a(l)}" dir="ltr">
<head>
${head.join("\n")}
</head>
<body>
${renderBody(page, l)}
</body>
</html>
`;
}

/** Page language: the server's own language when set, else the visitor's (Vary). */
export function langForRequest(page, acceptLanguage) {
  if (page && page.language && page.language !== "other") return { lang: pageLang(page.language), vary: false };
  return { lang: acceptLang(acceptLanguage), vary: true };
}

function cacheKey(slug) {
  return new Request(`${SITE_ORIGIN}/__edge/server-page/v1/${encodeURIComponent(slug)}`);
}

/** Minimal shape check of the backend reply (never trust it blindly). */
export function normalizePage(body) {
  const p = body && typeof body === "object" ? body.page : null;
  if (!p || typeof p !== "object") return null;
  if (!VANITY_RE.test(String(p.slug || "")) || !p.name) return null;
  return {
    ...p,
    url: `${SITE_ORIGIN}/s/${p.slug}`,
    tags: Array.isArray(p.tags) ? p.tags.slice(0, 5) : [],
    events: Array.isArray(p.events) ? p.events.slice(0, 5) : [],
    rules: Array.isArray(p.rules) ? p.rules.slice(0, 3) : [],
    channels: p.channels && Array.isArray(p.channels.text) && Array.isArray(p.channels.voice) ? p.channels : null,
    qrSvg: typeof p.qrSvg === "string" && /^<svg[\s>]/.test(p.qrSvg) && !/<script|on\w+=|javascript:|<foreignObject/i.test(p.qrSvg) ? p.qrSvg : null,
  };
}

/**
 * The public page of a vanity slug, edge-cached PAGE_TTL_SECONDS. null when the page is off,
 * the backend is slow or anything fails (the worker then serves the invite landing).
 */
export async function fetchServerPage(slug, opts = {}) {
  const { apiOrigin = DEFAULT_API_ORIGIN, fetchImpl = fetch, cache = null, timeoutMs = PAGE_VISITOR_TIMEOUT_MS, clientIp = "", userAgent = "", waitUntil = null } = opts;
  if (!VANITY_RE.test(String(slug || ""))) return null;
  const key = cacheKey(slug);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) {
        const body = await hit.json().catch(() => null);
        return body && !body.missing ? normalizePage(body) : null;
      }
    } catch {
      /* ask the backend */
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    const headers = { accept: "application/json", "user-agent": "DescallServerPage/1.0 (+https://descall.com)" };
    if (clientIp) headers["x-forwarded-for"] = clientIp;
    if (userAgent) headers["x-descall-ua"] = String(userAgent).slice(0, 300);
    res = await fetchImpl(`${String(apiOrigin).replace(/\/$/, "")}/api/public-pages/s/${encodeURIComponent(slug)}`, { headers, signal: controller.signal, redirect: "manual" });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  const store = (body, ttl) => {
    if (!cache) return;
    const put = cache.put(key, new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` } })).catch(() => {});
    if (waitUntil) waitUntil(put);
  };
  if (res.status === 404) {
    store({ missing: true }, MISSING_TTL_SECONDS);
    return null;
  }
  if (!res.ok) return null;
  let body;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const page = normalizePage(body);
  if (!page) return null;
  store({ page }, PAGE_TTL_SECONDS);
  return page;
}
