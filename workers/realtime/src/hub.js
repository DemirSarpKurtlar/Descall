// Hub Durable Object: one instance ("hub") holds every edge client WebSocket
// plus the single Render bridge WebSocket (scale plan §4). Uses the
// WebSocket Hibernation API, so an idle Hub sleeps with sockets still open
// and its in-memory maps are rebuilt from tags/attachments after a wake.
//
// To clients it speaks Engine.IO v4 over WebSocket (stock socket.io-client,
// transports: ["websocket"]). Socket.IO packets ("4…") are relayed to Render
// unchanged; Render's packets come back as single sends or broadcasts.

export const PING_INTERVAL_MS = 5 * 60 * 1000;
export const PING_TIMEOUT_MS = 60 * 1000;
export const MAX_CLIENTS = 30000;

function randomId() {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += (b % 36).toString(36);
  return s;
}

export class HubCore {
  /**
   * @param {{ acceptWebSocket(ws, tags): void, getWebSockets(tag?): any[], setAlarm?(ms): void, now?: () => number }} ctx
   */
  constructor(ctx, { log = console } = {}) {
    this.ctx = ctx;
    this.log = log;
    this.byCid = null; // lazily rebuilt after hibernation
    this.stats = { opened: 0, closed: 0, toClient: 0, fromClient: 0, broadcasts: 0, bridgeFrames: 0 };
  }

  now() {
    return this.ctx.now ? this.ctx.now() : Date.now();
  }

  index() {
    if (this.byCid) return this.byCid;
    this.byCid = new Map();
    for (const ws of this.ctx.getWebSockets("c")) {
      const att = ws.deserializeAttachment?.() || {};
      if (att.cid) this.byCid.set(att.cid, ws);
    }
    return this.byCid;
  }

  bridge() {
    const list = this.ctx.getWebSockets("bridge");
    return list.length ? list[list.length - 1] : null;
  }

  toBridge(op) {
    const b = this.bridge();
    if (!b) return false;
    try {
      b.send(JSON.stringify(op));
      return true;
    } catch {
      return false;
    }
  }

  /** New Render bridge. Replaces any old one; every client must reconnect. */
  acceptBridge(ws) {
    for (const old of this.ctx.getWebSockets("bridge")) {
      try {
        old.close(1000, "replaced");
      } catch {
        /* ignore */
      }
    }
    this.closeAllClients(1012, "bridge restarted");
    this.ctx.acceptWebSocket(ws, ["bridge"]);
    ws.serializeAttachment?.({ kind: "bridge", at: this.now() });
    try {
      ws.send(JSON.stringify(["hello", { clients: 0, at: this.now() }]));
    } catch {
      /* ignore */
    }
  }

  /** @returns {{ ok: true, cid: string } | { ok: false, code: number, reason: string }} */
  acceptClient(ws, meta = {}) {
    if (!this.bridge()) return { ok: false, code: 1013, reason: "bridge down" };
    const idx = this.index();
    if (idx.size >= MAX_CLIENTS) return { ok: false, code: 1013, reason: "overloaded" };
    let cid = randomId();
    while (idx.has(cid)) cid = randomId();
    const tags = ["c", `c:${cid}`];
    if (meta.uid) tags.push(`u:${String(meta.uid).slice(0, 64)}`);
    this.ctx.acceptWebSocket(ws, tags);
    ws.serializeAttachment?.({ kind: "client", cid, uid: meta.uid || null, at: this.now() });
    idx.set(cid, ws);
    this.stats.opened += 1;
    ws.send(
      "0" +
        JSON.stringify({ sid: cid, upgrades: [], pingInterval: PING_INTERVAL_MS, pingTimeout: PING_TIMEOUT_MS, maxPayload: 1000000 })
    );
    this.toBridge(["o", cid, { ip: meta.ip || "", ua: meta.ua || "", origin: meta.origin || "", country: meta.country || "" }]);
    this.ctx.setAlarm?.(PING_INTERVAL_MS);
    return { ok: true, cid };
  }

  closeAllClients(code, reason) {
    for (const ws of this.ctx.getWebSockets("c")) {
      try {
        ws.close(code, reason);
      } catch {
        /* ignore */
      }
    }
    this.byCid = new Map();
  }

  onMessage(ws, message) {
    const att = ws.deserializeAttachment?.() || {};
    if (att.kind === "bridge") return this.onBridgeMessage(message);
    if (att.kind !== "client") return;
    const cid = att.cid;
    this.stats.fromClient += 1;
    if (typeof message !== "string") {
      // Socket.IO binary attachment: forward as base64.
      const b64 = btoa(String.fromCharCode(...new Uint8Array(message)));
      this.toBridge(["b", cid, b64]);
      return;
    }
    const type = message[0];
    if (type === "4") {
      if (!this.toBridge(["m", cid, message.slice(1)])) {
        try {
          ws.close(1012, "bridge down");
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (type === "3") return; // pong
    if (type === "2") {
      ws.send("3" + message.slice(1));
      return;
    }
    if (type === "1") {
      try {
        ws.close(1000, "client close");
      } catch {
        /* ignore */
      }
    }
  }

  sendToClient(cid, data, binary = false) {
    const ws = this.index().get(cid);
    if (!ws) return false;
    try {
      if (binary) {
        const bin = atob(data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        ws.send(bytes);
      } else ws.send("4" + data);
      this.stats.toClient += 1;
      return true;
    } catch {
      this.index().delete(cid);
      this.toBridge(["x", cid, "send failed"]);
      return false;
    }
  }

  onBridgeMessage(message) {
    this.stats.bridgeFrames += 1;
    let ops;
    try {
      ops = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }
    if (!Array.isArray(ops)) return;
    if (ops.length && !Array.isArray(ops[0])) ops = [ops];
    for (const op of ops) {
      const [kind, target, data] = op;
      if (kind === "m") this.sendToClient(target, data);
      else if (kind === "b") this.sendToClient(target, data, true);
      else if (kind === "bc" && Array.isArray(target)) {
        this.stats.broadcasts += 1;
        for (const cid of target) this.sendToClient(cid, data);
      } else if (kind === "x") {
        const ws = this.index().get(target);
        if (ws) {
          this.index().delete(target);
          try {
            ws.close(1000, "server close");
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  onClose(ws) {
    const att = ws.deserializeAttachment?.() || {};
    if (att.kind === "bridge") {
      // Only react if no newer bridge took over.
      if (!this.ctx.getWebSockets("bridge").some((b) => b !== ws)) this.closeAllClients(1012, "bridge down");
      return;
    }
    if (att.kind === "client" && att.cid) {
      if (this.byCid) this.byCid.delete(att.cid);
      this.stats.closed += 1;
      this.toBridge(["x", att.cid, "transport close"]);
    }
  }

  /** Engine.IO heartbeat for every client; reschedules while clients remain. */
  onAlarm() {
    const clients = this.ctx.getWebSockets("c");
    for (const ws of clients) {
      try {
        ws.send("2");
      } catch {
        /* ignore */
      }
    }
    if (clients.length) this.ctx.setAlarm?.(PING_INTERVAL_MS);
  }

  health() {
    return { ok: true, bridge: Boolean(this.bridge()), clients: this.ctx.getWebSockets("c").length, stats: this.stats };
  }
}
