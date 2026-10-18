"use strict";
// node frontend/backend/lib/presenceFanout.selftest.cjs
const assert = require("assert");
const { EventEmitter } = require("events");
const { createPresenceFanout, legacyIntervalMs, scopeKeyForRoom } = require("./presenceFanout");

function fakeIo() {
  const rooms = new Map();
  const sockets = new Map();
  const adapter = new EventEmitter();
  adapter.rooms = rooms;
  const global = [];
  const io = {
    sockets: { sockets, adapter },
    of: () => ({ adapter }),
    emit: (ev, data) => global.push({ ev, data }),
    global,
  };
  io.connect = (uid, { delta = false } = {}) => {
    const id = `${uid}#${sockets.size + 1}`;
    const sent = [];
    const sock = {
      id,
      user: { id: uid },
      data: { presenceDelta: delta },
      sent,
      emit: (ev, data) => sent.push({ ev, data }),
      join(room) {
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room).add(id);
        adapter.emit("join-room", room, id);
      },
    };
    sockets.set(id, sock);
    sock.join(`user:${uid}`);
    return sock;
  };
  io.drop = (sock) => {
    sockets.delete(sock.id);
    for (const set of rooms.values()) set.delete(sock.id);
  };
  return io;
}

function setup({ memberships = {}, enabled = true } = {}) {
  const io = fakeIo();
  const presence = new Map();
  const friends = new Map();
  let t = 1_000_000;
  const timers = [];
  const fan = createPresenceFanout({
    io,
    presence,
    friends,
    buildEntry: (id) => {
      const p = presence.get(id);
      if (!p || p.status === "invisible") return null;
      return { id, status: p.status };
    },
    loadMemberships: async (uid) => memberships[uid] || [],
    isEnabled: () => enabled,
    now: () => t,
    setTimer: (fn) => {
      timers.push(fn);
      return { unref() {} };
    },
    clearTimer: () => {},
  });
  fan.attach();
  const online = async (uid, opts) => {
    const sock = io.connect(uid, opts);
    presence.set(uid, { status: "online" });
    await fan.userOnline(uid);
    return sock;
  };
  const tick = (ms = 600) => {
    t += ms;
    const due = timers.splice(0);
    for (const fn of due) fn();
  };
  return { io, presence, friends, fan, online, tick, advance: (ms) => (t += ms) };
}

const last = (sock, ev) => [...sock.sent].reverse().find((m) => m.ev === ev)?.data;
const count = (sock, ev) => sock.sent.filter((m) => m.ev === ev).length;
const ids = (list) => (list || []).map((u) => u.id).sort();

(async () => {
  // helpers
  assert.strictEqual(scopeKeyForRoom("server:7"), "s:7");
  assert.strictEqual(scopeKeyForRoom("group:9"), "g:9");
  assert.strictEqual(scopeKeyForRoom("user:1"), null);
  assert.strictEqual(legacyIntervalMs(0), 2000);
  assert.strictEqual(legacyIntervalMs(100), 4000);
  assert.strictEqual(legacyIntervalMs(1e6), 30000);

  // 1. Strangers never see each other; friends do; snapshot includes self.
  {
    const h = setup();
    h.friends.set("a", new Set(["b"]));
    h.friends.set("b", new Set(["a"]));
    const a = await h.online("a");
    const b = await h.online("b");
    const c = await h.online("c");
    h.tick();
    assert.deepStrictEqual(ids(last(a, "users:update")), ["a", "b"]);
    assert.deepStrictEqual(ids(last(b, "users:update")), ["a", "b"]);
    assert.deepStrictEqual(ids(last(c, "users:update")), ["c"]);
    assert.strictEqual(h.io.global.length, 0, "no global io.emit");
  }

  // 2. Shared server membership (from DB) puts members in scope.
  {
    const h = setup({ memberships: { a: ["s:1"], d: ["s:1", "g:5"], e: ["g:5"] } });
    const a = await h.online("a");
    const d = await h.online("d");
    const e = await h.online("e");
    h.tick();
    assert.deepStrictEqual(ids(last(a, "users:update")), ["a", "d"]);
    assert.deepStrictEqual(ids(last(d, "users:update")), ["a", "d", "e"]);
    assert.deepStrictEqual(ids(last(e, "users:update")), ["d", "e"]);
  }

  // 3. Live room join (new group) widens scope without a DB reload.
  {
    const h = setup();
    const a = await h.online("a");
    const b = await h.online("b");
    h.tick();
    assert.deepStrictEqual(ids(last(a, "users:update")), ["a"]);
    a.join("group:42");
    b.join("group:42");
    h.advance(5000);
    h.tick();
    assert.deepStrictEqual(ids(last(a, "users:update")), ["a", "b"]);
    assert.deepStrictEqual(ids(last(b, "users:update")), ["a", "b"]);
  }

  // 4. Delta clients get presence:delta after the first snapshot.
  {
    const h = setup();
    h.friends.set("a", new Set(["b"]));
    h.friends.set("b", new Set(["a"]));
    const a = await h.online("a", { delta: true });
    h.tick();
    assert.deepStrictEqual(ids(last(a, "users:update")), ["a"]);
    const snapsBefore = count(a, "users:update");
    await h.online("b");
    h.tick();
    // b's own snapshot was requested, a only needs a delta
    assert.strictEqual(count(a, "users:update"), snapsBefore);
    assert.deepStrictEqual(last(a, "presence:delta"), { up: [{ id: "b", status: "online" }], rm: [] });
    // status change → delta
    h.presence.set("b", { status: "dnd" });
    h.fan.markDirty("b");
    h.tick();
    assert.deepStrictEqual(last(a, "presence:delta").up, [{ id: "b", status: "dnd" }]);
    // invisible → removal, never an entry
    h.presence.set("b", { status: "invisible" });
    h.fan.markDirty("b");
    h.tick();
    assert.deepStrictEqual(last(a, "presence:delta"), { up: [], rm: ["b"] });
    // offline → removal
    h.presence.set("b", { status: "online" });
    h.fan.markDirty("b");
    h.tick();
    h.presence.delete("b");
    h.fan.userOffline("b");
    h.tick();
    assert.deepStrictEqual(last(a, "presence:delta"), { up: [], rm: ["b"] });
  }

  // 5. Legacy sockets are rate limited, then get the latest state.
  {
    const h = setup();
    h.friends.set("a", new Set(["b"]));
    h.friends.set("b", new Set(["a"]));
    const a = await h.online("a");
    h.tick();
    const n0 = count(a, "users:update");
    await h.online("b");
    h.tick(10); // within 2 s of a's last snapshot
    assert.strictEqual(count(a, "users:update"), n0, "rate limited");
    h.presence.set("b", { status: "idle" });
    h.fan.markDirty("b");
    h.tick(10);
    assert.strictEqual(count(a, "users:update"), n0);
    h.advance(2500);
    h.tick(0);
    assert.strictEqual(count(a, "users:update"), n0 + 1);
    assert.deepStrictEqual(last(a, "users:update").find((u) => u.id === "b"), { id: "b", status: "idle" });
  }

  // 6. Unfriend: refreshUsers resends both rosters without the other.
  {
    const h = setup();
    h.friends.set("a", new Set(["b"]));
    h.friends.set("b", new Set(["a"]));
    const a = await h.online("a", { delta: true });
    const b = await h.online("b", { delta: true });
    h.tick();
    assert.deepStrictEqual(ids(last(a, "users:update")), ["a", "b"]);
    h.friends.get("a").delete("b");
    h.friends.get("b").delete("a");
    h.fan.refreshUsers("a", "b");
    h.tick();
    assert.deepStrictEqual(ids(last(a, "users:update")), ["a"]);
    assert.deepStrictEqual(ids(last(b, "users:update")), ["b"]);
  }

  // 7. Kill switch: flag off = one global roster per flush (legacy behaviour).
  {
    const h = setup({ enabled: false });
    await h.online("a");
    await h.online("b");
    h.tick();
    assert.strictEqual(h.io.global.length, 1, "coalesced global emit");
    assert.deepStrictEqual(ids(h.io.global[0].data), ["a", "b"]);
  }

  // 8. Scale sanity: 300 users in 30 friend circles of 10 → bytes ≪ global.
  {
    const h = setup();
    const socks = [];
    for (let i = 0; i < 300; i++) {
      const circle = Math.floor(i / 10);
      const f = new Set();
      for (let j = circle * 10; j < circle * 10 + 10; j++) if (j !== i) f.add(`u${j}`);
      h.friends.set(`u${i}`, f);
    }
    for (let i = 0; i < 300; i++) socks.push(await h.online(`u${i}`, { delta: i % 2 === 0 }));
    h.advance(5000);
    h.tick();
    let entries = 0;
    for (const s of socks) for (const m of s.sent) entries += (m.ev === "users:update" ? m.data.length : m.data.up?.length || 0);
    // global roster would be ~300 × 300 / 2 = 45,000 entries just for the joins
    assert.ok(entries < 300 * 12, `entries=${entries}`);
    for (const s of socks) assert.ok(ids(last(s, "users:update")).length <= 10);
  }

  console.log("presenceFanout.selftest.cjs: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
