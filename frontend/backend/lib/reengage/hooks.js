"use strict";

/**
 * Growth 3B call sites (fire-and-forget, never throw, never block the caller):
 *   onRequest(userId)               middleware/auth.js, any signed-in request
 *   onDm(fromId, toId)              socket DM send, after the message is stored
 *   onServerMessage(userId)         socket channel message
 *   onVoiceSpeaking(userId, others) socket/descoinHeartbeat.js, a verified voice heartbeat
 * They feed the best send hour, the 48 h return tracking, the friend-call reward, the
 * shared streak and today's tasks.
 */

const voiceSeen = new Map(); // userId -> ms of the last counted voice minute

function later(fn) {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch(() => {});
  });
}

function onRequest(userId) {
  if (!userId) return;
  later(async () => {
    await require("./store").recordHour(userId);
    await require("./tracking").noteActive(userId, { kind: "request" });
    await require("./winback").noteActive(userId, { kind: "request" });
  });
}

function onDm(fromId, toId) {
  if (!fromId || !toId || String(fromId) === String(toId)) return;
  later(async () => {
    await require("./streaks").onDm(String(fromId), String(toId));
    await require("./tracking").noteActive(String(fromId), { kind: "message", detail: { to: String(toId) } });
    await require("./winback").noteActive(String(fromId), { kind: "message" });
  });
}

function onServerMessage(userId, detail = null) {
  if (!userId) return;
  later(() => require("./tracking").noteActive(String(userId), { kind: "message", detail }));
}

function onVoiceSpeaking(userId, others = [], detail = null) {
  if (!userId) return;
  const now = Date.now();
  if (now - (voiceSeen.get(userId) || 0) < 60_000) return;
  voiceSeen.set(userId, now);
  if (voiceSeen.size > 50000) voiceSeen.clear();
  later(async () => {
    await require("./streaks").onVoiceMinutes(String(userId), { minutes: 1, withIds: (others || []).map(String) });
    await require("./tracking").noteActive(String(userId), { kind: "voice", detail });
    await require("./winback").noteActive(String(userId), { kind: "voice" });
  });
}

module.exports = { onRequest, onDm, onServerMessage, onVoiceSpeaking };
