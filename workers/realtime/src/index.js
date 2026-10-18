// Descall realtime edge (scale plan S2). Worker + Hub Durable Object.
//   wss://rt.descall.com/socket.io/?EIO=4&transport=websocket  (clients)
//   wss://rt.descall.com/bridge                               (Render, Bearer EDGE_BRIDGE_SECRET)
//   https://rt.descall.com/health
// Secrets (wrangler secret put): EDGE_BRIDGE_SECRET, JWT_SECRET (optional HS256 pre-check).
// Vars: JWT_JWKS = JSON of https://api.descall.com/api/jwks.json (ES256 pre-check, public).
// Vars: HUB_SOFT_UNITS / HUB_HARD_UNITS (daily free-quota guard, see budget.js).
import { HubCore } from "./hub.js";
import { createBudget, DEFAULT_SOFT, DEFAULT_HARD } from "./budget.js";
import { verifyEdgeJwt, tokenFromProtocols, safeEqual } from "./jwt.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hub = env.HUB.get(env.HUB.idFromName("hub"));
    if (url.pathname === "/health") return hub.fetch(new Request(new URL("/health", url), { headers: { "x-hub-op": "health" } }));
    const upgrade = request.headers.get("Upgrade");
    if (url.pathname === "/bridge") {
      if (upgrade !== "websocket") return json({ error: "upgrade required" }, 426);
      const auth = request.headers.get("Authorization") || "";
      if (!env.EDGE_BRIDGE_SECRET || !safeEqual(auth, `Bearer ${env.EDGE_BRIDGE_SECRET}`)) return json({ error: "forbidden" }, 403);
      const headers = new Headers(request.headers);
      headers.set("x-hub-op", "bridge");
      return hub.fetch(new Request(request, { headers }));
    }
    if (url.pathname === "/socket.io/" || url.pathname === "/socket.io") {
      if (upgrade !== "websocket" || url.searchParams.get("transport") !== "websocket" || url.searchParams.get("EIO") !== "4") {
        return json({ code: 0, message: "Transport unknown" }, 400);
      }
      const proto = request.headers.get("Sec-WebSocket-Protocol");
      const token = tokenFromProtocols(proto);
      if (!token) return json({ error: "token required" }, 401);
      const v = await verifyEdgeJwt(token, env);
      if (!v.ok) return json({ error: "unauthorized", code: v.code }, 401);
      const uid = v.uid;
      const headers = new Headers(request.headers);
      headers.set("x-hub-op", "client");
      headers.set("x-edge-uid", uid);
      headers.set("x-edge-ip", request.headers.get("CF-Connecting-IP") || "");
      headers.set("x-edge-country", request.cf?.country || "");
      return hub.fetch(new Request(request, { headers }));
    }
    return json({ error: "not found" }, 404);
  },
};

export class Hub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.core = new HubCore({
      acceptWebSocket: (ws, tags) => state.acceptWebSocket(ws, tags),
      getWebSockets: (tag) => state.getWebSockets(tag),
      setAlarm: (ms) => {
        state.storage.getAlarm().then((at) => {
          if (!at) state.storage.setAlarm(Date.now() + ms);
        });
      },
    });
    this.budget = createBudget({ soft: Number(env.HUB_SOFT_UNITS) || DEFAULT_SOFT, hard: Number(env.HUB_HARD_UNITS) || DEFAULT_HARD });
    state.blockConcurrencyWhile(async () => {
      const snapshot = await state.storage.get("budget");
      if (snapshot) {
        this.budget = createBudget({ soft: Number(env.HUB_SOFT_UNITS) || DEFAULT_SOFT, hard: Number(env.HUB_HARD_UNITS) || DEFAULT_HARD, snapshot });
      }
    });
  }

  persistBudget(force = false) {
    if (force || this.budget.shouldPersist()) this.state.storage.put("budget", this.budget.snapshot());
  }

  /** Past the hard line every client goes back to Render (code 1013 → client fallback). */
  enforceBudget() {
    if (this.budget.level() === "hard" && this.state.getWebSockets("c").length) {
      this.core.closeAllClients(1013, "edge quota");
      this.persistBudget(true);
    }
  }

  async fetch(request) {
    const op = request.headers.get("x-hub-op");
    this.budget.request();
    this.persistBudget();
    if (op === "health") return json({ ...this.core.health(), budget: this.budget.info() });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (op === "bridge") {
      this.core.acceptBridge(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (op === "client") {
      const level = this.budget.level();
      const res = level !== "ok" ? { ok: false, code: 1013, reason: "edge quota" } : this.core.acceptClient(server, {
        uid: request.headers.get("x-edge-uid") || "",
        ip: request.headers.get("x-edge-ip") || "",
        ua: request.headers.get("User-Agent") || "",
        origin: request.headers.get("Origin") || "",
        country: request.headers.get("x-edge-country") || "",
      });
      if (!res.ok) {
        // Accept then close with a reason so the client can fall back fast.
        this.state.acceptWebSocket(server, ["rejected"]);
        server.close(res.code, res.reason);
      }
      return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": "descall.v1" } });
    }
    return json({ error: "bad op" }, 400);
  }

  webSocketMessage(ws, message) {
    this.budget.wsMessage();
    this.core.onMessage(ws, message);
    this.persistBudget();
    this.enforceBudget();
  }

  webSocketClose(ws, code, reason) {
    this.core.onClose(ws, code, reason);
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  webSocketError(ws) {
    this.core.onClose(ws);
  }

  alarm() {
    this.enforceBudget();
    this.core.onAlarm();
    this.persistBudget(true);
  }
}
