"use strict";

/**
 * Hybrid routing decision (lib/cluster/routing.js), pure + fake cluster:
 *  - load rule: Render > renderHighPct -> PC, PC > pcHighPct -> Render
 *  - hysteresis: band + dwell, no flapping around the thresholds
 *  - sticky per tab session (sid) and the prev hint
 *  - schedule in Europe/Istanbul across midnight and the week wrap, same UTC+3 in winter and
 *    summer (Turkey has no DST since 2016)
 *  - game mode (share and full handover), PC down / draining / unregistered / revoked key
 *  - single-node mode answers this node
 *  - secondary runtime: out of schedule -> drain + auto pause -> back in schedule -> resume
 */

const assert = require("assert");
const routing = require("../lib/cluster/routing");
const { createRouter, createNodeRuntime, inSchedule, zonedParts, nextMode, pcEligibility, pcShareMb, loadRule } = routing;

let t = Date.parse("2026-11-20T12:00:00Z"); // Friday 15:00 in Istanbul
const now = () => t;

function fakeCluster({ enabled = true, role = "primary", nodeId = "render" } = {}) {
  const c = {
    enabled: () => enabled,
    nodeId,
    role,
    publicUrl: role === "primary" ? "https://des-call.onrender.com" : "https://pc.descall.com",
    nodes: [],
    cfg: {
      ramMb: 4096,
      loadRule: { renderHighPct: 60, pcHighPct: 85 },
      gameMode: { enabled: true, shareMb: 1024, fullHandover: false },
      schedule: { tz: "Europe/Istanbul", slots: [] },
    },
    states: [],
    events: [],
    published: [],
    async getNodes() {
      return c.nodes;
    },
    async getCfg() {
      return c.cfg;
    },
    async setNodeState(id, state, reason) {
      c.states.push({ id, state, reason });
      const n = c.nodes.find((x) => x.id === id);
      if (n) n.state = state;
    },
    async pushEvent(kind, detail) {
      c.events.push({ kind, detail });
    },
    publish(ch, msg) {
      c.published.push({ ch, msg });
    },
    subscribe() {
      return () => {};
    },
  };
  return c;
}

function render(pct) {
  return { id: "render", role: "primary", url: "https://des-call.onrender.com", memRss: (512 * pct) / 100, memLimit: 512, state: "active", lastBeat: t };
}
function pc(pct, extra = {}) {
  return { id: "pc-home", role: "secondary", url: "https://pc.descall.com", memRss: (4096 * pct) / 100, memLimit: 4096, state: "active", gameMode: false, lastBeat: t, ...extra };
}

async function d(r, c, hint) {
  for (const n of c.nodes) if (!n.keepBeat) n.lastBeat = t;
  return r.decide(hint);
}

(async () => {
  /* ---------- nextMode (pure) ---------- */
  const rule = loadRule({ loadRule: { renderHighPct: 60, pcHighPct: 85 } });
  assert.strictEqual(nextMode("primary", { renderPct: 59, pcPct: 10, rule }), "primary", "Render under 60: stay");
  assert.strictEqual(nextMode("primary", { renderPct: 61, pcPct: 10, rule }), "pc", "Render over 60: PC");
  assert.strictEqual(nextMode("primary", { renderPct: 61, pcPct: 80, rule }), "primary", "PC inside the band below its cap: no switch");
  assert.strictEqual(nextMode("pc", { renderPct: 55, pcPct: 50, rule }), "pc", "Render 55 (inside the band): stay on the PC");
  assert.strictEqual(nextMode("pc", { renderPct: 45, pcPct: 50, rule }), "primary", "Render back under 50: Render");
  assert.strictEqual(nextMode("pc", { renderPct: 45, pcPct: 50, rule, sinceMs: 1000 }), "pc", "dwell: no switch back within 30 s");
  assert.strictEqual(nextMode("pc", { renderPct: 70, pcPct: 85, rule, sinceMs: 0 }), "primary", "PC at its cap: Render at once, dwell or not");
  assert.strictEqual(nextMode("primary", { renderPct: 70, pcPct: 61, rule, sinceMs: 0 }), "primary", "dwell also holds a new switch to the PC");
  assert.strictEqual(nextMode("primary", { renderPct: 95, pcPct: 10, rule: { ...rule, enabled: false } }), "primary", "load rule off: Render only");
  assert.strictEqual(nextMode("primary", { renderPct: 5, pcPct: 10, rule: { ...rule, preferPc: true } }), "pc", "preferPc: PC first");
  assert.strictEqual(nextMode("pc", { renderPct: 5, pcPct: 86, rule: { ...rule, preferPc: true } }), "primary", "preferPc: overflow to Render");

  /* ---------- schedule (Europe/Istanbul, UTC+3 all year) ---------- */
  const fri = { tz: "Europe/Istanbul", slots: [{ d: 5, from: "18:00", to: "02:00" }] };
  assert.deepStrictEqual(zonedParts(Date.parse("2026-11-20T15:00:00Z")), { day: 5, minutes: 18 * 60 }, "15:00Z = Fri 18:00 Istanbul");
  assert.strictEqual(inSchedule(fri, Date.parse("2026-11-20T14:59:00Z")), false, "Fri 17:59: out");
  assert.strictEqual(inSchedule(fri, Date.parse("2026-11-20T15:00:00Z")), true, "Fri 18:00: in");
  assert.strictEqual(inSchedule(fri, Date.parse("2026-11-20T22:59:00Z")), true, "Sat 01:59 (past midnight): in");
  assert.strictEqual(inSchedule(fri, Date.parse("2026-11-20T23:00:00Z")), false, "Sat 02:00: out");
  assert.strictEqual(inSchedule(fri, Date.parse("2026-11-21T15:30:00Z")), false, "Sat 18:30: no Saturday slot");
  // Summer and winter: same offset (a DST zone like Europe/Berlin would shift by an hour).
  for (const [winter, summer] of [["2026-01-09T15:00:00Z", "2026-07-10T15:00:00Z"], ["2026-01-09T14:59:00Z", "2026-07-10T14:59:00Z"]]) {
    assert.strictEqual(inSchedule(fri, Date.parse(winter)), inSchedule(fri, Date.parse(summer)), `no DST shift ${winter} / ${summer}`);
  }
  assert.strictEqual(inSchedule(fri, Date.parse("2026-07-10T15:00:00Z")), true, "July Fri 18:00 Istanbul is 15:00Z");
  assert.strictEqual(inSchedule({ tz: "Europe/Berlin", slots: fri.slots }, Date.parse("2026-07-10T15:00:00Z")), false, "control: Berlin is UTC+2 in July");
  const satNight = { slots: [{ d: 6, from: "22:00", to: "03:00" }] };
  assert.strictEqual(inSchedule(satNight, Date.parse("2026-11-21T23:30:00Z")), true, "Sun 02:30 from a Saturday slot (week wrap)");
  assert.strictEqual(inSchedule(satNight, Date.parse("2026-11-22T00:30:00Z")), false, "Sun 03:30: out");
  assert.strictEqual(inSchedule({ slots: [] }, t), true, "no slots: always on");
  assert.strictEqual(inSchedule({ enabled: false, slots: fri.slots }, Date.parse("2026-11-21T09:00:00Z")), true, "schedule off: always on");
  assert.strictEqual(inSchedule({ slots: [{ d: 1, from: "09:00", to: "17:00" }] }, Date.parse("2026-11-23T10:00:00Z")), true, "Mon 13:00 inside a day slot");
  assert.strictEqual(inSchedule({ slots: [{ d: 1, from: "bad", to: "17:00" }] }, Date.parse("2026-11-23T10:00:00Z")), false, "invalid slot ignored");

  /* ---------- eligibility ---------- */
  const cfg = fakeCluster().cfg;
  assert.ok(pcEligibility(pc(10), cfg, t).ok, "alive + active");
  assert.strictEqual(pcEligibility(pc(10, { lastBeat: t - 16_000 }), cfg, t).reason, "down", "no beat for 16 s: down");
  assert.strictEqual(pcEligibility(pc(10, { state: "draining" }), cfg, t).reason, "state:draining");
  assert.strictEqual(pcEligibility(pc(10, { state: "paused" }), cfg, t).reason, "state:paused");
  assert.strictEqual(pcEligibility(pc(10), cfg, t, { registered: false }).reason, "unregistered");
  assert.strictEqual(pcEligibility(pc(10, { gameMode: true }), { ...cfg, gameMode: { enabled: true, shareMb: 1024, fullHandover: true } }, t).reason, "game", "full handover");
  assert.ok(pcEligibility(pc(10, { gameMode: true }), cfg, t).ok, "game with a share: still eligible");
  assert.strictEqual(pcShareMb(pc(10, { gameMode: true }), cfg), 1024, "game share caps the RAM share");
  assert.strictEqual(pcShareMb(pc(10, { gameMode: true }), { ...cfg, gameMode: { enabled: false, shareMb: 1024 } }), 4096, "game mode off in cfg: full share");
  assert.strictEqual(pcEligibility(pc(10), { ...cfg, schedule: { slots: [{ d: 0, from: "10:00", to: "11:00" }] } }, t).reason, "schedule");

  /* ---------- decide(): single node ---------- */
  {
    const c = fakeCluster({ enabled: false });
    const r = createRouter({ cluster: c, now });
    const a = await r.decide({});
    assert.deepStrictEqual([a.nodeId, a.url, a.socketUrl], ["render", "https://des-call.onrender.com", "https://des-call.onrender.com"], "single-node: self");
    assert.ok(a.ttlSec > 0);
  }

  /* ---------- decide(): load rule + hysteresis + sticky ---------- */
  {
    const c = fakeCluster();
    const r = createRouter({ cluster: c, now, dwellMs: 30_000 });
    c.nodes = [render(40), pc(10)];
    assert.strictEqual((await d(r, c, {})).nodeId, "render", "Render 40 %: Render");
    c.nodes = [render(65), pc(10)];
    const a = await d(r, c, { sid: "tab-aaaaaaaa" });
    assert.strictEqual(a.nodeId, "pc-home", "Render 65 %: new user to the PC");
    assert.strictEqual(a.url, "https://pc.descall.com");
    t += 1000;
    c.nodes = [render(55), pc(30)];
    assert.strictEqual((await d(r, c, {})).nodeId, "pc-home", "Render 55 % (inside band): still the PC, no flap");
    t += 1000;
    c.nodes = [render(45), pc(30)];
    assert.strictEqual((await d(r, c, {})).nodeId, "pc-home", "Render 45 % but within dwell: PC");
    t += 31_000;
    assert.strictEqual((await d(r, c, {})).nodeId, "render", "Render 45 % after dwell: back to Render");
    assert.strictEqual((await d(r, c, { sid: "tab-aaaaaaaa" })).nodeId, "pc-home", "sticky: that tab stays on the PC");
    assert.strictEqual((await d(r, c, { prev: "pc-home" })).nodeId, "pc-home", "prev hint keeps the PC too");
    c.nodes = [render(70), pc(86)];
    assert.strictEqual((await d(r, c, { sid: "tab-aaaaaaaa" })).nodeId, "render", "PC over its cap: even the sticky tab goes to Render");
    t += 1000;
    c.nodes = [render(70), pc(80)];
    assert.strictEqual((await d(r, c, {})).nodeId, "render", "PC 80 % (inside band under 85): no flap back yet");
    t += 31_000;
    c.nodes = [render(70), pc(60)];
    assert.strictEqual((await d(r, c, {})).nodeId, "pc-home", "PC 60 %: the PC again");

    // PC down: no beat for 16 s.
    c.nodes = [render(90), pc(10, { lastBeat: t - 16_000, keepBeat: true })];
    const down = await d(r, c, { sid: "tab-aaaaaaaa" });
    assert.strictEqual(down.nodeId, "render", "PC down: Render even at 90 %");
    assert.strictEqual(down.url, "https://des-call.onrender.com");
    c.nodes = [render(90), pc(10, { state: "draining" })];
    assert.strictEqual((await d(r, c, {})).nodeId, "render", "PC draining: Render");
    c.nodes = [render(90), pc(10, { gameMode: true })];
    c.cfg.gameMode.fullHandover = true;
    assert.strictEqual((await d(r, c, {})).nodeId, "render", "full-handover game: Render");
    c.cfg.gameMode.fullHandover = false;
    t += 31_000;
    c.nodes = [render(90), pc(30, { gameMode: true })]; // 30 % of 4096 = 1229 MB > 1024 MB share
    assert.strictEqual((await d(r, c, {})).nodeId, "render", "game share: the PC is over its 1 GB share");
    c.cfg.schedule = { tz: "Europe/Istanbul", slots: [{ d: 0, from: "10:00", to: "11:00" }] };
    c.nodes = [render(90), pc(10)];
    assert.strictEqual((await d(r, c, {})).nodeId, "render", "outside the schedule: Render");
    c.cfg.schedule = { slots: [] };
  }

  /* ---------- registration and key revocation ---------- */
  {
    const c = fakeCluster();
    const r = createRouter({ cluster: c, now });
    c.nodes = [render(80), pc(10)];
    assert.strictEqual((await d(r, c, {})).nodeId, "pc-home", "right after a primary restart: trust the node entry");
    r.recordRegistration("pc-home", "nk_1");
    assert.strictEqual(r.revokeKey("nk_1"), 1);
    t += 31_000;
    assert.strictEqual((await d(r, c, {})).nodeId, "render", "revoked key: no users");
    r.recordRegistration("pc-home", "nk_2");
    t += 31_000; // the target only switches back after the dwell time
    assert.strictEqual((await d(r, c, {})).nodeId, "pc-home", "registered with a new key: users again");
    t += 4 * 60 * 1000;
    c.nodes = [render(80), pc(10)];
    assert.strictEqual((await d(r, c, {})).nodeId, "render", "no register for 4 min: stale, no users");
  }

  /* ---------- KV error -> this node ---------- */
  {
    const c = fakeCluster();
    c.getNodes = async () => {
      throw new Error("kv down");
    };
    const r = createRouter({ cluster: c, now });
    assert.strictEqual((await r.decide({})).nodeId, "render", "KV error: this node");
  }

  /* ---------- secondary runtime: schedule -> drain -> resume ---------- */
  {
    const c = fakeCluster({ role: "secondary", nodeId: "pc-home" });
    let conns = 3;
    const emitted = [];
    const io = {
      engine: {
        get clientsCount() {
          return conns;
        },
      },
      local: {
        emit(ev, payload) {
          emitted.push({ ev, payload });
          conns = 0; // every client moves
        },
        disconnectSockets() {
          conns = 0;
        },
      },
      of: () => ({ sockets: new Map() }),
    };
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const env = { DESCALL_NODE_KEY: "dsk_node_" + "a".repeat(43), DESCALL_PRIMARY_URL: "https://des-call.onrender.com", NODE_ENV: "test" };
    const rt = createNodeRuntime({ cluster: c, io, env, now, fetchImpl, sleep: async () => {}, log: () => {} });
    c.nodes = [render(20), pc(10)];
    c.cfg.schedule = { tz: "Europe/Istanbul", slots: [{ d: 5, from: "18:00", to: "02:00" }] };
    t = Date.parse("2026-11-20T14:00:00Z"); // Fri 17:00 Istanbul: outside
    c.nodes.forEach((n) => (n.lastBeat = t));
    await rt.tick();
    assert.ok(calls.some((x) => x.url === "https://des-call.onrender.com/api/node/register" && x.auth === `Bearer ${env.DESCALL_NODE_KEY}`), "registers with the node key");
    assert.deepStrictEqual(emitted[0], { ev: "node:move", payload: { reason: "schedule", toUrl: "https://des-call.onrender.com", jitterMs: 3000 } }, "node:move to its sockets");
    assert.deepStrictEqual(c.states.map((s) => s.state), ["draining", "paused"], "draining then paused");
    assert.strictEqual(rt.autoPaused, "schedule");
    const done = calls.find((x) => x.url.endsWith("/api/node/drain-done"));
    assert.ok(done && done.body.id === "pc-home" && done.body.moved === 3 && done.body.dropped === 0, "drain-done posted with counts");
    assert.ok(c.events.some((e) => e.kind === "node:drain-done"), "drain-done event");
    t = Date.parse("2026-11-20T15:05:00Z"); // Fri 18:05: inside
    c.nodes.forEach((n) => (n.lastBeat = t));
    await rt.tick();
    assert.strictEqual(c.nodes[1].state, "active", "back in the schedule: resumed");
    assert.strictEqual(rt.autoPaused, null);

    // Admin pause is never lifted by the runtime.
    c.nodes[1].state = "paused";
    await rt.tick();
    assert.strictEqual(c.nodes[1].state, "paused", "admin pause stays");
    c.nodes[1].state = "active";

    // Full-handover game: drain with reason game.
    c.nodes[1].gameMode = true;
    c.cfg.gameMode.fullHandover = true;
    conns = 2;
    emitted.length = 0;
    await rt.tick();
    assert.strictEqual(emitted[0].payload.reason, "game", "game mode: node:move reason game");
    assert.strictEqual(rt.autoPaused, "game");
    c.nodes[1].gameMode = false;
    await rt.tick();
    assert.strictEqual(c.nodes[1].state, "active", "game closed: resumed");

    // Revoked key: register answers 401 -> drain.
    const rt2 = createNodeRuntime({ cluster: c, io, env, now, sleep: async () => {}, log: () => {}, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
    c.cfg.gameMode.fullHandover = false;
    conns = 1;
    await rt2.tick();
    assert.strictEqual(c.nodes[1].state, "paused", "revoked key: drained and paused");
    assert.strictEqual(rt2.autoPaused, "revoked");

    // Emergency ("all to Render"): the PC drains itself even if it missed the command, and
    // resumes on its own once the owner clears it.
    const rt3 = createNodeRuntime({ cluster: c, io, env: { ...env, DESCALL_PRIMARY_URL: undefined, DESCALL_NODE_PRIMARY_URL: "https://primary.example" }, now, fetchImpl, sleep: async () => {}, log: () => {} });
    c.nodes[1].state = "active";
    c.cfg.emergency = { on: true, at: "2026-11-20T15:05:00Z", by: "admin", reason: "test" };
    conns = 2;
    emitted.length = 0;
    calls.length = 0;
    await rt3.tick();
    assert.strictEqual(c.nodes[1].state, "paused", "emergency: drained");
    assert.strictEqual(rt3.autoPaused, "emergency");
    assert.strictEqual(emitted[0].payload.toUrl, "https://primary.example", "DESCALL_NODE_PRIMARY_URL is the primary");
    assert.ok(calls.every((x) => x.url.startsWith("https://primary.example/")), "register / drain-done go to DESCALL_NODE_PRIMARY_URL");
    await rt3.tick();
    assert.strictEqual(c.nodes[1].state, "paused", "emergency still on: stays paused");
    c.cfg.emergency = { on: false, at: null, by: null, reason: null };
    await rt3.tick();
    assert.strictEqual(c.nodes[1].state, "active", "emergency cleared: resumed");
  }

  /* ---------- emergency on the primary: everyone to Render ---------- */
  {
    const c = fakeCluster();
    const r = createRouter({ cluster: c, now, dwellMs: 0 });
    c.nodes = [render(90), pc(10)];
    c.cfg.schedule = { tz: "Europe/Istanbul", slots: [] };
    r.recordRegistration("pc-home", "nk_1");
    assert.strictEqual((await d(r, c, { sid: "tab-emerg-0001" })).nodeId, "pc-home", "control: Render at 90 % sends to the PC");
    c.cfg.emergency = { on: true, at: "x", by: "admin", reason: "drill" };
    const e1 = await d(r, c, { sid: "tab-emerg-0001" });
    assert.strictEqual(e1.nodeId, "render", "emergency: Render even for a tab stuck on the PC");
    assert.strictEqual(e1.reason, "pc-emergency");
    assert.deepStrictEqual(pcEligibility(pc(10), c.cfg, t), { ok: false, reason: "emergency" });
    c.cfg.emergency = { on: false };
    assert.strictEqual((await d(r, c, { sid: "tab-emerg-0002" })).nodeId, "pc-home", "emergency off: the load rule again");
  }

  /* ---------- env aliases, local control guard, node key result shapes ---------- */
  {
    assert.strictEqual(routing.envPrimaryUrl({ DESCALL_NODE_PRIMARY_URL: "https://a.example/" }), "https://a.example");
    assert.strictEqual(routing.envPrimaryUrl({ DESCALL_PRIMARY_URL: "https://b.example" }), "https://b.example", "DESCALL_PRIMARY_URL alias");
    assert.strictEqual(routing.envPrimaryUrl({ DESCALL_NODE_PRIMARY_URL: "https://a.example", DESCALL_PRIMARY_URL: "https://b.example" }), "https://a.example", "the node app name wins");
    const cfgMod = require("../lib/cluster/config");
    assert.strictEqual(cfgMod.readListenHost({ DESCALL_NODE_ROLE: "secondary" }), "127.0.0.1", "secondary listens on loopback");
    assert.strictEqual(cfgMod.readListenHost({ DESCALL_NODE_ROLE: "primary" }), undefined, "primary as before");
    assert.strictEqual(cfgMod.readListenHost({}), undefined, "no env: as before");
    assert.strictEqual(cfgMod.readCores({ DESCALL_NODE_CORES: "1" }), 1, "DESCALL_NODE_CORES caps the cores");
    assert.strictEqual(cfgMod.readClusterConfig({ DESCALL_PRIMARY_URL: "https://p.example" }).primaryUrl, "https://p.example");

    const { isLocalControlRequest, keyResult } = require("../routes/node");
    const tok = "t".repeat(32);
    const req = (h = {}, addr = "127.0.0.1") => ({ socket: { remoteAddress: addr }, headers: { host: "127.0.0.1:3210", "x-descall-node-control": tok, ...h } });
    assert.strictEqual(isLocalControlRequest(req(), tok), true, "loopback + token");
    assert.strictEqual(isLocalControlRequest(req({}, "::ffff:127.0.0.1"), tok), true, "IPv4-mapped loopback");
    assert.strictEqual(isLocalControlRequest(req({}, "::1"), tok), true, "IPv6 loopback");
    assert.strictEqual(isLocalControlRequest(req({ host: "localhost:3210" }), tok), true, "localhost host");
    assert.strictEqual(isLocalControlRequest(req({}, "192.168.1.5"), tok), false, "LAN address refused");
    assert.strictEqual(isLocalControlRequest(req({ "cf-connecting-ip": "1.2.3.4" }), tok), false, "tunnel refused");
    assert.strictEqual(isLocalControlRequest(req({ "cf-warp-tag-id": "x" }), tok), false, "tunnel tag refused");
    assert.strictEqual(isLocalControlRequest(req({ origin: "null" }), tok), false, "browser origin refused");
    assert.strictEqual(isLocalControlRequest(req({ host: "pc.descall.com" }), tok), false, "foreign host refused");
    assert.strictEqual(isLocalControlRequest(req({ "x-descall-node-control": tok + "x" }), tok), false, "longer token refused");
    assert.strictEqual(isLocalControlRequest(req(), ""), false, "no token configured: refused");
    assert.strictEqual(isLocalControlRequest(req({ "x-descall-node-control": "short" }), "short"), false, "too short a token: refused");
    assert.deepStrictEqual(keyResult({ id: "k1", name: "PC" }), { ok: true, keyId: "k1" }, "lib/nodeKeys shape");
    assert.deepStrictEqual(keyResult({ ok: true, keyId: "k2" }), { ok: true, keyId: "k2" }, "{ ok, keyId } shape");
    assert.deepStrictEqual(keyResult(null), { ok: false, keyId: null });
    assert.deepStrictEqual(keyResult({ ok: false, id: "k3" }), { ok: false, keyId: null });
  }

  /* ---------- drain timeout: leftovers are dropped ---------- */
  {
    const c = fakeCluster({ role: "primary" });
    let conns = 4;
    let closed = false;
    const io = {
      engine: { get clientsCount() { return conns; } },
      local: { emit() { conns = 1; }, disconnectSockets() { closed = true; conns = 0; } },
      of: () => ({ sockets: new Map() }),
    };
    let clock = 0;
    const rt = createNodeRuntime({ cluster: c, io, now: () => clock, sleep: async (ms) => { clock += ms; }, log: () => {} });
    const res = await rt.drainSelf({ timeoutMs: 10_000 });
    assert.deepStrictEqual([res.moved, res.dropped], [3, 1], "one socket never moved");
    assert.ok(res.ms >= 10_000 && closed, "waited 10 s then closed the rest");
  }

  console.log("nodeRouting.unit.test: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
