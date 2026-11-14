"use strict";

/**
 * Ban experience (docs/design/ban-experience/CONTRACT.md): ACCOUNT_BANNED body with
 * a ban ticket on sign-in, 2FA and session restore; the ticket only opens the
 * ban-scoped endpoints; access bans on REST; owner / admin protection on every
 * ban route; appeals (account + access) and the admin decision; the live kick
 * payload; push recipients without banned accounts; ban_appeals missing = 503.
 */

process.env.NODE_ENV = "test";
process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.RESEND_API_KEY = "test-resend-key";
process.env.FEEDBACK_EMAIL_FROM = "support@descall.com";

const http = require("http");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const sentEmails = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (url === "https://api.resend.com/emails") {
    sentEmails.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ id: "fake_email_id" }) };
  }
  return realFetch(url, opts);
};

const HASH = bcrypt.hashSync("password123", 4);
const CONFIRMED = "2026-01-01T00:00:00.000Z";
function user(id, username, extra = {}) {
  return {
    id,
    username,
    password_hash: HASH,
    email: `${username}@example.com`,
    email_confirmed_at: CONFIRMED,
    is_admin: false,
    is_banned: false,
    active_sessions: [{ id: `s-${username}` }],
    birth_date: "1990-01-01",
    ...extra,
  };
}

const OWNER = "00000000-0000-4000-8000-000000000001";
const MOD = "00000000-0000-4000-8000-000000000002";
const ADMIN2 = "00000000-0000-4000-8000-000000000003";
const KAAN = "00000000-0000-4000-8000-000000000004";
const ELIF = "00000000-0000-4000-8000-000000000005";
const TWOFA = "00000000-0000-4000-8000-000000000006";
const PREBANNED = "00000000-0000-4000-8000-000000000007";
const ZEYNEP = "00000000-0000-4000-8000-000000000008";

const missingTables = [];
const fake = createFakeSupabase(
  {
    users: [
      user(OWNER, "admin", { is_admin: true }),
      user(MOD, "mod1", { is_admin: true, admin_permissions: ["moderation", "reports"] }),
      user(ADMIN2, "admin2", { is_admin: true }),
      user(KAAN, "kaanyilmaz"),
      user(ELIF, "elif"),
      user(TWOFA, "twofa", { two_factor_enabled: true }),
      user(ZEYNEP, "zeynep"),
      user(PREBANNED, "prebanned", {
        is_banned: true,
        ban_category: "harassment",
        ban_reason: "Harassment / Bullying",
        ban_message: "You insulted another member several times.",
        banned_at: "2026-11-10T10:00:00.000Z",
        banned_by: OWNER,
        ban_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }),
    ],
    user_reports: [{ id: "r-1", target_id: ADMIN2, reporter_id: KAAN, reason: "spam", status: "open" }],
    ban_appeals: [],
    access_bans: [],
  },
  { missingTables }
);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signBanTicket } = require("../config/jwt");
const authRouter = require("../routes/auth");
const adminRouter = require("../routes/admin");
const moderation = require("../lib/moderation");
const accessBans = require("../lib/accessBans");
const { buildKickPayload } = require("../socket/adminHandlers");
const { withoutBanned } = require("../lib/bannedRecipients");
const { resetLimits } = require("../lib/rateLimit");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

/* ---------- fake socket.io: two live sockets per user, user rooms ---------- */
const liveSockets = new Map();
function addSocket(id, userId) {
  const s = {
    id,
    user: { id: userId },
    rooms: new Set([`user:${userId}`]),
    handshake: { auth: {} },
    emitted: [],
    disconnected: false,
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
    disconnect() {
      this.disconnected = true;
      liveSockets.delete(this.id);
    },
  };
  liveSockets.set(id, s);
  return s;
}
const io = {
  sockets: { sockets: liveSockets },
  in(room) {
    return { fetchSockets: async () => [...liveSockets.values()].filter((s) => s.rooms.has(room)) };
  },
  to() {
    return { emit() {} };
  },
};

async function startServer() {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.set("io", io);
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token, ip, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(ip ? { "X-Forwarded-For": ip } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, raw: text, headers: res.headers };
}

const session = (id, username) => signToken({ id, username, sid: `s-${username}` });
const row = (id) => fake._tables.users.rows.find((u) => u.id === id);

function assertBanBody(body, { username, label }) {
  assert(body.code === "ACCOUNT_BANNED" && body.error === "Account is banned.", `${label}: code ${JSON.stringify(body)}`);
  const b = body.ban || {};
  for (const k of ["categoryId", "category", "reason", "message", "bannedAt", "expiresAt", "username", "byAdmin"]) {
    assert(Object.prototype.hasOwnProperty.call(b, k), `${label}: ban.${k} present`);
  }
  assert(b.username === username && b.byAdmin === true, `${label}: username / byAdmin`);
  assert(typeof body.banTicket === "string", `${label}: banTicket`);
  const t = jwt.verify(body.banTicket, process.env.JWT_SECRET);
  assert(t.scope === "ban" && t.exp - t.iat === 30 * 60, `${label}: ticket scope ban, 30 min`);
  assert(body.appeal && ["none", "pending", "rejected"].includes(body.appeal.status) && "canAppeal" in body.appeal, `${label}: appeal`);
  return t;
}

async function run() {
  await moderation.loadModerationStateFromDb();
  assert(moderation.isBanned(PREBANNED), "boot load picks up the stored ban");
  const { server, base } = await startServer();
  const owner = session(OWNER, "admin");
  const mod = session(MOD, "mod1");
  try {
    /* ---- 1. sign-in of a banned account: contract body + ticket ---- */
    let r = await call(base, "POST", "/api/auth/login", { body: { username: "prebanned", password: "password123" } });
    assert(r.status === 403, "banned login is 403");
    let ticketClaims = assertBanBody(r.body, { username: "prebanned", label: "login" });
    assert(ticketClaims.sub === PREBANNED, "ticket subject is the account");
    assert(r.body.ban.categoryId === "harassment" && r.body.ban.category === "harassment", "categoryId");
    assert(r.body.ban.reason === "Harassment / Bullying" && r.body.ban.message.startsWith("You insulted"), "reason + note kept");
    assert(r.body.appeal.status === "none" && r.body.appeal.canAppeal === true, "no appeal yet");
    const preTicket = r.body.banTicket;

    r = await call(base, "POST", "/api/auth/login", { body: { username: "prebanned", password: "wrong-password" } });
    assert(r.status === 401 && !r.body.banTicket, "wrong password never gets a ticket");

    /* ---- 2. the ticket only opens the ban endpoints ---- */
    r = await call(base, "GET", "/api/auth/me", { token: preTicket });
    assert(r.status === 401, "ticket is not a session: " + r.status);
    r = await call(base, "GET", "/api/auth/sessions", { token: preTicket });
    assert(r.status === 401, "ticket cannot list sessions");
    r = await call(base, "GET", "/api/admin/appeals", { token: preTicket });
    assert(r.status === 401, "ticket cannot reach admin");
    r = await call(base, "GET", "/api/auth/ban/status", { token: session(ELIF, "elif") });
    assert(r.status === 401, "a session token cannot use the ban endpoints");
    r = await call(base, "GET", "/api/auth/ban/status", { token: preTicket });
    assert(r.status === 200 && r.body.ban?.categoryId === "harassment" && r.body.appeal?.status === "none", "status with ticket " + r.raw);

    /* ---- 3. appeal endpoints: 503 while the table is missing, then create ---- */
    missingTables.push("ban_appeals");
    r = await call(base, "POST", "/api/auth/login", { body: { username: "prebanned", password: "password123" } });
    assert(r.status === 403 && r.body.appeal.canAppeal === false && r.body.appeal.status === "none", "login survives a missing table");
    r = await call(base, "POST", "/api/auth/ban/appeal", { token: preTicket, body: { text: "I did not insult anyone, please review the chat log." } });
    assert(r.status === 503 && r.body.code === "APPEALS_UNAVAILABLE", "appeal 503 when the table is missing");
    r = await call(base, "GET", "/api/admin/appeals", { token: owner });
    assert(r.status === 503 && r.body.code === "APPEALS_UNAVAILABLE", "admin list 503 when the table is missing");
    missingTables.splice(0);

    r = await call(base, "POST", "/api/auth/ban/appeal", { token: preTicket, body: { text: "too short" } });
    assert(r.status === 400 && r.body.code === "APPEAL_TEXT_LENGTH", "short appeal refused");
    r = await call(base, "POST", "/api/auth/ban/appeal", { token: preTicket, body: { text: "I did not insult anyone, please review the chat log." } });
    assert(r.status === 200 && r.body.appeal?.status === "pending" && r.body.appeal.canAppeal === false, "appeal created " + r.raw);
    r = await call(base, "POST", "/api/auth/ban/appeal", { token: preTicket, body: { text: "Second try, same ban, should be refused here." } });
    assert(r.status === 409 && r.body.code === "APPEAL_EXISTS", "one appeal per ban");
    r = await call(base, "GET", "/api/auth/ban/status", { token: preTicket });
    assert(r.body.appeal?.status === "pending" && r.body.appeal.submittedAt, "status shows the pending appeal");
    const accountAppeal = fake._tables.ban_appeals.rows[0];
    assert(accountAppeal.type === "account" && accountAppeal.user_id === PREBANNED && accountAppeal.email === "prebanned@example.com", "appeal row");

    /* ---- 4. admin / owner protection on every ban route ---- */
    r = await call(base, "POST", `/api/admin/users/${OWNER}/ban`, { token: mod, body: { category: "spam" } });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", "sub-admin cannot ban the owner " + r.raw);
    r = await call(base, "POST", `/api/admin/users/${ADMIN2}/ban`, { token: mod, body: { category: "spam" } });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", "sub-admin cannot ban another admin");
    r = await call(base, "POST", `/api/admin/users/${MOD}/ban`, { token: owner, body: { category: "spam" } });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", "owner cannot ban an admin either");
    r = await call(base, "POST", "/api/admin/users/bulk", { token: mod, body: { action: "ban", userIds: [ELIF, ADMIN2] } });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", "bulk ban with an admin is refused");
    assert(!moderation.isBanned(ELIF), "bulk refusal bans nobody");
    r = await call(base, "POST", "/api/admin/reports/r-1/ban", { token: mod, body: {} });
    assert(r.status === 403 && r.body.code === "ADMIN_PROTECTED", "report ban of an admin refused " + r.raw);
    assert(!row(ADMIN2).is_banned && !row(OWNER).is_banned && !row(MOD).is_banned, "no admin row was banned");

    /* ---- 5. ban a member: sessions revoked, email, live kick on every socket ---- */
    const kaanOld = session(KAAN, "kaanyilmaz");
    r = await call(base, "GET", "/api/auth/me", { token: kaanOld });
    assert(r.status === 200, "kaan signed in before the ban");
    const s1 = addSocket("sock-1", KAAN);
    const s2 = addSocket("sock-2", KAAN);
    const other = addSocket("sock-3", ELIF);
    const note = "Bir sunucuda baska bir uyeye defalarca hakaret ettin.";
    r = await call(base, "POST", `/api/admin/users/${KAAN}/ban`, {
      token: mod,
      body: { category: "harassment", message: note, presetId: "7d" },
    });
    assert(r.status === 200 && r.body.ok, "ban " + r.raw);
    assert(r.body.sessionsRevoked === 1 && r.body.emailed === true, "sessions revoked + emailed by default " + r.raw);
    assert(row(KAAN).is_banned && row(KAAN).active_sessions.length === 0, "row banned, sessions cleared");
    assert(s1.disconnected && s2.disconnected && !other.disconnected, "every socket of the user is closed, nobody else");
    const kick = s1.emitted.find((e) => e.event === "system:kick")?.payload;
    assert(kick && s2.emitted.some((e) => e.event === "system:kick"), "both sockets got system:kick");
    assert(kick.action === "ban" && kick.categoryId === "harassment" && kick.message === note, "kick payload " + JSON.stringify(kick));
    assert(kick.reason === "Harassment / Bullying" && kick.reason !== kick.message, "reason is the label, not the note again");
    assert(kick.username === "kaanyilmaz" && kick.bannedAt && kick.expiresAt, "kick has username and dates");
    assert(jwt.verify(kick.banTicket, process.env.JWT_SECRET).scope === "ban", "kick carries a ban ticket");
    const mail = sentEmails.find((m) => m.to[0] === "kaanyilmaz@example.com");
    assert(mail && !mail.html, "plain-text ban email sent");
    assert(/Sebep: Taciz \/ Zorbalık/.test(mail.text) && /Reason: Harassment \/ Bullying/.test(mail.text), "TR + EN category");
    assert(mail.text.includes(note) && /Açılış:/.test(mail.text) && /Ends:/.test(mail.text) && /İtiraz et/.test(mail.text), "note, end date, how to appeal");
    assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(mail.text + mail.subject), "no emojis in the email");

    // Session restore: the token the ban signed out still gets the ban screen.
    r = await call(base, "GET", "/api/auth/me", { token: kaanOld });
    assert(r.status === 403, "restore of a banned session " + r.status);
    assertBanBody(r.body, { username: "kaanyilmaz", label: "restore" });
    r = await call(base, "GET", "/api/auth/me", { token: signToken({ id: KAAN, username: "kaanyilmaz", sid: "never-existed" }) });
    assert(r.status === 401, "an unknown session of a banned user stays 401");

    // Ticket from the restore opens export and delete.
    const kaanTicket = signBanTicket({ id: KAAN });
    r = await call(base, "GET", "/api/auth/ban/export", { token: kaanTicket });
    assert(r.status === 200 && /attachment/.test(r.headers.get("content-disposition") || ""), "export with ticket " + r.status + " " + r.raw.slice(0, 200));
    assert(r.raw.includes("kaanyilmaz"), "the export is the account's data");
    r = await call(base, "POST", "/api/auth/ban/delete", { token: kaanTicket, body: { confirm: "nope" } });
    assert(r.status === 400, "delete needs confirm DELETE");
    r = await call(base, "POST", "/api/auth/ban/delete", { token: kaanTicket, body: { confirm: "DELETE" } });
    assert(r.status === 200 && row(KAAN).deletion_requested_at, "banned user can delete the account " + r.raw);
    r = await call(base, "POST", "/api/auth/login", { body: { username: "kaanyilmaz", password: "password123" } });
    assert(r.status === 403 && row(KAAN).deletion_requested_at, "a banned sign-in never cancels the deletion");

    // alsoAccessBan: the account's devices / addresses are banned too (before the
    // sessions are cleared), other accounts on that device get an access_ban kick.
    const deviceId = "device-zeynep-0123456789abcdef";
    row(ZEYNEP).active_sessions = [
      { id: "s-zeynep", ip: "88.240.1.1", deviceHash: accessBans.fingerprintOf({ deviceId }).device, device: "Chrome on Windows" },
    ];
    const sibling = addSocket("sock-4", ELIF);
    sibling.handshake.auth.device = deviceId;
    r = await call(base, "POST", `/api/admin/users/${ZEYNEP}/ban`, {
      token: owner,
      body: { category: "ban_evasion", presetId: "30d", alsoAccessBan: true, notifyEmail: false, revokeSessions: true },
    });
    assert(r.status === 200 && r.body.accessBan?.added === 2 && r.body.accessBan.duration === "30d", "account + access ban " + r.raw);
    assert(r.body.emailed === false && r.body.sessionsRevoked === 1, "notifyEmail false respected");
    const devBan = fake._tables.access_bans.rows.find((b) => b.kind === "device" && b.source_user_id === ZEYNEP);
    assert(devBan && fake._tables.access_bans.rows.some((b) => b.kind === "ip" && b.source_user_id === ZEYNEP), "device + ip rows");
    const accessKick = sibling.emitted.find((e) => e.event === "system:kick")?.payload;
    assert(sibling.disconnected && accessKick?.action === "access_ban", "other account on the device kicked " + JSON.stringify(accessKick));
    assert(accessKick.access?.code === accessBans.accessCode(devBan.id) && accessKick.access.kind === "device" && !JSON.stringify(accessKick).includes("88.240"), "access kick payload");
    await accessBans.revokeBan({ id: devBan.id, actor: { id: OWNER, username: "admin" } });

    // Pushes skip banned accounts.
    assert(withoutBanned([KAAN, ELIF]).join() === ELIF, "push recipients drop banned accounts");

    /* ---- 6. 2FA verify-login re-checks the ban ---- */
    r = await call(base, "POST", "/api/auth/login", { body: { username: "twofa", password: "password123" } });
    assert(r.status === 200 && r.body.requires2fa && r.body.pendingToken, "2FA step " + r.raw);
    const pendingToken = r.body.pendingToken;
    const codeMail = sentEmails.filter((m) => m.to[0] === "twofa@example.com").slice(-1)[0];
    const code = String(codeMail?.text || "").match(/\b(\d{6})\b/)?.[1];
    assert(code, "2FA code emailed");
    await moderation.applyBan({ targetUserId: TWOFA, actorUserId: OWNER, category: "spam", presetId: "permanent" });
    r = await call(base, "POST", "/api/auth/2fa/verify-login", { body: { pendingToken, code } });
    assert(r.status === 403 && !r.body.token, "verify-login refuses a freshly banned account " + r.raw);
    assertBanBody(r.body, { username: "twofa", label: "2fa" });
    assert(r.body.ban.expiresAt === null && r.body.ban.categoryId === "spam", "permanent spam ban");

    /* ---- 7. admin lists and decides the account appeal ---- */
    r = await call(base, "GET", "/api/admin/appeals?status=pending&type=account", { token: mod });
    assert(r.status === 200 && r.body.appeals.length === 1 && r.body.appeals[0].username === "prebanned", "pending list " + r.raw);
    r = await call(base, "POST", `/api/admin/appeals/${accountAppeal.id}/decide`, { token: mod, body: { decision: "maybe" } });
    assert(r.status === 400, "bad decision refused");
    const before = sentEmails.length;
    r = await call(base, "POST", `/api/admin/appeals/${accountAppeal.id}/decide`, { token: mod, body: { decision: "accept", note: "Log reviewed." } });
    assert(r.status === 200 && r.body.lifted === true && r.body.emailed === true, "accept " + r.raw);
    assert(!moderation.isBanned(PREBANNED) && !row(PREBANNED).is_banned, "accept lifts the ban");
    const result = sentEmails.slice(before).find((m) => m.to[0] === "prebanned@example.com");
    assert(result && /kabul edildi/.test(result.text) && /was accepted/.test(result.text) && result.text.includes("Log reviewed."), "result email");
    r = await call(base, "POST", `/api/admin/appeals/${accountAppeal.id}/decide`, { token: mod, body: { decision: "reject" } });
    assert(r.status === 409 && r.body.code === "APPEAL_DECIDED", "decided once");
    r = await call(base, "POST", "/api/auth/login", { body: { username: "prebanned", password: "password123" } });
    assert(r.status === 200 && r.body.token, "unbanned user signs in");

    /* ---- 8. access bans on REST, access appeal, accept lifts it ---- */
    resetLimits();
    const [ipBan] = await accessBans.banAddress({ ip: "88.230.17.4", kind: "ip", duration: "30d", reason: "raid", actor: { id: OWNER, username: "admin" } });
    const elif = session(ELIF, "elif");
    r = await call(base, "GET", "/api/auth/me", { token: elif, ip: "88.230.17.4" });
    assert(r.status === 403 && r.body.code === "ACCESS_BANNED", "REST from a banned IP is refused " + r.raw);
    assert(r.body.error === "Access to Descall from this device or network is blocked.", "access error text");
    assert(/^ACC-[A-Z2-7]{4}$/.test(r.body.access?.code) && r.body.access.kind === "ip", "access code + kind");
    assert(r.body.access.createdAt && r.body.access.expiresAt && r.body.expiresAt === r.body.access.expiresAt, "access dates");
    assert(!r.raw.includes("88.230"), "no IP in the body");
    assert(r.body.access.code === accessBans.accessCode(ipBan.id), "code derives from the row id");
    r = await call(base, "GET", "/api/auth/me", { token: elif, ip: "88.231.1.1" });
    assert(r.status === 200, "another address is fine");
    r = await call(base, "GET", "/api/auth/me", { token: owner, ip: "88.230.17.4" });
    assert(r.status === 200, "admins are exempt");
    r = await call(base, "POST", "/api/auth/login", { body: { username: "elif", password: "password123" }, ip: "88.230.17.4" });
    assert(r.status === 403 && r.body.code === "ACCESS_BANNED" && r.body.access?.code, "login answer has the access block");

    const accessCode = r.body.access.code;
    r = await call(base, "POST", "/api/auth/access-appeal", {
      ip: "88.230.17.4",
      body: { code: "ACC-2222", email: "elif@example.com", text: "Shared dorm network, I did nothing wrong here." },
    });
    assert(accessCode === "ACC-2222" || (r.status === 404 && r.body.code === "ACCESS_CODE_UNKNOWN"), "unknown code refused " + r.raw);
    r = await call(base, "POST", "/api/auth/access-appeal", {
      ip: "88.230.17.4",
      body: { code: accessCode, email: "not-an-email", text: "Shared dorm network, I did nothing wrong here." },
    });
    assert(r.status === 400, "bad email refused");
    r = await call(base, "POST", "/api/auth/access-appeal", {
      ip: "88.230.17.4",
      body: { code: accessCode.toLowerCase(), email: "Elif@Example.com", text: "Shared dorm network, I did nothing wrong here." },
    });
    assert(r.status === 200 && r.body.ok === true, "access appeal " + r.raw);
    const accessAppeal = fake._tables.ban_appeals.rows.find((a) => a.type === "access");
    assert(accessAppeal && accessAppeal.access_ban_id === ipBan.id && accessAppeal.email === "elif@example.com", "access appeal row");
    assert(!JSON.stringify(accessAppeal).includes("88.230"), "appeal row has no IP");

    for (let i = 0; i < 6; i += 1) {
      r = await call(base, "POST", "/api/auth/access-appeal", {
        ip: "88.230.17.9",
        body: { code: accessCode, email: "spam@example.com", text: "Spamming appeals over and over again here." },
      });
    }
    assert(r.status === 429, "access appeals are rate limited");

    r = await call(base, "GET", "/api/admin/appeals?type=access", { token: owner });
    assert(r.status === 200 && r.body.appeals[0]?.access?.kind === "ip" && !r.raw.includes("88.230"), "admin sees the access appeal, no IP");
    r = await call(base, "POST", `/api/admin/appeals/${accessAppeal.id}/decide`, { token: owner, body: { decision: "accept" } });
    assert(r.status === 200 && r.body.lifted === true, "accept access appeal " + r.raw);
    r = await call(base, "GET", "/api/auth/me", { token: elif, ip: "88.230.17.4" });
    assert(r.status === 200, "access ban lifted after the appeal");
    assert(sentEmails.some((m) => m.to[0] === "elif@example.com" && m.text.includes(accessCode)), "access result emailed");

    /* ---- 9. kick payloads never repeat the note ---- */
    const p = buildKickPayload({ targetUserId: ELIF, reason: "Be nice", action: "kick", category: "language", message: "Be nice" });
    assert(p.reason !== p.message && p.reason === "Abusive Language" && !p.banTicket, "kick reason is not the message");
    const pb = buildKickPayload({ targetUserId: ELIF, action: "ban", category: "spam", message: null });
    assert(pb.reason === "Spam" && pb.message === null && pb.banTicket, "ban kick without a note");
  } finally {
    server.close();
    moderation.stopModerationSync();
  }
  console.log("banExperience.integration.test: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
