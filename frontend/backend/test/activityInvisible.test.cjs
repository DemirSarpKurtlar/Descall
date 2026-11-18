"use strict";
// Regression (polish scan 17 Nov 2026, world-social-04): a user set to Görünmez still
// broadcast "playing X" to friends, which showed they were online. Live activity is
// held back while invisible, cleared on going invisible and re-sent on coming back.
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
const path = require("path");
const assert = require("assert");
const B = path.join(__dirname, "..");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const X = "11111111-1111-4111-8111-111111111111";
const F = "22222222-2222-4222-8222-222222222222";
const fake = createFakeSupabase({
  friendships: [{ id: "f1", user_id: X, friend_id: F, status: "accepted" }],
  user_activity_settings: [],
  user_presence: [],
});
const sp = require.resolve(path.join(B, "db/supabase"));
require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: fake };

const { presence } = require(path.join(B, "runtime/sharedState"));
const { registerActivityHandlers, onPresenceStatusChange } = require(path.join(B, "socket/activityHandlers"));

const got = [];
const friendSock = { id: "sf", user: { id: F }, emit: (ev, p) => got.push([ev, p]), on() {} };
const handlers = {};
const mySock = { id: "sx", user: { id: X, username: "x" }, emit() {}, on: (ev, fn) => { handlers[ev] = fn; } };
// Broadcasts go to friends' user rooms: io.to(["user:<id>", ...]).emit(...).
const roomMembers = { [`user:${F}`]: [friendSock], [`user:${X}`]: [mySock] };
const io = {
  sockets: { sockets: new Map([["sf", friendSock], ["sx", mySock]]) },
  to: (rooms) => ({
    emit: (ev, p) => {
      const seen = new Set();
      for (const r of [].concat(rooms)) for (const s of roomMembers[r] || []) if (!seen.has(s)) { seen.add(s); s.emit(ev, p); }
    },
  }),
};
const tick = () => new Promise((r) => setTimeout(r, 30));

(async () => {
  registerActivityHandlers(io, mySock);
  assert.ok(handlers["activity:update"], "handler registered");

  presence.set(X, { status: "invisible", socketId: "sx" });
  await handlers["activity:update"]({ appName: "Counter-Strike 2", appType: "game" });
  await tick();
  assert.ok(!got.some(([ev]) => ev === "activity:friend:update"), "invisible: no live activity to friends");
  await handlers["activity:manual"]({ displayName: "Ders" });
  await tick();
  assert.ok(!got.some(([ev]) => ev === "activity:friend:update"), "invisible: no manual activity either");

  // Coming back re-sends the stored row.
  presence.set(X, { status: "online", socketId: "sx" });
  await onPresenceStatusChange(io, X, "x", "invisible", "online");
  const back = got.find(([ev]) => ev === "activity:friend:update");
  assert.ok(back && back[1].userId === X, "back online: stored activity re-sent");

  // Going invisible clears it on friends' screens.
  got.length = 0;
  await onPresenceStatusChange(io, X, "x", "online", "invisible");
  assert.ok(got.some(([ev, p]) => ev === "activity:friend:clear" && p.userId === X), "going invisible clears");

  // Online users still broadcast.
  got.length = 0;
  presence.set(X, { status: "online", socketId: "sx" });
  await handlers["activity:update"]({ appName: "Minecraft", appType: "game" });
  await tick();
  assert.ok(got.some(([ev]) => ev === "activity:friend:update"), "online: broadcast");
  console.log("activityInvisible test ok");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
