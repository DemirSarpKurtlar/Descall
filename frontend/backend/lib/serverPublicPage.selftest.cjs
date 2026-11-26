"use strict";

/**
 * lib/serverPublicPage.js: visibility rules, the public allow-list (no hidden, role-locked
 * or age-restricted channels, no messages, owner-hidden sections left out), settings
 * validation, traffic sources, results and the sitemap. Synthetic data only.
 * Run: node frontend/backend/lib/serverPublicPage.selftest.cjs
 */

const assert = require("node:assert/strict");
const pp = require("./serverPublicPage");
const P = require("./serverPermissions");

// ---- hiddenReason
const owner = { id: "o" };
const base = { public_page_enabled: true, vanity_slug: "anadolucraft", directory_hidden_at: null, invites_paused_at: null };
assert.equal(pp.hiddenReason(base, { memberCount: 3, owner }), null);
assert.equal(pp.hiddenReason({ ...base, public_page_enabled: false }, { memberCount: 3, owner }), "off");
assert.equal(pp.hiddenReason({ ...base, vanity_slug: null }, { memberCount: 3, owner }), "no_vanity");
assert.equal(pp.hiddenReason({ ...base, directory_hidden_at: "x" }, { memberCount: 9, owner }), "moderation");
assert.equal(pp.hiddenReason({ ...base, invites_paused_at: "x" }, { memberCount: 9, owner }), "moderation");
assert.equal(pp.hiddenReason(base, { memberCount: 9, owner: { is_banned: true } }), "owner_unavailable");
assert.equal(pp.hiddenReason(base, { memberCount: 9, owner: null }), "owner_unavailable");
assert.equal(pp.hiddenReason(base, { memberCount: 2, owner }), "too_few_members");

// ---- publicChannels: @everyone visibility, categories, nsfw, owner list, voice counts
const VIEW = P.Permissions.VIEW_CHANNEL;
const roles = [
  { id: "r-every", is_everyone: true, position: 0, permissions: P.toPgBigint(P.EVERYONE_DEFAULT) },
  { id: "r-staff", is_everyone: false, position: 2, permissions: P.toPgBigint(VIEW) },
];
const channels = [
  { id: "c-cat", type: "category", name: "Genel", position: 0 },
  { id: "c-gen", type: "text", name: "genel-sohbet", parent_id: "c-cat", position: 1 },
  { id: "c-ann", type: "announcement", name: "duyurular", parent_id: null, position: 0 },
  { id: "c-staff", type: "text", name: "yetkili-odasi", parent_id: null, position: 3 },
  { id: "c-nsfw", type: "text", name: "yetiskin", nsfw: true, position: 4 },
  { id: "c-cat2", type: "category", name: "Gizli", position: 5 },
  { id: "c-in-hidden-cat", type: "text", name: "gizli-alt", parent_id: "c-cat2", position: 0 },
  { id: "c-lobby", type: "voice", name: "Lobi", position: 6 },
  { id: "c-out", type: "text", name: "sahibin-cikardigi", position: 7 },
];
const overrides = [
  { channel_id: "c-staff", target_type: "role", target_id: "r-every", allow_permissions: "0", deny_permissions: P.toPgBigint(VIEW) },
  { channel_id: "c-staff", target_type: "role", target_id: "r-staff", allow_permissions: P.toPgBigint(VIEW), deny_permissions: "0" },
  { channel_id: "c-cat2", target_type: "role", target_id: "r-every", allow_permissions: "0", deny_permissions: P.toPgBigint(VIEW) },
];
const pub = pp.publicChannels({ channels, roles, overrides, hiddenIds: ["C-OUT"], voiceCounts: new Map([["c-lobby", 4]]) });
assert.deepEqual(pub.text.map((c) => c.name), ["duyurular", "genel-sohbet"], "only @everyone-visible text channels, category order");
assert.deepEqual(pub.voice, [{ id: "c-lobby", name: "Lobi", count: 4 }]);
assert.equal(pub.total, 3);
const all = JSON.stringify(pub);
for (const secret of ["yetkili", "yetiskin", "gizli", "sahibin"]) assert.ok(!all.includes(secret), `${secret} never public`);

// ---- buildPublicPayload: allow-list and hidden sections
const row = {
  id: "srv", owner_id: "SECRET-OWNER", name: "Anadolu Craft", vanity_slug: "anadolucraft",
  icon_url: "https://x.supabase.co/storage/v1/object/public/i.png", banner_url: "http://insecure/b.png",
  description: "Sakin survival.", directory_description: null, directory_category: "gaming-minecraft",
  directory_language: "tr", directory_tags: ["survival", "sezon-7"], rules_text: "1. Kufur yok\n2. Grief yasak\n3. Hile yasak\n4. Dorduncu",
  public_page_hidden: ["pin", "bogus"], public_page_pin: "SECRET-PIN", public_page_title: "Baslik", public_page_description: "",
  public_page_updated_at: "2026-11-20T10:00:00Z", invite_code: "SECRET-INVITE",
};
const now = new Date("2026-11-24T12:00:00Z");
const events = [
  { id: "e1", title: "Sezon 7 acilisi", starts_at: "2026-11-29T18:00:00Z" },
  { id: "e0", title: "Gecmis", starts_at: "2026-11-01T18:00:00Z" },
];
const payload = pp.buildPublicPayload(row, { memberCount: 4812, onlineCount: 637, voiceCount: 41, channels: pub, events, qrSvg: "<svg/>", now });
assert.equal(payload.url, "https://descall.com/s/anadolucraft");
assert.equal(payload.bannerUrl, null, "only https images");
assert.ok(payload.iconUrl.startsWith("https://"));
assert.deepEqual(payload.rules, ["Kufur yok", "Grief yasak", "Hile yasak"], "first three rules");
assert.equal(payload.pin, "", "hidden section left out of the data");
assert.deepEqual(payload.events.map((e) => e.title), ["Sezon 7 acilisi"], "past events dropped");
assert.deepEqual(payload.counts, { members: 4812, online: 637, voice: 41 });
assert.equal(payload.seo.title, "Baslik");
assert.match(payload.version, /^[A-Za-z0-9_-]{10}$/);
const text = JSON.stringify(payload);
for (const secret of ["SECRET-OWNER", "SECRET-PIN", "SECRET-INVITE", "owner_id", "Dorduncu"]) assert.ok(!text.includes(secret), `payload leaks ${secret}`);
const hiddenAll = pp.buildPublicPayload({ ...row, public_page_hidden: pp.SECTION_KEYS, public_page_pin: "x" }, { memberCount: 5, channels: pub, events, now });
assert.equal(hiddenAll.counts, null);
assert.equal(hiddenAll.channels, null);
assert.deepEqual(hiddenAll.tags, []);
assert.equal(hiddenAll.category, null);
assert.equal(hiddenAll.description, "");
assert.deepEqual(hiddenAll.events, []);
assert.deepEqual(hiddenAll.rules, []);
assert.equal(hiddenAll.name, "Anadolu Craft", "name is always shown");
const v2 = pp.buildPublicPayload({ ...row, name: "Yeni Ad" }, { memberCount: 4812, onlineCount: 637, now });
assert.notEqual(v2.version, payload.version, "version moves when the card changes");

// ---- normalizeSettingsInput
const cur = { public_page_enabled: false };
let r = pp.normalizeSettingsInput({ enabled: true, title: "  A  title ", hidden: ["pin", "pin", "rules"] }, cur, { now });
assert.equal(r.error, null);
assert.equal(r.patch.public_page_enabled, true);
assert.equal(r.patch.public_page_title, "A title");
assert.deepEqual(r.patch.public_page_hidden, ["pin", "rules"]);
assert.ok(r.patch.public_page_updated_at && r.patch.public_page_enabled_at);
assert.equal(pp.normalizeSettingsInput({ title: "x".repeat(71) }, cur).error.code, "TITLE_TOO_LONG");
assert.equal(pp.normalizeSettingsInput({ description: "x".repeat(171) }, cur).error.code, "DESCRIPTION_TOO_LONG");
assert.equal(pp.normalizeSettingsInput({ pin: "x".repeat(281) }, cur).error.code, "PIN_TOO_LONG");
assert.equal(pp.normalizeSettingsInput({ hidden: ["name"] }, cur).error.code, "INVALID_SECTIONS", "name / icon cannot be hidden");
assert.equal(pp.normalizeSettingsInput({ hiddenChannels: ["nope"] }, cur, { channelIds: ["c-1"] }).error.code, "INVALID_CHANNELS");
assert.deepEqual(pp.normalizeSettingsInput({ hiddenChannels: ["C-1"] }, cur, { channelIds: ["c-1"] }).patch.public_page_hidden_channels, ["c-1"]);
r = pp.normalizeSettingsInput({ events: [{ title: "Ev", startsAt: "2026-11-30T18:00:00Z", endsAt: "2026-11-30T20:00:00Z", place: "Lobi" }] }, cur, { now });
assert.equal(r.error, null);
assert.equal(r.events.length, 1);
assert.equal(r.events[0].place, "Lobi");
assert.equal(pp.normalizeSettingsInput({ events: Array(6).fill({ title: "e", startsAt: "2026-11-30T18:00:00Z" }) }, cur, { now }).error.code, "TOO_MANY_EVENTS");
assert.equal(pp.normalizeSettingsInput({ events: [{ title: "", startsAt: "2026-11-30T18:00:00Z" }] }, cur, { now }).error.code, "EVENT_TITLE_REQUIRED");
assert.equal(pp.normalizeSettingsInput({ events: [{ title: "e", startsAt: "bad" }] }, cur, { now }).error.code, "EVENT_DATE_INVALID");
assert.equal(pp.normalizeSettingsInput({ events: [{ title: "e", startsAt: "2026-10-01T00:00:00Z" }] }, cur, { now }).error.code, "EVENT_IN_PAST");
assert.equal(pp.normalizeSettingsInput({ events: [{ title: "e", startsAt: "2026-11-30T18:00:00Z", endsAt: "2026-11-30T17:00:00Z" }] }, cur, { now }).error.code, "EVENT_END_INVALID");
assert.deepEqual(pp.normalizeSettingsInput({}, cur).patch, {}, "empty body changes nothing");

// ---- auditChanges
const changes = pp.auditChanges({ public_page_title: "Yeni", public_page_updated_at: "x", public_page_hidden: [] }, { public_page_title: "Eski", public_page_hidden: [] });
assert.deepEqual(changes, { title: { from: "Eski", to: "Yeni" } });

// ---- classifySource / crawlers
assert.equal(pp.classifySource("https://www.google.com.tr/", ""), "google");
assert.equal(pp.classifySource("https://l.facebook.com/l.php", ""), "facebook");
assert.equal(pp.classifySource("https://t.co/abc", ""), "x");
assert.equal(pp.classifySource("", ""), "direct");
assert.equal(pp.classifySource("https://example.org", ""), "other");
assert.equal(pp.classifySource("https://www.google.com/", "qr"), "qr", "explicit src wins");
assert.equal(pp.classifySource("", "wa"), "whatsapp");
assert.equal(pp.classifySource("", "evil<script>"), "direct", "unknown src ignored");
assert.ok(pp.isCrawler("Mozilla/5.0 (compatible; Googlebot/2.1)"));
assert.ok(pp.isCrawler(""));
assert.ok(!pp.isCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1"));
assert.ok(pp.isSearchEngine("Googlebot/2.1") && !pp.isSearchEngine("WhatsApp/2"));

// ---- aggregateStats
const rows = [
  { day: "2026-11-24", source: "google", views: 10, join_clicks: 3, joins: 2 },
  { day: "2026-11-24", source: "whatsapp", views: 5, join_clicks: 1, joins: 1 },
  { day: "2026-11-01", source: "google", views: 4, join_clicks: 0, joins: 0 },
  { day: "2026-10-10", source: "google", views: 5, join_clicks: 0, joins: 1 },
];
const st = pp.aggregateStats(rows, { days: 30, today: "2026-11-24" });
assert.equal(st.series.length, 30);
assert.equal(st.series.at(-1).day, "2026-11-24");
assert.equal(st.series.at(-1).views, 15);
assert.equal(st.series.at(-1).google, 10);
assert.equal(st.totals.views, 19);
assert.equal(st.totals.joins, 3);
assert.equal(st.totals.googleVisits, 14);
assert.equal(st.totals.joinsLast7, 3);
assert.equal(st.totals.conversion, 15.8);
assert.equal(st.deltas.views, 280, "+280% vs the previous 30 days");
assert.equal(st.sources[0].source, "google");

// ---- aggregateSearchConsole
const sc = pp.aggregateSearchConsole([
  { query: "anadolu craft", clicks: 10, impressions: 100, position: 2 },
  { query: "minecraft sunucu", clicks: 3, impressions: 300, position: 6 },
  { query: "anadolu craft", clicks: 2, impressions: 0, position: 0 },
]);
assert.equal(sc.clicks, 15);
assert.equal(sc.position, 5);
assert.deepEqual(sc.terms.map((t) => t.query), ["anadolu craft", "minecraft sunucu"]);
assert.equal(pp.aggregateSearchConsole([]), null);

// ---- sitemap
const xml = pp.sitemapXml([{ slug: "anadolucraft", lastmod: "2026-11-20T10:00:00Z" }, { slug: "<bad>" }]);
assert.ok(xml.includes("<loc>https://descall.com/s/anadolucraft</loc><lastmod>2026-11-20</lastmod>"));
assert.ok(!xml.includes("bad"));
assert.ok(pp.sitemapXml([]).includes("<urlset"));

// ---- undo window
assert.equal(pp.undoState({ public_page_enabled: false, public_page_undo_until: new Date(Date.now() + 60000).toISOString() }).msLeft > 0, true);
assert.equal(pp.undoState({ public_page_enabled: false, public_page_undo_until: new Date(Date.now() - 1).toISOString() }), null);
assert.equal(pp.undoState({ public_page_enabled: true, public_page_undo_until: new Date(Date.now() + 60000).toISOString() }), null);
assert.equal(pp.UNDO_MS, 10 * 60 * 1000);

console.log("serverPublicPage selftest ok");
