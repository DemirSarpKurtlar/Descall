"use strict";

const voiceLive = require("../lib/voiceLive");

function toInt16(raw) {
  if (!raw) return null;
  if (raw instanceof Int16Array) return raw;
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (buf.length < 4) return null;
    const n = Math.floor(buf.length / 2);
    const out = new Int16Array(n);
    for (let i = 0; i < n; i += 1) out[i] = buf.readInt16LE(i * 2);
    return out;
  }
  if (Array.isArray(raw)) return Int16Array.from(raw);
  return null;
}

function registerVoiceLiveHandlers(io, socket) {
  const myId = socket.user?.id;
  if (!myId) return;
  voiceLive.setIo(io);
  const joined = new Set();

  socket.on("voice-live:join", (payload = {}) => {
    const id = String(payload.roomId || "");
    if (!id || !voiceLive.parseRoomId(id)) return;
    const extra = {
      groupName: payload.groupName,
      channelName: payload.channelName,
      serverId: payload.serverId,
      startedAt: payload.startedAt,
      title: payload.title,
    };
    if (voiceLive.joinLive(id, myId, extra)) joined.add(id);
  });

  socket.on("voice-live:leave", ({ roomId } = {}) => {
    const id = String(roomId || "");
    if (!id) return;
    voiceLive.leaveLive(id, myId);
    joined.delete(id);
  });

  socket.on("voice-live:speaking", ({ roomId, level, speaking } = {}) => {
    const id = String(roomId || "");
    const parsed = voiceLive.parseRoomId(id);
    if (!id || !parsed) return;
    if (!voiceLive.userInRoom(myId, id)) {
      if (parsed.kind === "server" && !voiceLive.occupancyHas(myId, id)) return;
      voiceLive.joinLive(id, myId);
    }
    if (!voiceLive.userInRoom(myId, id)) return;
    joined.add(id);
    voiceLive.setSpeaking(id, myId, { level, speaking });
  });

  socket.on("voice-live:chunk", ({ roomId, pcm } = {}) => {
    const id = String(roomId || "");
    if (!id || !voiceLive.userInRoom(myId, id)) return;
    const samples = toInt16(pcm);
    if (samples) voiceLive.pushPcm(id, myId, samples);
  });

  socket.on("disconnect", () => {
    try {
      voiceLive.leaveUser(myId);
    } catch {
      for (const id of joined) voiceLive.leaveLive(id, myId);
    }
    joined.clear();
  });
}

module.exports = { registerVoiceLiveHandlers };
