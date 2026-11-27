"use strict";

/**
 * Growth 3B "Önce insanlar" over real HTTP with an in-memory database:
 *  - notification center: state, important people (max 8), message level mirrored into
 *    the per-DM options, settings validation
 *  - shared streak: both write -> day counts, +10 bonus once each; tasks paid once; nudge
 *    once a day, never in quiet hours
 *  - day-7 friend call: suggestion to the closest friend, one call, a face push, reward
 *    (50 + 50) once after 10 active minutes; same IP -> no reward; limits
 *  - console: list, template validation and approval, owner-only mode with a reason,
 *    a wave with undo, hold-out, sends, live counters, opened / returned tracking, recall
 *  - tracking: signed e-mail link redirects inside the app only
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.PUBLIC_APP_URL = "https://descall.com";
process.env.RESEND_API_KEY = "test";

const assert = require("node:assert/strict");
const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const D = 86400000;
const H = 3600000;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = U(1); // Demir (the account using the center)
const ECE = U(2);
const KAAN = U(3);
const ZEYNEP = U(4);
const ADMIN = U(9);
const GONE = U(20); // away for 7 days
const SAMEIP = U(21); // away, shares an IP with his caller
const CALLER2 = U(22);
const S1 = U(100);

// Fixed clock: Friday 27 Nov 2026 18:00 Istanbul (15:00Z), outside quiet hours.
let clock = Date.parse("2026-11-27T15:00:00Z");
const realNow = Date.now;
Date.now = () => clock;
const iso = (ms) => new Date(ms).toISOString();
const istDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

const user = (id, username, extra = {}) => ({
  id,
  username,
  display_name: username[0].toUpperCase() + username.slice(1),
  avatar_url: `https://cdn.descall.test/${username}.png`,
  created_at: iso(clock - 120 * D),
  descoin_balance: 0,
  language: "tr",
  timezone: "Europe/Istanbul",
  email: `${username}@example.com`,
  email_confirmed_at: iso(clock - 100 * D),
  active_sessions: [{ id: `s-${id}`, ip: `10.0.0.${parseInt(id.slice(-3), 10)}` }],
  blocked_users: [],
  ...extra,
});

const activeDays = [];
const addDays = (id, daysAgo) => {
  for (const n of daysAgo) activeDays.push({ user_id: id, day: istDay(clock - n * D) });
};
addDays(GONE, [7, 8, 9, 10, 12]);
addDays(SAMEIP, [7, 8, 9, 11]);
addDays(KAAN, [0, 1, 2]);
addDays(CALLER2, [0, 1]);
addDays(ME, [0]);

const dm = (from, to, agoMin) => ({ id: require("crypto").randomUUID(), from_user_id: from, to_user_id: to, content: "selam", created_at: iso(clock - agoMin * 60000) });

const fake = createFakeSupabase(
  {
    users: [
      user(ME, "demir"),
      user(ECE, "ece"),
      user(KAAN, "kaan"),
      user(ZEYNEP, "zeynep"),
      user(ADMIN, "admin", { is_admin: true }),
      user(GONE, "arda"),
      user(SAMEIP, "can", { active_sessions: [{ id: `s-${SAMEIP}`, ip: "77.77.77.77" }] }),
      user(CALLER2, "elif", { active_sessions: [{ id: `s-${CALLER2}`, ip: "77.77.77.77" }] }),
    ],
    friendships: [
      { id: "f1", user_id: ME, friend_id: ECE, status: "accepted" },
      { id: "f2", user_id: KAAN, friend_id: ME, status: "accepted" },
      { id: "f3", user_id: ME, friend_id: ZEYNEP, status: "accepted" },
      { id: "f4", user_id: KAAN, friend_id: GONE, status: "accepted" },
      { id: "f5", user_id: CALLER2, friend_id: SAMEIP, status: "accepted" },
    ],
    servers: [{ id: S1, name: "Gece Kuşları", owner_id: ECE, created_at: iso(clock - 60 * D) }],
    server_members: [
      { server_id: S1, user_id: ME, notification_level: "all" },
      { server_id: S1, user_id: ECE, notification_level: "all" },
      { server_id: S1, user_id: GONE, notification_level: "all" },
    ],
    server_messages: [],
    server_channels: [],
    dm_messages: [dm(GONE, KAAN, 9 * 24 * 60), dm(KAAN, GONE, 9 * 24 * 60 - 5), dm(GONE, KAAN, 8 * 24 * 60), dm(CALLER2, SAMEIP, 8 * 24 * 60), dm(ME, ECE, 60 * 24), dm(ECE, ME, 60 * 23)],
    descoin_ledger: [],
    user_active_days: activeDays,
    notify_settings: [],
    notify_person_prefs: [],
    conversation_notify_prefs: [],
    lifecycle_messages: [],
    winback_calls: [],
    winback_gifts: [],
    shared_streaks: [],
    daily_tasks: [],
    reengage_campaigns: [],
    reengage_waves: [],
    reengage_settings: [],
    user_activity_hours: [],
    web_push_subscriptions: [{ user_id: GONE, endpoint: "https://fcm.googleapis.com/x", p256dh: "p", auth: "a" }],
    device_push_tokens: [],
    marketing_subscribers: [],
  },
  {
    uniqueKeys: {
      lifecycle_messages: ["user_id", "kind"],
      winback_calls: ["episode_key"],
      notify_person_prefs: ["user_id", "peer_id"],
      winback_gifts: ["user_id", "episode_key"],
    },
  }
);
fake.rpc = async () => ({ data: null, error: null });
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

// Pushes and e-mails are recorded, never sent.
const pushes = [];
const webPushPath = require.resolve("../lib/webPush");
require.cache[webPushPath] = {
  id: webPushPath,
  filename: webPushPath,
  loaded: true,
  exports: {
    sendGrowthPush: async (ids, p) => {
      const tr = p.texts ? p.texts("tr") : {};
      pushes.push({ ids, type: p.type, title: tr.title, body: tr.body, avatar: p.avatar, tag: p.tag, rgKind: p.rgKind, ackUrl: p.ackUrl, actions: p.actions ? p.actions("tr") : [] });
      return ids;
    },
    sendFriendVoicePush: async () => [],
  },
};
const mails = [];
const mailerPath = require.resolve("../lib/mailer");
require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: { sendEmail: async (m) => (mails.push(m), { sent: true }) } };
const requireAdminPath = require.resolve("../middleware/requireAdmin");
require.cache[requireAdminPath] = {
  id: requireAdminPath,
  filename: requireAdminPath,
  loaded: true,
  exports: { userIsSuperAdmin: async (req) => req.user?.username === "admin", requireAdmin: (_q, _s, n) => n(), requireSuperAdmin: (_q, _s, n) => n() },
};
const audits = [];
const statePath = require.resolve("../runtime/sharedState");
const realState = require(statePath);
realState.appendAudit = (...a) => audits.push(a);

const express = require("express");
const { signToken } = require("../config/jwt");
const R = require("../lib/reengage/rules");
const mode = require("../lib/reengage/mode");
const store = require("../lib/reengage/store");
const winback = require("../lib/reengage/winback");
const streaks = require("../lib/reengage/streaks");
const campaigns = require("../lib/reengage/campaigns");
const tracking = require("../lib/reengage/tracking");

const emitted = [];
const io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }), sockets: { adapter: { rooms: new Map() } } };
require("../lib/reengage/io").setIo(io);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/notify-center", require("../routes/notifyCenter"));
  app.use("/api/streaks", require("../routes/streaks"));
  app.use("/api/winback", require("../routes/winback"));
  app.use("/api/reengage", require("../routes/reengage"));
  const { verifyToken } = require("../config/jwt");
  const admin = express.Router();
  admin.use((req, _res, next) => {
    try {
      const d = verifyToken(String(req.headers.authorization || "").replace(/^Bearer /, ""));
      req.user = { id: d.sub || d.id, username: d.username };
    } catch {
      req.user = null;
    }
    next();
  });
  admin.use(require("../routes/adminReengage"));
  app.use("/api/admin", admin);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = (id, name) => signToken({ id, username: name, sid: `s-${id}` });
  const call = async (method, path, { body, as = [ME, "demir"], redirect = "follow" } = {}) => {
    const res = await fetch(base + path, {
      method,
      redirect,
      headers: { "Content-Type": "application/json", ...(as ? { Authorization: `Bearer ${tok(as[0], as[1])}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { text };
    }
    return { status: res.status, body: json, headers: res.headers };
  };
  const t = fake._tables;
  const balance = (id) => t.users.rows.find((u) => u.id === id).descoin_balance;

  try {
    /* ---- notification center ---------------------------------------- */
    let r = await call("GET", "/api/notify-center", { as: null });
    assert.equal(r.status, 401);
    r = await call("GET", "/api/notify-center");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.importantMax, 8);
    assert.deepEqual(r.body.people.map((p) => p.name).sort(), ["Ece", "Kaan", "Zeynep"]);
    assert.equal(r.body.settings.quietStart, 23);
    assert.equal(r.body.servers[0].name, "Gece Kuşları");
    assert.equal(r.body.servers[0].level, "all");

    r = await call("PUT", `/api/notify-center/people/${ECE}`, { body: { important: true, primaryAction: "quiet_join" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.badge, "always");
    r = await call("GET", "/api/notify-center");
    assert.equal(r.body.people[0].id, ECE, "important people first");
    assert.equal(r.body.importantCount, 1);
    // Eight important people already (seeded), a ninth is refused.
    for (let i = 0; i < 7; i += 1) t.notify_person_prefs.rows.push({ user_id: ME, peer_id: U(300 + i), important: true, voice: "default", messages: "always", nudges: true, primary_action: "join" });
    r = await call("PUT", `/api/notify-center/people/${KAAN}`, { body: { important: true } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, "important_full");
    t.notify_person_prefs.rows.splice(-7, 7);
    // "Hiç" mirrors into the per-DM options (level none) and "Sustur 8 saat" sets the timer.
    r = await call("PUT", `/api/notify-center/people/${ZEYNEP}`, { body: { messages: "never", mute: "8h" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.badge, "muted");
    const dmPref = t.conversation_notify_prefs.rows.find((x) => x.user_id === ME && x.conv_id === ZEYNEP);
    assert.equal(dmPref?.level, "none");
    assert.equal(Date.parse(dmPref.muted_until), clock + 8 * H);
    r = await call("PUT", "/api/notify-center/settings", { body: { quietStart: 3 } });
    assert.equal(r.status, 400);
    r = await call("PUT", "/api/notify-center/settings", { body: { quietStart: 22, voiceDailyMax: 2, types: { digest: false } } });
    assert.equal(r.status, 200);
    assert.equal(t.notify_settings.rows[0].quiet_start, 22);
    assert.ok(emitted.some((e) => e.room === `user:${ME}` && e.event === "notify-center:changed"));
    r = await call("GET", `/api/notify-center/people/${ECE}/next`);
    assert.equal(r.status, 200);
    assert.equal(r.body.vip, true);

    /* ---- shared streak + tasks ---------------------------------------- */
    r = await call("POST", `/api/streaks/${ADMIN}`);
    assert.equal(r.status, 403, "only friends");
    r = await call("POST", `/api/streaks/${ECE}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await call("GET", "/api/streaks");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.shared.length, 1);
    assert.equal(r.body.tasks.length, 3);
    const msgTask = r.body.tasks.find((x) => x.kind === "message");
    assert.ok(msgTask.target, "every task is about one person");
    const before = balance(ME);
    await streaks.onDm(ME, ECE);
    await streaks.onDm(ECE, ME);
    r = await call("GET", "/api/streaks");
    assert.equal(r.body.shared[0].count, 1, "both wrote: day 1");
    assert.equal(r.body.shared[0].doneToday, true);
    const bonusRows = t.descoin_ledger.rows.filter((x) => x.reason === "reengage_task" && x.meta?.kind === "shared_bonus");
    assert.equal(bonusRows.length, 2, "+10 to both");
    await streaks.onDm(ME, ECE);
    assert.equal(t.descoin_ledger.rows.filter((x) => x.meta?.kind === "shared_bonus").length, 2, "never twice a day");
    // The message task to Ece (the closest friend) paid once.
    const paidMsg = t.daily_tasks.rows.find((x) => x.user_id === ME && x.kind === "message" && x.target_id === ECE);
    assert.ok(paidMsg?.done_at);
    assert.equal(paidMsg.paid_amount, 15);
    assert.equal(t.descoin_ledger.rows.filter((x) => x.user_id === ME && x.meta?.kind === "message").length, 1);
    assert.ok(balance(ME) >= before + 25);
    // Voice task: 10 minutes with a friend.
    for (let i = 0; i < 10; i += 1) await streaks.onVoiceMinutes(ME, { minutes: 1, withIds: [ZEYNEP] });
    assert.ok(t.daily_tasks.rows.find((x) => x.user_id === ME && x.kind === "voice").done_at);
    // Nudge: a new day, Ece wrote, Demir did not; once a day.
    t.shared_streaks.rows[0].last_day = istDay(clock - D);
    t.shared_streaks.rows[0].count = 4;
    const side = t.shared_streaks.rows[0].user_a === ECE ? "a_day" : "b_day";
    t.shared_streaks.rows[0][side] = istDay(clock);
    t.shared_streaks.rows[0][side === "a_day" ? "b_day" : "a_day"] = istDay(clock - D);
    r = await call("POST", `/api/streaks/${ME}/nudge`, { as: [ECE, "ece"] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const nudge = pushes.find((p) => p.type === "streak-nudge");
    assert.deepEqual(nudge.ids, [ME]);
    assert.equal(nudge.title, "Ece seni dürttü");
    assert.equal(nudge.avatar, "https://cdn.descall.test/ece.png", "the nudge carries a face");
    r = await call("POST", `/api/streaks/${ME}/nudge`, { as: [ECE, "ece"] });
    assert.equal(r.status, 409, "once a day");

    /* ---- day-7 friend call ------------------------------------------------- */
    // The environment is the ceiling (integrator decision): the console override alone is not enough.
    mode.__set({ modeOverride: "live" });
    assert.equal(mode.sendingMode(), "off", "env off caps the console override");
    process.env.REENGAGE_ENABLED = "1";
    assert.equal(mode.sendingMode(), "live");
    const found = await winback.findSuggestions({ now: () => clock, mode: () => "live" });
    assert.equal(found.suggested, 2, JSON.stringify(found));
    const sugg = t.winback_calls.rows.find((x) => x.target_id === GONE);
    assert.equal(sugg.caller_id, KAAN, "the closest friend who is around");
    assert.equal((await winback.findSuggestions({ now: () => clock, mode: () => "live" })).suggested, 0, "one suggestion per absence");
    r = await call("GET", "/api/winback/suggestion", { as: [KAAN, "kaan"] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.suggestion.target.id, GONE);
    assert.equal(r.body.suggestion.reward, 50);
    assert.equal(r.body.suggestion.target.absentDays, 7);
    r = await call("POST", `/api/winback/${sugg.id}/call`, { as: [ME, "demir"], body: { message: "x" } });
    assert.equal(r.status, 404, "only the suggested caller");
    r = await call("POST", `/api/winback/${sugg.id}/call`, { as: [KAAN, "kaan"], body: { message: "Arda, Gece Kuşları'nda seni bekliyoruz." } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const cp = pushes.find((p) => p.type === "friend-call");
    assert.deepEqual(cp.ids, [GONE]);
    assert.equal(cp.title, "Kaan seni çağırıyor");
    assert.equal(cp.body, "\"Arda, Gece Kuşları'nda seni bekliyoruz.\"");
    assert.equal(cp.avatar, "https://cdn.descall.test/kaan.png");
    assert.deepEqual(cp.actions.map((a) => a.action), ["rg_come", "rg_reply"]);
    r = await call("POST", `/api/winback/${sugg.id}/call`, { as: [KAAN, "kaan"] });
    assert.equal(r.status, 409, "one call per suggestion");
    // Arda comes back and stays active for 10 minutes -> 50 + 50 once.
    const kaanBefore = balance(KAAN);
    clock += H;
    for (let i = 0; i < 12; i += 1) {
      clock += 61 * 1000;
      await winback.noteActive(GONE, { kind: "voice", now: () => clock });
    }
    const paid = t.winback_calls.rows.find((x) => x.id === sugg.id);
    assert.equal(paid.status, "rewarded", JSON.stringify(paid));
    assert.equal(balance(GONE), 50);
    assert.equal(balance(KAAN), kaanBefore + 50);
    const keys = t.descoin_ledger.rows.filter((x) => x.reason === "winback_call").map((x) => x.meta.idempotencyKey);
    assert.deepEqual(keys.sort(), [`winback:${sugg.id}:${GONE}`, `winback:${sugg.id}:${KAAN}`].sort());
    for (let i = 0; i < 3; i += 1) {
      clock += 61 * 1000;
      await winback.noteActive(GONE, { kind: "voice", now: () => clock });
    }
    assert.equal(t.descoin_ledger.rows.filter((x) => x.reason === "winback_call").length, 2, "paid once");
    assert.ok(emitted.some((e) => e.event === "winback:rewarded" && e.room === `user:${KAAN}`));
    // Same IP: no reward.
    const sugg2 = t.winback_calls.rows.find((x) => x.target_id === SAMEIP);
    assert.equal(sugg2.caller_id, CALLER2);
    r = await call("POST", `/api/winback/${sugg2.id}/call`, { as: [CALLER2, "elif"] });
    assert.equal(r.status, 200);
    for (let i = 0; i < 12; i += 1) {
      clock += 61 * 1000;
      await winback.noteActive(SAMEIP, { kind: "message", now: () => clock });
    }
    const denied = t.winback_calls.rows.find((x) => x.id === sugg2.id);
    assert.equal(denied.status, "denied");
    assert.equal(denied.deny_reason, "same_ip");
    assert.equal(balance(SAMEIP), 0);
    // The admin panel numbers.
    r = await call("GET", "/api/admin/growth/reengage/friend-call", { as: [ADMIN, "admin"] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.called, 2);
    assert.equal(r.body.rewarded, 1);
    assert.equal(r.body.descoin, 100);
    assert.ok(r.body.log.some((l) => l.denyReason === "same_ip"));

    /* ---- console -------------------------------------------------------------- */
    r = await call("GET", "/api/admin/growth/reengage", { as: [ADMIN, "admin"] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.campaigns.map((c) => c.id), ["new_quiet", "inactive7", "friend_call", "inactive14", "weekly_digest", "streak_reminder"]);
    assert.equal(r.body.campaigns.find((c) => c.id === "inactive14").status, "draft");
    r = await call("PATCH", "/api/admin/growth/reengage/campaigns/inactive7", { as: [ADMIN, "admin"], body: { lang: "ru", template: { pushTitle: "{sunucu} {bilinmeyen}" } } });
    assert.equal(r.status, 400);
    assert.deepEqual(r.body.placeholders, ["bilinmeyen"]);
    r = await call("PATCH", "/api/admin/growth/reengage/campaigns/inactive7", { as: [ADMIN, "admin"], body: { lang: "ru", template: { pushTitle: "{arkadas_1} в {sunucu}" } } });
    assert.equal(r.status, 200);
    assert.equal(r.body.campaign.templates.ru.approved, false, "an edited text waits for approval");
    r = await call("PATCH", "/api/admin/growth/reengage/campaigns/inactive7", { as: [ADMIN, "admin"], body: { lang: "ru", template: { approved: true } } });
    assert.equal(r.body.campaign.templates.ru.approved, true);
    r = await call("PATCH", "/api/admin/growth/reengage/campaigns/inactive7", { as: [ADMIN, "admin"], body: { status: "paused" } });
    assert.equal(r.status, 400, "status change needs a reason");
    r = await call("PUT", "/api/admin/growth/reengage/settings", { as: [ECE, "ece"], body: { modeOverride: "live", reason: "x" } });
    assert.equal(r.status, 403, "owner only");
    r = await call("PUT", "/api/admin/growth/reengage/settings", { as: [ADMIN, "admin"], body: { modeOverride: "live" } });
    assert.equal(r.status, 400, "reason required");
    delete process.env.REENGAGE_ENABLED;
    process.env.REENGAGE_DRY_RUN = "1";
    r = await call("PUT", "/api/admin/growth/reengage/settings", { as: [ADMIN, "admin"], body: { modeOverride: "live", reason: "test" } });
    assert.equal(r.status, 409, "env dry run: the console cannot go live");
    assert.equal(r.body.code, "env_ceiling");
    r = await call("PUT", "/api/admin/growth/reengage/settings", { as: [ADMIN, "admin"], body: { modeOverride: "dry_run", reason: "test" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.mode.ceiling, "dry_run");
    delete process.env.REENGAGE_DRY_RUN;
    process.env.REENGAGE_ENABLED = "1";
    r = await call("PUT", "/api/admin/growth/reengage/settings", { as: [ADMIN, "admin"], body: { modeOverride: "live", reason: "test" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.mode.mode, "live");
    // Owner kill switch for streak / task DesCoin (independent of the mode).
    r = await call("PUT", "/api/admin/growth/reengage/settings", { as: [ECE, "ece"], body: { taskRewards: false, reason: "x" } });
    assert.equal(r.status, 403);
    r = await call("PUT", "/api/admin/growth/reengage/settings", { as: [ADMIN, "admin"], body: { taskRewards: false } });
    assert.equal(r.status, 400, "reason required");
    r = await call("PUT", "/api/admin/growth/reengage/settings", { as: [ADMIN, "admin"], body: { taskRewards: false, reason: "budget" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.console.taskRewards, false);
    const ledgerBefore = t.descoin_ledger.rows.filter((x) => x.reason === "reengage_task").length;
    const pair = t.shared_streaks.rows[0];
    Object.assign(pair, { last_day: istDay(clock - D), a_day: istDay(clock - D), b_day: istDay(clock - D), count: 5 });
    await streaks.onDm(ME, ECE);
    await streaks.onDm(ECE, ME);
    assert.equal(t.shared_streaks.rows[0].count, 6, "the streak still counts");
    assert.equal(t.descoin_ledger.rows.filter((x) => x.reason === "reengage_task").length, ledgerBefore, "no DesCoin while switched off");
    r = await call("GET", "/api/streaks");
    assert.equal(r.body.rewardsOn, false);
    r = await call("PUT", "/api/admin/growth/reengage/settings", { as: [ADMIN, "admin"], body: { taskRewards: true, reason: "back" } });
    assert.equal(r.body.console.taskRewards, true);
    assert.ok(audits.some((a) => a[2] === "reengage_settings"));

    // A third absentee for the system message (no friend around).
    const SYS = U(30);
    t.users.rows.push(user(SYS, "selin"));
    addDays(SYS, [7, 9, 10, 11]);
    t.user_active_days.rows.push(...activeDays.filter((x) => x.user_id === SYS));
    t.web_push_subscriptions.rows.push({ user_id: SYS, endpoint: "https://fcm.googleapis.com/y", p256dh: "p", auth: "a" });
    campaigns.__reset();
    // Holdout members never get a message; pick the expectation from the rule itself.
    const sysHoldout = R.inHoldout(SYS, "inactive7", 10);
    const wave = await campaigns.startWave("inactive7", { force: true, actor: { id: ADMIN, username: "admin" }, undoMs: 30_000, mode: () => "live" });
    assert.ok(wave.undo_until, "30 s undo window");
    r = await call("POST", `/api/admin/growth/reengage/waves/${wave.id}/undo`, { as: [ADMIN, "admin"] });
    assert.equal(r.status, 200);
    assert.equal(t.reengage_waves.rows.find((w) => w.id === wave.id).status, "cancelled");
    campaigns.__reset();
    const w2 = await campaigns.startWave("inactive7", { force: true, actor: { id: ADMIN, username: "admin" }, undoMs: 0, wait: true, mode: () => "live", now: () => clock });
    const rows = t.lifecycle_messages.rows.filter((x) => x.wave_id === w2.id);
    const sysRow = rows.find((x) => x.user_id === SYS);
    assert.ok(sysRow, JSON.stringify(rows));
    assert.equal(Boolean(sysRow.holdout), sysHoldout);
    if (!sysHoldout) {
      assert.equal(sysRow.status, "sent");
      assert.equal(sysRow.campaign, "inactive7");
      const sp = pushes.find((p) => p.type === "rg-campaign" && p.ids.includes(SYS));
      assert.ok(sp?.ackUrl?.includes("/api/reengage/t/d/"), "signed delivered ack");
      assert.ok(mails.some((m) => m.to === "selin@example.com" && m.headers["List-Unsubscribe-Post"]), "e-mail with one-click unsubscribe");
      // Opened from the app, then wrote to a friend: returned with "message".
      r = await call("POST", "/api/reengage/t/open", { as: [SYS, "selin"], body: { kind: sysRow.kind } });
      assert.equal(r.body.ok, true);
      await tracking.noteActive(SYS, { kind: "message", now: clock + 60_000 });
      assert.equal(sysRow.return_kind, "message");
      r = await call("GET", `/api/admin/growth/reengage/waves/${w2.id}`, { as: [ADMIN, "admin"] });
      assert.equal(r.status, 200);
      assert.equal(r.body.counters.opened, 1);
      assert.equal(r.body.returners[0].name, "Selin");
      assert.ok(emitted.some((e) => e.room === "admin" && e.event === "rg:returner"));
    }
    // The friend-called absentee (Arda) got no system message for this absence.
    assert.ok(!rows.some((x) => x.user_id === GONE), "a friend call goes first");
    r = await call("POST", `/api/admin/growth/reengage/waves/${w2.id}/recall`, { as: [ADMIN, "admin"], body: {} });
    assert.equal(r.status, 400, "a reason is required");
    r = await call("POST", `/api/admin/growth/reengage/waves/${w2.id}/recall`, { as: [ADMIN, "admin"], body: { reason: "other" } });
    assert.equal(r.status, 400, "'other' needs a note");
    r = await call("POST", `/api/admin/growth/reengage/waves/${w2.id}/recall`, { as: [ADMIN, "admin"], body: { reason: "content", note: "RU metni" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    if (!sysHoldout) assert.equal(r.body.opened, 1, "opened ones cannot be recalled");
    assert.ok(audits.some((a) => a[2] === "reengage_recall"));
    r = await call("GET", "/api/admin/growth/reengage/campaigns/inactive7", { as: [ADMIN, "admin"] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.languages.length, 7);
    assert.equal(r.body.bestHours.length, 24);
    assert.ok(r.body.log.some((l) => l.action === "recall"));
    r = await call("GET", "/api/admin/growth/reengage/campaigns/inactive7/preview?lang=en", { as: [ADMIN, "admin"] });
    assert.equal(r.status, 200);
    assert.equal(r.body.lang, "en");
    r = await call("GET", "/api/admin/growth/reengage/outcomes", { as: [ADMIN, "admin"] });
    assert.equal(r.status, 200);
    assert.equal(r.body.d7Return48h.target, 18);

    /* ---- weekly digest is a service e-mail: people only, no promotion ---------- */
    {
      const digest = await require("../lib/reengage/digest").digestFor(ME, { now: clock, lang: "tr" });
      const mail = require("../lib/reengageEmail").buildPeopleEmail({ kind: "digest", lang: "tr", ...digest, unsubUrl: "https://descall.com/api/reengage/unsubscribe?x=1" });
      for (const word of [/Descall\+/i, /premium/i, /ultra/i, /indirim/i, /DesCoin/i, /mağaza/i, /shop/i]) {
        assert.ok(!word.test(mail.html) && !word.test(mail.text) && !word.test(mail.subject), `digest has no promotional text (${word})`);
      }
      assert.ok(mail.headers["List-Unsubscribe-Post"], "one-click unsubscribe");
    }

    /* ---- tracking link -------------------------------------------------------- */
    const token = R.signTrack(SYS, "inactive7:x", process.env);
    r = await call("GET", `/api/reengage/t/c/${encodeURIComponent(token)}?to=${encodeURIComponent("//evil.example")}`, { as: null, redirect: "manual" });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), "https://descall.com/app", "no open redirect");
    r = await call("GET", `/api/reengage/t/c/${encodeURIComponent(token)}?to=${encodeURIComponent("/friends")}`, { as: null, redirect: "manual" });
    assert.equal(r.headers.get("location"), "https://descall.com/friends");
    r = await call("POST", "/api/reengage/t/d/bad.token.x", { as: null });
    assert.equal(r.status, 204);

    console.log("reengagePeople.integration: ok");
  } finally {
    server.close();
    Date.now = realNow;
    store.__reset();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
