"use strict";

/**
 * Public server page "Vitrin" + invite cards: /api/public-pages over real HTTP, synthetic
 * data in the in-memory fake Supabase (nothing reaches a database or the network).
 *   - off by default: 404 for the edge worker, nothing in the sitemap
 *   - owner turns it on: the page data is the allow-list only (no messages, no hidden or
 *     role-locked or age-restricted channels, no owner-hidden sections), sitemap entry
 *   - auto-hide: too few members, moderation, banned owner
 *   - owner desk: settings, validation, events, audit entries, results, Search Console
 *   - turning it off needs a reason, writes the audit log, and can be undone for 10 minutes
 *   - only the owner or an ADMINISTRATOR; others get 403
 *   - counters: crawlers ignored, text/plain beacons accepted
 *   - 1200x630 PNG cards: server, group, invalid (expired / unknown codes)
 *   - migration not applied: the page reads as off, saves answer 503
 * Run: node frontend/backend/test/publicPages.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.PUBLIC_APP_URL = "https://descall.com";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const P = require("../lib/serverPermissions");

const ts = (i) => new Date(Date.UTC(2026, 10, 1, 0, 0, i)).toISOString();
const soon = new Date(Date.now() + 5 * 86400000).toISOString();
const PEOPLE = ["owner", "admin", "mod", "m1", "m2", "m3", "stranger", "banned"];
const users = PEOPLE.map((id) => ({ id, username: id, display_name: id.toUpperCase(), active_sessions: [{ id: `s-${id}` }], is_banned: id === "banned", deleted_at: null, email_verified: true }));

const server = (over) => ({
  icon_url: null,
  banner_url: null,
  description: "Sakin survival sunucusu.",
  rules_text: "Kufur yok\nGrief yasak\nHile yasak\nSECRET-FOURTH-RULE",
  is_public: false,
  community_enabled: false,
  verification_level: "none",
  directory_category: "gaming-minecraft",
  directory_language: "tr",
  directory_description: null,
  directory_tags: ["survival"],
  directory_hidden_at: null,
  invites_paused_at: null,
  public_page_enabled: false,
  public_page_enabled_at: null,
  public_page_title: null,
  public_page_description: null,
  public_page_hidden: [],
  public_page_hidden_channels: [],
  public_page_pin: null,
  public_page_updated_at: null,
  public_page_disabled_at: null,
  public_page_disabled_reason: null,
  public_page_undo_until: null,
  public_page_last_crawl_at: null,
  created_at: ts(0),
  ...over,
});

const servers = [
  server({ id: "srv", owner_id: "owner", name: "Anadolu Craft", vanity_slug: "anadolucraft" }),
  server({ id: "tiny", owner_id: "owner", name: "Tiny", vanity_slug: "tinyone", public_page_enabled: true }),
  server({ id: "modded", owner_id: "owner", name: "Modded", vanity_slug: "moddedone", public_page_enabled: true, directory_hidden_at: ts(2) }),
  server({ id: "bad-owner", owner_id: "banned", name: "Banned Owner", vanity_slug: "bannedone", public_page_enabled: true }),
];
const members = [];
for (const [sid, ids] of [["srv", ["owner", "admin", "mod", "m1", "m2"]], ["tiny", ["owner", "m1"]], ["modded", ["owner", "m1", "m2", "m3"]], ["bad-owner", ["banned", "m1", "m2", "m3"]]]) {
  ids.forEach((u, i) => members.push({ server_id: sid, user_id: u, joined_at: ts(10 + i) }));
}
const roles = servers.map((s) => ({ id: `${s.id}-everyone`, server_id: s.id, is_everyone: true, position: 0, permissions: P.toPgBigint(P.EVERYONE_DEFAULT), created_at: ts(0) }));
roles.push({ id: "srv-admin", server_id: "srv", is_everyone: false, name: "Admin", position: 2, permissions: P.toPgBigint(P.Permissions.ADMINISTRATOR), created_at: ts(0) });
roles.push({ id: "srv-mod", server_id: "srv", is_everyone: false, name: "Mod", position: 1, permissions: P.toPgBigint(P.Permissions.MANAGE_GUILD), created_at: ts(0) });

const seed = () => ({
  users,
  servers,
  server_members: members,
  server_roles: roles,
  server_member_roles: [
    { server_id: "srv", user_id: "admin", role_id: "srv-admin" },
    { server_id: "srv", user_id: "mod", role_id: "srv-mod" },
  ],
  server_channels: [
    { id: "c-gen", server_id: "srv", type: "text", name: "genel-sohbet", position: 0, nsfw: false },
    { id: "c-staff", server_id: "srv", type: "text", name: "SECRET-STAFF-ROOM", position: 1, nsfw: false },
    { id: "c-nsfw", server_id: "srv", type: "text", name: "SECRET-NSFW", position: 2, nsfw: true },
    { id: "c-out", server_id: "srv", type: "text", name: "SECRET-OWNER-HIDDEN", position: 3, nsfw: false },
    { id: "c-lobby", server_id: "srv", type: "voice", name: "Lobi", position: 4, nsfw: false },
  ],
  server_channel_overrides: [
    { id: "o1", channel_id: "c-staff", target_type: "role", target_id: "srv-everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(P.Permissions.VIEW_CHANNEL) },
  ],
  server_messages: [{ id: "msg1", server_id: "srv", channel_id: "c-gen", author_id: "owner", content: "SECRET-MESSAGE", created_at: ts(20) }],
  server_invites: [
    { code: "GOODCODE", server_id: "srv", creator_id: "owner", uses: 0, max_uses: null, expires_at: null },
    { code: "OLDCODE1", server_id: "srv", creator_id: "owner", uses: 0, max_uses: null, expires_at: ts(1) },
  ],
  groups: [{ id: "g1", name: "Hafta Sonu Ekibi", avatar_url: null }],
  group_members: [{ group_id: "g1", user_id: "m1" }, { group_id: "g1", user_id: "m2" }],
  group_invite_links: [{ code: "grpcode1", group_id: "g1", creator_id: "m1", uses: 0, max_uses: null, expires_at: null }],
  server_public_events: [],
  server_public_page_daily: [
    { server_id: "srv", day: new Date().toISOString().slice(0, 10), source: "google", views: 12, join_clicks: 4, joins: 3 },
  ],
  seo_search_console_daily: [
    { date: new Date().toISOString().slice(0, 10), query: "anadolu craft", page: "https://descall.com/s/anadolucraft", country: "tur", device: "MOBILE", clicks: 9, impressions: 40, position: 2.5 },
  ],
  server_audit_logs: [],
});

let current = createFakeSupabase(seed());
const proxy = { from: (name) => current.from(name), rpc: async () => ({ error: null }), get storage() { return current.storage; } };
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: proxy };

const express = require("express");
const { signToken } = require("../config/jwt");
const router = require("../routes/publicPages");
const sharp = require("sharp");

const PRIVATE = ["SECRET-STAFF-ROOM", "SECRET-NSFW", "SECRET-OWNER-HIDDEN", "SECRET-MESSAGE", "SECRET-FOURTH-RULE", "owner_id", "\"owner\""];
function assertPrivate(body, label) {
  const text = JSON.stringify(body);
  for (const m of PRIVATE) assert.ok(!text.includes(m), `${label} leaks ${m}`);
}

async function run() {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use("/api/public-pages", router);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let ipSeq = 0;
  const call = async (who, method, p, body, { headers: extra = {}, raw = false } = {}) => {
    const headers = { "Content-Type": "application/json", "X-Forwarded-For": `10.1.0.${(ipSeq++ % 200) + 1}`, ...extra };
    if (who) headers.Authorization = `Bearer ${signToken({ id: who, username: who, sid: `s-${who}` })}`;
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
    if (raw) return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
  };

  try {
    // ---- Off by default.
    let r = await call(null, "GET", "/api/public-pages/s/anadolucraft");
    assert.equal(r.status, 404);
    assert.equal(r.body.code, "PUBLIC_PAGE_OFF");
    r = await call(null, "GET", "/api/public-pages/s/NOT_A_SLUG!");
    assert.equal(r.status, 404);
    let xml = await (await fetch(`${base}/api/public-pages/sitemap-servers.xml`)).text();
    assert.ok(!xml.includes("anadolucraft"), "off: not in the sitemap");

    // ---- Permissions: stranger and MANAGE_GUILD-only mod refused, admin allowed.
    assert.equal((await call(null, "GET", "/api/public-pages/manage/srv")).status, 401);
    assert.equal((await call("stranger", "GET", "/api/public-pages/manage/srv")).status, 403);
    assert.equal((await call("mod", "GET", "/api/public-pages/manage/srv")).status, 403);
    r = await call("admin", "GET", "/api/public-pages/manage/srv");
    assert.equal(r.status, 200);
    assert.equal(r.body.settings.enabled, false);
    assert.equal(r.body.state.reason, "off");
    assert.equal(r.body.state.indexed, "off");
    assert.deepEqual(r.body.channels.text.map((c) => c.name), ["genel-sohbet", "SECRET-OWNER-HIDDEN"], "picker: every @everyone-visible text channel");
    assert.equal(r.body.channels.lockedCount, 2, "role-locked + age-restricted are counted, never listed");
    assert.equal(r.body.stats.totals.views, 12);
    assert.equal(r.body.searchConsole, true);
    assert.equal(r.body.search.terms[0].query, "anadolu craft");
    assert.equal(r.body.limits.titleShown, 60);

    // ---- Validation.
    r = await call("owner", "PUT", "/api/public-pages/manage/srv", { title: "x".repeat(71) });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "TITLE_TOO_LONG");
    r = await call("owner", "PUT", "/api/public-pages/manage/srv", { hiddenChannels: ["c-elsewhere"] });
    assert.equal(r.body.code, "INVALID_CHANNELS");

    // ---- Turn it on with settings, an event and a hidden channel.
    r = await call("owner", "PUT", "/api/public-pages/manage/srv", {
      enabled: true,
      title: "Anadolu Craft · Türkçe Minecraft survival sunucusu",
      description: "Sakin survival ve Sezon 7.",
      hidden: ["pin"],
      pin: "SECRET-PIN-HIDDEN",
      hiddenChannels: ["c-out"],
      events: [{ title: "Sezon 7 açılışı", startsAt: soon, place: "Lobi" }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.settings.enabled, true);
    assert.equal(r.body.state.shown, true);
    assert.equal(r.body.state.indexed, "indexed", "Search Console impressions: in the index");
    assert.equal(r.body.settings.events.length, 1);
    const audit = current._tables.server_audit_logs.rows.map((x) => x.action);
    assert.ok(audit.includes("PUBLIC_PAGE_ENABLE") && audit.includes("PUBLIC_PAGE_UPDATE"), audit.join());

    // ---- Public data: allow-list only.
    r = await call(null, "GET", "/api/public-pages/s/anadolucraft", undefined, { headers: { "x-descall-ua": "Mozilla/5.0 (compatible; Googlebot/2.1)" } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("cache-control") || "", /public/);
    const page = r.body.page;
    assertPrivate(page, "public page");
    assert.ok(!JSON.stringify(page).includes("SECRET-PIN-HIDDEN"), "owner-hidden section is not sent");
    assert.equal(page.name, "Anadolu Craft");
    assert.equal(page.url, "https://descall.com/s/anadolucraft");
    assert.deepEqual(page.channels.text.map((c) => c.name), ["genel-sohbet"]);
    assert.deepEqual(page.channels.voice.map((c) => c.name), ["Lobi"]);
    assert.deepEqual(page.rules, ["Kufur yok", "Grief yasak", "Hile yasak"]);
    assert.equal(page.events[0].title, "Sezon 7 açılışı");
    assert.equal(page.counts.members, 5);
    assert.ok(page.qrSvg.startsWith("<svg"), "QR code for the desktop box");
    assert.equal(page.seo.title, "Anadolu Craft · Türkçe Minecraft survival sunucusu");
    await new Promise((res) => setTimeout(res, 20));
    assert.ok(current._tables.servers.rows.find((s) => s.id === "srv").public_page_last_crawl_at, "Googlebot fetch remembered");
    xml = await (await fetch(`${base}/api/public-pages/sitemap-servers.xml`)).text();
    assert.ok(xml.includes("<loc>https://descall.com/s/anadolucraft</loc>"), "on: in the sitemap");

    // ---- Auto-hidden pages are 404 and stay out of the sitemap.
    for (const slug of ["tinyone", "moddedone", "bannedone"]) {
      assert.equal((await call(null, "GET", `/api/public-pages/s/${slug}`)).status, 404, `${slug} hidden`);
      assert.ok(!xml.includes(slug), `${slug} not in the sitemap`);
    }

    // ---- Counters: text/plain beacon, crawlers ignored.
    r = await call(null, "POST", "/api/public-pages/s/anadolucraft/hit", JSON.stringify({ type: "view", ref: "https://www.google.com/" }), { headers: { "Content-Type": "text/plain", "User-Agent": "Mozilla/5.0 (iPhone)" } });
    assert.equal(r.status, 204);
    r = await call(null, "POST", "/api/public-pages/s/anadolucraft/hit", JSON.stringify({ type: "join_click" }), { headers: { "Content-Type": "text/plain", "User-Agent": "Googlebot/2.1" } });
    assert.equal(r.status, 204);
    const stats = require("../lib/publicPageStatsInstance").getPublicPageStats();
    assert.equal(stats.pendingSize(), 1, "one counted view (the crawler is ignored)");

    // ---- Turning it off: reason required, audit, undo window, then undo.
    r = await call("owner", "PUT", "/api/public-pages/manage/srv", { enabled: false });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "REASON_REQUIRED");
    r = await call("owner", "POST", "/api/public-pages/manage/srv/disable", { reason: "bogus" });
    assert.equal(r.body.code, "REASON_REQUIRED");
    r = await call("owner", "POST", "/api/public-pages/manage/srv/disable", { reason: "other" });
    assert.equal(r.body.code, "NOTE_REQUIRED");
    r = await call("owner", "POST", "/api/public-pages/manage/srv/disable", { reason: "season_break" });
    assert.equal(r.status, 200);
    assert.equal(r.body.settings.enabled, false);
    assert.ok(r.body.state.undo && r.body.state.undo.msLeft > 9 * 60 * 1000, "10-minute undo");
    assert.equal((await call(null, "GET", "/api/public-pages/s/anadolucraft")).status, 404, "off at once (noindex)");
    const dis = current._tables.server_audit_logs.rows.find((x) => x.action === "PUBLIC_PAGE_DISABLE");
    assert.equal(dis.reason, "season_break");
    assert.equal(dis.actor_id, "owner");
    r = await call("owner", "GET", "/api/public-pages/manage/srv");
    assert.ok(r.body.audit.some((e) => e.action === "PUBLIC_PAGE_DISABLE" && e.actor.name === "OWNER"), "desk shows the audit entry");
    r = await call("owner", "POST", "/api/public-pages/manage/srv/undo");
    assert.equal(r.status, 200);
    assert.equal(r.body.settings.enabled, true);
    assert.equal((await call(null, "GET", "/api/public-pages/s/anadolucraft")).status, 200, "back on");
    r = await call("owner", "POST", "/api/public-pages/manage/srv/undo");
    assert.equal(r.status, 409, "nothing to undo");
    // Expired window.
    await call("owner", "POST", "/api/public-pages/manage/srv/disable", { reason: "raid" });
    current._tables.servers.rows.find((s) => s.id === "srv").public_page_undo_until = ts(1);
    r = await call("owner", "POST", "/api/public-pages/manage/srv/undo");
    assert.equal(r.body.code, "UNDO_EXPIRED");

    // ---- Cards: PNG 1200x630, invalid for expired / unknown codes.
    for (const p of ["/api/public-pages/og/s/anadolucraft.png?v=abc", "/api/public-pages/og/invite/GOODCODE.png", "/api/public-pages/og/group/grpcode1.png?lang=tr", "/api/public-pages/og/invite/OLDCODE1.png", "/api/public-pages/og/invite/NOPE9999.png", "/api/public-pages/og/invalid.png?lang=ru"]) {
      const img = await call(null, "GET", p, undefined, { raw: true });
      assert.equal(img.status, 200, p);
      assert.equal(img.headers.get("content-type"), "image/png", p);
      const meta = await sharp(img.buf).metadata();
      assert.equal(`${meta.width}x${meta.height}`, "1200x630", p);
    }
    const versioned = await call(null, "GET", "/api/public-pages/og/s/anadolucraft.png?v=abc", undefined, { raw: true });
    assert.match(versioned.headers.get("cache-control"), /immutable/, "versioned card is immutable");
    const expired = await call(null, "GET", "/api/public-pages/og/invite/OLDCODE1.png", undefined, { raw: true });
    const invalid = await call(null, "GET", "/api/public-pages/og/invalid.png", undefined, { raw: true });
    assert.ok(expired.buf.equals(invalid.buf), "an expired invite gets exactly the neutral card (no server name)");

    // ---- Migration not applied: off, saves 503.
    current = createFakeSupabase({
      ...seed(),
      servers: servers.map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith("public_page_")))),
    });
    router.__reset();
    assert.equal((await call(null, "GET", "/api/public-pages/s/anadolucraft")).status, 404);
    r = await call("owner", "GET", "/api/public-pages/manage/srv");
    assert.equal(r.status, 200);
    assert.equal(r.body.available, false);
    r = await call("owner", "PUT", "/api/public-pages/manage/srv", { enabled: true });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, "PUBLIC_PAGE_UNAVAILABLE");

    console.log("publicPages integration ok");
  } finally {
    srv.close();
  }
}

run().then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
