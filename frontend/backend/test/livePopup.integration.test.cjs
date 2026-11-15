"use strict";

/**
 * Canlı popup (admin section livepopup, Draft B remake) over real HTTP with the
 * fake Supabase and a fake Socket.IO server: section gate, audience estimate
 * (platform / language / Descall+-free rules, offline picks), send with a
 * required note + step-up, per-socket delivery, client receipts (validated,
 * own row only, other devices closed), live detail (funnel, platform, language,
 * feed), recipients table + CSV, resend to missed, login delivery, recall
 * (correction note, typed reason), "Düzeldi", schedule / cancel / send now,
 * templates, exemptions, daily limit, and the memory-only mode while the
 * tables are missing.
 */

process.env.NODE_ENV = "test";
process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = id(1);
const POPADMIN = id(2);
const OTHERADMIN = id(3);
const ELIF = id(10);
const MERT = id(11);
const ZEYNEP = id(12);
const JOHN = id(13);
const OFFLINE = id(14);
const S1 = id(100);

const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
const now = Date.now();
const ago = (days) => new Date(now - days * 86400000).toISOString();
const user = (uid, username, extra = {}) => ({ id: uid, username, display_name: username, is_admin: false, active_sessions: [{ id: `s-${username}` }], language: "tr", created_at: ago(400), ...extra });

const fake = createFakeSupabase({
  users: [
    user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
    user(POPADMIN, "demir", { is_admin: true, admin_permissions: ["livepopup", "moderation"], ...TOTP_ON }),
    user(OTHERADMIN, "other", { is_admin: true, admin_permissions: ["reports"], ...TOTP_ON }),
    user(ELIF, "elif.kaya"),
    user(MERT, "mertcan", { created_at: ago(3) }),
    user(ZEYNEP, "zeynepb"),
    user(JOHN, "john.w", { language: "en" }),
    user(OFFLINE, "aysenur"),
  ],
  servers: [{ id: S1, name: "Gece Pazari", icon_url: null }],
  server_members: [
    { server_id: S1, user_id: ELIF },
    { server_id: S1, user_id: OFFLINE },
  ],
  popup_campaigns: [],
  popup_receipts: [],
  popup_templates: [],
  popup_exemptions: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const state = require("../runtime/sharedState");
const engine = require("../lib/livePopup/engine");
const store = require("../lib/livePopup/store");
const { registerPopupReceipts } = require("../socket/popupReceipts");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

/* ---- fake Socket.IO ---- */
const emitted = [];
const rooms = new Map();
const sockets = new Map();
const io = {
  to(room) {
    return { emit: (event, payload) => emitted.push({ room, event, payload }) };
  },
  in() {
    return { fetchSockets: async () => [] };
  },
  sockets: { adapter: { rooms }, sockets },
};
let sockN = 0;
function connect(uid, username, app = "web", lang = null, status = "online") {
  sockN += 1;
  const sid = `sock-${sockN}`;
  const handlers = new Map();
  const s = {
    id: sid,
    user: { id: uid, username },
    data: {},
    handshake: { auth: { app, ...(lang ? { lang } : {}) } },
    own: [],
    emit(event, payload) {
      s.own.push({ event, payload });
    },
    to(room) {
      return { emit: (event, payload) => emitted.push({ room, event, payload, except: sid }) };
    },
    on(event, fn) {
      handlers.set(event, fn);
    },
    fire(event, payload) {
      return new Promise((resolve) => handlers.get(event)(payload, resolve));
    },
  };
  sockets.set(sid, s);
  const room = `user:${uid}`;
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(sid);
  state.presence.set(uid, { username, status, socketId: sid, avatar_url: null });
  return s;
}
function disconnect(s) {
  sockets.delete(s.id);
  const room = rooms.get(`user:${s.user.id}`);
  room?.delete(s.id);
  if (room && !room.size) {
    rooms.delete(`user:${s.user.id}`);
    state.presence.delete(s.user.id);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token, stepUp } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json = {};
  try {
    json = JSON.parse(raw);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, raw };
}

const session = (uid, username) => signToken({ id: uid, username, sid: `s-${username}` });
const stepUpFor = (uid, username) => signStepUpToken({ id: uid, sid: `s-${username}` });
const lastAudit = (action) => state.auditLog.find((e) => e.action === action);
const popupsTo = (sid) => emitted.filter((e) => e.room === sid && e.event === "admin:popup");
const CONTENT = {
  title: "Planli bakim bu gece 03:00'te",
  body: "Sesli kanallar birkac dakika kapali olacak.",
  severity: "warning",
  icon: "wrench",
  requireAck: true,
  ctaLabel: "Durum sayfasi",
  ctaUrl: "descall.com/durum",
};

async function run() {
  const { server, base } = await startServer();
  const tok = session(POPADMIN, "demir");
  const step = stepUpFor(POPADMIN, "demir");
  const P = "/api/admin/popup";
  try {
    /* ---- sockets: elif desktop TR, mert iOS, zeynep web (invisible), john desktop EN, admin web ---- */
    const sElif = connect(ELIF, "elif.kaya", "electron", "tr");
    const sMert = connect(MERT, "mertcan", "ios", "tr");
    const sZey = connect(ZEYNEP, "zeynepb", "web", null, "invisible");
    const sJohn = connect(JOHN, "john.w", "electron", "en");
    const sAdmin = connect(POPADMIN, "demir", "web", "tr");
    for (const s of [sElif, sMert, sZey, sJohn, sAdmin]) registerPopupReceipts(io, s);
    await engine.ready();

    /* ---- 1. section gate ---- */
    let r = await call(base, "GET", `${P}/overview`, { token: session(OTHERADMIN, "other") });
    assert(r.status === 403 && r.body.section === "livepopup", "admin without the section is refused " + r.raw);
    r = await call(base, "GET", `${P}/overview`, { token: session(ELIF, "elif.kaya") });
    assert(r.status === 403, "non-admin refused");

    /* ---- 2. overview ---- */
    r = await call(base, "GET", `${P}/overview`, { token: tok });
    assert(r.status === 200, "overview " + r.raw);
    assert(r.body.kpis.connected === 5 && r.body.kpis.visible === 4 && r.body.kpis.invisible === 1, "kpis " + JSON.stringify(r.body.kpis));
    assert(r.body.kpis.dailyLimit === 10 && r.body.kpis.sentToday === 0, "daily limit");
    assert(r.body.persistent === true && r.body.voiceAvailable === true, "tables + voice available");

    /* ---- 3. audience estimate: no step-up needed ---- */
    r = await call(base, "POST", `${P}/audience/preview`, { token: tok, body: { audience: { rules: [{ type: "platform", values: ["desktop"] }] } } });
    assert(r.status === 200 && r.body.count === 2 && r.body.connected === 5 && r.body.share === 40, "desktop rule: elif + john " + r.raw);
    r = await call(base, "POST", `${P}/audience/preview`, { token: tok, body: { audience: { rules: [{ type: "language", values: ["en"] }] } } });
    assert(r.body.count === 1 && r.body.sample[0].username === "john.w", "language rule " + r.raw);
    r = await call(base, "POST", `${P}/audience/preview`, { token: tok, body: { audience: { rules: [{ type: "accountAge", op: "newer", days: 7 }] } } });
    assert(r.body.count === 1 && r.body.sample[0].username === "mertcan", "account age rule " + r.raw);
    r = await call(base, "POST", `${P}/audience/preview`, { token: tok, body: { audience: { rules: [{ type: "visibility" }] } } });
    assert(r.body.count === 3, "visible only, admin excluded without includeSelf " + r.raw);
    r = await call(base, "POST", `${P}/audience/preview`, { token: tok, body: { audience: { rules: [{ type: "server", serverId: S1 }] } } });
    assert(r.body.count === 1, "server members connected " + r.raw);
    r = await call(base, "POST", `${P}/audience/preview`, { token: tok, body: { audience: { rules: [{ type: "users", users: [{ id: ELIF }, { id: OFFLINE }] }] } } });
    assert(r.body.count === 2 && r.body.online === 1 && r.body.offline === 1, "picked people: offline counted for login " + r.raw);
    state.activeServerVoiceCalls.set("ch-1", { serverId: S1, participants: new Map([[MERT, { id: MERT }]]) });
    r = await call(base, "POST", `${P}/audience/preview`, { token: tok, body: { audience: { rules: [{ type: "voice" }] } } });
    assert(r.body.count === 1 && r.body.sample[0].username === "mertcan", "in voice now " + r.raw);
    state.activeServerVoiceCalls.delete("ch-1");

    r = await call(base, "GET", `${P}/audience/servers?q=gece`, { token: tok });
    assert(r.body.servers.length === 1 && r.body.servers[0].members === 2, "server search " + r.raw);
    r = await call(base, "GET", `${P}/audience/users?q=elif`, { token: tok });
    assert(r.body.users.length === 1 && r.body.users[0].username === "elif.kaya", "user search");

    /* ---- 4. send: step-up + note required ---- */
    r = await call(base, "POST", `${P}/campaigns`, { token: tok, body: { content: CONTENT, note: "Planli bakim duyurusu" } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "send needs a step-up code");
    r = await call(base, "POST", `${P}/campaigns`, { token: tok, stepUp: step, body: { content: CONTENT, note: "" } });
    assert(r.status === 400 && r.body.code === "NOTE_REQUIRED", "send needs an audit note");
    r = await call(base, "POST", `${P}/campaigns`, { token: tok, stepUp: step, body: { content: { ...CONTENT, ctaUrl: "https://evil.example/x" }, note: "Planli bakim" } });
    assert(r.status === 400 && r.body.code === "BAD_CTA_URL", "foreign links refused");
    r = await call(base, "POST", `${P}/campaigns`, {
      token: tok,
      stepUp: step,
      body: { content: CONTENT, note: "Planli bakim duyurusu", audience: { rules: [{ type: "users", users: [{ id: ELIF }, { id: MERT }, { id: ZEYNEP }, { id: JOHN }, { id: OFFLINE }] }] } },
    });
    assert(r.status === 200 && r.body.status === "live", "sent " + r.raw);
    const CID = r.body.id;
    assert(r.body.stats.targeted === 5 && r.body.stats.missed === 1, "4 online + 1 offline (login) " + JSON.stringify(r.body.stats));
    const a = lastAudit("live_popup");
    assert(a && a.target === CID && a.meta.note === "Planli bakim duyurusu" && a.meta.targeted === 5, "send audited with the note");
    const wire = popupsTo(sElif.id)[0]?.payload;
    assert(wire && wire.id === CID && wire.track === true && wire.icon === "wrench" && wire.requireAck === true && wire.ctaUrl === "https://descall.com/durum", "wire payload " + JSON.stringify(wire));
    assert(!popupsTo(sAdmin.id).length, "not to me without 'Bana da gönder'");
    assert(fake._tables.popup_receipts.rows.length === 5 && fake._tables.popup_campaigns.rows[0].note === "Planli bakim duyurusu", "persisted");
    r = await call(base, "POST", `${P}/campaigns`, { token: tok, stepUp: step, body: { content: CONTENT, note: "Ikinci deneme" } });
    assert(r.status === 429 && r.body.code === "RATE_LIMITED", "8 s between sends");

    /* ---- 5. receipts ---- */
    let ack = await sElif.fire("popup:receipt", { id: CID, kind: "delivered", lang: "tr" });
    assert(ack.ok, "delivered accepted");
    await sElif.fire("popup:receipt", { id: CID, kind: "seen" });
    await sElif.fire("popup:receipt", { id: CID, kind: "clicked" });
    await sElif.fire("popup:receipt", { id: CID, kind: "acked" });
    assert(emitted.some((e) => e.event === "admin:popup:close" && e.room === `user:${ELIF}` && e.except === sElif.id), "ack closes it on elif's other devices");
    await sMert.fire("popup:receipt", { id: CID, kind: "delivered" });
    await sMert.fire("popup:receipt", { id: CID, kind: "seen" });
    await sMert.fire("popup:receipt", { id: CID, kind: "clicked" });
    await sJohn.fire("popup:receipt", { id: CID, kind: "delivered" });
    await sJohn.fire("popup:receipt", { id: CID, kind: "seen" });
    ack = await sAdmin.fire("popup:receipt", { id: CID, kind: "acked" });
    assert(!ack.ok, "a non-recipient cannot write a receipt");
    ack = await sZey.fire("popup:receipt", { id: "not-a-uuid", kind: "seen" });
    assert(!ack.ok, "bad id refused");
    ack = await sZey.fire("popup:receipt", { id: CID, kind: "hacked" });
    assert(!ack.ok, "bad kind refused");
    for (let i = 0; i < 45; i += 1) ack = await sZey.fire("popup:receipt", { id: CID, kind: "delivered" });
    assert(!ack.ok, "receipts are rate limited per socket");
    assert(emitted.some((e) => e.room === "admin" && e.event === "admin:livepopup" && e.payload.campaignId === CID), "admins notified live");

    /* ---- 6. detail ---- */
    r = await call(base, "GET", `${P}/campaigns/${CID}`, { token: tok });
    assert(r.status === 200, "detail " + r.raw);
    const st = r.body.stats;
    assert(st.targeted === 5 && st.delivered === 4 && st.seen === 3 && st.acked === 1 && st.clicked === 2 && st.missed === 1, "funnel " + JSON.stringify(st));
    assert(st.open === 1 && st.closable === 3 && st.pendingLogin === 1, "john open on screen; mert (clicked, needs ack) + zeynep (unseen) still closable; aysenur waits for login " + JSON.stringify(st));
    const desk = st.platforms.find((p) => p.id === "desktop");
    assert(desk.n === 2 && desk.seen === 2 && desk.pct === 100, "platform split " + JSON.stringify(st.platforms));
    const en = st.languages.find((l) => l.id === "en");
    assert(en && en.n === 1, "language split " + JSON.stringify(st.languages));
    assert(st.recentAckers[0].username === "elif.kaya" && st.ackersTotal === 1, "recent ackers");
    assert(st.events[0].username && st.events.some((e) => e.kind === "missed" && e.reason === "offline" && e.pending), "live feed " + JSON.stringify(st.events));
    assert(st.events.some((e) => e.kind === "clicked" && e.url === "https://descall.com/durum"), "click events carry the link");

    /* ---- 7. recipients table + CSV ---- */
    r = await call(base, "GET", `${P}/campaigns/${CID}/receipts?filter=missed`, { token: tok });
    assert(r.body.counts.all === 5 && r.body.counts.missed === 1 && r.body.counts.open === 1 && r.body.rows.length === 1 && r.body.rows[0].username === "aysenur", "filter missed " + r.raw);
    assert(r.body.rows[0].pendingLogin === true && r.body.rows[0].online === false, "aysenur pending login");
    r = await call(base, "GET", `${P}/campaigns/${CID}/receipts?platform=desktop&q=john`, { token: tok });
    assert(r.body.rows.length === 1 && r.body.rows[0].language === "en" && r.body.rows[0].status === "open", "search + platform " + r.raw);
    r = await call(base, "GET", `${P}/campaigns/${CID}/export`, { token: tok });
    assert(r.status === 200 && r.body.rows === 5 && r.body.csv.includes("elif.kaya") && r.body.csv.includes("acked"), "csv export");
    assert(lastAudit("live_popup_export")?.target === CID, "export audited");

    /* ---- 8. login delivery ---- */
    const sOff = connect(OFFLINE, "aysenur", "ios", "tr");
    registerPopupReceipts(io, sOff);
    await new Promise((res) => setTimeout(res, 10));
    assert(sOff.own.some((e) => e.event === "admin:popup" && e.payload.id === CID), "missed popup shown at login");
    await sOff.fire("popup:receipt", { id: CID, kind: "delivered" });
    // A reconnecting person who has not acknowledged a required popup sees it again.
    const sMert2 = connect(MERT, "mertcan", "ios", "tr");
    registerPopupReceipts(io, sMert2);
    await new Promise((res) => setTimeout(res, 10));
    assert(sMert2.own.some((e) => e.event === "admin:popup" && e.payload.id === CID), "unacknowledged required popup shown again");
    disconnect(sMert2);

    /* ---- 9. resend selected ---- */
    r = await call(base, "POST", `${P}/campaigns/${CID}/resend`, { token: tok, stepUp: step, body: { userIds: [ZEYNEP] } });
    assert(r.status === 200 && r.body.sent === 1 && r.body.queued === 0, "resend to one " + r.raw);
    assert(lastAudit("live_popup_resend")?.meta.selected === 1, "resend audited");

    /* ---- 10. person history + exemption ---- */
    r = await call(base, "GET", `${P}/users/${JOHN}/history`, { token: tok });
    assert(r.body.items.length === 1 && r.body.items[0].campaignId === CID && r.body.exempt === false, "person history " + r.raw);
    r = await call(base, "POST", `${P}/users/${JOHN}/exempt`, { token: tok, stepUp: step, body: { exempt: true } });
    assert(r.status === 200 && fake._tables.popup_exemptions.rows.length === 1, "exempt saved");
    r = await call(base, "POST", `${P}/audience/preview`, { token: tok, body: { severity: "info", audience: { rules: [] } } });
    assert(r.body.count === 4, "exempt person skipped for info popups (aysenur is online now) " + r.raw);
    r = await call(base, "POST", `${P}/audience/preview`, { token: tok, body: { severity: "urgent", audience: { rules: [] } } });
    assert(r.body.count === 5, "but not for urgent ones " + r.raw);
    await call(base, "POST", `${P}/users/${JOHN}/exempt`, { token: tok, stepUp: step, body: { exempt: false } });

    /* ---- 11. recall with a correction note ---- */
    r = await call(base, "POST", `${P}/campaigns/${CID}/recall`, { token: tok, stepUp: step, body: { mode: "note", reason: "", note: "Bakim 04:00'e kaydi." } });
    assert(r.status === 400 && r.body.code === "NOTE_REQUIRED", "recall needs a reason");
    r = await call(base, "POST", `${P}/campaigns/${CID}/recall`, { token: tok, stepUp: step, body: { mode: "note", reason: "Yanlis saat duyuruldu", note: "" } });
    assert(r.status === 400 && r.body.code === "CORRECTION_REQUIRED", "note mode needs the note");
    r = await call(base, "POST", `${P}/campaigns/${CID}/recall`, { token: tok, stepUp: step, body: { mode: "note", reason: "Yanlis saat duyuruldu", note: "Bakim 04:00'e kaydi." } });
    assert(r.status === 200 && r.body.closed >= 2 && r.body.alreadySeen === 3, "recalled " + r.raw);
    const recalls = emitted.filter((e) => e.event === "admin:popup:recall" && e.payload.id === CID);
    assert(recalls.some((e) => e.room === `user:${JOHN}` && e.payload.mode === "note" && e.payload.note === "Bakim 04:00'e kaydi."), "open popups closed with the note");
    assert(!recalls.some((e) => e.room === `user:${ELIF}`), "acknowledged ones are not touched");
    assert(lastAudit("live_popup_recall")?.meta.reason === "Yanlis saat duyuruldu", "recall audited with the reason");
    r = await call(base, "POST", `${P}/campaigns/${CID}/resend`, { token: tok, stepUp: step, body: {} });
    assert(r.status === 409, "a recalled popup cannot be resent");

    /* ---- 12. scheduling ---- */
    const later = new Date(Date.now() + 3600_000).toISOString();
    r = await call(base, "POST", `${P}/campaigns`, { token: tok, stepUp: step, body: { content: { ...CONTENT, severity: "info", requireAck: false }, note: "Hafta sonu etkinligi", scheduleAt: later } });
    assert(r.status === 200 && r.body.status === "scheduled", "scheduled " + r.raw);
    const SID = r.body.id;
    assert(lastAudit("live_popup_schedule")?.meta.scheduledAt === later, "schedule audited");
    r = await call(base, "GET", `${P}/overview`, { token: tok });
    assert(r.body.queue.length === 1 && r.body.queue[0].id === SID, "queue lists it");
    assert(r.body.history.some((h) => h.id === CID && h.status === "recalled"), "history lists the recalled one");
    r = await call(base, "PUT", `${P}/campaigns/${SID}`, { token: tok, stepUp: step, body: { content: { ...CONTENT, title: "Hafta sonu etkinligi basliyor", severity: "info", requireAck: false }, scheduleAt: later } });
    assert(r.status === 200, "scheduled popup edited " + r.raw);
    r = await call(base, "POST", `${P}/campaigns/${SID}/cancel`, { token: tok, stepUp: step, body: { reason: "Etkinlik ertelendi" } });
    assert(r.status === 200 && lastAudit("live_popup_cancel")?.meta.reason === "Etkinlik ertelendi", "canceled");
    // The scheduler fires a due one.
    r = await call(base, "POST", `${P}/campaigns`, { token: tok, stepUp: step, body: { content: { ...CONTENT, title: "Zamanli", severity: "urgent" }, note: "Zamanli test", scheduleAt: new Date(Date.now() + 120_000).toISOString() } });
    const DUE = r.body.id;
    engine.__state.campaigns.get(DUE).c.scheduled_at = new Date(Date.now() - 1000).toISOString();
    await engine.tick();
    assert(engine.__state.campaigns.get(DUE).c.status === "live", "scheduler sent the due popup");
    assert(popupsTo(sJohn.id).some((e) => e.payload.id === DUE), "scheduled popup delivered");

    /* ---- 13. "Düzeldi" ---- */
    r = await call(base, "POST", `${P}/campaigns/${DUE}/resolve`, { token: tok, stepUp: step, body: { content: { title: "Sorun giderildi", body: "Sesli kanallar yeniden calisiyor." }, note: "Kesinti bitti" } });
    assert(r.status === 200 && r.body.followUp && r.body.recipients === 5, "resolved popup to the same people " + r.raw);
    assert(engine.__state.campaigns.get(DUE).c.status === "ended", "incident popup ended");
    const resolved = popupsTo(sJohn.id).find((e) => e.payload.id === r.body.followUp);
    assert(resolved && resolved.payload.severity === "success" && resolved.payload.requireAck === false, "success popup");

    /* ---- 14. test send ---- */
    r = await call(base, "POST", `${P}/test`, { token: tok, stepUp: step, body: { content: CONTENT } });
    assert(r.status === 200 && r.body.devices === 1 && r.body.mobile === false, "test to my own device " + r.raw);
    assert(popupsTo(sAdmin.id).some((e) => e.payload.test === true && e.payload.track === false), "test popup is never tracked");

    /* ---- 15. templates ---- */
    r = await call(base, "POST", `${P}/templates`, { token: tok, stepUp: step, body: { name: "Hizmet kesintisi", content: { ...CONTENT, severity: "urgent" }, audience: { rules: [{ type: "voice" }] } } });
    assert(r.status === 200 && r.body.template.name === "Hizmet kesintisi" && r.body.template.audience.rules[0].type === "voice", "template saved " + r.raw);
    const TID = r.body.template.id;
    r = await call(base, "PUT", `${P}/templates/${TID}`, { token: tok, stepUp: step, body: { name: "Kesinti", content: CONTENT } });
    assert(r.status === 200 && r.body.template.name === "Kesinti", "template renamed");
    r = await call(base, "GET", `${P}/templates`, { token: tok });
    assert(r.body.templates.length === 1 && r.body.persistent, "templates listed");
    r = await call(base, "DELETE", `${P}/templates/${TID}`, { token: tok, stepUp: step });
    assert(r.status === 200 && lastAudit("live_popup_template_delete")?.target === TID, "template deleted");

    /* ---- 16. end ---- */
    r = await call(base, "POST", `${P}/campaigns/${engine.__state.campaigns.get(DUE) && [...engine.__state.campaigns.values()].find((e) => e.c.kind === "resolved").c.id}/end`, { token: tok, stepUp: step });
    assert(r.status === 200, "ended " + r.raw);

    /* ---- 17. daily limit ---- */
    const today = engine.__state.campaigns.size;
    for (let i = 0; i < 10; i += 1) fake._tables.popup_campaigns.rows.push({ id: id(900 + i), status: "ended", kind: "standard", title: "x", body: "y", sent_at: new Date().toISOString(), created_at: new Date().toISOString() });
    require("../lib/adminBroadcastPopup")._resetForTests();
    r = await call(base, "POST", `${P}/campaigns`, { token: tok, stepUp: step, body: { content: CONTENT, note: "Limit denemesi" } });
    assert(r.status === 429 && r.body.code === "DAILY_LIMIT", "daily limit " + r.raw + " " + today);
    fake._tables.popup_campaigns.rows = fake._tables.popup_campaigns.rows.filter((row) => !row.id.startsWith("00000000-0000-4000-8000-0000000009"));

    /* ---- 18. memory-only while the tables are missing ---- */
    engine.__resetForTests();
    const fake2 = createFakeSupabase({ users: fake._tables.users.rows }, { missingTables: store.TABLES });
    store.__setDbForTests(fake2);
    engine.attachIo(io);
    await engine.ready();
    const out = await engine.createCampaign({
      content: { title: "Hafiza", body: "Tablo yok", severity: "warning", icon: "wrench", durationMs: 0, requireAck: false, autoResolve: false, ctaLabel: "", ctaUrl: "" },
      audience: { rules: [] },
      note: "Tablo yok testi",
      actor: { id: POPADMIN, username: "demir" },
    }).catch((e) => e);
    assert(out && out.c && out.c.status === "live" && out.receipts.size === 5, "sent from memory " + (out?.message || ""));
    const ov = await engine.overview();
    assert(ov.persistent === false && ov.live.length === 1, "overview from memory");
    store.__setDbForTests(null);
    console.log("livePopup.integration.test.cjs: ok");
  } finally {
    engine.__resetForTests();
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
