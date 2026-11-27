"use strict";

/**
 * Davet Merkezi / Davet ödülleri (growth phase 4, 4A) over real HTTP with the fake Supabase:
 * friend-link sign-up writes a PENDING reward (no instant DesCoin), the first message and a
 * return the next day pay 100 + 50 once (idempotency keys), legacy rewards stay paid and are
 * never paid twice, throwaway email is denied, the same device is held, a burst raises an
 * alert with automatic holds, milestones pay once, the user dashboard / landing / open /
 * attach / nudge / welcome endpoints, the admin board (section gate, overview, panel,
 * previewed text, hold / release / revoke with debit, undo with refund, rules versions,
 * alert ignore, link pause, CSV export), audit entries, and the onboarding "friend" step
 * that must not count the automatic invite friendship.
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
const INVADMIN = id(2);
const OTHERADMIN = id(3);
const ECE = id(10);
const BORA = id(11);
const OLD = id(12);
const OLD2 = id(13);
const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
const now = Date.now();
const ago = (days) => new Date(now - days * 86400000).toISOString();
const user = (uid, username, extra = {}) => ({
  id: uid,
  username,
  display_name: username,
  is_admin: false,
  active_sessions: [{ id: `s-${username}` }],
  language: "tr",
  created_at: ago(100),
  descoin_balance: 0,
  email: `${username}@example.com`,
  email_confirmed_at: ago(100),
  ...extra,
});

const fake = createFakeSupabase(
  {
    users: [
      user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
      user(INVADMIN, "demir", { is_admin: true, admin_permissions: ["invites"], ...TOTP_ON }),
      user(OTHERADMIN, "other", { is_admin: true, admin_permissions: ["reports"], ...TOTP_ON }),
      user(ECE, "ece", { display_name: "Ece", descoin_balance: 1000 }),
      user(BORA, "bora.aksoy", { display_name: "Bora Aksoy", created_at: ago(32) }),
      user(OLD, "old.friend", { created_at: ago(60) }),
      user(OLD2, "late.paid", { created_at: ago(1) }),
    ],
    // Paid by the old instant logic, before the migration (no status column on the row).
    referral_rewards: [{ id: id(500), inviter_id: ECE, invitee_id: OLD, inviter_amount: 100, invitee_amount: 50, created_at: ago(60) }],
    descoin_ledger: [
      { id: id(600), user_id: OLD, amount: 50, reason: "referral_welcome", meta: { inviterId: ECE }, created_at: ago(60) },
      { id: id(601), user_id: ECE, amount: 100, reason: "referral_invite", meta: { inviteeId: OLD }, created_at: ago(60) },
      // Old instant credit for an invitee whose row was written as pending after the migration.
      { id: id(602), user_id: OLD2, amount: 50, reason: "referral_welcome", meta: { inviterId: ECE }, created_at: ago(1) },
    ],
    friendships: [],
    servers: [{ id: id(900), name: "Gece Kuşları", icon_url: null, is_public: true }],
    server_members: [
      { server_id: id(900), user_id: ECE },
      { server_id: id(900), user_id: BORA },
    ],
    referral_opens: [],
    referral_milestones: [],
    referral_rules: [],
    referral_actions: [],
    referral_alerts: [],
    referral_inviter_state: [],
    referral_notices: [],
  },
  { uniqueKeys: { referral_rewards: ["invitee_id"], referral_milestones: ["inviter_id", "milestone"], referral_opens: ["inviter_id", "visitor_hash", "day"], referral_rules: ["version"] } }
);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const authRouter = require("../routes/auth");
const invitesRouter = require("../routes/invites");
const adminRouter = require("../routes/admin");
const state = require("../runtime/sharedState");
const engine = require("../lib/referrals/engine");
const store = require("../lib/referrals/store");
const descoin = require("../lib/descoin");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const emitted = [];
const io = {
  to(room) {
    return { emit: (event, payload) => emitted.push({ room, event, payload }) };
  },
  in() {
    return { fetchSockets: async () => [] };
  },
  sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
};

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/auth", authRouter);
  app.use("/api/invites", invitesRouter);
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token, stepUp, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}),
      ...headers,
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
const T = (name) => fake._tables[name].rows;
const userByName = (n) => T("users").find((u) => u.username === n);
const refOf = (uid) => T("referral_rewards").find((r) => r.invitee_id === uid);
const ledgerOf = (uid, reason) => T("descoin_ledger").filter((l) => l.user_id === uid && (!reason || l.reason === reason));
const balance = (uid) => T("users").find((u) => u.id === uid).descoin_balance;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REG = { password: "password123", termsAccepted: true, birthDate: "2000-01-15" };

async function register(base, username, invitedBy, { email = `${username}@example.com`, device = `dev-${username}` } = {}) {
  const r = await call(base, "POST", "/api/auth/register", { body: { ...REG, username, email, invitedBy }, headers: { "x-descall-device": device } });
  assert(r.status === 201, `register ${username}: ${JSON.stringify(r.body)}`);
  await wait(20);
  const u = userByName(username);
  u.active_sessions = [{ id: `s-${username}` }];
  if (u.descoin_balance == null) u.descoin_balance = 0; // database default
  return u;
}

/** Move a row's sign-up time back (the tests drive time through `at`). */
function backdate(uid, hours) {
  const r = refOf(uid);
  const t = new Date(Date.now() - hours * 3600000).toISOString();
  r.signup_at = t;
  r.created_at = t;
  r.unlock_at = new Date(Date.now() - (hours - 24) * 3600000).toISOString();
  r.expires_at = new Date(Date.now() - (hours - 72) * 3600000).toISOString();
  return r;
}

async function run() {
  const { server, base } = await startServer();
  const admin = { token: session(INVADMIN, "demir"), stepUp: stepUpFor(INVADMIN, "demir") };
  const other = { token: session(OTHERADMIN, "other"), stepUp: stepUpFor(OTHERADMIN, "other") };
  const ece = session(ECE, "ece");
  try {
    // ---- 1. Friend-link sign-up: friendship now, reward PENDING, no DesCoin yet.
    const can = await register(base, "can", "ece");
    let row = refOf(can.id);
    assert(row && row.status === "pending" && row.legacy === false, `pending row: ${JSON.stringify(row)}`);
    assert(row.inviter_amount === 100 && row.invitee_amount === 50, "amounts from the rules");
    assert(row.device_hash && row.device_hash !== "dev-can" && row.ip_hash, "device / ip stored hashed only");
    assert(!ledgerOf(can.id, "referral_welcome").length && ledgerOf(ECE, "referral_invite").length === 1, "nothing paid at sign-up (only the legacy credit)");
    assert(T("friendships").some((f) => f.status === "accepted" && [f.user_id, f.friend_id].includes(ECE) && [f.user_id, f.friend_id].includes(can.id)), "auto friendship");
    assert(emitted.some((e) => e.room === `user:${ECE}` && e.event === "invites:update"), "inviter told live");

    // ---- 2. Throwaway email: no reward. Same device as Can: held for review.
    const mert = await register(base, "mert", "ece", { email: "mert@mailinator.com" });
    assert(refOf(mert.id).status === "denied" && refOf(mert.id).hold_reason === "disposable_email", `denied: ${JSON.stringify(refOf(mert.id))}`);
    const nisa = await register(base, "nisa_2207", "ece", { device: "dev-can" });
    assert(refOf(nisa.id).status === "held" && refOf(nisa.id).hold_reason === "same_device", `held: ${JSON.stringify(refOf(nisa.id))}`);
    assert(refOf(nisa.id).auto_hold === true, "automatic hold");
    assert(T("referral_actions").some((a) => a.action === "auto_hold" && a.inviter_id === ECE), "system action logged");
    assert(state.auditLog.some((e) => e.action === "invite_auto_hold"), "audit: automatic hold");

    // ---- 3. First message (to the inviter) then a visit the next day: pays once.
    backdate(can.id, 25);
    let r1 = await engine.noteFirstMessage({ userId: can.id, peerId: ECE, io, at: Date.now() - 24 * 3600000 });
    assert(r1.changed, "first message noted");
    row = refOf(can.id);
    assert(row.first_message_at && row.first_message_peer === "inviter" && row.status === "pending", `after message: ${row.status}`);
    assert(row.risk_signals.some((s) => s.code === "inviter_only"), "warn signal stored");
    const eceBefore = balance(ECE);
    await engine.noteSeen({ userId: can.id, io, force: true });
    row = refOf(can.id);
    assert(row.status === "paid" && row.returned_at && row.paid_at, `paid: ${JSON.stringify(row)}`);
    assert(balance(can.id) === 50 && balance(ECE) === eceBefore + 100, `balances ${balance(can.id)} ${balance(ECE)}`);
    const keyed = T("descoin_ledger").filter((l) => String(l.meta?.idempotencyKey || "").startsWith(`referral:${row.id}:`));
    assert(keyed.length === 2, `two keyed ledger rows: ${keyed.length}`);
    // Paying again (retry, second node) moves nothing.
    row.status = "pending";
    await engine.pay(row, { io });
    assert(balance(can.id) === 50 && balance(ECE) === eceBefore + 100, "no double pay");
    row.status = "paid";
    const dup = await descoin.creditIdempotent(can.id, 50, "referral_welcome", `referral:${row.id}:invitee`, {});
    assert(dup.duplicate === true && balance(can.id) === 50, "creditIdempotent refuses a used key");
    assert(emitted.some((e) => e.room === `user:${can.id}` && e.event === "descoin:balance" && e.payload.reason === "referral_welcome"), "invitee balance live");

    // ---- 4. Legacy: a pending row whose invitee already got the old instant credit closes as legacy.
    await store.insertReferral({ inviter_id: ECE, invitee_id: OLD2, inviter_amount: 100, invitee_amount: 50, status: "pending", legacy: false, signup_at: new Date(Date.now() - 30 * 3600000).toISOString(), first_message_at: new Date(Date.now() - 29 * 3600000).toISOString(), returned_at: new Date().toISOString(), risk_signals: [] });
    const oldBefore = balance(ECE);
    await engine.tryUnlock(refOf(OLD2), { io });
    assert(refOf(OLD2).legacy === true && balance(OLD2) === 0 && balance(ECE) === oldBefore, "legacy reward is not paid twice");
    assert(refOf(OLD).status === undefined, "the old row is untouched");

    // ---- 5. Two more active friends: milestone 3 pays 250 once.
    for (const name of ["zeynep", "selin.k"]) {
      const u = await register(base, name, "ece");
      backdate(u.id, 26);
      await engine.noteFirstMessage({ userId: u.id, peerId: null, io, at: Date.now() - 25 * 3600000 });
      await engine.noteSeen({ userId: u.id, io, force: true });
      assert(refOf(u.id).status === "paid", `${name} paid`);
    }
    assert(T("referral_milestones").filter((m) => m.inviter_id === ECE && m.milestone === 3).length === 1, "milestone 3 claimed");
    assert(ledgerOf(ECE, "referral_milestone").length === 1 && ledgerOf(ECE, "referral_milestone")[0].amount === 250, "milestone paid once");
    await engine.checkMilestones(ECE, { io });
    assert(ledgerOf(ECE, "referral_milestone").length === 1, "milestone not paid twice");

    // ---- 6. A friend who has not written: Dürt once a day.
    const kaan = await register(base, "kaan", "ece");
    backdate(kaan.id, 2);
    let r = await call(base, "GET", "/api/invites/me", { token: ece });
    assert(r.status === 200, `me: ${r.raw}`);
    const me = r.body;
    assert(me.link === "https://descall.com/r/ece" && /<svg/.test(me.qrSvg || ""), "link + QR");
    assert(me.funnel.signedUp >= 6 && me.funnel.active >= 3, `funnel ${JSON.stringify(me.funnel)}`);
    assert(me.milestones.count === 3 && me.milestones.next === 10, `milestones ${JSON.stringify(me.milestones)}`);
    assert(me.totals.earned >= 300 + 250, `earned ${me.totals.earned}`);
    const kaanRow = me.friends.find((f) => f.user.username === "kaan");
    assert(kaanRow && kaanRow.canNudge && kaanRow.status === "waiting_message" && kaanRow.stage === 2, `kaan row ${JSON.stringify(kaanRow)}`);
    const nisaRow = me.friends.find((f) => f.user.username === "nisa_2207");
    assert(nisaRow.status === "reviewing" && nisaRow.why === "same_device", "held friend shows why");
    assert(me.wallet.some((w) => w.status === "reviewing") && me.wallet.some((w) => w.status === "waiting_message"), "wallet lists pending rewards");
    r = await call(base, "POST", `/api/invites/nudge/${kaanRow.id}`, { token: ece, body: { variant: 0 } });
    assert(r.status === 200 && r.body.text.includes("kaan") && r.body.friend.username === "kaan", `nudge ${r.raw}`);
    r = await call(base, "POST", `/api/invites/nudge/${kaanRow.id}`, { token: ece, body: {} });
    assert(r.status === 429 && r.body.code === "NUDGE_LIMIT", "once a day");
    r = await call(base, "POST", `/api/invites/nudge/${kaanRow.id}`, { token: session(BORA, "bora.aksoy"), body: {} });
    assert(r.status === 404, "someone else's friend");

    // ---- 7. Public landing + anonymous opens + attach the channel after sign-up.
    state.presence.set(ECE, { username: "ece", status: "online", socketId: "x" });
    state.activeServerVoiceCalls.set("ch-1", { serverId: id(900), channelName: "Sohbet", participants: new Map([[ECE, { username: "ece" }], ["p2", { displayName: "Kaan" }], ["p3", { displayName: "Zeynep" }]]) });
    r = await call(base, "GET", "/api/invites/landing/ece");
    assert(r.status === 200 && r.body.inviter.online === "online" && r.body.inviter.activity.serverName === "Gece Kuşları" && r.body.inviter.activity.count === 3, `landing ${r.raw}`);
    assert(r.body.gifts.inviteeReward === 50, "gift shown");
    state.presence.set(ECE, { username: "ece", status: "invisible", socketId: "x" });
    r = await call(base, "GET", "/api/invites/landing/ece");
    assert(r.body.inviter.online === null && r.body.inviter.activity === null, "invisible stays hidden");
    r = await call(base, "GET", "/api/invites/landing/nobody");
    assert(r.status === 404, "unknown link");
    r = await call(base, "POST", "/api/invites/open", { body: { username: "ece", channel: "wa", visitor: "v1abcdefgh" } });
    assert(r.status === 200 && r.body.openId && r.body.channel === "wa", `open ${r.raw}`);
    const openId = r.body.openId;
    const again = await call(base, "POST", "/api/invites/open", { body: { username: "ece", channel: "wa", visitor: "v1abcdefgh" } });
    assert(again.body.openId === openId && T("referral_opens").length === 1, "one open per visitor per day");
    const deniz = await register(base, "deniz.k", "ece");
    r = await call(base, "POST", "/api/invites/attach", { token: session(deniz.id, "deniz.k"), body: { openId } });
    assert(r.status === 200 && r.body.attached && refOf(deniz.id).channel === "wa", `attach ${r.raw}`);
    assert(T("referral_opens")[0].signup_user_id === deniz.id, "open linked");

    // ---- 8. The invitee's first entry.
    r = await call(base, "GET", "/api/invites/welcome", { token: session(can.id, "can") });
    assert(r.status === 200 && r.body.invited && r.body.inviter.username === "ece" && r.body.gift.status === "paid", `welcome ${r.raw}`);
    assert(r.body.gift.steps.length === 3 && r.body.gift.steps.every((s) => s.done), "three steps done");
    assert(r.body.server && r.body.server.name === "Gece Kuşları", "inviter's public server suggested");
    r = await call(base, "GET", "/api/invites/welcome", { token: session(OTHERADMIN, "other") });
    assert(r.status === 200 && r.body.invited === false, "not invited");

    // ---- 9. Admin board: section gate and overview.
    r = await call(base, "GET", "/api/admin/invites/overview?range=30d", other);
    assert(r.status === 403, `other admin refused: ${r.status}`);
    r = await call(base, "GET", "/api/admin/invites/overview?range=30d", admin);
    assert(r.status === 200, `overview ${r.raw}`);
    const ov = r.body;
    assert(ov.kpis.signups.value >= 7 && ov.kpis.held.value >= 1 && ov.kpis.paid.count >= 3, `kpis ${JSON.stringify(ov.kpis)}`);
    assert(ov.shield.find((s) => s.code === "same_device").count >= 1 && ov.shield.find((s) => s.code === "disposable_email").count === 1, "shield counts");
    assert(ov.top[0].user.username === "ece", "top inviter");
    assert(ov.channels.some((c) => c.channel === "wa"), "channel scorecard");
    assert(ov.measurement.inviteShare.target === 25 && ov.measurement.invitedFirstMessage.target === 65, "measurement targets");
    assert(ov.rules.version === 0 && ov.rules.monthlyCap === 20, "default rules v0");

    // ---- 10. Burst from one inviter: alert + automatic holds.
    for (let i = 0; i < 6; i += 1) await register(base, `bot${i}x`, "bora.aksoy", { device: "dev-cluster" });
    const alert = T("referral_alerts").find((a) => a.inviter_id === BORA);
    assert(alert && alert.status === "open" && alert.detail.signups === 5, `alert ${JSON.stringify(alert)}`);
    const boraRows = T("referral_rewards").filter((x) => x.inviter_id === BORA);
    assert(boraRows.every((x) => x.status === "held"), `bora rows held: ${boraRows.map((x) => x.status)}`);
    r = await call(base, "GET", "/api/admin/invites/overview?range=24h", admin);
    assert(r.body.alert && r.body.alert.inviter.username === "bora.aksoy", "alert on the board");
    r = await call(base, "GET", `/api/admin/invites/inviter/${BORA}`, admin);
    assert(r.status === 200 && r.body.risk.band === "high" && r.body.risk.cluster.size === 6, `panel ${r.raw}`);
    assert(r.body.invitees[0].chips.some((c) => c.kind === "device"), "device chip");

    // ---- 11. Previewed text = the draft's text.
    r = await call(base, "GET", `/api/admin/invites/preview?inviterId=${BORA}&kind=revokeInviter&count=7&amount=700&reason=same_device`, admin);
    assert(r.body.text === "Davetlerinden 7'si incelendi ve ödül şartlarını karşılamadı (aynı cihazdan açılmış hesaplar). 700 D geri alındı. Hata olduğunu düşünüyorsan Destek'e yazabilirsin.", `preview ${r.raw}`);

    // ---- 12. Alert "Yoksay" releases the automatic holds; undo re-holds.
    r = await call(base, "POST", `/api/admin/invites/alerts/${alert.id}`, { ...admin, body: { decision: "ignore" } });
    assert(r.status === 200 && r.body.status === "ignored", `ignore ${r.raw}`);
    const ignoreAction = r.body.actionId;
    r = await call(base, "POST", `/api/admin/invites/actions/${ignoreAction}/undo`, admin);
    assert(r.status === 200 && T("referral_alerts").find((a) => a.id === alert.id).status === "open", `undo ignore ${r.raw}`);

    // ---- 13. Release, hold (with notice), pause link.
    r = await call(base, "POST", `/api/admin/invites/inviter/${BORA}/release`, admin);
    assert(r.status === 200 && r.body.count >= 1, `release ${r.raw}`);
    r = await call(base, "POST", `/api/admin/invites/inviter/${BORA}/hold`, { ...admin, body: { reason: "same_device", notify: true } });
    assert(r.status === 200 && r.body.count >= 1, `hold ${r.raw}`);
    assert(T("referral_notices").some((n) => n.user_id === BORA && n.kind === "hold"), "hold notice");
    r = await call(base, "POST", `/api/admin/invites/inviter/${BORA}/pause`, { ...admin, body: { paused: true, reason: "same_device" } });
    assert(r.status === 200 && r.body.paused, "paused");
    const late = await register(base, "late.bot", "bora.aksoy", { device: "dev-late" });
    assert(refOf(late.id).status === "denied" && refOf(late.id).hold_reason === "link_paused", "paused link earns nothing");

    // ---- 14. Revoke a paid reward (debit + milestone back), notice, undo refunds.
    const balBefore = balance(ECE);
    r = await call(base, "POST", `/api/admin/invites/inviter/${ECE}/revoke`, { ...admin, body: { reason: "fake_activity", ids: [refOf(can.id).id] } });
    assert(r.status === 200 && r.body.count === 1, `revoke ${r.raw}`);
    assert(r.body.amount === 100 + 250, `debit incl. milestone: ${r.body.amount}`);
    assert(balance(ECE) === balBefore - 350, "balance down");
    assert(refOf(can.id).status === "revoked" && refOf(can.id).revoked_amount === 100, "row revoked");
    const notice = T("referral_notices").find((n) => n.user_id === ECE && n.kind === "revoke");
    assert(notice && notice.text.includes("350 D geri alındı"), `notice ${notice && notice.text}`);
    assert(state.auditLog.some((e) => e.action === "invite_revoke" && e.meta.amount === 350), "audit revoke");
    r = await call(base, "POST", `/api/admin/invites/inviter/${ECE}/revoke`, { ...admin, body: { reason: "other" } });
    assert(r.status === 400 && r.body.code === "NOTE_REQUIRED", "other needs a note");
    r = await call(base, "POST", `/api/admin/invites/actions/${T("referral_actions").find((a) => a.action === "revoke").id}/undo`, admin);
    assert(r.status === 200 && r.body.refunded === 350, `undo revoke ${r.raw}`);
    assert(balance(ECE) === balBefore && refOf(can.id).status === "paid", "everything back");
    assert(T("referral_notices").find((n) => n.id === notice.id).withdrawn_at, "notice withdrawn");
    assert(T("referral_milestones").some((m) => m.inviter_id === ECE && m.milestone === 3), "milestone restored");
    r = await call(base, "POST", `/api/admin/invites/actions/${T("referral_actions").find((a) => a.action === "revoke").id}/undo`, admin);
    assert(r.status === 409 && r.body.code === "ALREADY_UNDONE", "undo once");
    const stale = T("referral_actions").find((a) => a.action === "pause");
    stale.undo_until = new Date(Date.now() - 1000).toISOString();
    r = await call(base, "POST", `/api/admin/invites/actions/${stale.id}/undo`, admin);
    assert(r.status === 409 && r.body.code === "UNDO_EXPIRED", "10 minute window");

    // ---- 15. Rules: new version, audit diff, undo publishes the old values again.
    r = await call(base, "PUT", "/api/admin/invites/rules", { ...admin, body: { rules: { monthlyCap: 25 }, note: "kampanya" } });
    assert(r.status === 200 && r.body.version === 1 && r.body.diff[0].key === "monthlyCap", `rules ${r.raw}`);
    r = await call(base, "PUT", "/api/admin/invites/rules", { ...admin, body: { rules: { monthlyCap: -3 } } });
    assert(r.status === 400 && r.body.code === "RULES_INVALID" && r.body.field === "monthlyCap", "bad rules refused");
    const rulesAction = T("referral_actions").find((a) => a.action === "rules");
    r = await call(base, "POST", `/api/admin/invites/actions/${rulesAction.id}/undo`, admin);
    assert(r.status === 200, `rules undo ${r.raw}`);
    store.__resetRulesCache();
    assert((await store.getRules({ fresh: true })).rules.monthlyCap === 20 && (await store.getRules()).version === 2, "v2 = old values");
    r = await call(base, "GET", "/api/admin/invites/rules", admin);
    assert(r.body.versions.length === 2 && r.body.reasons.includes("same_device"), "versions listed");

    // ---- 16. Monthly cap: inviter side skipped once the month is full.
    await call(base, "PUT", "/api/admin/invites/rules", { ...admin, body: { rules: { monthlyCap: 1 } } });
    store.__resetRulesCache();
    const capped = await register(base, "cap.friend", "ece");
    backdate(capped.id, 26);
    const capBefore = balance(ECE);
    await engine.noteFirstMessage({ userId: capped.id, io, at: Date.now() - 25 * 3600000 });
    await engine.noteSeen({ userId: capped.id, io, force: true });
    assert(refOf(capped.id).status === "paid" && refOf(capped.id).inviter_skip === "monthly_cap" && balance(capped.id) === 50 && balance(ECE) === capBefore, "cap: invitee paid, inviter skipped");

    // ---- 17. Log, CSV export, notices read.
    r = await call(base, "GET", "/api/admin/invites/log?limit=50", admin);
    assert(r.status === 200 && r.body.items.some((i) => i.kind === "revoke") && r.body.items.some((i) => i.kind === "auto_hold" && i.system), "log");
    r = await call(base, "GET", "/api/admin/invites/export.csv?range=30d", admin);
    assert(r.status === 200 && r.raw.includes("signup_at,inviter,invitee") && r.raw.includes("ece"), "csv");
    assert(state.auditLog.some((e) => e.action === "invite_export"), "export audited");
    r = await call(base, "POST", "/api/invites/notices/read", { token: session(BORA, "bora.aksoy"), body: {} });
    assert(r.status === 200 && T("referral_notices").filter((n) => n.user_id === BORA).every((n) => n.read_at), "read");

    // ---- 18. Onboarding "Bir arkadaş ekle" ignores the automatic invite friendship.
    const onbStore = require("../lib/onboarding/store");
    assert((await onbStore.hasAcceptedFriend(kaan.id)) === false, "invite friendship does not count");
    T("friendships").push({ id: id(950), user_id: kaan.id, friend_id: BORA, status: "accepted" });
    assert((await onbStore.hasAcceptedFriend(kaan.id)) === true, "a real friend counts");
    assert(await require("../lib/referrals/autoFriend").isInviteAutoFriendship(ECE, kaan.id), "helper");

    // ---- 19. Expiry: no first message within the window.
    backdate(kaan.id, 80);
    await engine.sweep({ io });
    assert(refOf(kaan.id).status === "expired", `expired: ${refOf(kaan.id).status}`);

    console.log("invites integration ok");
  } finally {
    server.close();
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
