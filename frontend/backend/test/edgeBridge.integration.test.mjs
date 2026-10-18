// Edge bridge end to end without Cloudflare: Socket.IO server + bridge
// (lib/edgeBridge.js) + the Hub (workers/realtime/src/hub.js) on Node + stock
// socket.io-client. Run after `npm ci` in frontend/:
//   node backend/test/edgeBridge.integration.test.mjs
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(path.join(here, "../package.json"));
const frontendRequire = createRequire(path.join(here, "../../package.json"));
const { Server } = backendRequire("socket.io");
const { createEdgeBridge } = backendRequire("./lib/edgeBridge.js");
const { io: ioClient } = frontendRequire("socket.io-client");
process.env.WS_MODULE = backendRequire.resolve("ws");
const { startHubHost } = await import(path.join(here, "../../../workers/realtime/test/nodeHubHost.mjs"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 5000, label = "condition") {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return;
    await sleep(25);
  }
  throw new Error(`timeout: ${label}`);
}

const SECRET = "bridge-test-secret";
const hub = await startHubHost({ port: 0 || 4190, bridgeSecret: SECRET });
const httpServer = http.createServer();
const io = new Server(httpServer, { transports: ["websocket"] });
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || !token.startsWith("u-")) return next(new Error("Authentication failed: invalid token."));
  socket.user = { id: token.slice(2) };
  next();
});
const seen = { ips: [], edgeHeader: [] };
io.on("connection", (socket) => {
  seen.ips.push(socket.handshake.address);
  seen.edgeHeader.push(socket.handshake.headers["x-descall-edge"] || null);
  socket.join(`user:${socket.user.id}`);
  socket.join("room:all");
  socket.on("echo", (x, ack) => ack({ back: x, id: socket.user.id }));
  socket.on("shout", (msg) => io.to("room:all").emit("heard", { from: socket.user.id, msg }));
  socket.on("dm", ({ to, msg }) => io.to(`user:${to}`).emit("dm", { from: socket.user.id, msg }));
  socket.on("kick", () => socket.disconnect(true));
});
await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
const originUrl = `http://127.0.0.1:${httpServer.address().port}`;
const bridge = createEdgeBridge({ io, url: "ws://127.0.0.1:4190/bridge", secret: SECRET, log: { info() {}, warn() {} }, options: { flushMs: 5, ratePerSec: 1000, burst: 1000 } });
bridge.start();
await waitFor(() => bridge.isOpen(), 5000, "bridge open");

function client(uid, edge) {
  const s = ioClient(edge ? "ws://127.0.0.1:4190" : originUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    reconnection: false,
    auth: { token: `u-${uid}` },
    ...(edge ? { protocols: ["descall.v1", `jwt.u-${uid}`] } : {}),
  });
  s.got = [];
  s.onAny((ev, d) => s.got.push([ev, d]));
  return s;
}

try {
  const a = client("alice", true);
  const b = client("bob", true);
  const c = client("carol", false);
  await waitFor(() => a.connected && b.connected && c.connected, 5000, "all connected");
  assert.equal(bridge.size(), 2, "two virtual sockets on Render");
  assert.deepEqual(seen.edgeHeader.filter(Boolean).length, 2);

  // ack round trip through the Hub
  assert.deepEqual(await a.timeout(2000).emitWithAck("echo", 7), { back: 7, id: "alice" });

  // room broadcast: one bridge op for both edge sockets, origin socket direct
  const before = bridge.stats.broadcastsOffloaded;
  c.emit("shout", "hi all");
  await waitFor(() => [a, b, c].every((s) => s.got.some(([e, d]) => e === "heard" && d.msg === "hi all")), 3000, "broadcast delivered");
  assert.equal(bridge.stats.broadcastsOffloaded - before, 1, "broadcast offloaded once");
  assert.equal(hub.core.stats.broadcasts >= 1, true);

  // unicast edge → edge and edge → origin
  a.emit("dm", { to: "bob", msg: "psst" });
  a.emit("dm", { to: "carol", msg: "hey" });
  await waitFor(() => b.got.some(([e, d]) => e === "dm" && d.msg === "psst") && c.got.some(([e, d]) => e === "dm" && d.msg === "hey"), 3000, "dms");

  // auth failure travels back as connect_error (Render decides, not the edge)
  const bad = ioClient("ws://127.0.0.1:4190", { path: "/socket.io", transports: ["websocket"], reconnection: false, auth: { token: "nope" }, protocols: ["descall.v1", "jwt.nope"] });
  const err = await new Promise((r) => bad.on("connect_error", (e) => r(e.message)));
  assert.match(err, /Authentication failed/);
  bad.close();

  // server-side disconnect(true) closes the edge client
  const bGone = new Promise((r) => b.on("disconnect", r));
  b.emit("kick");
  assert.equal(await bGone, "io server disconnect");
  await waitFor(() => bridge.size() === 1, 3000, "virtual socket removed");

  // client leaves → Render sees disconnect
  const aliceServer = [...io.sockets.sockets.values()].find((s) => s.user.id === "alice");
  const discOnServer = new Promise((r) => aliceServer.on("disconnect", r));
  a.close();
  await discOnServer;
  await waitFor(() => bridge.size() === 0, 3000, "alice removed");

  // Hub/bridge loss: Render drops virtual sockets, origin socket untouched
  const d = client("dave", true);
  await waitFor(() => d.connected, 3000, "dave connected");
  const dGone = new Promise((r) => d.on("disconnect", r));
  await hub.close();
  await dGone;
  await waitFor(() => bridge.size() === 0 && !bridge.isOpen(), 3000, "bridge closed");
  assert.ok(c.connected, "origin client unaffected");
  c.close();
  console.log("edgeBridge.integration.test.mjs: ok");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  bridge.stop();
  io.close();
  setTimeout(() => process.exit(), 100);
}
