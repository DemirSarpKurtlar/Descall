"use strict";

/** Process-wide edge bridge + per-socket advice (lib/edgeBridge.js, lib/edgeRealtime.js). */
const { systemConfig } = require("./sharedState");
const { createEdgeBridge } = require("../lib/edgeBridge");
const { edgeRealtimeAdvice, clientPlatform } = require("../lib/edgeRealtime");

let bridge = null;
let ioRef = null;

function isEdgeSocket(socket) {
  return socket?.handshake?.headers?.["x-descall-edge"] === "1";
}

function adviceFor(socket) {
  return edgeRealtimeAdvice({
    uid: socket?.user?.id,
    platform: clientPlatform(socket),
    config: systemConfig,
    bridgeOpen: Boolean(bridge?.isOpen()),
  });
}

function sendAdvice(socket) {
  const advice = adviceFor(socket);
  socket.emit("edge:advice", { realtime: advice.realtime });
}

/** After an admin change or a bridge state change: tell every socket. */
function broadcastAdvice() {
  if (!ioRef) return;
  for (const socket of ioRef.of("/").sockets.values()) {
    try {
      sendAdvice(socket);
    } catch {
      /* best effort */
    }
  }
}

function startEdgeBridgeFromEnv(io, env = process.env) {
  ioRef = io;
  const url = String(env.EDGE_BRIDGE_URL || "").trim();
  const secret = String(env.EDGE_BRIDGE_SECRET || "").trim();
  if (!url || !secret) return null;
  if (!/^wss:\/\/rt(-staging)?\.descall\.com\/bridge$/.test(url) && env.NODE_ENV === "production") {
    console.warn("[edge-bridge] EDGE_BRIDGE_URL not allowed; bridge disabled");
    return null;
  }
  const options = {};
  const flushMs = Number(env.EDGE_BRIDGE_FLUSH_MS);
  const rate = Number(env.EDGE_BRIDGE_RATE);
  if (flushMs >= 5 && flushMs <= 200) options.flushMs = flushMs;
  if (rate >= 1 && rate <= 50) options.ratePerSec = rate;
  bridge = createEdgeBridge({ io, url, secret, options });
  bridge.events.on("open", broadcastAdvice);
  bridge.events.on("close", broadcastAdvice);
  bridge.start();
  return bridge;
}

function edgeStats() {
  if (!bridge) return { enabled: false };
  return { enabled: true, open: bridge.isOpen(), clients: bridge.size(), ...bridge.stats };
}

module.exports = { startEdgeBridgeFromEnv, sendAdvice, broadcastAdvice, isEdgeSocket, edgeStats, _getBridge: () => bridge };
