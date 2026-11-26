"use strict";

/**
 * Public server page "Vitrin" (descall.com/s/<slug>, UI-BRIEF draft A).
 *
 * OFF by default. The owner (or an ADMINISTRATOR) turns on "Google'da göster"; only then
 * does the edge worker (frontend/public/_worker.js + server-page.js) render the page and
 * let search engines index it. Off: /s/<slug> stays the normal invite landing (noindex).
 *
 * What may leave this module (allow-list, profanity masked):
 *   name, icon, banner, description, category / tags / language (directory settings),
 *   member / online / in-voice counts, channel NAMES that @everyone can see (never
 *   messages, never hidden, role-locked or age-restricted channels, never channels the
 *   owner left out), owner highlights (events, the first rules, a pinned note).
 *
 * The page hides itself (and the owner is told why) while:
 *   - the server has fewer than MIN_MEMBERS members,
 *   - Descall moderation hid it from the directory or paused its invites,
 *   - the owner account is banned or deleted.
 *
 * Pure helpers only (no database). Routes: routes/publicPages.js. Columns and tables:
 * supabase/migrations/20261124u_server_public_page.sql. Tests: serverPublicPage.selftest.cjs.
 */

const crypto = require("crypto");
const { maskProfanity } = require("./profanity");
const { Permissions, hasPermission, computeMemberBaseBits, computeChannelOverwriteBits } = require("./serverPermissions");

/** Sections the owner can hide (name and icon are always shown). Same keys as src/lib/publicPage.js. */
const SECTION_KEYS = ["banner", "desc", "tags", "count", "chan", "ev", "rules", "pin"];
const DISABLE_REASONS = ["season_break", "too_many_joins", "raid", "other"];
const LIMITS = Object.freeze({
  titleMax: 70,
  titleShown: 60,
  descriptionMax: 170,
  descriptionShown: 155,
  pinMax: 280,
  eventsMax: 5,
  eventTitleMax: 80,
  placeMax: 60,
  rulesShown: 3,
  ruleLenMax: 140,
  channelsShownText: 12,
  channelsShownVoice: 8,
});
const MIN_MEMBERS = 3;
const UNDO_MS = 10 * 60 * 1000;
const SITE_ORIGIN = "https://descall.com";
const VANITY_RE = /^[a-z0-9][a-z0-9-]{2,31}$/;

const SOURCES = [
  "google", "bing", "yandex", "duckduckgo", "whatsapp", "telegram", "x", "instagram",
  "facebook", "reddit", "discord", "youtube", "tiktok", "descall", "qr", "direct", "other",
];

/** Referrer host (suffix match) -> source. Order matters: first match wins. */
const SOURCE_HOSTS = [
  ["google", /(^|\.)google\.[a-z.]+$|(^|\.)googleusercontent\.com$/],
  ["bing", /(^|\.)bing\.com$/],
  ["yandex", /(^|\.)yandex\.[a-z.]+$|(^|\.)ya\.ru$/],
  ["duckduckgo", /(^|\.)duckduckgo\.com$/],
  ["whatsapp", /(^|\.)whatsapp\.(com|net)$|^wa\.me$/],
  ["telegram", /(^|\.)telegram\.(org|me)$|^t\.me$/],
  ["x", /(^|\.)(x|twitter)\.com$|^t\.co$/],
  ["instagram", /(^|\.)instagram\.com$/],
  ["facebook", /(^|\.)(facebook|fb|messenger)\.com$|^l\.facebook\.com$|^fb\.me$/],
  ["reddit", /(^|\.)reddit\.com$|^redd\.it$/],
  ["discord", /(^|\.)discord(app)?\.(com|gg)$/],
  ["youtube", /(^|\.)youtube\.com$|^youtu\.be$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["descall", /(^|\.)descall\.com$/],
];

/** utm_source / ?src= values the page links themselves use. */
const SOURCE_ALIASES = { wa: "whatsapp", tg: "telegram", twitter: "x", ig: "instagram", fb: "facebook", yt: "youtube" };

const CRAWLER_RE =
  /googlebot|google-inspectiontool|googleother|adsbot-google|mediapartners-google|bingbot|bingpreview|yandex(bot|images)|duckduckbot|baiduspider|applebot|petalbot|seznambot|naver|yeti|sogou|exabot|ahrefsbot|semrushbot|mj12bot|dotbot|facebookexternalhit|facebot|meta-externalagent|twitterbot|telegrambot|whatsapp|slackbot|discordbot|linkedinbot|embedly|pinterest|redditbot|skypeuripreview|vkshare|bot\b|crawler|spider|headless|lighthouse|pagespeed|preview/i;
const SEARCH_ENGINE_RE = /googlebot|google-inspectiontool|bingbot|yandexbot|duckduckbot|applebot|baiduspider|petalbot|seznambot/i;

function isCrawler(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return true;
  return CRAWLER_RE.test(ua);
}

/** True for search engine crawlers (they update public_page_last_crawl_at). */
function isSearchEngine(userAgent) {
  return SEARCH_ENGINE_RE.test(String(userAgent || ""));
}

function hostOf(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Traffic source of one page view: an explicit ?src= / utm_source first (QR codes, shared
 * links), then the referrer host. No referrer: "direct". Unknown: "other".
 */
function classifySource(referrer, hint) {
  const h = String(hint || "").trim().toLowerCase().slice(0, 32);
  if (h) {
    const aliased = SOURCE_ALIASES[h] || h;
    if (SOURCES.includes(aliased) && aliased !== "other") return aliased;
  }
  const host = hostOf(referrer);
  if (!host) return "direct";
  for (const [source, re] of SOURCE_HOSTS) if (re.test(host)) return source;
  return "other";
}

function cleanLine(raw, max) {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max) : s;
}

function cleanMultiline(raw, max) {
  const s = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.length > max ? s.slice(0, max) : s;
}

function isMissingSchemaError(err) {
  const code = String(err?.code || "");
  const msg = String(err?.message || "");
  return code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205" || code === "42883" ||
    /public_page_|server_public_(events|page_daily)|server_public_page_bump/.test(msg);
}

function hasSchema(row) {
  return Boolean(row) && Object.prototype.hasOwnProperty.call(row, "public_page_enabled");
}

/** Hidden section keys, clean and unique. */
function hiddenSections(row) {
  const list = Array.isArray(row?.public_page_hidden) ? row.public_page_hidden : [];
  return [...new Set(list.map(String).filter((k) => SECTION_KEYS.includes(k)))];
}

/**
 * Why the public page is not shown right now (null: it is shown).
 *   "off"                owner has not turned it on
 *   "moderation"         Descall staff hid the server from the directory or paused its invites
 *   "owner_unavailable"  owner account banned or deleted
 *   "too_few_members"    fewer than MIN_MEMBERS members
 *   "no_vanity"          no descall.com/s/<slug> address yet
 */
function hiddenReason(row, { memberCount = 0, owner } = {}) {
  if (!row || !row.public_page_enabled) return "off";
  if (!row.vanity_slug || !VANITY_RE.test(String(row.vanity_slug))) return "no_vanity";
  if (row.directory_hidden_at || row.invites_paused_at) return "moderation";
  if (!owner || owner.is_banned || owner.deleted_at) return "owner_unavailable";
  if (!(Number(memberCount) >= MIN_MEMBERS)) return "too_few_members";
  return null;
}

/** First rules (one line each), as on the page ("Kurallar özeti"). */
function rulesSummary(text, n = LIMITS.rulesShown) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, n)
    .map((l) => maskProfanity(cleanLine(l, LIMITS.ruleLenMax)));
}

const TEXT_TYPES = new Set(["text", "announcement", "forum", "media"]);
const VOICE_TYPES = new Set(["voice", "stage"]);

/**
 * Channels a logged-out visitor may learn the NAME of: @everyone has VIEW_CHANNEL after the
 * governing overwrites (the channel's own, else its category's), the channel is not
 * age-restricted, it is not in a category @everyone cannot see, and the owner did not
 * leave it out. Messages are never part of this.
 *
 * @param {{ channels: object[], roles: object[], overrides: object[], hiddenIds?: string[],
 *           voiceCounts?: Map<string, number> }} input
 * @returns {{ text: {id,name}[], voice: {id,name,count}[], total: number }}
 */
function publicChannels({ channels = [], roles = [], overrides = [], hiddenIds = [], voiceCounts = null } = {}) {
  const hidden = new Set((hiddenIds || []).map((id) => String(id).toLowerCase()));
  const base = computeMemberBaseBits(roles, []);
  const byId = new Map(channels.map((c) => [String(c.id), c]));
  const canView = (ch) => {
    const bits = computeChannelOverwriteBits({
      baseBits: base,
      roles,
      assigned: [],
      overrides,
      channelId: ch.id,
      parentId: ch.parent_id || null,
      userId: "__public__",
    });
    return hasPermission(bits, Permissions.VIEW_CHANNEL);
  };
  const sorted = [...channels].sort((a, b) => {
    const pa = a.parent_id ? byId.get(String(a.parent_id)) : null;
    const pb = b.parent_id ? byId.get(String(b.parent_id)) : null;
    const ka = (pa ? Number(pa.position) || 0 : -1) * 10000 + (Number(a.position) || 0);
    const kb = (pb ? Number(pb.position) || 0 : -1) * 10000 + (Number(b.position) || 0);
    return ka - kb;
  });
  const text = [];
  const voice = [];
  for (const ch of sorted) {
    if (!ch || ch.type === "category") continue;
    if (ch.nsfw) continue;
    if (hidden.has(String(ch.id).toLowerCase())) continue;
    const parent = ch.parent_id ? byId.get(String(ch.parent_id)) : null;
    if (parent && (parent.nsfw || !canView(parent))) continue;
    if (!canView(ch)) continue;
    const name = maskProfanity(cleanLine(ch.name, 60));
    if (!name) continue;
    if (VOICE_TYPES.has(ch.type)) {
      const count = voiceCounts ? Number(voiceCounts.get(String(ch.id).toLowerCase())) || 0 : 0;
      voice.push({ id: String(ch.id), name, count });
    } else if (TEXT_TYPES.has(ch.type)) {
      text.push({ id: String(ch.id), name });
    }
  }
  return { text, voice, total: text.length + voice.length };
}

/** Upcoming events (not ended), soonest first, at most LIMITS.eventsMax. */
function upcomingEvents(rows, now = new Date()) {
  const t = now.getTime();
  return (rows || [])
    .filter((e) => {
      const start = Date.parse(e?.starts_at);
      if (!Number.isFinite(start)) return false;
      const end = Date.parse(e?.ends_at || "") || start + 3 * 60 * 60 * 1000;
      return end >= t;
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, LIMITS.eventsMax)
    .map((e) => ({
      id: String(e.id),
      title: maskProfanity(cleanLine(e.title, LIMITS.eventTitleMax)),
      startsAt: new Date(Date.parse(e.starts_at)).toISOString(),
      endsAt: e.ends_at && Number.isFinite(Date.parse(e.ends_at)) ? new Date(Date.parse(e.ends_at)).toISOString() : null,
      place: e.place ? maskProfanity(cleanLine(e.place, LIMITS.placeMax)) : null,
    }));
}

function httpsUrl(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 2048) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Short stable hash (og:image ?v=, sitemap, ETag). */
function shortHash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("base64url").slice(0, 10);
}

/**
 * The only shape the public page is built from (the edge worker renders it).
 * Hidden sections are left out here, not only hidden in HTML.
 */
function buildPublicPayload(row, { memberCount = 0, onlineCount = 0, voiceCount = 0, channels = null, events = [], qrSvg = null, now = new Date() } = {}) {
  const hidden = new Set(hiddenSections(row));
  const description = maskProfanity(cleanMultiline(row.directory_description || row.description || "", 600));
  const tags = Array.isArray(row.directory_tags) ? row.directory_tags.slice(0, 5).map((t) => maskProfanity(cleanLine(t, 24))).filter(Boolean) : [];
  const pin = row.public_page_pin ? maskProfanity(cleanMultiline(row.public_page_pin, LIMITS.pinMax)) : "";
  const rules = rulesSummary(row.rules_text);
  const evs = upcomingEvents(events, now);
  const payload = {
    slug: String(row.vanity_slug),
    url: `${SITE_ORIGIN}/s/${row.vanity_slug}`,
    name: maskProfanity(cleanLine(row.name, 100)),
    iconUrl: httpsUrl(row.icon_url),
    bannerUrl: hidden.has("banner") ? null : httpsUrl(row.banner_url),
    description: hidden.has("desc") ? "" : description,
    category: hidden.has("tags") ? null : row.directory_category || null,
    language: hidden.has("tags") ? null : row.directory_language || null,
    tags: hidden.has("tags") ? [] : tags,
    counts: hidden.has("count")
      ? null
      : { members: Math.max(0, Number(memberCount) || 0), online: Math.max(0, Number(onlineCount) || 0), voice: Math.max(0, Number(voiceCount) || 0) },
    channels: hidden.has("chan") || !channels ? null : channels,
    events: hidden.has("ev") ? [] : evs,
    rules: hidden.has("rules") ? [] : rules,
    pin: hidden.has("pin") ? "" : pin,
    seo: {
      title: cleanLine(row.public_page_title || "", LIMITS.titleMax),
      description: cleanLine(row.public_page_description || "", LIMITS.descriptionMax),
    },
    createdAt: row.created_at || null,
    updatedAt: row.public_page_updated_at || row.updated_at || null,
    qrSvg: typeof qrSvg === "string" && qrSvg.startsWith("<svg") ? qrSvg : null,
  };
  payload.version = shortHash({
    n: payload.name, i: payload.iconUrl, b: payload.bannerUrl, d: payload.description.slice(0, 160),
    m: payload.counts?.members ?? null, o: payload.counts ? Math.round((payload.counts.online || 0) / 5) : null,
    u: payload.updatedAt,
  });
  return payload;
}

/**
 * Owner input -> servers patch. Returns { patch, events, error }.
 * events: null (unchanged) or the full new list [{ title, startsAt, endsAt, place }].
 */
function normalizeSettingsInput(body = {}, current = {}, { channelIds = null, now = new Date() } = {}) {
  const patch = {};
  const fail = (code, template, vars) => ({ patch: null, events: null, error: { code, template, vars: vars || null } });
  if (body.enabled !== undefined) {
    const on = Boolean(body.enabled);
    if (on !== Boolean(current.public_page_enabled)) {
      patch.public_page_enabled = on;
      if (on) {
        patch.public_page_enabled_at = now.toISOString();
        patch.public_page_undo_until = null;
        patch.public_page_disabled_reason = null;
      }
    }
  }
  if (body.title !== undefined) {
    const title = cleanLine(body.title, 1000);
    if (title.length > LIMITS.titleMax) return fail("TITLE_TOO_LONG", "The title can be at most {max} characters.", { max: LIMITS.titleMax });
    patch.public_page_title = title || null;
  }
  if (body.description !== undefined) {
    const d = cleanLine(body.description, 1000);
    if (d.length > LIMITS.descriptionMax) return fail("DESCRIPTION_TOO_LONG", "The description can be at most {max} characters.", { max: LIMITS.descriptionMax });
    patch.public_page_description = d || null;
  }
  if (body.pin !== undefined) {
    const p = cleanMultiline(body.pin, 2000);
    if (p.length > LIMITS.pinMax) return fail("PIN_TOO_LONG", "The pinned note can be at most {max} characters.", { max: LIMITS.pinMax });
    patch.public_page_pin = p || null;
  }
  if (body.hidden !== undefined) {
    if (!Array.isArray(body.hidden)) return fail("INVALID_SECTIONS", "Invalid page sections.");
    const bad = body.hidden.find((k) => !SECTION_KEYS.includes(String(k)));
    if (bad !== undefined) return fail("INVALID_SECTIONS", "Invalid page sections.");
    patch.public_page_hidden = [...new Set(body.hidden.map(String))];
  }
  if (body.hiddenChannels !== undefined) {
    if (!Array.isArray(body.hiddenChannels) || body.hiddenChannels.length > 500) return fail("INVALID_CHANNELS", "Invalid channel list.");
    const ids = [...new Set(body.hiddenChannels.map((id) => String(id).toLowerCase()))];
    if (channelIds) {
      const known = new Set(channelIds.map((id) => String(id).toLowerCase()));
      if (ids.some((id) => !known.has(id))) return fail("INVALID_CHANNELS", "Invalid channel list.");
    }
    patch.public_page_hidden_channels = ids;
  }
  let events = null;
  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length > LIMITS.eventsMax) {
      return fail("TOO_MANY_EVENTS", "A page can show at most {max} events.", { max: LIMITS.eventsMax });
    }
    events = [];
    for (const raw of body.events) {
      const title = cleanLine(raw?.title, 1000);
      if (!title) return fail("EVENT_TITLE_REQUIRED", "Every event needs a title.");
      if (title.length > LIMITS.eventTitleMax) return fail("EVENT_TITLE_TOO_LONG", "An event title can be at most {max} characters.", { max: LIMITS.eventTitleMax });
      const start = Date.parse(raw?.startsAt);
      if (!Number.isFinite(start)) return fail("EVENT_DATE_INVALID", "Every event needs a valid start time.");
      if (start < now.getTime() - 24 * 60 * 60 * 1000) return fail("EVENT_IN_PAST", "An event cannot start in the past.");
      if (start > now.getTime() + 366 * 24 * 60 * 60 * 1000) return fail("EVENT_TOO_FAR", "An event can be at most a year ahead.");
      let end = null;
      if (raw?.endsAt) {
        end = Date.parse(raw.endsAt);
        if (!Number.isFinite(end) || end < start) return fail("EVENT_END_INVALID", "An event cannot end before it starts.");
      }
      const place = cleanLine(raw?.place, 1000);
      if (place.length > LIMITS.placeMax) return fail("EVENT_PLACE_TOO_LONG", "A place can be at most {max} characters.", { max: LIMITS.placeMax });
      events.push({
        title,
        starts_at: new Date(start).toISOString(),
        ends_at: end ? new Date(end).toISOString() : null,
        place: place || null,
      });
    }
  }
  if (Object.keys(patch).length || events) patch.public_page_updated_at = now.toISOString();
  return { patch, events, error: null };
}

/** Human-readable diff for the audit log (keys only, short values). */
function auditChanges(patch, current) {
  const out = {};
  const short = (v) => (typeof v === "string" ? (v.length > 80 ? `${v.slice(0, 79)}…` : v) : v);
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === "public_page_updated_at" || k === "public_page_enabled_at" || k === "public_page_undo_until") continue;
    const before = current ? current[k] : undefined;
    if (JSON.stringify(before ?? null) === JSON.stringify(v ?? null)) continue;
    out[k.replace(/^public_page_/, "")] = { from: short(before ?? null), to: short(v ?? null) };
  }
  return out;
}

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function addDays(day, n) {
  const t = Date.parse(`${day}T00:00:00Z`) + n * 86400000;
  return dayKey(t);
}

/**
 * Owner results from server_public_page_daily rows ({ day, source, views, join_clicks, joins }).
 * days: window length; the previous window of the same length gives the deltas.
 */
function aggregateStats(rows, { days = 30, today = dayKey(Date.now()) } = {}) {
  const from = addDays(today, -(days - 1));
  const prevFrom = addDays(from, -days);
  const series = [];
  const idx = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = addDays(from, i);
    idx.set(d, i);
    series.push({ day: d, views: 0, google: 0, joins: 0, joinClicks: 0 });
  }
  const cur = { views: 0, joins: 0, joinClicks: 0, google: 0 };
  const prev = { views: 0, joins: 0, joinClicks: 0, google: 0 };
  const bySource = new Map();
  let joinsLast7 = 0;
  const weekFrom = addDays(today, -6);
  for (const r of rows || []) {
    const d = String(r.day).slice(0, 10);
    const views = Number(r.views) || 0;
    const joins = Number(r.joins) || 0;
    const clicks = Number(r.join_clicks) || 0;
    const google = r.source === "google" ? views : 0;
    if (d >= from && d <= today) {
      const s = series[idx.get(d)];
      if (s) {
        s.views += views;
        s.google += google;
        s.joins += joins;
        s.joinClicks += clicks;
      }
      cur.views += views;
      cur.joins += joins;
      cur.joinClicks += clicks;
      cur.google += google;
      if (d >= weekFrom) joinsLast7 += joins;
      const b = bySource.get(r.source) || { source: r.source, views: 0, joins: 0 };
      b.views += views;
      b.joins += joins;
      bySource.set(r.source, b);
    } else if (d >= prevFrom && d < from) {
      prev.views += views;
      prev.joins += joins;
      prev.joinClicks += clicks;
      prev.google += google;
    }
  }
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const sources = [...bySource.values()].sort((a, b) => b.joins - a.joins || b.views - a.views);
  return {
    days,
    from,
    to: today,
    series,
    totals: {
      views: cur.views,
      googleVisits: cur.google,
      joins: cur.joins,
      joinClicks: cur.joinClicks,
      joinsLast7,
      conversion: cur.views > 0 ? Math.round((cur.joins / cur.views) * 1000) / 10 : null,
    },
    deltas: { views: pct(cur.views, prev.views), joins: pct(cur.joins, prev.joins), google: pct(cur.google, prev.google) },
    sources,
  };
}

/** Search Console rows (seo_search_console_daily) of one page -> clicks, position, top terms. */
function aggregateSearchConsole(rows, { top = 5 } = {}) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let clicks = 0;
  let impressions = 0;
  let posWeighted = 0;
  const terms = new Map();
  for (const r of rows) {
    const c = Number(r.clicks) || 0;
    const imp = Number(r.impressions) || 0;
    clicks += c;
    impressions += imp;
    posWeighted += (Number(r.position) || 0) * imp;
    const q = cleanLine(r.query, 80);
    if (!q) continue;
    const t = terms.get(q) || { query: q, clicks: 0, impressions: 0 };
    t.clicks += c;
    t.impressions += imp;
    terms.set(q, t);
  }
  return {
    clicks,
    impressions,
    position: impressions > 0 ? Math.round((posWeighted / impressions) * 10) / 10 : null,
    terms: [...terms.values()].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, top),
  };
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** sitemap-servers.xml: one <url> per shown public page. entries: [{ slug, lastmod }]. */
function sitemapXml(entries) {
  const urls = (entries || [])
    .filter((e) => VANITY_RE.test(String(e?.slug || "")))
    .map((e) => {
      const lastmod = e.lastmod && Number.isFinite(Date.parse(e.lastmod)) ? `<lastmod>${dayKey(e.lastmod)}</lastmod>` : "";
      return `  <url><loc>${escapeXml(`${SITE_ORIGIN}/s/${e.slug}`)}</loc>${lastmod}<changefreq>daily</changefreq></url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}${urls.length ? "\n" : ""}</urlset>\n`;
}

/** Owner-facing state of the undo window. */
function undoState(row, now = Date.now()) {
  const until = Date.parse(row?.public_page_undo_until || "");
  if (!Number.isFinite(until) || until <= now || row?.public_page_enabled) return null;
  return { until: new Date(until).toISOString(), msLeft: until - now };
}

module.exports = {
  SECTION_KEYS,
  DISABLE_REASONS,
  LIMITS,
  MIN_MEMBERS,
  UNDO_MS,
  SOURCES,
  SITE_ORIGIN,
  VANITY_RE,
  isCrawler,
  isSearchEngine,
  classifySource,
  isMissingSchemaError,
  hasSchema,
  hiddenSections,
  hiddenReason,
  rulesSummary,
  publicChannels,
  upcomingEvents,
  buildPublicPayload,
  normalizeSettingsInput,
  auditChanges,
  aggregateStats,
  aggregateSearchConsole,
  sitemapXml,
  undoState,
  shortHash,
  dayKey,
  addDays,
  cleanLine,
};
