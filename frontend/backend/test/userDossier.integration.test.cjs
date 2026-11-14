"use strict";

/**
 * Kullanıcı dosyası (Nov 2026 remake) over real HTTP with the fake Supabase:
 * section "people" guards every dossier route, the summary carries the
 * explainable risk + masked sessions, the lazy tabs (timeline, linked,
 * communities, activity, wallet) never carry message text or raw IPs, admin
 * notes are step-up + audited + author-only delete + 503 before the migration,
 * one session can be ended, the timeout can notify, the live popup can target
 * one person, and the audit log filters by account.
 */

process.env.NODE_ENV = "test";
process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const SECRET = "DM-TEXT-SECRET-41aa";
const RAW_IP = "88.230.12.4";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = id(1);
const PEOPLE = id(2); // admin with the people + moderation sections
const REPORTS_ONLY = id(3);
const KAAN = id(10);
const EMRE = id(11); // banned, same device
const MERT = id(12); // same /24 network
const ELIF = id(13); // reporter
const S1 = id(100);
const S2 = id(101);
const G1 = id(150);
const ITEM = id(160);

const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
const now = Date.now();
const ago = (days) => new Date(now - days * 86400000).toISOString();
function user(uid, username, extra = {}) {
  return {
    id: uid,
    username,
    display_name: username,
    email: `${username}@example.com`,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    is_admin: false,
    is_banned: false,
    active_sessions: [{ id: `s-${username}` }],
    birth_date: "1990-01-01",
    created_at: ago(200),
    ...extra,
  };
}

const missing = [];
const fake = createFakeSupabase(
  {
    users: [
      user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
      user(PEOPLE, "demir", { is_admin: true, admin_permissions: ["people", "moderation"], ...TOTP_ON }),
      user(REPORTS_ONLY, "rep", { is_admin: true, admin_permissions: ["reports"], ...TOTP_ON }),
      user(KAAN, "kaanyilmaz", {
        display_name: "Kaan Yilmaz",
        descoin_balance: 115000,
        active_sessions: [
          { id: "sess-1", device: "Descall Desktop", ip: RAW_IP, deviceHash: "dh-1", createdAt: ago(1), lastActiveAt: ago(0.01) },
          { id: "sess-2", device: "Safari on iOS", ip: "176.88.1.2", createdAt: ago(5), lastActiveAt: ago(0.1) },
        ],
        first_touch_source: "instagram",
      }),
      user(EMRE, "emre_alt", { is_banned: true }),
      user(MERT, "mert.k"),
      user(ELIF, "elif"),
    ],
    descoin_device_seen: [
      { user_id: KAAN, kind: "fp", hash: "fp-1", last_seen: ago(1) },
      { user_id: KAAN, kind: "subnet", hash: "net-1", last_seen: ago(1) },
      { user_id: EMRE, kind: "fp", hash: "fp-1", last_seen: ago(2) },
      { user_id: MERT, kind: "subnet", hash: "net-1", last_seen: ago(20) },
    ],
    descoin_account_links: [],
    user_reports: [
      { id: id(600), reporter_id: ELIF, target_id: KAAN, reason: "harassment", status: "open", context_type: "dm", snippet: "SNIPPET-X", created_at: ago(0.5) },
      { id: id(601), reporter_id: ELIF, target_id: KAAN, reason: "spam", status: "dismissed", context_type: "profile", created_at: ago(9) },
    ],
    moderation_actions: [{ id: id(700), action_type: "kick", target_user_id: KAAN, actor_user_id: PEOPLE, category: "spam", reason: "Spam", created_at: ago(3) }],
    descoin_ledger: [
      { id: id(800), user_id: KAAN, amount: 100000, reason: "admin_grant", meta: { by: PEOPLE, reason: "Etkinlik" }, balance_after: 100000, created_at: ago(8) },
      { id: id(801), user_id: KAAN, amount: 15000, reason: "premium_gift", meta: {}, balance_after: 115000, created_at: ago(4) },
    ],
    servers: [
      { id: S1, name: "Gece Ders Kampi", owner_id: KAAN, is_public: true, created_at: ago(30) },
      { id: S2, name: "Minecraft SMP", owner_id: MERT, is_public: false, created_at: ago(100) },
    ],
    server_members: [
      { server_id: S1, user_id: KAAN, joined_at: ago(30) },
      { server_id: S2, user_id: KAAN, joined_at: ago(6) },
      { server_id: S2, user_id: MERT, joined_at: ago(100) },
    ],
    groups: [{ id: G1, name: "Okul" }],
    group_members: [{ group_id: G1, user_id: KAAN, role: "member", joined_at: ago(7) }],
    friendships: [
      { user_id: KAAN, friend_id: MERT, status: "accepted" },
      { user_id: KAAN, friend_id: ELIF, status: null },
    ],
    server_bans: [],
    dm_messages: [
      { id: id(900), from_user_id: KAAN, to_user_id: ELIF, content: SECRET, created_at: ago(1) },
      { id: id(901), from_user_id: KAAN, to_user_id: ELIF, content: SECRET, created_at: ago(2) },
      { id: id(902), from_user_id: KAAN, to_user_id: ELIF, content: SECRET, created_at: ago(40) },
    ],
    group_messages: [{ id: id(910), sender_id: KAAN, group_id: G1, content: SECRET, created_at: ago(3) }],
    server_messages: [{ id: id(920), sender_id: KAAN, server_id: S1, content: SECRET, created_at: ago(3) }],
    server_voice_sessions: [
      { user_id: KAAN, server_id: S1, joined_at: ago(2), left_at: ago(2 - 3600 / 86400), duration_seconds: 3600 },
      { user_id: KAAN, server_id: S1, joined_at: ago(60), duration_seconds: 9000 },
    ],
    screen_share_sessions: [{ user_id: KAAN, group_id: G1, started_at: ago(2), ended_at: ago(1.9) }],
    user_subscriptions: [{ user_id: KAAN, plan_id: "plus", status: "active", started_at: ago(10), ends_at: ago(-20), unlimited: false, is_free: true, source: "admin" }],
    subscription_events: [{ id: id(950), user_id: KAAN, kind: "grant", new_plan: "plus", new_ends_at: ago(-20), actor_kind: "admin", created_at: ago(10) }],
    shop_items: [{ id: ITEM, name: "Neon cerceve" }],
    shop_purchases: [{ id: id(960), user_id: KAAN, item_id: ITEM, amount_descoin: 2500, status: "completed", created_at: ago(12) }],
    user_credits: [{ user_id: KAAN, credits: 420 }],
    admin_user_notes: [],
    admin_audit: [],
  },
  { missingTables: missing }
);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const state = require("../runtime/sharedState");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const emitted = [];
const disconnected = [];
const fakeSocket = (uid, sid) => ({
  user: { id: uid, sid },
  emit: (event, payload) => emitted.push({ room: `socket:${sid}`, event, payload }),
  disconnect: () => disconnected.push(sid),
});
const io = {
  to(room) {
    return { emit: (event, payload) => emitted.push({ room, event, payload }) };
  },
  in() {
    return { fetchSockets: async () => [] };
  },
  sockets: { sockets: new Map([["a", fakeSocket(KAAN, "sess-2")], ["b", fakeSocket(KAAN, "sess-1")]]), adapter: { rooms: new Map() } },
};

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

async function run() {
  const { server, base } = await startServer();
  const owner = session(OWNER, "admin");
  const ownerStep = stepUpFor(OWNER, "admin");
  const demir = session(PEOPLE, "demir");
  const demirStep = stepUpFor(PEOPLE, "demir");
  const P = `/api/admin/people/${KAAN}`;
  try {
    /* ---- 1. section people guards every route ---- */
    for (const path of [`${P}/dossier`, `${P}/dossier/timeline`, `${P}/dossier/linked`, `${P}/notes`]) {
      const r = await call(base, "GET", path, { token: session(REPORTS_ONLY, "rep") });
      assert(r.status === 403 && r.body.section === "people", `${path} needs people ` + r.raw);
    }

    /* ---- 2. summary: risk reasons, masked sessions, stats ---- */
    let r = await call(base, "GET", `${P}/dossier`, { token: demir });
    assert(r.status === 200, "dossier " + r.raw);
    assert(!r.raw.includes(RAW_IP), "no raw IP in the summary");
    assert(r.body.sessions.find((s) => s.id === "sess-1").ip === "88.230.x.x", "masked session IP");
    const reasons = r.body.risk.reasons.map((x) => x.id);
    assert(reasons.includes("open_reports") && reasons.includes("linked_banned") && reasons.includes("prior_sanctions") && reasons.includes("account_age"), "risk reasons " + reasons);
    assert(r.body.risk.score === r.body.risk.reasons.reduce((s, x) => s + x.points, 0), "score = sum of reasons");
    assert(r.body.stats.linked === 2 && r.body.linked.bannedCount === 1, "linked stats " + JSON.stringify(r.body.linked));
    assert(r.body.stats.voiceSeconds30d === 3600, "voice 30d " + r.body.stats.voiceSeconds30d);
    assert(r.body.stats.servers === 2 && r.body.stats.groups === 1, "community counts");
    assert(r.body.subscription?.active && r.body.subscription.plan === "plus", "subscription summary");
    assert(r.body.identity.emailMasked === "k***@example.com" && r.body.identity.emailVerified === true, "email masked + verified");
    assert(r.body.notes.ready === true && r.body.notes.count === 0, "notes summary");

    /* ---- 3. timeline: merged, newest first, no message text ---- */
    r = await call(base, "GET", `${P}/dossier/timeline`, { token: demir });
    assert(r.status === 200, "timeline " + r.raw);
    const types = new Set(r.body.items.map((i) => i.type));
    for (const t of ["signup", "login", "report", "mod", "ledger", "purchase", "subscription", "server_join", "server_own", "group_join"]) assert(types.has(t), `timeline has ${t}`);
    const times = r.body.items.map((i) => Date.parse(i.at));
    assert(times.every((t, i) => i === 0 || times[i - 1] >= t), "newest first");
    assert(!r.raw.includes(SECRET) && !r.raw.includes(RAW_IP) && !r.raw.includes("SNIPPET-X"), "no content, IP or report snippet");
    assert(r.body.items.find((i) => i.type === "ledger" && i.meta.amount === 100000).meta.by === "demir", "grant actor resolved");

    /* ---- 4. linked accounts ---- */
    r = await call(base, "GET", `${P}/dossier/linked`, { token: demir });
    const emre = r.body.accounts.find((a) => a.id === EMRE);
    const mert = r.body.accounts.find((a) => a.id === MERT);
    assert(emre && emre.banned && emre.kinds.includes("device"), "banned account on the same device " + r.raw);
    assert(mert && mert.kinds.join() === "network" && !mert.banned, "same network");
    assert(r.body.accounts[0].id === EMRE, "device matches first");
    assert(!/hash|"ip"/.test(r.raw), "no hashes or IPs");

    /* ---- 5. communities, activity, wallet ---- */
    r = await call(base, "GET", `${P}/dossier/communities`, { token: demir });
    assert(r.body.owned.length === 1 && r.body.owned[0].members === 1, "owned server " + r.raw);
    assert(r.body.joined.length === 1 && r.body.joined[0].name === "Minecraft SMP", "joined (owned not repeated)");
    assert(r.body.groups[0].name === "Okul" && r.body.friends === 2, "groups + friends");
    r = await call(base, "GET", `${P}/dossier/activity`, { token: demir });
    assert(r.status === 200 && r.body.days.length >= 30, "30 days " + r.body.days?.length);
    assert(r.body.totals.messages === 4 && r.body.split.dm === 2, "message counts in window " + JSON.stringify(r.body.totals));
    assert(r.body.totals.voiceSeconds === 3600 && r.body.totals.screenShares === 1, "voice + screen");
    assert(!r.raw.includes(SECRET), "activity has no text");
    r = await call(base, "GET", `${P}/dossier/wallet`, { token: demir });
    assert(r.body.balance === 115000 && r.body.ledger.length === 2 && r.body.ledger[0].reason === "premium_gift", "ledger newest first");
    assert(r.body.purchases[0].item === "Neon cerceve" && r.body.gameCredits === 420, "purchases + credits");
    assert(r.body.subscription.plan === "plus" && r.body.subscriptionEvents.length === 1, "subscription");
    r = await call(base, "GET", `${P}/dossier/nope`, { token: demir });
    assert(r.status === 404, "unknown section");

    /* ---- 6. notes ---- */
    r = await call(base, "POST", `${P}/notes`, { token: demir, body: { body: "Spam supheli" } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "notes need step-up");
    r = await call(base, "POST", `${P}/notes`, { token: demir, stepUp: demirStep, body: { body: "   " } });
    assert(r.status === 400 && r.body.code === "NOTE_INVALID", "empty note refused");
    r = await call(base, "POST", `${P}/notes`, { token: demir, stepUp: demirStep, body: { body: "x".repeat(2001) } });
    assert(r.status === 400, "too long refused");
    r = await call(base, "POST", `${P}/notes`, { token: demir, stepUp: demirStep, body: { body: "  Spam supheli, reklam linkleri  " } });
    assert(r.status === 201 && r.body.note.body === "Spam supheli, reklam linkleri" && r.body.note.authorUsername === "demir", "note saved " + r.raw);
    const noteId = r.body.note.id;
    assert(lastAudit("user_note_add")?.target === KAAN, "note audited");
    r = await call(base, "GET", `${P}/notes`, { token: owner });
    assert(r.body.ready && r.body.notes.length === 1, "notes listed");
    r = await call(base, "DELETE", `${P}/notes/${noteId}`, { token: owner, stepUp: ownerStep });
    assert(r.status === 403 && r.body.code === "NOTE_NOT_YOURS", "only the author deletes");
    r = await call(base, "DELETE", `${P}/notes/${noteId}`, { token: demir, stepUp: demirStep });
    assert(r.status === 200 && fake._tables.admin_user_notes.rows.length === 0, "author deletes");
    assert(lastAudit("user_note_delete"), "delete audited");
    missing.push("admin_user_notes");
    r = await call(base, "POST", `${P}/notes`, { token: demir, stepUp: demirStep, body: { body: "Not" } });
    assert(r.status === 503 && r.body.code === "NOTES_UNAVAILABLE", "503 before the migration " + r.raw);
    r = await call(base, "GET", `${P}/notes`, { token: demir });
    assert(r.status === 200 && r.body.ready === false, "GET reads as not ready");
    missing.length = 0;

    /* ---- 7. end one session ---- */
    r = await call(base, "POST", `${P}/sessions/sess-2/revoke`, { token: demir, stepUp: demirStep });
    assert(r.status === 200 && r.body.remaining === 1 && r.body.disconnected === 1, "one session ended " + r.raw);
    assert(state.revokedSessionIds.has("sess-2") && !state.revokedSessionIds.has("sess-1"), "only that id revoked");
    assert(disconnected.join() === "sess-2", "only its socket disconnected");
    assert(fake._tables.users.rows.find((u) => u.id === KAAN).active_sessions.map((s) => s.id).join() === "sess-1", "row updated");
    assert(lastAudit("revoke_session")?.meta.device === "Safari on iOS", "audited with the device");
    r = await call(base, "POST", `${P}/sessions/nope/revoke`, { token: demir, stepUp: demirStep });
    assert(r.status === 404, "unknown session");

    /* ---- 8. timeout notify, single-person popup, audit by account ---- */
    io.sockets.adapter.rooms.set(`user:${KAAN}`, new Set(["b"]));
    r = await call(base, "POST", `/api/admin/users/${KAAN}/timeout`, { token: demir, stepUp: demirStep, body: { category: "spam", durationSeconds: 600, message: "1 saat sonra yazabilirsin", notify: true } });
    assert(r.status === 200, "timeout " + r.raw);
    assert(lastAudit("timeout").meta.notified === true, "notified in audit");
    assert(emitted.some((e) => e.event === "notification:new" && e.payload?.notification?.body === "1 saat sonra yazabilirsin"), "bell notification with the note");
    r = await call(base, "POST", "/api/admin/popup", { token: owner, stepUp: ownerStep, body: { title: "Merhaba", body: "Kurallara uy", targetUserId: KAAN } });
    assert(r.status === 400 && r.body.code === "USER_OFFLINE", "offline person refused " + r.raw);
    r = await call(base, "GET", `/api/admin/audit?target=${KAAN}`, { token: owner });
    assert(r.status === 200 && r.body.entries.length > 0 && r.body.entries.every((e) => String(e.target) === KAAN), "audit filtered by account");

    console.log("userDossier.integration: ok");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
