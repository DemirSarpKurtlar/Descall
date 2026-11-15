"use strict";

/**
 * Canlı popup on the socket (admin remake, Nov 2026):
 *  - on connect: start the popup engine (scheduler) and show this person the
 *    live popups they missed or have not acknowledged yet;
 *  - `popup:receipt` { id, kind: delivered|seen|clicked|acked|dismissed, lang? }
 *    from the recipient. Validated (uuid id, known kind), rate limited per
 *    socket (40 per 10 s, extra ones dropped), and only ever moves the sender's
 *    own receipt row of a live campaign (lib/livePopup/engine.js handleReceipt).
 */

const engine = require("../lib/livePopup/engine");

const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 40;

function allow(socket) {
  const now = Date.now();
  const rl = socket.data?.popupReceiptRl || { start: now, n: 0 };
  if (now - rl.start > WINDOW_MS) {
    rl.start = now;
    rl.n = 0;
  }
  rl.n += 1;
  if (socket.data) socket.data.popupReceiptRl = rl;
  return rl.n <= MAX_PER_WINDOW;
}

function registerPopupReceipts(io, socket) {
  try {
    const ready = engine.attachIo(io);
    Promise.resolve(ready)
      .then(() => engine.onUserConnected(socket))
      .catch(() => {});
  } catch (err) {
    console.warn("[live-popup] connect hook failed:", err?.message || err);
  }
  socket.on("popup:receipt", (payload, ack) => {
    let ok = false;
    if (payload && typeof payload === "object" && allow(socket)) {
      const lang = typeof payload.lang === "string" ? payload.lang.slice(0, 10) : undefined;
      ok = engine.handleReceipt(socket, { id: String(payload.id || "").slice(0, 64), kind: String(payload.kind || "").slice(0, 16), lang });
    }
    if (typeof ack === "function") ack({ ok });
  });
}

module.exports = { registerPopupReceipts, MAX_PER_WINDOW, WINDOW_MS };
