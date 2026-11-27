"use strict";

/**
 * Public server page "Vitrin" + invite preview images (UI-BRIEF draft A, items 22 and 23).
 * Mounted at /api/public-pages.
 *
 * Public, no auth, rate limited per IP:
 *   GET  /s/:slug                 page data for the edge worker (404 while the page is off)
 *   POST /s/:slug/hit             page counters: { type: view|join_click, ref, src }
 *   GET  /sitemap-servers.xml     every shown page (served at descall.com/sitemap-servers.xml)
 *   GET  /og/s/:slug.png          1200x630 server card (vanity link)
 *   GET  /og/invite/:code.png     1200x630 server card (server invite) or the invalid card
 *   GET  /og/group/:code.png      1200x630 group card or the invalid card
 *   GET  /og/invalid.png          1200x630 "invite no longer valid" card (no names)
 *
 * Owner / ADMINISTRATOR only (signed in):
 *   GET  /manage/:serverId        settings, live state, preview data, results, audit entries
 *   PUT  /manage/:serverId        save settings (turning it OFF goes through /disable)
 *   POST /manage/:serverId/disable  { reason, note? }: noindex now, 10-minute undo, audit log
 *   POST /manage/:serverId/undo     turn it back on inside the undo window
 *
 * Rules and the public allow-list: lib/serverPublicPage.js. Images: lib/publicPageOg.js.
 */

const express = require("express");
const QRCode = require("qrcode");
const supabase = require("../db/supabase");
const { requireAuth } = require("../middleware/auth");
const { Permissions, hasPermission, resolveMemberPermissions } = require("../lib/serverPermissions");
const { apiError, templatedError, errorFields } = require("../lib/apiError");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
const { publicCache } = require("../lib/edgeConfig");
const { presence: livePresence, activeServerVoiceCalls } = require("../runtime/sharedState");
const { countVisibleOnline } = require("../lib/invitePreviewExtras");
const { createSingleflight } = require("../lib/singleflight");
const pp = require("../lib/serverPublicPage");
const og = require("../lib/publicPageOg");
const { getPublicPageStats } = require("../lib/publicPageStatsInstance");

const READ_LIMIT = { windowMs: 60 * 1000, max: 120 };
const HIT_LIMIT = { windowMs: 10 * 60 * 1000, max: 60 };
const OG_LIMIT = { windowMs: 60 * 1000, max: 90 };
const MANAGE_LIMIT = { windowMs: 60 * 1000, max: 60 };
const SAVE_LIMIT = { windowMs: 10 * 60 * 1000, max: 40 };
const PAGE_TTL_MS = 30 * 1000;
const SITEMAP_TTL_MS = 10 * 60 * 1000;
const CRAWL_WRITE_EVERY_MS = 60 * 60 * 1000;
const MEMBER_SCAN = 5000;
const INDEXNOW_KEY = "4f463b15fd51f502c6bb73abbeb38e3c";
const AUDIT_ACTIONS = ["PUBLIC_PAGE_ENABLE", "PUBLIC_PAGE_DISABLE", "PUBLIC_PAGE_UNDO", "PUBLIC_PAGE_UPDATE", "PUBLIC_PAGE_AUTO_HIDE"];
const SERVER_CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;
const GROUP_CODE_RE = /^[A-Za-z0-9_-]{2,64}$/;
const OG_LANGS = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

const router = express.Router();
const flight = createSingleflight();
const pageCache = new Map(); // slug -> { at, value }
const crawlWrites = new Map(); // serverId -> last write time
const images = og.createImageCache();
let sitemapCache = null;
let ioRef = null;

router.use((req, _res, next) => {
  if (!ioRef) ioRef = req.app?.get?.("io") || null;
  next();
});

function limited(req, res, kind, limit) {
  return rejectIfLimited(res, [recordFailure(`public-page-${kind}:ip:${req.ip || ""}`, limit)]);
}

function sendFailure(res, err, fallback) {
  const status = err?.status || 500;
  if (status >= 500) console.error("[public-page]", err?.message || err);
  if (status >= 500) return res.status(status).json(apiError(fallback));
  return res.status(status).json({ ...errorFields(err), error: err.message, code: err.code || null });
}

function cleanSlug(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return pp.VANITY_RE.test(s) ? s : null;
}

async function loadOwner(ownerId) {
  if (!ownerId) return null;
  try {
    const { data, error } = await supabase.from("users").select("id, is_banned, deleted_at").eq("id", ownerId).maybeSingle();
    if (!error) return data || null;
  } catch {
    /* older schema */
  }
  const { data } = await supabase.from("users").select("id").eq("id", ownerId).maybeSingle();
  return data || null;
}

async function memberStats(serverId) {
  const { count, error } = await supabase.from("server_members").select("user_id", { count: "exact", head: true }).eq("server_id", serverId);
  if (error) throw error;
  let onlineCount = 0;
  try {
    const { data: rows } = await supabase.from("server_members").select("user_id").eq("server_id", serverId).limit(MEMBER_SCAN);
    if (Array.isArray(rows)) onlineCount = countVisibleOnline(rows.map((r) => r.user_id), livePresence, ioRef);
  } catch {
    onlineCount = 0;
  }
  return { memberCount: count || 0, onlineCount };
}

function voiceCountsFor(channelIds) {
  const out = new Map();
  let total = 0;
  for (const id of channelIds) {
    const key = String(id).toLowerCase();
    const call = activeServerVoiceCalls.get(key) || activeServerVoiceCalls.get(String(id));
    const n = call?.participants?.size || 0;
    if (n) {
      out.set(key, n);
      total += n;
    }
  }
  return { map: out, total };
}

async function loadChannelData(serverId) {
  const [{ data: channels, error: cErr }, { data: roles, error: rErr }] = await Promise.all([
    supabase.from("server_channels").select("id, name, type, parent_id, position, nsfw").eq("server_id", serverId),
    supabase.from("server_roles").select("id, permissions, position, is_everyone").eq("server_id", serverId),
  ]);
  if (cErr) throw cErr;
  if (rErr) throw rErr;
  const ids = (channels || []).map((c) => c.id);
  const overrides = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("server_channel_overrides")
      .select("channel_id, target_type, target_id, allow_permissions, deny_permissions")
      .in("channel_id", ids.slice(i, i + 100));
    if (error) throw error;
    overrides.push(...(data || []));
  }
  return { channels: channels || [], roles: roles || [], overrides };
}

async function loadEvents(serverId) {
  const { data, error } = await supabase
    .from("server_public_events")
    .select("id, title, starts_at, ends_at, place")
    .eq("server_id", serverId)
    .order("starts_at", { ascending: true })
    .limit(20);
  if (error) {
    if (pp.isMissingSchemaError(error)) return [];
    throw error;
  }
  return data || [];
}

async function qrSvgFor(slug) {
  try {
    const svg = await QRCode.toString(`${pp.SITE_ORIGIN}/s/${slug}?src=qr`, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#0b0c12ff", light: "#ffffffff" },
    });
    return svg.replace(/<\?xml[^>]*>/, "").trim();
  } catch {
    return null;
  }
}

/** Everything the page shows, or { reason } when it is not shown. */
async function buildPage(slug) {
  const { data: row, error } = await supabase.from("servers").select("*").eq("vanity_slug", slug).maybeSingle();
  if (error) throw error;
  if (!row || !pp.hasSchema(row)) return { reason: "off" };
  if (!row.public_page_enabled) return { reason: "off" };
  const [{ memberCount, onlineCount }, owner] = await Promise.all([memberStats(row.id), loadOwner(row.owner_id)]);
  const reason = pp.hiddenReason(row, { memberCount, owner });
  if (reason) return { reason, serverId: row.id };
  const [chData, events, qrSvg] = await Promise.all([loadChannelData(row.id), loadEvents(row.id), qrSvgFor(slug)]);
  const voice = voiceCountsFor(chData.channels.filter((c) => c.type === "voice" || c.type === "stage").map((c) => c.id));
  const channels = pp.publicChannels({ ...chData, hiddenIds: row.public_page_hidden_channels, voiceCounts: voice.map });
  const payload = pp.buildPublicPayload(row, { memberCount, onlineCount, voiceCount: voice.total, channels, events, qrSvg });
  // Descall+ 2.0 thank-you wall (boosters who agreed, when the owner keeps it on); absent otherwise.
  if (payload) {
    const wall = await require("../lib/plus").publicWall(row.id).catch(() => null);
    if (wall && wall.boosters.length) payload.boostWall = wall;
  }
  return { payload, serverId: row.id };
}

async function pageFor(slug) {
  const hit = pageCache.get(slug);
  if (hit && Date.now() - hit.at < PAGE_TTL_MS) return hit.value;
  return flight.run(`page:${slug}`, async () => {
    const value = await buildPage(slug);
    pageCache.set(slug, { at: Date.now(), value });
    if (pageCache.size > 2000) pageCache.delete(pageCache.keys().next().value);
    return value;
  });
}

function forgetPage(slug) {
  if (slug) pageCache.delete(String(slug).toLowerCase());
  sitemapCache = null;
}

/** Google fetched the page: remember when (at most once an hour per server). */
function noteCrawl(serverId, ua) {
  if (!serverId || !/googlebot|google-inspectiontool/i.test(String(ua || ""))) return;
  const last = crawlWrites.get(serverId) || 0;
  if (Date.now() - last < CRAWL_WRITE_EVERY_MS) return;
  crawlWrites.set(serverId, Date.now());
  supabase
    .from("servers")
    .update({ public_page_last_crawl_at: new Date().toISOString() })
    .eq("id", serverId)
    .then(({ error }) => {
      if (error && !pp.isMissingSchemaError(error)) console.warn("[public-page] crawl time not saved:", error.message);
    }, () => {});
}

/** Tell IndexNow engines (Bing, Yandex, Seznam, Naver) that the page changed. Production only. */
function pingIndexNow(slug) {
  if (process.env.NODE_ENV !== "production" || !slug) return;
  const url = `${pp.SITE_ORIGIN}/s/${slug}`;
  fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: "descall.com", key: INDEXNOW_KEY, keyLocation: `${pp.SITE_ORIGIN}/${INDEXNOW_KEY}.txt`, urlList: [url] }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Public

router.get("/s/:slug", async (req, res) => {
  try {
    if (limited(req, res, "read", READ_LIMIT)) return;
    const slug = cleanSlug(req.params.slug);
    if (!slug) return res.status(404).json(apiError("Not found.", null, { code: "PUBLIC_PAGE_OFF" }));
    const page = await pageFor(slug);
    noteCrawl(page.serverId, req.get("x-descall-ua") || req.get("user-agent"));
    if (!page.payload) {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60");
      return res.status(404).json(apiError("Not found.", null, { code: "PUBLIC_PAGE_OFF" }));
    }
    publicCache(res, { maxAge: 30, sMaxAge: 60, swr: 120 });
    return res.json({ page: page.payload });
  } catch (err) {
    return sendFailure(res, err, "Could not load the page.");
  }
});

// navigator.sendBeacon posts text/plain (a CORS "simple" request, no preflight).
router.post("/s/:slug/hit", express.text({ type: ["text/plain", "application/json"], limit: "2kb" }), async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    if (limited(req, res, "hit", HIT_LIMIT)) return;
    const slug = cleanSlug(req.params.slug);
    const ua = req.get("user-agent") || "";
    if (!slug || pp.isCrawler(ua)) return res.status(204).end();
    const page = await pageFor(slug);
    if (!page.payload || !page.serverId) return res.status(204).end();
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    if (!body || typeof body !== "object") body = {};
    const source = pp.classifySource(String(body.ref || "").slice(0, 512), body.src);
    const stats = getPublicPageStats();
    if (body.type === "view") stats.view(page.serverId, source, { ip: req.ip, ua });
    else if (body.type === "join_click") stats.add(page.serverId, source, "join_clicks", 1);
    return res.status(204).end();
  } catch (err) {
    return sendFailure(res, err, "Could not record.");
  }
});

async function shownSlugs() {
  if (sitemapCache && Date.now() - sitemapCache.at < SITEMAP_TTL_MS) return sitemapCache.entries;
  return flight.run("sitemap", async () => {
    const { data, error } = await supabase
      .from("servers")
      .select("id, vanity_slug, owner_id, public_page_enabled, public_page_updated_at, directory_hidden_at, invites_paused_at")
      .eq("public_page_enabled", true)
      .not("vanity_slug", "is", null)
      .order("public_page_updated_at", { ascending: false })
      .limit(5000);
    if (error) {
      if (pp.isMissingSchemaError(error)) return [];
      throw error;
    }
    const entries = [];
    for (const row of data || []) {
      const [{ count }, owner] = await Promise.all([
        supabase.from("server_members").select("user_id", { count: "exact", head: true }).eq("server_id", row.id),
        loadOwner(row.owner_id),
      ]);
      if (pp.hiddenReason(row, { memberCount: count || 0, owner }) === null) {
        entries.push({ slug: row.vanity_slug, lastmod: row.public_page_updated_at });
      }
    }
    sitemapCache = { at: Date.now(), entries };
    return entries;
  });
}

router.get("/sitemap-servers.xml", async (req, res) => {
  try {
    if (limited(req, res, "read", READ_LIMIT)) return;
    const entries = await shownSlugs();
    publicCache(res, { maxAge: 600, sMaxAge: 1800, swr: 3600 });
    res.type("application/xml; charset=utf-8");
    return res.send(pp.sitemapXml(entries));
  } catch (err) {
    return sendFailure(res, err, "Could not build the sitemap.");
  }
});

function ogLang(raw) {
  const s = String(raw || "");
  return OG_LANGS.includes(s) ? s : "en";
}

function sendPng(res, buf, { versioned }) {
  res.set("Content-Type", "image/png");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Cache-Control", versioned ? "public, max-age=31536000, immutable" : "public, max-age=3600, s-maxage=3600");
  return res.end(buf);
}

async function sendInvalid(res, lang) {
  const buf = await images.get(`invalid:${lang}`, () => og.renderInvalidCard({ lang }));
  res.set("Content-Type", "image/png");
  res.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
  return res.status(200).end(buf);
}

async function serverCardFor(server, lang, version, urlText) {
  const { memberCount, onlineCount } = await memberStats(server.id);
  return images.get(`srv:${server.id}:${lang}:${version || ""}:${urlText || ""}`, () =>
    og.renderServerCard({
      name: server.name,
      description: server.directory_description || server.description || "",
      iconUrl: server.icon_url,
      bannerUrl: server.banner_url,
      memberCount,
      onlineCount,
      category: server.directory_category || null,
      lang,
      urlText,
    })
  );
}

router.get("/og/invalid.png", async (req, res) => {
  try {
    if (limited(req, res, "og", OG_LIMIT)) return;
    return await sendInvalid(res, ogLang(req.query.lang));
  } catch (err) {
    return sendFailure(res, err, "Could not draw the image.");
  }
});

router.get("/og/s/:slug.png", async (req, res) => {
  try {
    if (limited(req, res, "og", OG_LIMIT)) return;
    const lang = ogLang(req.query.lang);
    const slug = cleanSlug(req.params.slug);
    if (!slug) return await sendInvalid(res, lang);
    const { data: server, error } = await supabase.from("servers").select("*").eq("vanity_slug", slug).maybeSingle();
    if (error) throw error;
    if (!server) return await sendInvalid(res, lang);
    const v = String(req.query.v || "").slice(0, 24);
    const buf = await serverCardFor(server, lang, v, `descall.com/s/${slug}`);
    return sendPng(res, buf, { versioned: Boolean(v) });
  } catch (err) {
    return sendFailure(res, err, "Could not draw the image.");
  }
});

router.get("/og/invite/:code.png", async (req, res) => {
  try {
    if (limited(req, res, "og", OG_LIMIT)) return;
    const lang = ogLang(req.query.lang);
    const code = String(req.params.code || "");
    if (!SERVER_CODE_RE.test(code)) return await sendInvalid(res, lang);
    const { data: invite, error } = await supabase.from("server_invites").select("code, server_id, expires_at, max_uses, uses").eq("code", code).maybeSingle();
    if (error) throw error;
    const expired = !invite || (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) || (invite.max_uses != null && (invite.uses || 0) >= invite.max_uses);
    if (expired) return await sendInvalid(res, lang);
    const { data: server } = await supabase.from("servers").select("*").eq("id", invite.server_id).maybeSingle();
    if (!server) return await sendInvalid(res, lang);
    const v = String(req.query.v || "").slice(0, 24);
    const buf = await serverCardFor(server, lang, v, server.vanity_slug ? `descall.com/s/${server.vanity_slug}` : "descall.com");
    // Short cache even when versioned: the invite can expire while the version stays.
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    return res.end(buf);
  } catch (err) {
    return sendFailure(res, err, "Could not draw the image.");
  }
});

router.get("/og/group/:code.png", async (req, res) => {
  try {
    if (limited(req, res, "og", OG_LIMIT)) return;
    const lang = ogLang(req.query.lang);
    const code = String(req.params.code || "");
    if (!GROUP_CODE_RE.test(code)) return await sendInvalid(res, lang);
    const { data: invite, error } = await supabase
      .from("group_invite_links")
      .select("code, group_id, creator_id, max_uses, uses, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    const expired = !invite || (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) || (invite.max_uses != null && (invite.uses || 0) >= invite.max_uses);
    if (expired) return await sendInvalid(res, lang);
    const { data: group } = await supabase.from("groups").select("id, name, avatar_url").eq("id", invite.group_id).maybeSingle();
    if (!group) return await sendInvalid(res, lang);
    const v = String(req.query.v || "").slice(0, 24);
    const buf = await images.get(`grp:${group.id}:${code}:${lang}:${v}`, async () => {
      const { data: members } = await supabase.from("group_members").select("user_id").eq("group_id", group.id).limit(500);
      const ids = (members || []).map((m) => m.user_id);
      const onlineCount = countVisibleOnline(ids, livePresence, ioRef);
      // Avatars: the inviter first, then up to three more members (first letter or picture only).
      const pick = [...new Set([invite.creator_id, ...ids].filter(Boolean))].slice(0, 4);
      const { data: users } = pick.length
        ? await supabase.from("users").select("id, username, display_name, avatar_url").in("id", pick)
        : { data: [] };
      const byId = new Map((users || []).map((u) => [String(u.id), u]));
      const avatars = pick.map((id) => byId.get(String(id))).filter(Boolean).map((u) => ({ name: u.display_name || u.username || "", url: u.avatar_url || null }));
      const inviter = byId.get(String(invite.creator_id));
      return og.renderGroupCard({
        name: group.name,
        memberCount: ids.length,
        onlineCount,
        inviterName: inviter ? inviter.display_name || inviter.username : null,
        avatars: avatars.length ? avatars : group.avatar_url ? [{ name: group.name, url: group.avatar_url }] : [],
        lang,
      });
    });
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    return res.end(buf);
  } catch (err) {
    return sendFailure(res, err, "Could not draw the image.");
  }
});

// ---------------------------------------------------------------------------
// Owner / administrator desk

async function requireManager(serverId, userId) {
  const { data: server, error } = await supabase.from("servers").select("*").eq("id", serverId).maybeSingle();
  if (error) throw error;
  if (!server) throw templatedError("Server not found.", null, { status: 404, code: "NOT_FOUND" });
  if (String(server.owner_id) === String(userId)) return server;
  const resolved = await resolveMemberPermissions(supabase, serverId, userId, { server });
  if (!resolved.isMember || !hasPermission(resolved.bits, Permissions.ADMINISTRATOR)) {
    throw templatedError("Only the owner or an administrator can change this setting.", null, { status: 403, code: "ADMIN_REQUIRED" });
  }
  return server;
}

async function auditEntries(serverId) {
  const { data, error } = await supabase
    .from("server_audit_logs")
    .select("id, actor_id, action, changes, reason, created_at")
    .eq("server_id", serverId)
    .in("action", AUDIT_ACTIONS)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [];
  const ids = [...new Set((data || []).map((r) => r.actor_id).filter(Boolean))];
  const { data: users } = ids.length ? await supabase.from("users").select("id, username, display_name, avatar_url").in("id", ids) : { data: [] };
  const byId = new Map((users || []).map((u) => [String(u.id), u]));
  return (data || []).map((r) => {
    const u = byId.get(String(r.actor_id));
    return {
      id: r.id,
      action: r.action,
      changes: r.changes || null,
      reason: r.reason || null,
      createdAt: r.created_at,
      actor: u ? { id: u.id, name: u.display_name || u.username || "", username: u.username || "", avatarUrl: u.avatar_url || null } : null,
    };
  });
}

async function statsFor(serverId, days) {
  const today = pp.dayKey(Date.now());
  const from = pp.addDays(today, -(days * 2 - 1));
  const { data, error } = await supabase
    .from("server_public_page_daily")
    .select("day, source, views, join_clicks, joins")
    .eq("server_id", serverId)
    .gte("day", from)
    .limit(5000);
  if (error) return { ...pp.aggregateStats([], { days, today }), available: false };
  return { ...pp.aggregateStats(data || [], { days, today }), available: true };
}

/** Search Console rows for this page, only when the repo's sync job fills the table. */
async function searchConsoleFor(slug, days) {
  if (!slug) return null;
  const since = pp.addDays(pp.dayKey(Date.now()), -days);
  const pages = [`${pp.SITE_ORIGIN}/s/${slug}`, `${pp.SITE_ORIGIN}/s/${slug}/`];
  try {
    const { data, error } = await supabase
      .from("seo_search_console_daily")
      .select("query, clicks, impressions, position")
      .in("page", pages)
      .gte("date", since)
      .limit(5000);
    if (error) return null;
    return pp.aggregateSearchConsole(data || []);
  } catch {
    return null;
  }
}

async function deskState(server, { days = 30 } = {}) {
  const available = pp.hasSchema(server);
  const [{ memberCount, onlineCount }, owner, chData, events] = await Promise.all([
    memberStats(server.id),
    loadOwner(server.owner_id),
    loadChannelData(server.id),
    available ? loadEvents(server.id) : Promise.resolve([]),
  ]);
  const slug = server.vanity_slug || null;
  const reason = available ? pp.hiddenReason(server, { memberCount, owner }) : "unavailable";
  const voice = voiceCountsFor(chData.channels.filter((c) => c.type === "voice" || c.type === "stage").map((c) => c.id));
  // Every channel @everyone can see (the owner chooses which of them to list).
  const eligible = pp.publicChannels({ ...chData, hiddenIds: [], voiceCounts: voice.map });
  const lockedCount = chData.channels.filter((c) => c.type !== "category").length - eligible.total;
  const hiddenIds = new Set((server.public_page_hidden_channels || []).map((id) => String(id).toLowerCase()));
  const previewRow = { ...server, vanity_slug: slug || "your-server", public_page_hidden: [], public_page_hidden_channels: [] };
  const preview = pp.buildPublicPayload(previewRow, {
    memberCount,
    onlineCount,
    voiceCount: voice.total,
    channels: eligible,
    events,
    qrSvg: slug ? await qrSvgFor(slug) : null,
  });
  const [stats, search, audit] = await Promise.all([statsFor(server.id, days), searchConsoleFor(slug, days), auditEntries(server.id)]);
  const indexed = !server.public_page_enabled
    ? "off"
    : search && search.impressions > 0
      ? "indexed"
      : server.public_page_last_crawl_at
        ? "crawled"
        : "pending";
  return {
    available,
    settings: {
      enabled: Boolean(server.public_page_enabled),
      title: server.public_page_title || "",
      description: server.public_page_description || "",
      hidden: pp.hiddenSections(server),
      hiddenChannels: [...hiddenIds],
      pin: server.public_page_pin || "",
      events: pp.upcomingEvents(events).map((e) => ({ ...e })),
      enabledAt: server.public_page_enabled_at || null,
      updatedAt: server.public_page_updated_at || null,
      disabledAt: server.public_page_disabled_at || null,
      disabledReason: server.public_page_disabled_reason || null,
    },
    state: {
      shown: reason === null,
      reason,
      memberCount,
      onlineCount,
      minMembers: pp.MIN_MEMBERS,
      slug,
      url: slug ? `${pp.SITE_ORIGIN}/s/${slug}` : null,
      lastCrawlAt: server.public_page_last_crawl_at || null,
      indexed,
      undo: pp.undoState(server),
    },
    preview,
    channels: {
      text: eligible.text.map((c) => ({ ...c, hidden: hiddenIds.has(c.id.toLowerCase()) })),
      voice: eligible.voice.map((c) => ({ ...c, hidden: hiddenIds.has(c.id.toLowerCase()) })),
      lockedCount: Math.max(0, lockedCount),
    },
    stats,
    search,
    searchConsole: Boolean(search),
    audit,
    limits: pp.LIMITS,
    sections: pp.SECTION_KEYS,
    reasons: pp.DISABLE_REASONS,
    undoMs: pp.UNDO_MS,
  };
}

function statsDays(raw) {
  const n = Number(raw);
  return [7, 30, 90].includes(n) ? n : 30;
}

async function writeAudit(serverId, actorId, action, changes, reason) {
  const { error } = await supabase.from("server_audit_logs").insert({
    server_id: serverId,
    actor_id: actorId,
    action,
    target_type: "server",
    target_id: String(serverId),
    changes: changes && Object.keys(changes).length ? changes : null,
    reason: reason || null,
  });
  if (error) console.warn("[public-page] audit log insert failed:", error.message);
}

function unavailable(res) {
  return res.status(503).json(apiError("Public pages are not available yet.", null, { code: "PUBLIC_PAGE_UNAVAILABLE" }));
}

router.get("/manage/:serverId", requireAuth, async (req, res) => {
  try {
    if (limited(req, res, "manage", MANAGE_LIMIT)) return;
    const server = await requireManager(req.params.serverId, req.user.id);
    res.set("Cache-Control", "no-store");
    return res.json(await deskState(server, { days: statsDays(req.query.days) }));
  } catch (err) {
    return sendFailure(res, err, "Could not load the public page settings.");
  }
});

async function replaceEvents(serverId, events, userId) {
  const { error: delErr } = await supabase.from("server_public_events").delete().eq("server_id", serverId);
  if (delErr) throw delErr;
  if (!events.length) return;
  const { error } = await supabase.from("server_public_events").insert(events.map((e) => ({ ...e, server_id: serverId, created_by: userId })));
  if (error) throw error;
}

router.put("/manage/:serverId", requireAuth, express.json({ limit: "32kb" }), async (req, res) => {
  try {
    if (limited(req, res, "save", SAVE_LIMIT)) return;
    const server = await requireManager(req.params.serverId, req.user.id);
    res.set("Cache-Control", "no-store");
    if (!pp.hasSchema(server)) return unavailable(res);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.enabled === false && server.public_page_enabled) {
      return res.status(400).json(apiError("Turning the page off needs a reason.", null, { code: "REASON_REQUIRED" }));
    }
    if (body.enabled === true && !server.vanity_slug) {
      return res.status(400).json(apiError("Choose a descall.com/s/ address first.", null, { code: "NO_VANITY" }));
    }
    const { data: chans } = await supabase.from("server_channels").select("id").eq("server_id", server.id);
    const { patch, events, error: invalid } = pp.normalizeSettingsInput(body, server, { channelIds: (chans || []).map((c) => c.id) });
    if (invalid) return res.status(400).json(apiError(invalid.template, invalid.vars, { code: invalid.code }));
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("servers").update(patch).eq("id", server.id);
      if (error) {
        if (pp.isMissingSchemaError(error)) return unavailable(res);
        throw error;
      }
    }
    if (events) {
      try {
        await replaceEvents(server.id, events, req.user.id);
      } catch (err) {
        if (pp.isMissingSchemaError(err)) return unavailable(res);
        throw err;
      }
    }
    const turnedOn = patch.public_page_enabled === true;
    const changes = pp.auditChanges(patch, server);
    if (events) changes.events = { to: events.length };
    if (turnedOn) await writeAudit(server.id, req.user.id, "PUBLIC_PAGE_ENABLE", null, null);
    delete changes.enabled;
    if (Object.keys(changes).length) await writeAudit(server.id, req.user.id, "PUBLIC_PAGE_UPDATE", changes, null);
    forgetPage(server.vanity_slug);
    if (turnedOn || server.public_page_enabled) pingIndexNow(server.vanity_slug);
    const { data: fresh } = await supabase.from("servers").select("*").eq("id", server.id).maybeSingle();
    return res.json(await deskState(fresh || { ...server, ...patch }, { days: statsDays(req.query.days) }));
  } catch (err) {
    return sendFailure(res, err, "Could not save the public page.");
  }
});

router.post("/manage/:serverId/disable", requireAuth, express.json({ limit: "4kb" }), async (req, res) => {
  try {
    if (limited(req, res, "save", SAVE_LIMIT)) return;
    const server = await requireManager(req.params.serverId, req.user.id);
    res.set("Cache-Control", "no-store");
    if (!pp.hasSchema(server)) return unavailable(res);
    const reason = String(req.body?.reason || "");
    if (!pp.DISABLE_REASONS.includes(reason)) {
      return res.status(400).json(apiError("Choose why you are turning the page off.", null, { code: "REASON_REQUIRED" }));
    }
    const note = pp.cleanLine(req.body?.note, 200);
    if (reason === "other" && !note) {
      return res.status(400).json(apiError("Write a short reason.", null, { code: "NOTE_REQUIRED" }));
    }
    if (!server.public_page_enabled) {
      return res.json(await deskState(server, { days: statsDays(req.query.days) }));
    }
    const now = Date.now();
    const patch = {
      public_page_enabled: false,
      public_page_disabled_at: new Date(now).toISOString(),
      public_page_disabled_reason: reason,
      public_page_undo_until: new Date(now + pp.UNDO_MS).toISOString(),
      public_page_updated_at: new Date(now).toISOString(),
    };
    const { error } = await supabase.from("servers").update(patch).eq("id", server.id);
    if (error) {
      if (pp.isMissingSchemaError(error)) return unavailable(res);
      throw error;
    }
    await writeAudit(server.id, req.user.id, "PUBLIC_PAGE_DISABLE", { reason }, note ? `${reason}: ${note}` : reason);
    forgetPage(server.vanity_slug);
    pingIndexNow(server.vanity_slug);
    return res.json(await deskState({ ...server, ...patch }, { days: statsDays(req.query.days) }));
  } catch (err) {
    return sendFailure(res, err, "Could not turn the page off.");
  }
});

router.post("/manage/:serverId/undo", requireAuth, async (req, res) => {
  try {
    if (limited(req, res, "save", SAVE_LIMIT)) return;
    const server = await requireManager(req.params.serverId, req.user.id);
    res.set("Cache-Control", "no-store");
    if (!pp.hasSchema(server)) return unavailable(res);
    if (!pp.undoState(server)) {
      return res.status(409).json(apiError("The undo window has passed.", null, { code: "UNDO_EXPIRED" }));
    }
    const patch = {
      public_page_enabled: true,
      public_page_enabled_at: new Date().toISOString(),
      public_page_undo_until: null,
      public_page_disabled_reason: null,
      public_page_updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("servers").update(patch).eq("id", server.id);
    if (error) throw error;
    await writeAudit(server.id, req.user.id, "PUBLIC_PAGE_UNDO", null, null);
    forgetPage(server.vanity_slug);
    pingIndexNow(server.vanity_slug);
    return res.json(await deskState({ ...server, ...patch }, { days: statsDays(req.query.days) }));
  } catch (err) {
    return sendFailure(res, err, "Could not turn the page back on.");
  }
});

/** Tests: drop caches. */
router.__reset = () => {
  pageCache.clear();
  crawlWrites.clear();
  images.clear();
  sitemapCache = null;
};

module.exports = router;
