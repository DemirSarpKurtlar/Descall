"use strict";

/**
 * Duyurular remake end to end on the fake database:
 *   public list (everyone only, legacy rows), per-person feed (audience, language fallback),
 *   drafts, publish, schedule + scheduler, expiry, second-admin approval, end with a reason,
 *   reopen, extend, archive / delete with a reason, pins order, versions + restore,
 *   seen / read / click counts, CSV, templates, translation preview, real-time delivery
 *   only to matching sessions, and the legacy fallback before the migration.
 * Run: node frontend/backend/test/announcements.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.NODE_ENV = "test";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const D = 86400000;
const NOW = Date.now();
const iso = (t) => new Date(t).toISOString();
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = (n) => `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;

const fake = createFakeSupabase({
  users: [
    { id: U(1), username: "ayse", language: "tr", created_at: iso(NOW - 400 * D), active_sessions: [{ id: "s1" }] },
    { id: U(2), username: "hans", language: "de", created_at: iso(NOW - 400 * D), active_sessions: [{ id: "s2" }] },
    { id: U(3), username: "newbie", language: "en", created_at: iso(NOW - 2 * D), active_sessions: [{ id: "s3" }] },
    { id: U(8), username: "ece", is_admin: true, language: "tr", created_at: iso(NOW - 500 * D), active_sessions: [{ id: "s8" }] },
    { id: U(9), username: "selin", is_admin: true, language: "tr", created_at: iso(NOW - 500 * D), active_sessions: [{ id: "s9" }] },
  ],
  announcements: [
    // Rows from before the remake: no status column values, emoji icons.
    { id: A(1), title: "Selam!", content: "Eski duyuru", created_at: iso(NOW - 20 * D), is_active: true, priority: "important", color: "#ffffff", emoji: "📌", pinned: true, target: "all", author: "admin" },
    { id: A(2), title: "Eski kapali", content: "Gizli", created_at: iso(NOW - 30 * D), is_active: false, priority: "normal", color: "#5865F2", emoji: "📢", pinned: false, target: "all", author: "admin" },
  ],
  announcement_reads: [],
  announcement_versions: [],
  announcement_templates: [],
  admin_audit: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
const rows = (t) => fake._tables[t]?.rows || [];

const failures = [];
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    if (process.env.TEST_VERBOSE) console.log(`PASS | ${name}`);
  } catch (err) {
    failures.push(`${name}: ${String(err.stack || err.message).split("\n").slice(0, 8).join(" | ").slice(0, 900)}`);
    if (process.env.TEST_VERBOSE) console.log(`FAIL | ${name}`);
  }
}

async function run() {
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const service = require("../lib/announcements/service");
  const store = require("../lib/announcements/store");

  // Open sessions: ayse (tr, web) and hans (de, desktop).
  const emitted = [];
  const sockets = new Map([
    ["sa", { handshake: { auth: { lang: "tr", app: "web" } } }],
    ["sh", { handshake: { auth: { lang: "de", app: "electron" } } }],
  ]);
  const io = {
    emit: (ev, p) => emitted.push({ to: "all", ev, p }),
    to: (room) => ({ emit: (ev, p) => emitted.push({ to: room, ev, p }) }),
    sockets: { adapter: { rooms: new Map([[`user:${U(1)}`, new Set(["sa"])], [`user:${U(2)}`, new Set(["sh"])]]) }, sockets },
  };
  service.attachIo(io);

  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use(require("../routes/announcements"));
  const admin = express.Router();
  admin.use((req, _res, next) => {
    const as = req.headers["x-test-admin"] === "selin" ? { id: U(9), username: "selin" } : { id: U(8), username: "ece" };
    req.user = as;
    next();
  });
  admin.use(require("../routes/adminAnnouncements"));
  app.use("/admin", admin);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, { method = "GET", body, user = 1, as } = {}) => {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: U(user), username: `u${user}`, sid: `s${user}` })}` };
    if (as) headers["x-test-admin"] = as;
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const reset = () => {
    service.__reset();
    require("../routes/announcements").__resetPublicCache();
  };

  try {
    await check("legacy rows: public list and feed show the active one with a line icon", async () => {
      const pub = await call("/api/announcements");
      assert.equal(pub.status, 200);
      assert.deepEqual(pub.body.announcements.map((a) => a.id), [A(1)]);
      assert.equal(pub.body.announcements[0].icon, "pin");
      const feed = await call("/api/announcements/feed?lang=tr&platform=web");
      assert.equal(feed.status, 200);
      assert.equal(feed.body.unread, 1);
      assert.ok(rows("announcement_reads").some((r) => r.user_id === U(1) && r.announcement_id === A(1) && r.delivered_at), "delivered mark");
    });

    let draftId;
    await check("draft is saved with a version and stays out of the feed", async () => {
      const r = await call("/admin/announcements", {
        method: "POST",
        body: {
          action: "draft",
          title: "Planlı bakım: 16 Kasım 03:00-04:00",
          content: "Sesli kanallar yaklaşık 1 saat kesintili çalışacak.",
          icon: "wrench",
          color: "#f2a93b",
          priority: "important",
          ctaLabel: "Durum sayfası",
          ctaUrl: "/status",
          sourceLang: "tr",
          translations: { en: { title: "Scheduled maintenance: Nov 16, 03:00-04:00", content: "Voice channels may be interrupted for about 1 hour.", cta_label: "Status page", state: "ready" } },
          audience: {},
        },
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.result, "draft");
      draftId = r.body.item.id;
      assert.equal(rows("announcement_versions").filter((v) => v.announcement_id === draftId).length, 1);
      reset();
      const feed = await call("/api/announcements/feed?lang=tr");
      assert.ok(!feed.body.announcements.some((a) => a.id === draftId));
      assert.ok(rows("admin_audit").length >= 0);
    });

    await check("publish: live for everyone, German falls back to English, delivered to both sessions with a toast", async () => {
      emitted.length = 0;
      const r = await call(`/admin/announcements/${draftId}/publish`, { method: "POST", body: {} });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.result, "live");
      const toAyse = emitted.find((e) => e.to === "sa" && e.ev === "announcement:new");
      const toHans = emitted.find((e) => e.to === "sh" && e.ev === "announcement:new");
      assert.ok(toAyse && toHans, "both open sessions get it");
      assert.equal(toAyse.p.title, "Planlı bakım: 16 Kasım 03:00-04:00");
      assert.equal(toHans.p.lang, "en", "German session sees the English version");
      assert.equal(toHans.p.toast, true, "important -> toast");
      reset();
      const feed = await call("/api/announcements/feed?lang=de&platform=desktop", { user: 2 });
      const mine = feed.body.announcements.find((a) => a.id === draftId);
      assert.equal(mine.title, "Scheduled maintenance: Nov 16, 03:00-04:00");
      assert.equal(mine.fallback, true);
      assert.equal(mine.ctaUrl, "/status");
      assert.equal(rows("announcements").find((a) => a.id === draftId).audience_size, 5);
    });

    let targetedId;
    await check("audience: Turkish-only announcement reaches only Turkish sessions and feeds", async () => {
      emitted.length = 0;
      const r = await call("/admin/announcements", { method: "POST", body: { action: "publish", title: "Sadece Türkçe", content: "Merhaba", audience: { langs: ["tr"] }, priority: "normal" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      targetedId = r.body.item.id;
      assert.ok(emitted.some((e) => e.to === "sa" && e.ev === "announcement:new" && e.p.id === targetedId));
      assert.ok(emitted.some((e) => e.to === "sh" && e.ev === "announcement:removed" && e.p.id === targetedId));
      assert.equal(emitted.find((e) => e.to === "sa" && e.p.id === targetedId).p.toast, false, "normal -> no toast");
      reset();
      const de = await call("/api/announcements/feed?lang=de", { user: 2 });
      assert.ok(!de.body.announcements.some((a) => a.id === targetedId));
      const pub = await call("/api/announcements");
      assert.ok(!pub.body.announcements.some((a) => a.id === targetedId), "targeted rows never in the public list");
    });

    await check("new users audience matches only people who joined recently", async () => {
      const r = await call("/admin/announcements", { method: "POST", body: { action: "publish", title: "Hoş geldin", content: "İlk sunucunu kur", audience: { newDays: 14 } } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      reset();
      const newbie = await call("/api/announcements/feed?lang=en", { user: 3 });
      const old = await call("/api/announcements/feed?lang=tr", { user: 1 });
      assert.ok(newbie.body.announcements.some((a) => a.id === r.body.item.id));
      assert.ok(!old.body.announcements.some((a) => a.id === r.body.item.id));
    });

    let urgentId;
    await check("urgent to everyone waits for a second admin; the requester cannot approve", async () => {
      const r = await call("/admin/announcements", { method: "POST", body: { action: "publish", title: "Giriş sorunu", content: "SMS kodları gecikiyor", priority: "urgent", audience: {} } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.result, "pending");
      urgentId = r.body.item.id;
      const self = await call(`/admin/announcements/${urgentId}/approve`, { method: "POST", body: {} });
      assert.equal(self.status, 403);
      assert.equal(self.body.code, "SECOND_ADMIN_REQUIRED");
      const other = await call(`/admin/announcements/${urgentId}/approve`, { method: "POST", body: {}, as: "selin" });
      assert.equal(other.status, 200, JSON.stringify(other.body));
      assert.equal(other.body.result, "live");
      assert.equal(rows("announcements").find((a) => a.id === urgentId).approved_by_name, "selin");
    });

    await check("schedule: future publish time -> scheduled, the scheduler makes it live", async () => {
      const r = await call("/admin/announcements", { method: "POST", body: { action: "publish", title: "Kış etkinliği", content: "22 Kasım", startsAt: iso(Date.now() + 3600_000) } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.result, "scheduled");
      const id = r.body.item.id;
      rows("announcements").find((a) => a.id === id).starts_at = iso(Date.now() - 1000);
      const out = await service.tick();
      assert.equal(out.published, 1);
      assert.equal(rows("announcements").find((a) => a.id === id).status, "live");
    });

    await check("expiry: the scheduler ends it and tells open sessions to drop it", async () => {
      emitted.length = 0;
      const row = rows("announcements").find((a) => a.id === targetedId);
      row.ends_at = iso(Date.now() - 1000);
      const out = await service.tick();
      assert.ok(out.ended >= 1);
      assert.equal(row.status, "ended");
      assert.equal(row.ended_reason, "expired");
      assert.ok(emitted.some((e) => e.ev === "announcement:removed" && e.p.id === targetedId));
    });

    await check("extend an expired one brings it back live", async () => {
      const r = await call(`/admin/announcements/${targetedId}/extend`, { method: "POST", body: { endsAt: iso(Date.now() + 2 * D) } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.result, "live");
    });

    await check("end needs a reason; reopen puts it back", async () => {
      const none = await call(`/admin/announcements/${targetedId}/end`, { method: "POST", body: {} });
      assert.equal(none.status, 400);
      const other = await call(`/admin/announcements/${targetedId}/end`, { method: "POST", body: { reason: "other" } });
      assert.equal(other.body.code, "NOTE_REQUIRED");
      const ok = await call(`/admin/announcements/${targetedId}/end`, { method: "POST", body: { reason: "outdated", note: "Sürüm notlarına taşındı." } });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.item.status, "ended");
      const back = await call(`/admin/announcements/${targetedId}/reopen`, { method: "POST", body: {} });
      assert.equal(back.body.item.status, "live");
    });

    await check("edit makes a version, marks translations for review, restore goes back", async () => {
      const r = await call(`/admin/announcements/${draftId}`, { method: "PUT", body: { title: "Planlı bakım: 17 Kasım 03:00-04:00" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.item.version, 2);
      assert.equal(r.body.item.translations.en.state, "stale");
      const v = await call(`/admin/announcements/${draftId}/versions`);
      assert.equal(v.body.versions.length, 2);
      const back = await call(`/admin/announcements/${draftId}/restore`, { method: "POST", body: { version: 1 } });
      assert.equal(back.status, 200, JSON.stringify(back.body));
      assert.equal(back.body.item.title, "Planlı bakım: 16 Kasım 03:00-04:00");
    });

    await check("seen / read / click counts reach the overview, CSV export", async () => {
      reset();
      await call("/api/announcements/seen", { method: "POST", body: { ids: [draftId], platform: "web", lang: "tr" } });
      await call("/api/announcements/read", { method: "POST", body: { ids: [draftId] } });
      await call(`/api/announcements/${draftId}/click`, { method: "POST" });
      await call("/api/announcements/seen", { method: "POST", user: 2, body: { ids: [draftId], platform: "desktop", lang: "de" } });
      const hidden = await call("/api/announcements/seen", { method: "POST", user: 2, body: { ids: [targetedId] } });
      assert.equal(hidden.body.marked, 0, "cannot mark what the audience does not include");
      const ov = await call("/admin/announcements/overview");
      assert.equal(ov.status, 200);
      const item = ov.body.items.find((i) => i.id === draftId);
      assert.equal(item.stats.seen, 2);
      assert.equal(item.stats.read, 1);
      assert.equal(item.stats.clicked, 1);
      assert.equal(item.stats.platforms.desktop.seen, 1);
      assert.ok(ov.body.kpis.live >= 3);
      const csv = await call(`/admin/announcements/${draftId}/export`);
      assert.match(csv.body.csv, /clicked,,1/);
      const unread = await call("/api/announcements/unread/count?lang=tr");
      assert.ok(unread.body.count >= 1);
    });

    await check("pins: order is saved and the feed follows it", async () => {
      const r = await call("/admin/announcements/pins", { method: "POST", body: { ids: [urgentId, A(1)] } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      reset();
      const feed = await call("/api/announcements/feed?lang=tr");
      assert.deepEqual(feed.body.announcements.slice(0, 2).map((a) => a.id), [urgentId, A(1)]);
    });

    await check("delete: reason required, archive by default, hard delete when asked", async () => {
      const none = await call(`/admin/announcements/${targetedId}`, { method: "DELETE", body: { reason: "nope" } });
      assert.equal(none.status, 400);
      const arch = await call(`/admin/announcements/${targetedId}`, { method: "DELETE", body: { reason: "wrong_audience" } });
      assert.equal(arch.body.result, "archived");
      assert.ok(rows("announcements").some((a) => a.id === targetedId));
      const gone = await call(`/admin/announcements/${targetedId}`, { method: "DELETE", body: { reason: "wrong_content", archiveInstead: false } });
      assert.equal(gone.body.result, "deleted");
      assert.ok(!rows("announcements").some((a) => a.id === targetedId));
    });

    await check("templates: built-ins with use counts, fill per language, save my own", async () => {
      const list = await call("/admin/announcements/templates");
      assert.equal(list.status, 200);
      assert.equal(list.body.builtin.length, 6);
      const fill = await call("/admin/announcements/templates/fill/preview", { method: "POST", body: { key: "b:maintenance", values: { date: "2026-11-16", start: "03:00", end: "04:00", affected: "voice_screen" } } });
      assert.equal(fill.status, 200, JSON.stringify(fill.body));
      assert.equal(fill.body.filled.title, "Planlı bakım: 16 Kasım 03:00-04:00");
      assert.match(fill.body.filled.translations.fr.title, /16 novembre/);
      assert.match(fill.body.filled.content, /1 saat/);
      assert.equal(fill.body.filled.translations.de.state, "ready");
      const saved = await call(`/admin/announcements/${draftId}/save-template`, { method: "POST", body: { name: "Bakım (benim)", category: "maintenance" } });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      const again = await call("/admin/announcements/templates");
      assert.equal(again.body.custom.length, 1);
    });

    await check("translation preview uses Claude and returns versions to review", async () => {
      service.__setTranslateClientForTests({
        messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ ru: { title: "Плановые работы", content: "Голосовые каналы", cta_label: "Статус" } }) }] }) },
      });
      const r = await call("/admin/announcements/translate/preview", { method: "POST", body: { title: "Planlı bakım", content: "Sesli kanallar", from: "tr", to: ["ru"] } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.translations.ru.state, "auto");
    });

    await check("legacy fallback before the migration: overview works, drafts answer 503", async () => {
      const realFrom = fake.from.bind(fake);
      store.__db = {
        storage: fake.storage,
        from(name) {
          const q = realFrom(name);
          const sel = q.select.bind(q);
          q.select = (cols, opts) => (name === "announcements" && /status/.test(String(cols || "")) ? { limit: async () => ({ data: null, error: { code: "42703", message: "column announcements.status does not exist" } }) } : sel(cols, opts));
          return q;
        },
      };
      store.resetProbe();
      reset();
      const ov = await call("/admin/announcements/overview");
      assert.equal(ov.status, 200);
      assert.equal(ov.body.schemaReady, false);
      const d = await call("/admin/announcements", { method: "POST", body: { action: "draft", title: "x", content: "y" } });
      assert.equal(d.status, 503);
      assert.equal(d.body.code, "ANNOUNCEMENTS_SCHEMA_MISSING");
      store.__db = null;
      store.resetProbe();
    });
  } finally {
    srv.close();
  }

  if (failures.length) {
    console.error(`announcements.integration: ${failures.length} failed, ${passed} passed`);
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exit(1);
  }
  console.log(`announcements.integration: ${passed} passed`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
