"use strict";
/**
 * 2.11.1 security: a logged-in socket cannot join someone else's user room or
 * the admin room, and cannot inject room:message events.
 * Run: node frontend/backend/socket/roomJoinRemoved.selftest.cjs
 */
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const fs = require("fs");
const path = require("path");
const { createFakeSupabase } = require("../test/fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: createFakeSupabase({ users: [{ id: "eve", username: "eve" }, { id: "bob", username: "bob" }] }),
};
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };

function assert(c, m) { if (!c) throw new Error("FAIL: " + m); }

const emitted = [];
const io = {
  _conn: null,
  on(ev, fn) { if (ev === "connection") this._conn = fn; },
  to(room) { return { emit: (ev, data) => emitted.push({ room, ev, data }), to: () => this.to(room) }; },
  in(room) { return this.to(room); },
  emit() {},
  sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
  of() { return this; },
  fetchSockets: async () => [],
};
const handlers = new Map();
const joined = new Set();
const socket = {
  id: "sock-eve",
  user: { id: "eve", username: "eve" },
  handshake: { auth: {} },
  data: {},
  rooms: joined,
  on(ev, fn) { handlers.set(ev, fn); },
  onAny() {}, use() {},
  emit() {},
  join(r) { (Array.isArray(r) ? r : [r]).forEach((x) => joined.add(x)); },
  leave(r) { joined.delete(r); },
  to(room) { return io.to(room); },
  broadcast: { emit() {}, to: (r) => io.to(r) },
  disconnect() {},
};
io.sockets.sockets.set(socket.id, socket);

const { registerSocketHandlers } = require("./handlers");
registerSocketHandlers(io);
io._conn(socket);

assert(handlers.size > 10, "handlers registered");
assert(handlers.has("app:ping"), "sanity: app:ping registered");
assert(!handlers.has("room:join"), "room:join handler must not exist");
assert(!handlers.has("room:message"), "room:message handler must not exist");

// Even if a client sends them, nothing joins or broadcasts.
for (const ev of ["room:join", "room:message"]) {
  const fn = handlers.get(ev);
  if (fn) fn(ev === "room:join" ? "user:bob" : { roomId: "user:bob", text: "x" });
}
assert(!joined.has("user:bob"), "cannot join user:<other>");
assert(!joined.has("admin"), "non-admin cannot join admin");
assert(joined.has("user:eve"), "joins own user room");
assert(!emitted.some((e) => e.ev === "room:message:new"), "no room:message:new injected");

const src = fs.readFileSync(path.join(__dirname, "handlers.js"), "utf8");
assert(!/socket\.on\(\s*["']room:(join|message)["']/.test(src), "source has no room:join/room:message");
assert(!src.includes("room:message:new"), "no room:message:new broadcast left in source");

console.log("roomJoinRemoved.selftest.cjs: ok");
process.exit(0);
