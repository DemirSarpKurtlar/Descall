"use strict";

/**
 * Server audit 2026-11-15, MESSAGES + channel access (server-audit/messages.md,
 * sockets.md SK-4.., channel-access.md CA-1/CA-2), through the real socket handlers
 * and a fake Supabase:
 *   MSG-1  announcement channels are read-only for members without MANAGE_MESSAGES
 *   MSG-2  a timed-out moderator cannot pin / unpin / delete others' messages
 *   MSG-3  mediaUrl only from our storage (or a GIF provider); javascript: / external refused
 *   MSG-4  voice needs SEND_VOICE_MESSAGES, audio files need ATTACH_FILES
 *   MSG-5  length limit on send and edit
 *   MSG-6 / SK-4  edits run the send checks (word filter, EMBED_LINKS, @everyone, chat freeze)
 *   MSG-7 / MSG-11  slowmode is atomic for parallel sends and survives deleting your message
 *   MSG-9  reaction emoji validated, distinct reactions capped
 *   MSG-10 a site-wide timeout blocks edit / react / pin too
 *   MSG-15 a timed-out member can remove their own reaction
 *   MSG-16 pin cap per channel
 *   CA-1   a join racing a kick never leaves the kicked socket in the room
 *   CA-2   access eviction resolves a channel's sockets in bulk
 *   node frontend/backend/test/serverMessagesAudit.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const { createFakeSupabase } = require("./fakeSupabase.cjs");

const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };

const { Permissions: F, EVERYONE_DEFAULT, toPgBigint } = require("../lib/serverPermissions");

const S = "srv-1";
const TXT = "chan-txt";
const ANN = "chan-ann";
const ANNW = "chan-annw";
const SLOW = "chan-slow";
const NOATT = "chan-noatt";
const NOVOICE = "chan-novoice";
const STAFF = "chan-staff";
const R = {
  every: "00000000-0000-4000-8000-0000000000e0",
  mod: "00000000-0000-4000-8000-0000000000a2",
  writer: "00000000-0000-4000-8000-0000000000a3",
};
const future = new Date(Date.now() + 3600e3).toISOString();
const uuid = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const people = ["own", "mod", "mod2", "alice", "bob", "writer", "plat", "victim"];

const fake = createFakeSupabase({
  users: people.map((n) => ({ id: `u-${n}`, username: n, active_sessions: [{ id: `s-${n}` }], blocked_users: [] })),
  servers: [{ id: S, name: "S", owner_id: "u-own" }],
  server_members: [
    { server_id: S, user_id: "u-own" },
    { server_id: S, user_id: "u-mod", timeout_until: future, timeout_reason: "test" },
    { server_id: S, user_id: "u-mod2" },
    { server_id: S, user_id: "u-alice" },
    { server_id: S, user_id: "u-bob", timeout_until: future, timeout_reason: "test" },
    { server_id: S, user_id: "u-writer" },
    { server_id: S, user_id: "u-plat" },
    { server_id: S, user_id: "u-victim" },
  ],
  server_roles: [
    { id: R.every, server_id: S, name: "@everyone", is_everyone: true, position: 0, permissions: toPgBigint(EVERYONE_DEFAULT) },
    { id: R.mod, server_id: S, name: "Mod", position: 3, permissions: toPgBigint(F.MANAGE_MESSAGES) },
    { id: R.writer, server_id: S, name: "Writer", position: 2, permissions: "0" },
  ],
  server_member_roles: [
    { server_id: S, user_id: "u-mod", role_id: R.mod },
    { server_id: S, user_id: "u-mod2", role_id: R.mod },
    { server_id: S, user_id: "u-plat", role_id: R.mod },
    { server_id: S, user_id: "u-writer", role_id: R.writer },
  ],
  server_channels: [
    { id: TXT, server_id: S, name: "genel", type: "text", position: 0, slowmode_seconds: 0 },
    { id: ANN, server_id: S, name: "duyurular", type: "announcement", position: 1, slowmode_seconds: 0 },
    { id: ANNW, server_id: S, name: "haberler", type: "announcement", position: 2, slowmode_seconds: 0 },
    { id: SLOW, server_id: S, name: "slow", type: "text", position: 3, slowmode_seconds: 3600 },
    { id: NOATT, server_id: S, name: "noatt", type: "text", position: 4, slowmode_seconds: 0 },
    { id: NOVOICE, server_id: S, name: "novoice", type: "text", position: 5, slowmode_seconds: 0 },
    { id: STAFF, server_id: S, name: "staff", type: "text", position: 6, slowmode_seconds: 0 },
  ],
  server_channel_overrides: [
    { id: "ov1", channel_id: NOATT, target_type: "role", target_id: R.every, allow_permissions: "0", deny_permissions: toPgBigint(F.ATTACH_FILES | F.EMBED_LINKS) },
    { id: "ov2", channel_id: NOVOICE, target_type: "role", target_id: R.every, allow_permissions: "0", deny_permissions: toPgBigint(F.SEND_VOICE_MESSAGES) },
    { id: "ov3", channel_id: ANNW, target_type: "role", target_id: R.writer, allow_permissions: toPgBigint(F.SEND_MESSAGES), deny_permissions: "0" },
  ],
  server_channel_mutes: [],
  server_channel_reads: [],
  device_push_tokens: [],
  reactions: [],
  server_messages: [
    { id: uuid(1), server_id: S, channel_id: TXT, sender_id: "u-alice", content: "victim msg", created_at: new Date().toISOString() },
    { id: uuid(2), server_id: S, channel_id: TXT, sender_id: "u-mod", content: "mod own msg", created_at: new Date().toISOString() },
    { id: uuid(3), server_id: S, channel_id: NOATT, sender_id: "u-alice", content: "harmless", created_at: new Date().toISOString() },
    { id: uuid(4), server_id: S, channel_id: TXT, sender_id: "u-alice", content: "react target", created_at: new Date().toISOString() },
    { id: uuid(5), server_id: S, channel_id: TXT, sender_id: "u-plat", content: "plat msg", created_at: new Date().toISOString() },
  ],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

// Word filter stand-in: "badword" is blocked.
const contentFilter = require("../lib/contentFilter");
contentFilter.gate = ({ text }) => (String(text || "").includes("badword") ? { blocked: true, verdict: { block: true } } : { blocked: false, verdict: null });
contentFilter.after = () => {};

const shared = require("../runtime/sharedState");
const { registerServerChannelHandlers } = require("../socket/serverChannelHandlers");

const emitted = [];
const roomMembers = new Map();
const io = {
  to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  in: (room) => ({
    emit: (event, payload) => emitted.push({ room, event, payload }),
    fetchSockets: async () => [...(roomMembers.get(room) || [])],
    socketsLeave() {},
  }),
  sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
};

function makeSocket(userId) {
  const handlers = new Map();
  const out = [];
  const s = {
    id: `sock-${userId}-${Math.random().toString(36).slice(2, 7)}`,
    user: { id: userId, username: userId.replace(/^u-/, "") },
    handshake: { auth: {}, headers: {} },
    data: {},
    rooms: new Set(),
    on(ev, fn) { handlers.set(ev, fn); },
    emit(ev, payload) { out.push({ ev, payload }); },
    join(r) { s.rooms.add(r); if (!roomMembers.has(r)) roomMembers.set(r, new Set()); roomMembers.get(r).add(s); },
    leave(r) { s.rooms.delete(r); roomMembers.get(r)?.delete(s); },
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
    broadcast: { emit() {}, to: (room) => io.to(room) },
  };
  s.join(`user:${userId}`);
  registerServerChannelHandlers(io, s);
  return { s, out, call: (ev, payload) => handlers.get(ev)(payload) };
}

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const rows = () => fake._tables.server_messages.rows;
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}
let tempN = 0;
async function send(sock, channelId, extra = {}) {
  sock.out.length = 0;
  const tempId = `t-${++tempN}`;
  const before = rows().length;
  await sock.call("server:channel:message", { serverId: S, channelId, tempId, ...extra });
  await settle(5);
  const err = sock.out.find((o) => o.ev === "server:channel:message:error" && o.payload?.tempId === tempId);
  const stored = rows().length > before ? rows()[rows().length - 1] : null;
  return { stored, err: err?.payload || null };
}
async function act(sock, ev, payload) {
  sock.out.length = 0;
  await sock.call(ev, payload);
  await settle(5);
  return sock.out;
}

async function messageTests() {
  const own = makeSocket("u-own");
  const mod = makeSocket("u-mod");
  const mod2 = makeSocket("u-mod2");
  const alice = makeSocket("u-alice");
  const alice2 = makeSocket("u-alice");
  const writer = makeSocket("u-writer");
  const plat = makeSocket("u-plat");

  // MSG-1
  {
    const a = await send(alice, ANN, { content: "member post" });
    check("MSG-1 member cannot post in an announcement channel", !a.stored && a.err, a.err?.code);
    const o = await send(own, ANN, { content: "owner post" });
    check("MSG-1 owner posts in an announcement channel", o.stored && !o.err);
    const m = await send(mod2, ANN, { content: "mod post" });
    check("MSG-1 MANAGE_MESSAGES posts in an announcement channel", m.stored && !m.err);
    const w = await send(writer, ANNW, { content: "writer post" });
    check("MSG-1 explicit SEND allow overwrite posts in an announcement channel", w.stored && !w.err);
  }

  // MSG-2
  {
    const pin = await act(mod, "server:channel:message:pin", { serverId: S, channelId: TXT, messageId: uuid(1) });
    const pinned = rows().find((r) => r.id === uuid(1))?.pinned_at;
    check("MSG-2 timed-out moderator cannot pin", !pinned && pin.some((o) => o.ev === "server:channel:message:error" && o.payload?.code === "TIMED_OUT"));
    await act(mod, "server:channel:message:delete", { serverId: S, channelId: TXT, messageId: uuid(1) });
    check("MSG-2 timed-out moderator cannot delete another member's message", rows().some((r) => r.id === uuid(1)));
    await act(mod, "server:channel:message:delete", { serverId: S, channelId: TXT, messageId: uuid(2) });
    check("MSG-2 timed-out member still deletes their own message", !rows().some((r) => r.id === uuid(2)));
    if (!rows().some((r) => r.id === uuid(1))) rows().push({ id: uuid(1), server_id: S, channel_id: TXT, sender_id: "u-alice", content: "victim msg", created_at: new Date().toISOString() });
    rows().find((r) => r.id === uuid(1)).pinned_at = new Date().toISOString();
    await act(mod, "server:channel:message:unpin", { serverId: S, channelId: TXT, messageId: uuid(1) });
    check("MSG-2 timed-out moderator cannot unpin", Boolean(rows().find((r) => r.id === uuid(1)).pinned_at));
    rows().find((r) => r.id === uuid(1)).pinned_at = null;
    await act(mod2, "server:channel:message:pin", { serverId: S, channelId: TXT, messageId: uuid(1) });
    check("MSG-2 active moderator still pins", Boolean(rows().find((r) => r.id === uuid(1)).pinned_at));
    rows().find((r) => r.id === uuid(1)).pinned_at = null;
  }

  // MSG-3
  {
    const js = await send(alice, TXT, { content: "", mediaUrl: "javascript:alert(document.domain)", mediaType: "file" });
    check("MSG-3 javascript: mediaUrl refused", !js.stored, js.err?.code);
    const ext = await send(alice, TXT, { content: "", mediaUrl: "https://evil.example/x.exe", mediaType: "file" });
    check("MSG-3 external mediaUrl refused", !ext.stored, ext.err?.code);
    const extCaption = await send(alice, TXT, { content: "look", mediaUrl: "https://evil.example/pixel.png", mediaType: "image" });
    check("MSG-3 external mediaUrl not stored even with a caption", !extCaption.stored || !extCaption.stored.media_url);
    const gif = await send(alice, TXT, { content: "", mediaUrl: "https://media2.giphy.com/media/abc/200.gif", mediaType: "gif" });
    check("MSG-3 GIF provider URL still accepted", gif.stored && gif.stored.media_url?.includes("giphy.com"));
    const bad = await send(alice, TXT, { content: "x", mediaType: "<script>" });
    check("MSG-3 unknown mediaType dropped", bad.stored && bad.stored.media_type == null);
  }

  // MSG-4
  {
    const v = await send(alice, NOVOICE, { content: "", mediaUrl: "https://media2.giphy.com/media/abc/200.gif", mediaType: "voice" });
    check("MSG-4 voice refused without SEND_VOICE_MESSAGES", !v.stored, v.err?.code);
    const au = await send(alice, NOATT, { content: "", mediaUrl: "https://media2.giphy.com/media/abc/200.gif", mediaType: "audio" });
    check("MSG-4 audio file refused without ATTACH_FILES", !au.stored, au.err?.code);
  }

  // MSG-5
  {
    const long = await send(alice, TXT, { content: "x".repeat(5000) });
    check("MSG-5 over-long message refused", !long.stored && long.err?.code === "TOO_LONG", long.err?.code);
    const out = await act(alice, "server:channel:message:edit", { serverId: S, channelId: NOATT, messageId: uuid(3), newText: "y".repeat(5000) });
    check("MSG-5 over-long edit refused", rows().find((r) => r.id === uuid(3)).content === "harmless" && out.some((o) => o.payload?.code === "TOO_LONG"));
  }

  // MSG-6 / SK-4
  {
    const editTo = async (text) => {
      await act(alice, "server:channel:message:edit", { serverId: S, channelId: NOATT, messageId: uuid(3), newText: text });
      return rows().find((r) => r.id === uuid(3)).content;
    };
    check("SK-4 edit to a link refused without EMBED_LINKS", (await editTo("see https://evil.example/phish")) === "harmless");
    check("SK-4 edit to @everyone refused without MENTION_EVERYONE", (await editTo("hey @everyone")) === "harmless");
    check("SK-4 edit runs the word filter", (await editTo("this badword here")) === "harmless");
    shared.systemConfig.chatFrozen = true;
    const frozen = await editTo("edited while frozen");
    shared.systemConfig.chatFrozen = false;
    check("SK-4 edit refused while chat is frozen", frozen === "harmless");
    check("SK-4 a clean edit still works", (await editTo("clean edit")) === "clean edit");
  }

  // MSG-7 / MSG-11
  {
    const before = rows().filter((r) => r.channel_id === SLOW).length;
    await Promise.all([1, 2, 3, 4, 5].map((i) => (i % 2 ? alice : alice2).call("server:channel:message", { serverId: S, channelId: SLOW, tempId: `f${i}`, content: `spam ${i}` })));
    await settle(20);
    const stored = rows().filter((r) => r.channel_id === SLOW).length - before;
    check("MSG-7 parallel sends in slowmode store one message", stored === 1, `stored=${stored}`);
    for (const r of rows().filter((x) => x.channel_id === SLOW)) {
      await act(alice, "server:channel:message:delete", { serverId: S, channelId: SLOW, messageId: r.id });
    }
    const again = await send(alice, SLOW, { content: "after delete" });
    check("MSG-11 deleting your message does not reset slowmode", !again.stored && again.err?.code === "SLOWMODE", again.err?.code);
  }

  // MSG-10: site-wide timeout
  {
    shared.timedOutUsers.set("u-plat", { until: future, category: "other", reason: "test" });
    await act(plat, "server:channel:message:edit", { serverId: S, channelId: TXT, messageId: uuid(5), newText: "edited" });
    check("MSG-10 site-wide timeout blocks edit", rows().find((r) => r.id === uuid(5)).content === "plat msg");
    await act(plat, "server:channel:message:pin", { serverId: S, channelId: TXT, messageId: uuid(1) });
    check("MSG-10 site-wide timeout blocks pin", !rows().find((r) => r.id === uuid(1)).pinned_at);
    shared.timedOutUsers.delete("u-plat");
  }

  // MSG-16
  {
    const extra = [];
    for (let i = 0; i < 50; i += 1) extra.push({ id: uuid(1000 + i), server_id: S, channel_id: TXT, sender_id: "u-alice", content: `p${i}`, pinned_at: new Date().toISOString(), created_at: new Date().toISOString() });
    rows().push(...extra);
    await act(mod2, "server:channel:message:pin", { serverId: S, channelId: TXT, messageId: uuid(4) });
    check("MSG-16 pin refused past the per-channel cap", !rows().find((r) => r.id === uuid(4)).pinned_at);
    fake._tables.server_messages.rows = rows().filter((r) => !extra.includes(r));
  }
}

async function reactionTests() {
  const { registerSocketHandlers } = require("../socket/handlers");
  const sio = {
    _conn: null,
    on(ev, fn) { if (ev === "connection") this._conn = fn; },
    to(room) { return { emit: (event, payload) => emitted.push({ room, event, payload }), to: () => sio.to(room) }; },
    in(room) { return { ...sio.to(room), socketsLeave() {}, socketsJoin() {}, fetchSockets: async () => [] }; },
    emit() {},
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    of() { return sio; },
    fetchSockets: async () => [],
  };
  registerSocketHandlers(sio);
  const mk = async (userId) => {
    const handlers = new Map();
    const sock = {
      id: `rsock-${userId}`, user: { id: userId, username: userId.slice(2) }, handshake: { auth: {} }, data: {}, rooms: new Set(),
      on(ev, fn) { handlers.set(ev, fn); }, onAny() {}, use() {}, emit() {},
      join(r) { (Array.isArray(r) ? r : [r]).forEach((x) => sock.rooms.add(x)); }, leave(r) { sock.rooms.delete(r); },
      to() { return { emit() {} }; }, broadcast: { emit() {}, to: () => ({ emit() {} }) }, disconnect() {},
    };
    sio.sockets.sockets.set(sock.id, sock);
    sio._conn(sock);
    await settle(40);
    const call = (ev, payload) => new Promise((resolve) => {
      const t = setTimeout(() => resolve({ ok: "timeout" }), 1500);
      handlers.get(ev)(payload, (res) => { clearTimeout(t); resolve(res); });
    });
    return { call };
  };
  const alice = await mk("u-alice");
  const react = (who, emoji, messageId = uuid(4)) => who.call("reaction:add", { messageId, conversationType: "server", conversationId: TXT, emoji });

  const long = await react(alice, "x".repeat(500));
  check("MSG-9 500-char reaction refused", long.ok === false);
  const obj = await react(alice, { a: 1 });
  check("MSG-9 non-string reaction refused", obj.ok === false);
  const text = await react(alice, "slur text");
  check("MSG-9 plain-text reaction refused", text.ok === false);
  const okRes = await react(alice, "👍");
  check("MSG-9 a real emoji is accepted", okRes.ok === true);
  const custom = await react(alice, "<:party:123456789012345678>");
  check("MSG-9 a custom emoji token is accepted", custom.ok === true);
  const emojis = ["😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊", "😋", "😎", "😍", "😘", "🥰", "😗", "😙", "😚"];
  for (const e of emojis) await react(alice, e);
  const distinct = new Set(fake._tables.reactions.rows.filter((r) => r.message_id === uuid(4)).map((r) => r.emoji)).size;
  const over = await react(alice, "🙂");
  check("MSG-9 distinct reactions per message capped at 20", distinct === 20 && over.ok === false, `distinct=${distinct}`);

  // MSG-15: bob is server-timed-out and still removes his own reaction.
  fake._tables.reactions.rows.push({ message_id: uuid(4), conversation_type: "server", conversation_id: TXT, user_id: "u-bob", emoji: "👍" });
  const bob = await mk("u-bob");
  const rm = await bob.call("reaction:remove", { messageId: uuid(4), conversationType: "server", conversationId: TXT, emoji: "👍" });
  check("MSG-15 timed-out member removes their own reaction", rm.ok === true && !fake._tables.reactions.rows.some((r) => r.user_id === "u-bob"));
  const bobAdd = await react(bob, "👍");
  check("MSG-15 timed-out member still cannot add a reaction", bobAdd.ok === false);

  // MSG-10: site-wide timeout blocks reactions.
  shared.timedOutUsers.set("u-alice", { until: future, category: "other", reason: "test" });
  const plat = await react(alice, "👍", uuid(1));
  shared.timedOutUsers.delete("u-alice");
  check("MSG-10 site-wide timeout blocks reaction:add", plat.ok === false);
}

async function raceTests() {
  // CA-1: the join's permission check reads membership, then the kick lands, then the join completes.
  const { dropUserFromServer } = require("../lib/serverRooms");
  const victim = makeSocket("u-victim");
  const realFrom = fake.from.bind(fake);
  let gate = null;
  fake.from = (name) => {
    const q = realFrom(name);
    if (name === "server_channel_overrides" && gate) {
      const g = gate;
      gate = null;
      const origThen = q.then.bind(q);
      q.then = (res, rej) => g.then(() => origThen(res, rej));
    }
    return q;
  };
  let release;
  gate = new Promise((r) => { release = r; });
  const joinP = victim.call("server:channel:join", STAFF);
  await settle(10);
  fake._tables.server_members.rows = fake._tables.server_members.rows.filter((r) => r.user_id !== "u-victim");
  await dropUserFromServer(io, S, "u-victim", "kick");
  release();
  await joinP;
  await settle(30);
  fake.from = realFrom;
  check("CA-1 a join racing a kick does not leave the kicked socket in the room", !victim.s.rooms.has(`server-channel:${STAFF}`));

  // CA-2: eviction cost per channel is bounded, not per socket.
  const { evictUnauthorizedChannelSockets } = require("../lib/serverAccessRealtime");
  const fakeSocks = [];
  for (let i = 0; i < 30; i += 1) {
    const uid = `u-bulk${i}`;
    fake._tables.server_members.rows.push({ server_id: S, user_id: uid });
    const s = { user: { id: uid }, rooms: new Set(), join(r) { s.rooms.add(r); if (!roomMembers.has(r)) roomMembers.set(r, new Set()); roomMembers.get(r).add(s); }, leave(r) { s.rooms.delete(r); roomMembers.get(r)?.delete(s); }, emit() {} };
    s.join(`server-channel:${STAFF}`);
    fakeSocks.push(s);
  }
  fake._tables.server_channel_overrides.rows.push({ id: "ov-staff", channel_id: STAFF, target_type: "role", target_id: R.every, allow_permissions: "0", deny_permissions: toPgBigint(F.VIEW_CHANNEL) });
  let queries = 0;
  fake.from = (name) => { queries += 1; return realFrom(name); };
  await evictUnauthorizedChannelSockets(io, S, { channelId: STAFF });
  fake.from = realFrom;
  const left = fakeSocks.filter((s) => s.rooms.has(`server-channel:${STAFF}`)).length;
  check("CA-2 every socket that lost VIEW_CHANNEL is evicted", left === 0, `left=${left}`);
  check("CA-2 eviction uses a bounded number of queries", queries <= 20, `queries=${queries}`);

  // CA-2 scoping: a change limited to one channel leaves other rooms alone, and a
  // member who lost the channel loses its unread row (CA-6).
  const other = { user: { id: "u-alice" }, rooms: new Set(), join(r) { other.rooms.add(r); if (!roomMembers.has(r)) roomMembers.set(r, new Set()); roomMembers.get(r).add(other); }, leave(r) { other.rooms.delete(r); roomMembers.get(r)?.delete(other); }, emit() {} };
  other.join(`server-channel:${STAFF}`);
  other.join(`server-channel:${TXT}`);
  fake._tables.server_channel_reads.rows.push({ user_id: "u-alice", channel_id: STAFF, unread_count: 3 });
  fake._tables.server_channel_overrides.rows.push({ id: "ov-txt", channel_id: TXT, target_type: "member", target_id: "u-alice", allow_permissions: "0", deny_permissions: toPgBigint(F.VIEW_CHANNEL) });
  await evictUnauthorizedChannelSockets(io, S, { channelId: STAFF });
  check("CA-2 scoped eviction removes the socket from the changed channel", !other.rooms.has(`server-channel:${STAFF}`));
  check("CA-2 scoped eviction does not re-check other channels", other.rooms.has(`server-channel:${TXT}`));
  check("CA-6 the evicted member's unread row for that channel is gone", !fake._tables.server_channel_reads.rows.some((r) => r.user_id === "u-alice" && r.channel_id === STAFF));
  await evictUnauthorizedChannelSockets(io, S, {});
  check("CA-2 an unscoped run checks every channel", !other.rooms.has(`server-channel:${TXT}`));
  fake._tables.server_channel_overrides.rows = fake._tables.server_channel_overrides.rows.filter((r) => r.id !== "ov-txt");
}

async function ownerTimeoutTest() {
  // A timeout row left on the owner (e.g. from before an ownership transfer) holds nothing.
  fake._tables.server_members.rows.find((r) => r.user_id === "u-own").timeout_until = future;
  const own = makeSocket("u-own");
  const r = await send(own, TXT, { content: "owner still talks" });
  check("Owner is exempt from a server timeout row (send)", r.stored && !r.err, r.err?.code);
  await act(own, "server:channel:message:pin", { serverId: S, channelId: TXT, messageId: uuid(4) });
  check("Owner is exempt from a server timeout row (pin)", Boolean(rows().find((x) => x.id === uuid(4))?.pinned_at));
  fake._tables.server_members.rows.find((x) => x.user_id === "u-own").timeout_until = null;
}

(async () => {
  await messageTests();
  await reactionTests();
  await raceTests();
  await ownerTimeoutTest();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
