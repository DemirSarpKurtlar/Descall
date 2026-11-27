"use strict";

/**
 * "Başla panosu" (routes/onboarding.js, lib/onboarding/*) over real HTTP with an in-memory
 * database: the five-day window, community auto-join, inviter's corner, live suggestions
 * ranked by interests, checklist rewards paid once, preview privacy, "Katıl ve gönder"
 * tracking, "İlk Selam" (+50 and the badge once, never for an undone message, a lonely
 * server, a DM to yourself or a suspicious account), hide / reopen, and the admin report.
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const assert = require("node:assert/strict");
const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const { EVERYONE_DEFAULT, Permissions } = require("../lib/serverPermissions");

const D = 86400000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = U(1);
const ZEYNEP = U(2);
const KAAN = U(3);
const MERT = U(4);
const OLD = U(5);
const SUS = U(6);
const LONELY = U(7);
const COMM = U(100);
const DK = U(101);
const MC = U(102);
const PRIV = U(103);
const LONE_SRV = U(104);
const CH = { dkGenel: U(201), dkTan: U(202), dkKural: U(203), dkVoice: U(204), commTan: U(205), mcGenel: U(206), loneGenel: U(207) };

const sess = (id) => [{ id: `s-${id}` }];
const user = (id, username, extra = {}) => ({ id, username, display_name: null, avatar_url: null, active_sessions: sess(id), descoin_balance: 0, created_at: iso(now - 90 * D), ...extra });
const msg = (server_id, channel_id, sender_id, agoMin, content = "selam", extra = {}) => ({ id: require("crypto").randomUUID(), server_id, channel_id, sender_id, content, created_at: iso(now - agoMin * 60000), ...extra });

const everyone = (server_id) => ({ id: `${server_id}-everyone`, server_id, is_everyone: true, position: 0, permissions: String(EVERYONE_DEFAULT) });

const fake = createFakeSupabase(
  {
    users: [
      user(ME, "ece", { display_name: "Ece", created_at: iso(now - 1 * D), referred_by: ZEYNEP }),
      user(ZEYNEP, "zeynep", { display_name: "Zeynep", first_message_at: iso(now - 30 * D) }),
      user(KAAN, "kaan", { created_at: iso(now - 2 * D), referred_by: ZEYNEP }),
      user(MERT, "mert", { created_at: iso(now - 3 * D), referred_by: ZEYNEP }),
      user(OLD, "eski", { created_at: iso(now - 9 * D) }),
      user(SUS, "sus", { created_at: iso(now - D / 2), suspicious_signup: true }),
      user(LONELY, "yalniz", { created_at: iso(now - D / 2) }),
    ],
    servers: [
      { id: COMM, name: "Descall Topluluk", owner_id: OLD, is_public: false, updated_at: iso(now) },
      { id: DK, name: "Ders Kampı YKS 2027", owner_id: ZEYNEP, is_public: true, directory_category: null, updated_at: iso(now - 1000), rules_text: "Saygılı ol\nSpam yok\nKonu dışı #genel'e" },
      { id: MC, name: "Minecraft Türkiye SMP", owner_id: OLD, is_public: true, updated_at: iso(now - 2000) },
      { id: PRIV, name: "Gizli", owner_id: OLD, is_public: false, updated_at: iso(now) },
      { id: LONE_SRV, name: "Yalnız Sunucu", owner_id: LONELY, is_public: true, updated_at: iso(now - 3000) },
    ],
    server_members: [
      { server_id: COMM, user_id: OLD, joined_at: iso(now - 60 * D) },
      { server_id: DK, user_id: ZEYNEP, joined_at: iso(now - 60 * D) },
      { server_id: DK, user_id: KAAN, joined_at: iso(now - 2 * D) },
      { server_id: MC, user_id: OLD, joined_at: iso(now - 60 * D) },
      { server_id: MC, user_id: MERT, joined_at: iso(now - 3 * D) },
      { server_id: LONE_SRV, user_id: LONELY, joined_at: iso(now - D / 2) },
    ],
    server_channels: [
      { id: CH.dkGenel, server_id: DK, name: "genel", type: "text", position: 0 },
      { id: CH.dkTan, server_id: DK, name: "tanışma", type: "text", position: 1 },
      { id: CH.dkKural, server_id: DK, name: "yetkili", type: "text", position: 2 },
      { id: CH.dkVoice, server_id: DK, name: "Pomodoro odası", type: "voice", position: 3 },
      { id: CH.commTan, server_id: COMM, name: "tanışma", type: "text", position: 0 },
      { id: CH.mcGenel, server_id: MC, name: "genel", type: "text", position: 0 },
      { id: CH.loneGenel, server_id: LONE_SRV, name: "genel", type: "text", position: 0 },
    ],
    server_roles: [everyone(DK), everyone(COMM), everyone(MC), everyone(LONE_SRV)],
    server_channel_overrides: [
      { channel_id: CH.dkKural, target_type: "role", target_id: `${DK}-everyone`, allow_permissions: "0", deny_permissions: String(Permissions.VIEW_CHANNEL) },
    ],
    server_messages: [
      msg(DK, CH.dkGenel, ZEYNEP, 50, "Türev bitti, kim limit tekrarı yapacak?"),
      msg(DK, CH.dkGenel, KAAN, 40, "20:00'de pomodoro odasındayım"),
      msg(DK, CH.dkGenel, ZEYNEP, 38, "geliyorum"),
      msg(DK, CH.dkKural, ZEYNEP, 30, "gizli yetkili notu"),
      msg(MC, CH.mcGenel, MERT, 30, "survival açıldı"),
    ],
    friendships: [{ id: "f1", user_id: ZEYNEP, friend_id: ME, status: "accepted" }],
    onboarding_settings: [{ id: "default", enabled: true, community_server_id: COMM, auto_join: true, rehber_enabled: true, rewards_enabled: true }],
    user_onboarding: [],
    onboarding_rewards: [],
    descoin_ledger: [],
    analytics_events: [],
    reactions: [],
    server_bans: [],
    dm_messages: [],
  },
  { uniqueKeys: { onboarding_rewards: ["user_id", "step"], user_onboarding: ["user_id"] } }
);
const rpcCalls = [];
fake.rpc = async (name, args) => {
  rpcCalls.push({ name, args });
  if (name === "special_badge_grant") {
    const dup = rpcCalls.filter((c) => c.name === name && c.args.p_user_id === args.p_user_id).length > 1;
    return { data: dup ? { ok: true, granted: false, error: "owned" } : { ok: true, granted: true, serial: 1, id: U(900) }, error: null };
  }
  return { data: 0, error: null };
};
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

// Server-side join goes through routes/servers.js in production; here a stub records it.
const joins = [];
const serversPath = require.resolve("../routes/servers");
require.cache[serversPath] = {
  id: serversPath,
  filename: serversPath,
  loaded: true,
  exports: {
    joinServerForUser: async (_req, serverId, userId, opts) => {
      joins.push({ serverId, userId, via: opts?.via });
      fake._tables.server_members.rows.push({ server_id: serverId, user_id: userId, joined_at: iso(Date.now()) });
      return { ok: true };
    },
  },
};

const express = require("express");
const { signToken } = require("../config/jwt");
const router = require("../routes/onboarding");
const firstHello = require("../lib/onboarding/firstHello");
const live = require("../lib/onboarding/live");
const store = require("../lib/onboarding/store");
const { onboardingReport } = require("../routes/adminGrowth");

const emitted = [];
const io = {
  to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  sockets: { adapter: { rooms: new Map() } },
};

async function main() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/onboarding", router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/onboarding`;
  const tok = (id, name) => signToken({ id, username: name, sid: `s-${id}` });
  const call = async (method, path, { body, as = [ME, "ece"] } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(as ? { Authorization: `Bearer ${tok(as[0], as[1])}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    return { status: res.status, body: json };
  };
  const users = fake._tables.users.rows;
  const balanceOf = (id) => users.find((u) => u.id === id).descoin_balance;

  try {
    let r = await call("GET", "/state", { as: null });
    assert.equal(r.status, 401);

    // ---- first read: window, community auto-join, inviter's corner, friend step paid
    r = await call("GET", "/state");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const s1 = r.body;
    assert.equal(s1.active, true);
    assert.equal(s1.day, 2);
    assert.equal(s1.windowDays, 5);
    assert.deepEqual(joins, [{ serverId: COMM, userId: ME, via: "onboarding_community" }], "community joined once on the server");
    assert.equal(s1.community.id, COMM);
    assert.equal(s1.community.joined, true);
    assert.equal(s1.community.joinedNow, true);
    assert.ok(s1.myServers.some((x) => x.id === COMM && x.official));
    assert.equal(s1.inviter.id, ZEYNEP);
    assert.equal(s1.inviter.friend, "friend");
    assert.deepEqual(s1.sameInvite.map((p) => p.id).sort(), [KAAN, MERT].sort(), "others with the same invite");
    assert.ok(!s1.sameInvite.some((p) => p.id === ME));
    assert.deepEqual(s1.newlyPaid, [{ step: "friend", amount: 50 }], "an accepted friend pays the friend step");
    assert.equal(balanceOf(ME), 50);
    assert.equal(s1.checklist.doneCount, 1);
    assert.equal(s1.checklist.earned, 50);
    assert.equal(s1.checklist.rewardTotal, 160);
    assert.equal(s1.checklist.next, "interests");
    assert.ok(emitted.some((e) => e.room === `user:${ME}` && e.event === "onboarding:reward" && e.payload.step === "friend"));
    assert.ok(s1.suggestions.length >= 1 && s1.suggestions.length <= 3);
    assert.ok(!s1.suggestions.some((x) => x.id === COMM || x.id === PRIV), "never the community or a private server");
    assert.ok(!("memberIds" in s1.suggestions[0]), "no member ids leave the server");
    assert.ok(Array.isArray(s1.online.spark));
    assert.equal(s1.interestCatalog.length, 12);
    assert.ok(fake._tables.analytics_events.rows.some((e) => e.event === "onboarding_opened" && e.user_id === ME));

    // Rehber greets in the community intro channel once, never at night (00:00-08:00 Istanbul).
    const greetings = () => emitted.filter((e) => e.event === "server:channel:message" && e.payload.message.sender_id === "descall-rehber");
    if (require("../lib/onboarding/model").isQuietHour()) {
      assert.equal(greetings().length, 0, "Rehber is quiet at night");
    } else {
      assert.ok(greetings().some((e) => e.room === `server-channel:${CH.commTan}`), "greeting in #tanışma");
      const g = greetings()[0].payload.message;
      assert.equal(g.i18n.content.key, "bot.onb.rehberWelcome");
      assert.equal(g.i18n.content.vars.user, `<@${ME}>`);
      assert.ok(g.isBot);
    }

    // second read: nothing paid twice, community not joined again
    r = await call("GET", "/state");
    assert.deepEqual(r.body.newlyPaid, []);
    assert.equal(joins.length, 1);
    assert.equal(balanceOf(ME), 50);
    const greetCount = greetings().length;
    assert.ok(greetCount <= 2, "one greeting (room + the user), never twice");

    // ---- interests: +10 once
    r = await call("PUT", "/interests", { body: { interests: ["study", "nope", "music"] } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.interests, ["study", "music"]);
    assert.deepEqual(r.body.paid, { step: "interests", amount: 10 });
    r = await call("PUT", "/interests", { body: { interests: ["gaming-minecraft"] } });
    assert.equal(r.body.paid, null, "changing interests later pays nothing");
    assert.equal(balanceOf(ME), 60);
    r = await call("PUT", "/interests", { body: { interests: ["study"] } });

    live.__resetForTests();
    r = await call("GET", "/state");
    assert.equal(r.body.suggestions[0].id, DK, "study interest ranks Ders Kampı first");
    assert.equal(r.body.suggestions[0].matched, true);
    assert.equal(r.body.suggestions[0].category, "study");
    assert.ok(r.body.suggestions[0].lastHour >= 3);
    assert.equal(r.body.checklist.items.find((i) => i.id === "interests").done, true);

    // ---- preview: public servers and the community only, public channels only
    r = await call("GET", `/servers/${DK}/preview`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.server.name, "Ders Kampı YKS 2027");
    assert.equal(r.body.introChannel.name, "tanışma");
    assert.ok(!r.body.channels.some((c) => c.name === "yetkili"), "a channel @everyone cannot see stays out");
    assert.equal(r.body.channelId, CH.dkGenel, "the preview opens on #genel");
    assert.equal(r.body.messages.length, 3);
    assert.equal(r.body.messages[0].text, "Türev bitti, kim limit tekrarı yapacak?");
    assert.ok(!r.body.messages.some((m) => /yetkili/.test(m.text)));
    assert.equal(r.body.rulesCount, 3);
    assert.equal(r.body.crowd.length, 12);
    r = await call("GET", `/servers/${DK}/preview?channel=${CH.dkKural}`);
    assert.equal(r.body.channelId, CH.dkGenel, "asking for a hidden channel falls back to a public one");
    r = await call("GET", `/servers/${PRIV}/preview`);
    assert.equal(r.status, 404);
    r = await call("GET", `/servers/${COMM}/preview`);
    assert.equal(r.status, 200, "the official community can be previewed although not public");
    r = await call("GET", "/servers/not-a-uuid/preview");
    assert.equal(r.status, 400);

    // ---- join intent + events
    r = await call("POST", "/event", { body: { event: "onboarding_joined", props: { server: DK, slot: "card", interest: "study" } } });
    assert.equal(r.status, 204);
    r = await call("POST", "/event", { body: { event: "drop_table" } });
    assert.equal(r.status, 400);
    const onbRow = () => fake._tables.user_onboarding.rows.find((x) => x.user_id === ME);
    assert.equal(onbRow().last_join.serverId, DK);
    assert.equal(onbRow().last_join.slot, "card");

    // ---- "Katıl ve gönder": joined + first real message -> pending, then paid after the window
    fake._tables.server_members.rows.push({ server_id: DK, user_id: ME, joined_at: iso(now) });
    const hello = msg(DK, CH.dkTan, ME, 0, "Selam, ben Ece. 12. sınıftayım.");
    fake._tables.server_messages.rows.push(hello);
    let n = await firstHello.noteMessage({ io, userId: ME, kind: "server", text: hello.content, messageId: hello.id, serverId: DK, channelId: CH.dkTan });
    assert.ok(n.pending, JSON.stringify(n));
    let f = await firstHello.finalize({ io, userId: ME });
    assert.equal(f.paid, false, "not before the undo window");
    f = await firstHello.finalize({ io, userId: ME, now: Date.now() + 13000 });
    assert.equal(f.paid, true, JSON.stringify(f));
    assert.equal(f.amount, 50);
    assert.equal(f.badge.id, "ilkselam");
    assert.equal(balanceOf(ME), 110);
    assert.ok(onbRow().first_hello_at);
    assert.equal(onbRow().first_hello_ref.slot, "card", "the card that led to it is kept");
    assert.ok(rpcCalls.some((c) => c.name === "special_badge_grant" && c.args.p_badge_id === "ilkselam" && c.args.p_source === "admin"));
    assert.ok(rpcCalls.some((c) => c.name === "special_badge_mark_notified"));
    assert.ok(emitted.some((e) => e.event === "onboarding:first-hello" && e.payload.amount === 50));
    const helloEv = fake._tables.analytics_events.rows.find((e) => e.event === "onboarding_first_hello");
    assert.equal(helloEv.props.server, DK);
    assert.equal(helloEv.props.slot, "card");
    // once per account
    f = await firstHello.finalize({ io, userId: ME, now: Date.now() + 30000 });
    assert.equal(f.paid, false);
    n = await firstHello.noteMessage({ io, userId: ME, kind: "server", text: "ikinci mesaj", messageId: U(901), serverId: DK, channelId: CH.dkTan });
    assert.equal(n.skipped, "done");
    assert.equal(balanceOf(ME), 110);
    const ledger = fake._tables.descoin_ledger.rows.filter((x) => x.user_id === ME && x.reason === "onboarding_reward");
    assert.deepEqual(ledger.map((x) => x.amount).sort((a, b) => a - b), [10, 50, 50]);

    // ---- tracking: replies and reactions to my message
    fake._tables.server_messages.rows.push(msg(DK, CH.dkTan, ZEYNEP, -1, "Hoş geldin Ece!", { reply_to: { id: hello.id }, created_at: iso(Date.now() + 1000) }));
    fake._tables.server_messages.rows.push(msg(DK, CH.dkTan, KAAN, -1, `<@${ME}> akşam gel`, { created_at: iso(Date.now() + 2000) }));
    fake._tables.reactions.rows.push({ message_id: hello.id, emoji: "heart", user_id: ZEYNEP }, { message_id: hello.id, emoji: "heart", user_id: KAAN });
    r = await call("GET", `/track?serverId=${DK}&channelId=${CH.dkTan}&messageId=${hello.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.exists, true);
    assert.equal(r.body.replies, 2);
    assert.equal(r.body.reactions, 2);
    assert.equal(r.body.repliers.length, 2);
    r = await call("GET", `/track?serverId=${DK}&channelId=${CH.dkTan}&messageId=${hello.id}`, { as: [KAAN, "kaan"] });
    assert.equal(r.body.exists, false, "someone else's message is not tracked");

    // ---- undo: the message is gone when the window ends -> nothing paid
    fake._tables.server_members.rows.push({ server_id: MC, user_id: KAAN, joined_at: iso(now) });
    const kHello = msg(MC, CH.mcGenel, KAAN, 0, "Selam ben Kaan");
    fake._tables.server_messages.rows.push(kHello);
    n = await firstHello.noteMessage({ io, userId: KAAN, kind: "server", text: kHello.content, messageId: kHello.id, serverId: MC, channelId: CH.mcGenel });
    assert.ok(n.pending);
    fake._tables.server_messages.rows = fake._tables.server_messages.rows.filter((x) => x.id !== kHello.id);
    f = await firstHello.finalize({ io, userId: KAAN, now: Date.now() + 13000 });
    assert.equal(f.undone, true);
    assert.equal(balanceOf(KAAN), 0);
    r = await call("POST", "/undo", { body: { messageId: kHello.id, serverId: MC }, as: [KAAN, "kaan"] });
    assert.equal(r.status, 200);

    // ---- nobody else in the server, a DM to yourself, a suspicious account, an old account
    const lHello = msg(LONE_SRV, CH.loneGenel, LONELY, 0, "kimse var mı");
    n = await firstHello.noteMessage({ io, userId: LONELY, kind: "server", text: lHello.content, messageId: lHello.id, serverId: LONE_SRV, channelId: CH.loneGenel });
    assert.equal(n.skipped, "alone");
    n = await firstHello.noteMessage({ io, userId: LONELY, kind: "dm", text: "selam", messageId: U(902), peerId: LONELY });
    assert.equal(n.skipped, "alone");
    n = await firstHello.noteMessage({ io, userId: LONELY, kind: "dm", text: "selam", messageId: U(903), peerId: SUS });
    assert.equal(n.skipped, "alone", "a twelve-hour-old silent account is not a real peer yet");
    n = await firstHello.noteMessage({ io, userId: SUS, kind: "dm", text: "selam", messageId: U(904), peerId: ZEYNEP });
    assert.equal(n.skipped, "eligible", "suspicious sign-ups never earn");
    n = await firstHello.noteMessage({ io, userId: OLD, kind: "dm", text: "selam", messageId: U(905), peerId: ZEYNEP });
    assert.equal(n.skipped, "eligible");
    n = await firstHello.noteMessage({ io, userId: LONELY, kind: "dm", text: "/daily", messageId: U(906), peerId: ZEYNEP });
    assert.equal(n.skipped, "text");

    r = await call("GET", "/state", { as: [OLD, "eski"] });
    assert.equal(r.body.active, false);
    assert.equal(r.body.inWindow, false);
    assert.equal(r.body.day, 10);

    // a suspicious account sees the dashboard but earns nothing and is not auto-joined
    const joinsBefore = joins.length;
    r = await call("GET", "/state", { as: [SUS, "sus"] });
    assert.equal(r.body.active, true);
    assert.equal(joins.length, joinsBefore);
    r = await call("PUT", "/interests", { body: { interests: ["music"] }, as: [SUS, "sus"] });
    assert.equal(r.body.paid, null);
    assert.equal(balanceOf(SUS), 0);

    // ---- hide and reopen
    r = await call("POST", "/hide", { body: { hidden: true } });
    assert.equal(r.body.hidden, true);
    r = await call("GET", "/state");
    assert.equal(r.body.active, false);
    assert.equal(r.body.hidden, true);
    r = await call("POST", "/hide", { body: { hidden: false } });
    r = await call("GET", "/state");
    assert.equal(r.body.active, true);

    // ---- leaving the community is remembered and never undone
    fake._tables.server_members.rows = fake._tables.server_members.rows.filter((x) => !(x.server_id === COMM && x.user_id === ME));
    r = await call("GET", "/state");
    assert.equal(r.body.community.left, true);
    r = await call("GET", "/state");
    assert.equal(joins.filter((j) => j.userId === ME).length, 1, "a user who left is never auto-joined again");

    // ---- settings off: no dashboard
    fake._tables.onboarding_settings.rows[0].enabled = false;
    store.__resetSettings();
    r = await call("GET", "/state");
    assert.equal(r.body.active, false);
    fake._tables.onboarding_settings.rows[0].enabled = true;
    store.__resetSettings();

    // ---- admin report (pure)
    const ev = (event, user_id, props = {}) => ({ event, user_id, props });
    const report = onboardingReport({
      events: [
        ev("onboarding_opened", ME), ev("onboarding_opened", KAAN), ev("onboarding_opened", ME),
        ev("onboarding_previewed", ME, { server: DK }), ev("onboarding_previewed", ME, { server: DK }), ev("onboarding_previewed", KAAN, { server: MC }),
        ev("onboarding_joined", ME, { server: DK }),
        ev("onboarding_first_hello", ME, { server: DK, slot: "card" }),
        ev("onboarding_opened", OLD),
      ],
      users: [
        { id: ME, username: "ece", created_at: iso(now - 3 * D), first_message_at: iso(now - 3 * D + 3600000) },
        { id: KAAN, username: "kaan", created_at: iso(now - 3 * D) },
        { id: OLD, username: "admin", created_at: iso(now - 3 * D) },
      ],
      interestsByUser: new Map([[ME, ["study"]], [KAAN, ["study", "music"]]]),
      activity: [{ user_id: ME, day: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(now - 2 * D)) }],
      sinceMs: now - 7 * D,
      now,
    });
    assert.deepEqual(report.funnel, { opened: 2, previewed: 2, joined: 1, firstHello: 1, undone: 0, hidden: 0 }, "admins left out, distinct accounts");
    assert.equal(report.firstDay.signups, 2);
    assert.equal(report.firstDay.firstDayMessage, 1);
    assert.equal(report.firstDay.pct, 50);
    assert.deepEqual(report.byInterest[0], { id: "study", picked: 2, firstHello: 1, pct: 50 });
    assert.deepEqual(report.byServer[0], { serverId: DK, previewed: 1, joined: 1, firstHello: 1 });
    assert.deepEqual(report.bySlot, { card: 1 });
    assert.equal(report.cohort.opened.eligible, 2);
    assert.equal(report.cohort.opened.kept, 1);

    console.log("onboarding.integration.test: ok");
  } finally {
    firstHello.__resetForTests();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
