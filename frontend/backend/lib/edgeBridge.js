"use strict";

/**
 * Render ↔ Cloudflare Hub bridge (scale plan S2, 2.11.6).
 *
 * Clients that use the edge connect their stock socket.io-client to the Hub
 * Durable Object (wss://rt.descall.com). The Hub speaks Engine.IO to them and
 * relays every Socket.IO packet over ONE WebSocket to this process. Here each
 * edge client becomes a normal Socket.IO socket through a "virtual" Engine.IO
 * connection, so socketAuth, every handler, rooms, `io.to(room).emit`,
 * `fetchSockets()` and the presence fan-out work unchanged. Render stays the
 * authority (auth, DB, DesCoin, casino, calls).
 *
 * What changes is fan-out: a broadcast to N edge sockets leaves Render once
 * (["bc", [cid...], packet]) and the Hub copies it, so Render egress no longer
 * scales with the number of recipients.
 *
 * Bridge frames are JSON arrays, batched (one WebSocket message per flush):
 *   Render → Hub: ["m", cid, pkt] ["bc", [cid], pkt] ["x", cid, reason] ["b", cid, base64]
 *   Hub → Render: ["o", cid, meta] ["m", cid, pkt] ["x", cid, reason] ["hello", info]
 * Durable Objects bill incoming WebSocket messages 20:1, so the Render → Hub
 * direction is batched and rate limited (token bucket, default 12 msg/s, 20 ms
 * flush; EDGE_BRIDGE_FLUSH_MS / EDGE_BRIDGE_RATE override). The Hub's daily budget
 * guard keeps the account inside the free quota either way.
 */

const { EventEmitter } = require("events");

const DEFAULTS = {
  flushMs: 20,
  ratePerSec: 12,
  burst: 40,
  pingMs: 30_000,
  deflate: true,
  reconnectMinMs: 1_000,
  reconnectMaxMs: 60_000,
  maxBatchBytes: 512 * 1024,
};

class VirtualConn extends EventEmitter {
  constructor(bridge, cid, meta = {}) {
    super();
    this.__edgeCid = cid;
    this.bridge = bridge;
    this.id = `edge_${cid}`;
    this.protocol = 4;
    this.readyState = "open";
    const ip = typeof meta.ip === "string" && meta.ip ? meta.ip.slice(0, 64) : "0.0.0.0";
    this.remoteAddress = ip;
    const headers = {
      "x-forwarded-for": ip,
      "user-agent": typeof meta.ua === "string" ? meta.ua.slice(0, 300) : "",
      "x-descall-edge": "1",
    };
    if (typeof meta.origin === "string" && meta.origin) headers.origin = meta.origin.slice(0, 200);
    if (typeof meta.country === "string") headers["cf-ipcountry"] = meta.country.slice(0, 4);
    this.request = {
      headers,
      url: "/socket.io/?EIO=4&transport=websocket",
      _query: { EIO: "4", transport: "websocket" },
      connection: { encrypted: true },
    };
    this.transport = { name: "websocket", writable: true };
  }

  write(packet) {
    if (this.readyState !== "open") return;
    this.bridge._toHubPacket(this.__edgeCid, packet);
  }

  send(packet) {
    this.write(packet);
  }

  /** Server-side close (disconnect(true), auth failure, connect timeout). */
  close() {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.transport.writable = false;
    this.bridge._closeFromServer(this.__edgeCid);
    this.emit("close", "forced close");
  }

  /** Hub says the client is gone. */
  _remoteClose(reason) {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.transport.writable = false;
    this.emit("close", reason || "transport close");
  }
}

function createEdgeBridge({
  io,
  url,
  secret,
  WebSocketImpl = null,
  now = () => Date.now(),
  log = console,
  options = {},
} = {}) {
  const opts = { ...DEFAULTS, ...options };
  const conns = new Map(); // cid -> VirtualConn
  let ws = null;
  let open = false;
  let stopped = false;
  let queue = [];
  let queueBytes = 0;
  let flushTimer = null;
  let tokens = opts.burst;
  let lastRefill = now();
  let reconnectDelay = opts.reconnectMinMs;
  let pingTimer = null;
  let awaitingPong = false;
  const stats = { framesOut: 0, opsOut: 0, bytesOut: 0, framesIn: 0, broadcastsOffloaded: 0, recipientsOffloaded: 0, opened: 0, closed: 0 };
  const events = new EventEmitter();

  function refill() {
    const t = now();
    const add = ((t - lastRefill) / 1000) * opts.ratePerSec;
    if (add > 0) {
      tokens = Math.min(opts.burst, tokens + add);
      lastRefill = t;
    }
  }

  function scheduleFlush(delay = opts.flushMs) {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, delay);
    if (flushTimer.unref) flushTimer.unref();
  }

  function flush() {
    if (!open || !ws || !queue.length) return;
    refill();
    if (tokens < 1 && queueBytes < opts.maxBatchBytes) {
      scheduleFlush(Math.ceil(((1 - tokens) / opts.ratePerSec) * 1000));
      return;
    }
    tokens = Math.max(0, tokens - 1);
    const batch = queue;
    queue = [];
    queueBytes = 0;
    const text = JSON.stringify(batch);
    stats.framesOut += 1;
    stats.opsOut += batch.length;
    stats.bytesOut += text.length;
    try {
      ws.send(text);
    } catch (err) {
      log.warn?.("[edge-bridge] send failed:", err?.message || err);
    }
  }

  function enqueue(op) {
    queue.push(op);
    queueBytes += typeof op[2] === "string" ? op[2].length : 64;
    if (queueBytes >= opts.maxBatchBytes) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush();
    } else scheduleFlush();
  }

  function encodeOp(cidOrCids, packet) {
    if (typeof packet === "string") return Array.isArray(cidOrCids) ? ["bc", cidOrCids, packet] : ["m", cidOrCids, packet];
    const b64 = Buffer.from(packet).toString("base64");
    if (Array.isArray(cidOrCids)) return null; // binary broadcast: caller falls back per socket
    return ["b", cidOrCids, b64];
  }

  function closeAllVirtual(reason) {
    for (const conn of [...conns.values()]) conn._remoteClose(reason);
    conns.clear();
  }

  function onHubOp(op) {
    if (!Array.isArray(op)) return;
    const [kind, cid, data] = op;
    if (kind === "o") {
      if (typeof cid !== "string" || conns.has(cid)) return;
      const conn = new VirtualConn(api, cid, data || {});
      conns.set(cid, conn);
      conn.once("close", () => conns.delete(cid));
      stats.opened += 1;
      io.onconnection(conn);
      return;
    }
    if (kind === "m") {
      const conn = conns.get(cid);
      if (conn && typeof data === "string") conn.emit("data", data);
      return;
    }
    if (kind === "x") {
      const conn = conns.get(cid);
      if (conn) {
        stats.closed += 1;
        conn._remoteClose(typeof data === "string" ? data : "transport close");
      }
      return;
    }
    if (kind === "hello") events.emit("hello", cid);
  }

  function onMessage(raw) {
    stats.framesIn += 1;
    let msg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
    } catch {
      return;
    }
    if (!Array.isArray(msg)) return;
    if (msg.length && Array.isArray(msg[0])) for (const op of msg) onHubOp(op);
    else onHubOp(msg);
  }

  function connect() {
    if (stopped || !url || !secret) return;
    const WS = WebSocketImpl || require("ws");
    let sock;
    try {
      sock = new WS(url, {
        headers: { Authorization: `Bearer ${secret}` },
        handshakeTimeout: 10_000,
        // One long-lived stream of similar JSON: deflate with context takeover
        // shrinks Render egress several times (Cloudflare negotiates
        // permessage-deflate since compat date 2023-08-15). ~300 KB memory.
        perMessageDeflate: opts.deflate
          ? { threshold: 64, clientNoContextTakeover: false, serverNoContextTakeover: false, zlibDeflateOptions: { level: 6, memLevel: 8 } }
          : false,
      });
    } catch (err) {
      log.warn?.("[edge-bridge] connect failed:", err?.message || err);
      return retry();
    }
    ws = sock;
    sock.on("open", () => {
      open = true;
      reconnectDelay = opts.reconnectMinMs;
      awaitingPong = false;
      log.info?.("[edge-bridge] connected");
      events.emit("open");
      pingTimer = setInterval(() => {
        if (awaitingPong) {
          log.warn?.("[edge-bridge] no pong, reconnecting");
          try {
            sock.terminate();
          } catch {
            /* ignore */
          }
          return;
        }
        awaitingPong = true;
        try {
          sock.ping();
        } catch {
          /* ignore */
        }
      }, opts.pingMs);
      if (pingTimer.unref) pingTimer.unref();
      flush();
    });
    sock.on("pong", () => {
      awaitingPong = false;
    });
    sock.on("message", onMessage);
    sock.on("close", () => {
      const wasOpen = open;
      open = false;
      ws = null;
      queue = [];
      queueBytes = 0;
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      closeAllVirtual("transport close");
      if (wasOpen) log.warn?.("[edge-bridge] closed");
      events.emit("close");
      retry();
    });
    sock.on("error", (err) => {
      log.warn?.("[edge-bridge] error:", err?.message || err);
    });
  }

  function retry() {
    if (stopped) return;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(opts.reconnectMaxMs, reconnectDelay * 2);
    const t = setTimeout(connect, delay + Math.floor(Math.random() * 500));
    if (t.unref) t.unref();
  }

  /** Offload broadcasts to edge sockets: one frame per broadcast. */
  function patchAdapter() {
    const adapter = io.of("/").adapter;
    if (adapter.__edgePatched) return;
    adapter.__edgePatched = true;
    const orig = adapter.broadcast.bind(adapter);
    adapter.broadcast = function edgeAwareBroadcast(packet, bopts) {
      if (!open) return orig(packet, bopts);
      const flags = bopts.flags || {};
      const packetOpts = { preEncoded: true, volatile: flags.volatile, compress: flags.compress };
      packet.nsp = this.nsp.name;
      const encoded = this._encode(packet, packetOpts);
      const edgeCids = [];
      const single = Array.isArray(encoded) && encoded.length === 1 && typeof encoded[0] === "string";
      this.apply(bopts, (socket) => {
        if (typeof socket.notifyOutgoingListeners === "function") socket.notifyOutgoingListeners(packet);
        const conn = socket.client?.conn;
        if (single && conn && conn.__edgeCid && conn.readyState === "open") edgeCids.push(conn.__edgeCid);
        else socket.client.writeToEngine(encoded, packetOpts);
      });
      if (!edgeCids.length) return;
      if (edgeCids.length === 1) {
        enqueue(["m", edgeCids[0], encoded[0]]);
        return;
      }
      stats.broadcastsOffloaded += 1;
      stats.recipientsOffloaded += edgeCids.length;
      enqueue(["bc", edgeCids, encoded[0]]);
    };
  }

  const api = {
    start() {
      stopped = false;
      patchAdapter();
      connect();
      return api;
    },
    stop() {
      stopped = true;
      try {
        ws?.close(1001, "shutdown");
      } catch {
        /* ignore */
      }
    },
    isOpen: () => open,
    size: () => conns.size,
    stats,
    events,
    _toHubPacket(cid, packet) {
      const op = encodeOp(cid, packet);
      if (op) enqueue(op);
    },
    _closeFromServer(cid) {
      conns.delete(cid);
      enqueue(["x", cid, "server close"]);
    },
    // test hooks
    _onMessage: onMessage,
    _flush: flush,
    _patchAdapter: patchAdapter,
    _setOpenForTest(sock) {
      ws = sock;
      open = true;
    },
  };
  return api;
}

module.exports = { createEdgeBridge, VirtualConn, DEFAULTS };
