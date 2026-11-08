"use strict";
// node backend/lib/reengage.selftest.cjs
// Re-engagement (item 4): kill switch, quiet hours, friend-in-voice throttle and
// eligibility, lifecycle / activity email eligibility, unsubscribe tokens, invite
// links in a DM, the email builder (7 languages, no emoji) and the orchestrator
// with an in-memory database (idempotent claims, dry-run writes nothing).
const assert = require("assert");
const P = require("./reengagePolicy");
const { buildReengageEmail, KINDS } = require("./reengageEmail");
const { createReengage } = require("./reengage");

const H = 60 * 60 * 1000;
const D = 24 * H;
// 2026-11-08 12:00 Istanbul (UTC+3) = 09:00 UTC.
const NOON_IST = Date.UTC(2026, 10, 8, 9, 0, 0);

/* ---- mode / features ---- */
assert.equal(P.mode({}), "off", "default off");
assert.equal(P.mode({ REENGAGE_ENABLED: "0" }), "off");
assert.equal(P.mode({ REENGAGE_ENABLED: "1" }), "live");
assert.equal(P.mode({ REENGAGE_ENABLED: "true", REENGAGE_DRY_RUN: "1" }), "dry_run", "dry-run wins over live");
assert.equal(P.mode({ REENGAGE_DRY_RUN: "yes" }), "dry_run");
assert.ok(P.featureOn("lifecycle", {}));
assert.ok(P.featureOn("friend_voice", { REENGAGE_FEATURES: "friend_voice, lifecycle" }));
assert.ok(!P.featureOn("activity_email", { REENGAGE_FEATURES: "friend_voice,lifecycle" }));
assert.ok(!P.featureOn("nope", {}));

/* ---- time zones and quiet hours ---- */
assert.equal(P.recipientTimeZone("UTC"), "Europe/Istanbul", "column default UTC = not set");
assert.equal(P.recipientTimeZone(""), "Europe/Istanbul");
assert.equal(P.recipientTimeZone("Mars/Base"), "Europe/Istanbul", "invalid zone");
assert.equal(P.recipientTimeZone("America/New_York"), "America/New_York");
assert.equal(P.localHour(null, NOON_IST), 12);
assert.ok(!P.isQuietHours(null, NOON_IST), "noon is fine");
assert.ok(P.isQuietHours(null, Date.UTC(2026, 10, 8, 20, 0)), "23:00 Istanbul is quiet");
assert.ok(!P.isQuietHours(null, Date.UTC(2026, 10, 8, 19, 59)), "22:59 Istanbul is fine");
assert.ok(P.isQuietHours(null, Date.UTC(2026, 10, 8, 5, 59)), "08:59 Istanbul is quiet");
assert.ok(!P.isQuietHours(null, Date.UTC(2026, 10, 8, 6, 0)), "09:00 Istanbul is fine");
// Noon in Istanbul is 04:00 in New York: quiet there.
assert.ok(P.isQuietHours("America/New_York", NOON_IST), "the stored zone wins");
assert.equal(P.istDay(Date.UTC(2026, 10, 8, 21, 30)), "2026-11-09", "Istanbul day boundary");

/* ---- friend-in-voice throttle ---- */
assert.deepEqual(P.friendVoiceThrottle([], NOON_IST), { ok: true, reason: null });
assert.equal(P.friendVoiceThrottle([NOON_IST - 5 * H], NOON_IST).reason, "gap_6h");
assert.ok(P.friendVoiceThrottle([NOON_IST - 6 * H - 1], NOON_IST).ok, "6 h later is fine");
assert.equal(P.friendVoiceThrottle([NOON_IST - 7 * H, NOON_IST - 14 * H, NOON_IST - 21 * H], NOON_IST).reason, "max_per_day");
assert.ok(P.friendVoiceThrottle([NOON_IST - 7 * H, NOON_IST - 14 * H, NOON_IST - 25 * H], NOON_IST).ok, "rolling 24 h");
assert.ok(P.friendVoiceThrottle([new Date(NOON_IST - 7 * H).toISOString()], NOON_IST).ok, "ISO strings");
assert.equal(P.friendVoiceThrottle(["2026-11-08 07:00:00"], NOON_IST).reason, "gap_6h", "offset-less timestamps are UTC");
assert.equal(P.friendVoiceKind(NOON_IST), P.friendVoiceKind(NOON_IST + 30 * 60 * 1000), "same 6 h slot");
assert.equal(P.dailyKind("friend_request_email", NOON_IST), "friend_request_email:2026-11-08");

const okFriend = {
  presence: null,
  inVoice: false,
  storedStatus: "online",
  optIn: true,
  canJoin: true,
  serverLevel: "all",
  hasPushTarget: true,
  timezone: "UTC",
  sentAt: [],
};
assert.deepEqual(P.friendVoiceEligible(okFriend, NOON_IST), { ok: true, reason: null });
const fv = (patch) => P.friendVoiceEligible({ ...okFriend, ...patch }, NOON_IST).reason;
assert.equal(fv({ presence: "idle" }), null, "away (idle) counts");
assert.equal(fv({ presence: "online" }), "online");
assert.equal(fv({ presence: "invisible" }), "online", "invisible is still in the app");
assert.equal(fv({ storedStatus: "dnd" }), "dnd");
assert.equal(fv({ optIn: false }), "opted_out");
assert.equal(fv({ inVoice: true }), "in_voice");
assert.equal(fv({ blocksJoiner: true }), "blocked");
assert.equal(fv({ joinerBlocks: true }), "blocked");
assert.equal(fv({ canJoin: false }), "no_access", "hidden / no CONNECT channel");
assert.equal(fv({ serverLevel: "muted" }), "server_level");
assert.equal(fv({ serverLevel: "mentions" }), "server_level");
assert.equal(fv({ channelMuted: true }), "channel_muted");
assert.equal(fv({ dmMuted: true }), "dm_muted");
assert.equal(fv({ dmLevel: "none" }), "dm_muted");
assert.equal(fv({ hasPushTarget: false }), "no_device");
assert.equal(fv({ banned: true }), "account");
assert.equal(P.friendVoiceEligible(okFriend, Date.UTC(2026, 10, 8, 22, 0)).reason, "quiet_hours");
assert.equal(fv({ sentAt: [NOON_IST - H] }), "gap_6h");

/* ---- lifecycle ---- */
const created = NOON_IST - 3 * D - H; // 3 days + 1 h ago
assert.equal(P.lifecycleKindFor(created, NOON_IST), "day3");
assert.equal(P.lifecycleKindFor(NOON_IST - 7.5 * D, NOON_IST), "day7");
assert.equal(P.lifecycleKindFor(NOON_IST - 2 * D, NOON_IST), null, "too new");
assert.equal(P.lifecycleKindFor(NOON_IST - 6.5 * D, NOON_IST), null, "between windows");
assert.equal(P.lifecycleKindFor(NOON_IST - 30 * D, NOON_IST), null, "old accounts are never mailed");
const signupDay = P.istDay(created);
assert.ok(P.inactiveSinceSignup({ createdAt: created, activeDays: [signupDay] }), "only the sign-up day");
assert.ok(!P.inactiveSinceSignup({ createdAt: created, activeDays: [signupDay, "2026-11-07"] }), "came back");
assert.ok(P.inactiveSinceSignup({ createdAt: created, activeDays: null, lastSeen: created + H }), "last_seen fallback");
assert.ok(!P.inactiveSinceSignup({ createdAt: created, activeDays: null, lastSeen: NOON_IST - H }));
assert.ok(!P.inactiveSinceSignup({ createdAt: created, activeDays: null, lastSeen: null }), "unknown = no email");

const newUser = {
  email: "ada@example.com",
  email_confirmed_at: new Date(created).toISOString(),
  created_at: new Date(created).toISOString(),
  timezone: "UTC",
};
const consent = { confirmed_at: "2026-11-05T10:00:00Z", unsubscribed_at: null };
const lc = (u, ctx, now = NOON_IST) => P.lifecycleEligible({ ...newUser, ...u }, { kind: "day3", activeDays: [signupDay], consent, ...ctx }, now).reason;
assert.equal(lc({}, {}), null);
assert.equal(lc({}, { kind: "day7" }), "window");
assert.equal(lc({ email: "" }, {}), "no_email");
assert.equal(lc({ email_confirmed_at: null }, {}), "email_unverified");
assert.equal(lc({ email_notify_opt_out_at: "2026-11-06T00:00:00Z" }, {}), "unsubscribed");
assert.equal(lc({}, { consent: null }), "no_consent", "promotional: needs the product-update opt-in");
assert.equal(lc({}, { consent: { confirmed_at: null } }), "no_consent", "unconfirmed opt-in");
assert.equal(lc({}, { consent: { ...consent, unsubscribed_at: "2026-11-07T00:00:00Z" } }), "no_consent");
assert.equal(lc({}, { alreadySent: true }), "already_sent");
assert.equal(lc({}, { activeDays: [signupDay, "2026-11-06"] }), "active");
assert.equal(lc({ is_banned: true }, {}), "account");
assert.equal(lc({}, {}, Date.UTC(2026, 10, 9, 3, 0)), "quiet_hours", "06:00 Istanbul");

/* ---- activity email fallback ---- */
const au = { email: "b@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", last_seen: new Date(NOON_IST - 2 * H).toISOString() };
const ae = (u, ctx) => P.activityEmailEligible({ ...au, ...u }, { online: false, hasPushTarget: false, ...ctx }, NOON_IST).reason;
assert.equal(ae({}, {}), null, "no push device: email");
assert.equal(ae({}, { hasPushTarget: true }), "push_enough", "seen 2 h ago with a device: the push is enough");
assert.equal(ae({ last_seen: new Date(NOON_IST - 2 * D).toISOString() }, { hasPushTarget: true }), null, "away 2 days");
assert.equal(ae({}, { online: true }), "online");
assert.equal(ae({}, { alreadySentToday: true }), "already_sent");
assert.equal(ae({ email_notify_opt_out_at: "x" }, {}), "unsubscribed");
assert.equal(ae({ email_confirmed_at: null }, {}), "email_unverified");

/* ---- unsubscribe tokens ---- */
const env = { JWT_SECRET: "s3cret", PUBLIC_APP_URL: "https://descall.com/" };
const uid = "11111111-2222-3333-4444-555555555555";
const tok = P.signUnsub(uid, "activity", env);
assert.ok(tok && tok.length === 32);
assert.ok(P.verifyUnsub(uid, "activity", tok, env));
assert.ok(!P.verifyUnsub(uid, "lifecycle", tok, env), "scope bound");
assert.ok(!P.verifyUnsub("other", "activity", tok, env), "user bound");
assert.ok(!P.verifyUnsub(uid, "activity", "x", env));
assert.ok(!P.verifyUnsub(uid, "activity", tok, { JWT_SECRET: "other" }), "secret bound");
assert.equal(P.signUnsub(uid, "activity", {}), null, "no secret, no link");
const url = new URL(P.unsubscribeUrl(uid, "lifecycle", env));
assert.equal(url.origin + url.pathname, "https://descall.com/api/reengage/unsubscribe");
assert.ok(P.verifyUnsub(url.searchParams.get("u"), url.searchParams.get("s"), url.searchParams.get("t"), env));

/* ---- invite links ---- */
assert.equal(P.inviteCodeFromText("join us https://descall.com/servers/join/AbC_12 tonight"), "AbC_12");
assert.equal(P.inviteCodeFromText("descall.com/invite/s/xyz9"), "xyz9");
assert.equal(P.inviteCodeFromText("https://evil.example/servers/join/abcd"), null, "other hosts ignored");
assert.equal(P.inviteCodeFromText("https://app.test/servers/join/abcd", { PUBLIC_APP_URL: "https://app.test" }), "abcd");
assert.equal(P.inviteCodeFromText("no link"), null);

/* ---- email builder ---- */
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
for (const lang of ["en", "tr", "de", "es", "fr", "pt-BR", "ru"]) {
  for (const kind of KINDS) {
    const m = buildReengageEmail({ kind, lang, username: "ada", from: "<b>bob</b>", server: "Gece", inviteCode: "abcd", unsubUrl: "https://descall.com/api/reengage/unsubscribe?u=1&s=activity&t=x", year: 2026 });
    assert.equal(m.lang, lang);
    assert.ok(m.subject && !/\{|\}/.test(m.subject), `${lang}/${kind} subject rendered`);
    assert.ok(!emoji.test(m.subject + m.html + m.text), `${lang}/${kind} no emoji`);
    assert.ok(!m.html.includes("<b>bob</b>"), `${lang}/${kind} names escaped`);
    assert.ok(m.html.includes("/api/reengage/unsubscribe") && m.text.includes("/api/reengage/unsubscribe"), `${lang}/${kind} unsubscribe link`);
    assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.match(m.html, new RegExp(`<html lang="${lang}"`));
  }
}
const d3 = buildReengageEmail({ kind: "day3", lang: "tr", username: "ada" });
assert.ok(d3.text.includes("https://descall.com/register?ref=ada"), "invite-a-friend link");
assert.ok(d3.text.includes("https://descall.com/servers"), "public servers link");
assert.equal(d3.subject, "ada, arkadaşların Descall'da seni bekliyor");
const inv = buildReengageEmail({ kind: "serverInvite", lang: "en", from: "bob", server: "Night Owls", inviteCode: "abcd" });
assert.ok(inv.text.includes("https://descall.com/servers/join/abcd"));
assert.equal(inv.subject, "bob invited you to Night Owls");
assert.equal(buildReengageEmail({ kind: "friendRequest", lang: "xx" }).lang, "tr", "Turkish fallback");

/* ---- orchestrator with an in-memory database ---- */
function fakeDb(tables) {
  const t = (name) => (tables[name] = tables[name] || []);
  function q(name) {
    const filters = [];
    let op = "select";
    let payload = null;
    let single = false;
    let limitN = null;
    const api = {
      select() { return api; },
      insert(row) { op = "insert"; payload = row; return api; },
      update(patch) { op = "update"; payload = patch; return api; },
      eq(c, v) { filters.push((r) => String(r[c]) === String(v)); return api; },
      is(c, v) { filters.push((r) => (r[c] ?? null) === v); return api; },
      in(c, vs) { filters.push((r) => vs.map(String).includes(String(r[c]))); return api; },
      gte(c, v) { filters.push((r) => String(r[c]) >= String(v)); return api; },
      lte(c, v) { filters.push((r) => String(r[c]) <= String(v)); return api; },
      like(c, v) { const p = String(v).replace("%", ""); filters.push((r) => String(r[c]).startsWith(p)); return api; },
      or(expr) {
        const ids = [...String(expr).matchAll(/(\w+)\.eq\.([\w-]+)/g)];
        filters.push((r) => ids.some(([, c, v]) => String(r[c]) === v));
        return api;
      },
      order() { return api; },
      limit(n) { limitN = n; return api; },
      maybeSingle() { single = true; return api; },
      then(res, rej) {
        try {
          const rows = t(name);
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          if (op === "insert") {
            if (name === "lifecycle_messages" && rows.some((r) => r.user_id === payload.user_id && r.kind === payload.kind)) {
              return Promise.resolve({ error: { code: "23505", message: "duplicate key" } }).then(res, rej);
            }
            rows.push({ ...payload });
            return Promise.resolve({ error: null }).then(res, rej);
          }
          if (op === "update") {
            hit.forEach((r) => Object.assign(r, payload));
            return Promise.resolve({ error: null }).then(res, rej);
          }
          const data = limitN ? hit.slice(0, limitN) : hit;
          return Promise.resolve({ data: single ? data[0] || null : data, error: null }).then(res, rej);
        } catch (e) {
          return Promise.reject(e).then(res, rej);
        }
      },
    };
    return api;
  }
  return { from: q, tables };
}

async function orchestrator() {
  const A = "aaaaaaaa-0000-0000-0000-000000000001"; // joins voice
  const B = "bbbbbbbb-0000-0000-0000-000000000002"; // away friend, eligible
  const C = "cccccccc-0000-0000-0000-000000000003"; // online friend
  const E = "eeeeeeee-0000-0000-0000-000000000005"; // away friend, switch off
  const S = "55555555-0000-0000-0000-000000000000";
  const CH = "66666666-0000-0000-0000-000000000000";
  const db = fakeDb({
    users: [
      { id: A, username: "ada", display_name: "Ada", blocked_users: [], notify_friend_voice: true },
      { id: B, username: "bob", language: "en", timezone: "UTC", presence_status: "online", blocked_users: [], notify_friend_voice: true, email: "bob@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
      { id: C, username: "cem", blocked_users: [], notify_friend_voice: true },
      { id: E, username: "eda", blocked_users: [], notify_friend_voice: false },
    ],
    friendships: [
      { user_id: A, friend_id: B, status: "accepted" },
      { user_id: C, friend_id: A, status: "accepted" },
      { user_id: A, friend_id: E, status: "accepted" },
    ],
    server_members: [B, C, E].map((u) => ({ server_id: S, user_id: u, notification_level: "all" })),
    server_channel_mutes: [],
    web_push_subscriptions: [{ user_id: B }, { user_id: E }],
    device_push_tokens: [],
    servers: [{ id: S, name: "Gece" }],
    lifecycle_messages: [],
  });
  const pushes = [];
  const lines = [];
  let clock = NOON_IST;
  const state = { presence: new Map([[C, { status: "online" }]]), activeServerVoiceCalls: new Map() };
  const mk = (envOver) =>
    createReengage({
      getDb: () => db,
      env: { JWT_SECRET: "x", RESEND_API_KEY: "k", ...envOver },
      now: () => clock,
      log: { log: (...a) => lines.push(a.join(" ")), info: (...a) => lines.push(a.join(" ")), warn: (...a) => lines.push(a.join(" ")) },
      state,
      push: { sendFriendVoicePush: async (ids, p) => pushes.push({ ids, p }) },
      sendEmail: async () => ({ sent: true }),
      channelBits: async (_db, _s, _c, ids) => new Map(ids.map((id) => [id, 1n])),
      canJoinBits: (bits) => bits === 1n,
      dmMuted: async () => false,
      dmLevel: async () => "all",
    });
  const join = { joinerId: A, serverId: S, channelId: CH, channelName: "Lobi", channelType: "voice" };

  // Off: nothing at all.
  const off = await mk({}).onVoiceJoin(join);
  assert.equal(off.skipped, "off");

  // Dry-run: logs, writes nothing, pushes nothing.
  const dry = await mk({ REENGAGE_DRY_RUN: "1" }).onVoiceJoin(join);
  assert.equal(dry.sent, 0);
  assert.equal(db.tables.lifecycle_messages.length, 0, "dry-run writes no markers");
  assert.equal(pushes.length, 0);
  assert.ok(lines.some((l) => l.includes("dry-run") && l.includes(B)), "dry-run logs the recipient");

  // Live: only B (C is online, E switched it off).
  const live = mk({ REENGAGE_ENABLED: "1" });
  const r1 = await live.onVoiceJoin(join);
  assert.equal(r1.sent, 1, JSON.stringify(r1));
  assert.deepEqual(pushes[0].ids, [B]);
  assert.equal(pushes[0].p.friendName, "Ada");
  assert.equal(pushes[0].p.serverName, "Gece");
  assert.equal(r1.reasons.opted_out, 1);
  assert.equal(db.tables.lifecycle_messages.length, 1);
  assert.equal(db.tables.lifecycle_messages[0].status, "sent");

  // Rejoin flap within 15 min: ignored.
  assert.equal((await live.onVoiceJoin(join)).skipped, "cooldown");
  // A fresh instance (restart) 1 h later: the 6 h rule from the stored marker holds.
  clock = NOON_IST + H;
  const restarted = mk({ REENGAGE_ENABLED: "1" });
  const r2 = await restarted.onVoiceJoin(join);
  assert.equal(r2.sent, 0);
  assert.equal(r2.reasons.gap_6h, 1);
  assert.equal(pushes.length, 1, "never twice within 6 h, even after a restart");

  // Friend request email: B is offline with a web push device, seen long ago.
  db.tables.users.find((u) => u.id === B).last_seen = new Date(NOON_IST - 3 * D).toISOString();
  const sent = [];
  const mail = createReengage({
    getDb: () => db,
    env: { JWT_SECRET: "x", RESEND_API_KEY: "k", REENGAGE_ENABLED: "1" },
    now: () => clock,
    log: { log() {}, info() {}, warn() {} },
    state,
    sendEmail: async (m) => { sent.push(m); return { sent: true }; },
  });
  const e1 = await mail.onFriendRequest({ toUserId: B, fromId: A, fromName: "ada" });
  assert.equal(e1.sent, true, JSON.stringify(e1));
  assert.equal(sent[0].to, "bob@example.com");
  assert.ok(sent[0].headers["List-Unsubscribe"].includes("/api/reengage/unsubscribe"));
  const e2 = await mail.onFriendRequest({ toUserId: B, fromId: C, fromName: "cem" });
  assert.equal(e2.reason, "already_sent", "one per day");
  // Online recipients never get it.
  state.presence.set(B, { status: "online" });
  assert.equal((await mail.onFriendRequest({ toUserId: B, fromId: A })).reason, "online");
  state.presence.delete(B);

  // Unsubscribe link works and stops the next day's email.
  const u = new URL(P.unsubscribeUrl(B, "activity", { JWT_SECRET: "x" }));
  const un = await mail.unsubscribe({ userId: u.searchParams.get("u"), scope: "activity", token: u.searchParams.get("t") });
  assert.equal(un.ok, true);
  assert.ok(db.tables.users.find((x) => x.id === B).email_notify_opt_out_at, "opt-out stored");
  assert.equal((await mail.unsubscribe({ userId: B, scope: "activity", token: "bad" })).ok, false);
  clock = NOON_IST + D;
  assert.equal((await mail.onFriendRequest({ toUserId: B, fromId: A })).reason, "unsubscribed");

  // Settings switches.
  assert.deepEqual(await mail.readPrefs(E), { friendVoice: false, email: true, ready: true });
  const saved = await mail.savePrefs(E, { friendVoice: true, email: false });
  assert.equal(saved.ok, true);
  assert.equal(saved.friendVoice, true);
  assert.equal(saved.email, false);

  // Admin counts per day and kind.
  const counts = await mail.adminCounts({ days: 7 });
  const kinds = counts.rows.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["friend_request_email", "friend_voice"]);
}

async function lifecycle() {
  const U = "dddddddd-0000-0000-0000-000000000004";
  const V = "ffffffff-0000-0000-0000-000000000006";
  const createdAt = new Date(created).toISOString();
  const db = fakeDb({
    users: [
      { id: U, username: "ada", email: "Ada@Example.com", email_confirmed_at: createdAt, created_at: createdAt, timezone: "UTC", language: "tr" },
      { id: V, username: "veli", email: "v@example.com", email_confirmed_at: createdAt, created_at: createdAt, timezone: "UTC" },
    ],
    marketing_subscribers: [
      { email: "ada@example.com", confirmed_at: "2026-11-05T10:00:00Z", unsubscribed_at: null },
    ],
    user_active_days: [{ user_id: U, day: signupDay }, { user_id: V, day: signupDay }],
    lifecycle_messages: [],
  });
  const sent = [];
  const mk = () =>
    createReengage({
      getDb: () => db,
      env: { JWT_SECRET: "x", RESEND_API_KEY: "k", REENGAGE_ENABLED: "1" },
      now: () => NOON_IST,
      log: { log() {}, info() {}, warn() {} },
      state: { presence: new Map(), activeServerVoiceCalls: new Map() },
      sendEmail: async (m) => { sent.push(m); return { sent: true }; },
    });
  const s1 = await mk().runLifecycle();
  assert.equal(s1.sent, 1, JSON.stringify(s1));
  assert.equal(s1.reasons.no_consent, 1, "no opt-in, no lifecycle email");
  assert.equal(sent[0].to, "Ada@Example.com");
  assert.ok(sent[0].subject.startsWith("ada, "), "Turkish subject");
  // Restart: the stored marker prevents a second email.
  const s2 = await mk().runLifecycle();
  assert.equal(s2.sent, 0);
  assert.equal(sent.length, 1, "idempotent across restarts");

  // Lifecycle unsubscribe also ends the product-update opt-in.
  const link = new URL(P.unsubscribeUrl(U, "lifecycle", { JWT_SECRET: "x" }));
  await mk().unsubscribe({ userId: U, scope: "lifecycle", token: link.searchParams.get("t") });
  assert.ok(db.tables.marketing_subscribers[0].unsubscribed_at, "marketing opt-in ended");

  // Live mode without the migration: nothing is sent.
  const noTable = fakeDb({ users: [{ id: U, username: "ada", created_at: createdAt }] });
  const origFrom = noTable.from;
  noTable.from = (name) => {
    if (name === "lifecycle_messages") {
      const err = { code: "42P01", message: 'relation "public.lifecycle_messages" does not exist' };
      const api = new Proxy({}, { get: (_t, k) => (k === "then" ? (res) => res({ data: null, error: err }) : () => api) });
      return api;
    }
    if (name === "users") {
      const inner = origFrom("users");
      const sel = inner.select;
      inner.select = (cols) => {
        if (/notify_friend_voice/.test(cols || "")) {
          const err = { code: "42703", message: "column users.notify_friend_voice does not exist" };
          const api = new Proxy({}, { get: (_t, k) => (k === "then" ? (res) => res({ data: null, error: err }) : () => api) });
          return api;
        }
        return sel(cols);
      };
      return inner;
    }
    return origFrom(name);
  };
  const r = await createReengage({
    getDb: () => noTable,
    env: { JWT_SECRET: "x", RESEND_API_KEY: "k", REENGAGE_ENABLED: "1" },
    now: () => NOON_IST,
    log: { log() {}, info() {}, warn() {} },
    state: { presence: new Map(), activeServerVoiceCalls: new Map() },
    sendEmail: async () => { throw new Error("must not send"); },
  }).runLifecycle();
  assert.equal(r.skipped, "not_ready");
}

(async () => {
  await orchestrator();
  await lifecycle();
  console.log("reengage.selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
