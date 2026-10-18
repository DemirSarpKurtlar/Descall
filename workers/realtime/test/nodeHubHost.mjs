// Runs the Hub (src/hub.js) on plain Node + `ws`, emulating the Durable Object
// hibernation API. LOCAL TESTING ONLY (e2e test, k6 S2 matrix).
//   node test/nodeHubHost.mjs  (PORT=4100 EDGE_BRIDGE_SECRET=... JWT_SECRET=...)
import http from "node:http";
import { createRequire } from "node:module";
import { HubCore } from "../src/hub.js";
import { verifyAppJwt, tokenFromProtocols, safeEqual } from "../src/jwt.js";

const require = createRequire(import.meta.url);
const { WebSocketServer } = require(process.env.WS_MODULE || "ws");

export function startHubHost({ port = 4100, bridgeSecret, jwtSecret, log = () => {} } = {}) {
  const sockets = [];
  let alarmTimer = null;
  const ctx = {
    acceptWebSocket(ws, tags) {
      ws.__tags = tags;
      sockets.push(ws);
    },
    getWebSockets(tag) {
      return sockets.filter((w) => w.readyState === 1 && (!tag || w.__tags.includes(tag)));
    },
    setAlarm(ms) {
      if (alarmTimer) return;
      alarmTimer = setTimeout(() => {
        alarmTimer = null;
        core.onAlarm();
      }, ms);
      alarmTimer.unref?.();
    },
  };
  const core = new HubCore(ctx, { log });
  const stats = { incomingMessages: 0, bridgeIncoming: 0, clientIncoming: 0 };

  function wrap(ws) {
    let att = null;
    ws.serializeAttachment = (a) => (att = structuredClone(a));
    ws.deserializeAttachment = () => att;
    ws.on("message", (data, isBinary) => {
      stats.incomingMessages += 1;
      if (att?.kind === "bridge") stats.bridgeIncoming += 1;
      else stats.clientIncoming += 1;
      core.onMessage(ws, isBinary ? data : data.toString("utf8"));
    });
    ws.on("close", (code, reason) => {
      if (process.env.HUB_DEBUG) console.error(`[hub-host] close ${att?.kind || "?"} ${att?.cid || ""} ${code} ${String(reason || "")}`);
      const i = sockets.indexOf(ws);
      if (i >= 0) sockets.splice(i, 1);
      core.onClose(ws);
    });
    return ws;
  }

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ ...core.health(), host: stats }));
    }
    res.statusCode = 404;
    res.end();
  });
  const wss = new WebSocketServer({
    noServer: true,
    // Like Cloudflare (web_socket_compression): accept permessage-deflate when offered.
    perMessageDeflate: { threshold: 0, serverNoContextTakeover: false, clientNoContextTakeover: false },
    handleProtocols: (protocols) => (protocols.has("descall.v1") ? "descall.v1" : false),
  });
  server.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url, "http://x");
    const reject = (code) => {
      socket.write(`HTTP/1.1 ${code} No\r\n\r\n`);
      socket.destroy();
    };
    if (url.pathname === "/bridge") {
      if (!safeEqual(req.headers.authorization || "", `Bearer ${bridgeSecret}`)) return reject(403);
      return wss.handleUpgrade(req, socket, head, (ws) => core.acceptBridge(wrap(ws)));
    }
    if (url.pathname.startsWith("/socket.io")) {
      const token = tokenFromProtocols(req.headers["sec-websocket-protocol"]);
      if (!token) return reject(401);
      let uid = "";
      if (jwtSecret) {
        const v = await verifyAppJwt(token, jwtSecret);
        if (!v.ok) return reject(401);
        uid = v.uid;
      }
      return wss.handleUpgrade(req, socket, head, (ws) => {
        const res = core.acceptClient(wrap(ws), { uid, ip: (process.env.HUB_TRUST_XFF && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress, ua: req.headers["user-agent"] || "", origin: req.headers.origin || "" });
        if (!res.ok) ws.close(res.code, res.reason);
      });
    }
    reject(404);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, core, stats, close: () => new Promise((r) => { for (const w of sockets) w.terminate(); server.close(r); }) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 4100);
  await startHubHost({ port, bridgeSecret: process.env.EDGE_BRIDGE_SECRET || "local-bridge-secret", jwtSecret: process.env.JWT_SECRET || "" });
  console.log(`[hub-host] ws://127.0.0.1:${port}`);
}
