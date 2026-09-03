"use strict";

const { spawn } = require("child_process");
const {
  activeGroupCalls,
  activeServerVoiceCalls,
  usernameById,
} = require("../runtime/sharedState");
const { listActiveDmCalls, ensureActiveDmCall } = require("./dmCallLog");
const { getCachedPublicUser } = require("./userProfile");

const SAMPLE_RATE = 16000;
const FRAME_MS = 100;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;
const SPEAK_HOLD_MS = 700;
const PCM_TTL_MS = 800;
const LIVE_TTL_MS = 15000;

/** roomId -> Map userId -> { level, speaking, at, pcm: Int16Array, pcmAt, refs } */
const live = new Map();
/** roomId -> { groupName, channelName, serverId, startedAt, title } */
const liveMeta = new Map();
let ioRef = null;
let broadcastTimer = null;

function setIo(io) {
  ioRef = io;
}

function roomIdDm(a, b) {
  return `dm:${[String(a), String(b)].filter(Boolean).sort().join(":")}`;
}
function roomIdGroup(groupId) {
  return `group:${groupId}`;
}
function roomIdServer(channelId) {
  return `server:${channelId}`;
}

function parseRoomId(id) {
  const s = String(id || "");
  if (s.startsWith("dm:")) return { kind: "dm", key: s.slice(3) };
  if (s.startsWith("group:")) return { kind: "group", key: s.slice(6) };
  if (s.startsWith("server:")) return { kind: "server", key: s.slice(7) };
  return null;
}

function personFromId(id, extra = {}) {
  const pub = getCachedPublicUser?.(id) || null;
  const username = pub?.username || usernameById.get(id) || extra.username || "user";
  return {
    id: String(id),
    username,
    displayName: pub?.displayName || pub?.display_name || extra.displayName || username,
    avatarUrl: pub?.avatarUrl || pub?.avatar_url || extra.avatarUrl || null,
    speaking: Boolean(extra.speaking),
    level: Number(extra.level) || 0,
  };
}

function overlaySpeaking(roomId, people) {
  const row = live.get(roomId);
  const now = Date.now();
  if (!row) return people;
  return people.map((p) => {
    const st = row.get(String(p.id));
    if (!st || now - st.at > SPEAK_HOLD_MS * 2) return { ...p, speaking: false, level: 0 };
    const speaking = Boolean(st.speaking) && now - st.at <= SPEAK_HOLD_MS;
    return { ...p, speaking, level: speaking ? Math.max(st.level || 0, 0.2) : st.level || 0 };
  });
}

function mergeLivePeople(roomId, people) {
  const row = live.get(roomId);
  const base = Array.isArray(people) ? [...people] : [];
  if (!row) return overlaySpeaking(roomId, base);
  const seen = new Set(base.map((p) => String(p.id)));
  for (const uid of row.keys()) {
    const id = String(uid);
    if (!seen.has(id)) {
      seen.add(id);
      base.push(personFromId(id));
    }
  }
  return overlaySpeaking(roomId, base);
}

function speakerId(people) {
  const hot = people.filter((p) => p.speaking).sort((a, b) => (b.level || 0) - (a.level || 0))[0];
  return hot ? String(hot.id) : "";
}

function rememberMeta(roomId, extra = {}) {
  if (!roomId || !extra || typeof extra !== "object") return;
  const prev = liveMeta.get(roomId) || {};
  const next = { ...prev };
  for (const key of ["groupName", "channelName", "serverId", "startedAt", "title"]) {
    if (extra[key] != null && extra[key] !== "") next[key] = extra[key];
  }
  liveMeta.set(roomId, next);
}

function liveOnlyRoom(roomId) {
  const parsed = parseRoomId(roomId);
  if (!parsed) return null;
  const row = live.get(roomId);
  if (!row || !row.size) return null;
  const meta = liveMeta.get(roomId) || {};
  let ids = [...row.keys()].map(String);
  if (parsed.kind === "dm") {
    for (const id of parsed.key.split(":").filter(Boolean)) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  const participants = mergeLivePeople(
    roomId,
    ids.map((uid) => personFromId(uid))
  );
  const entry = {
    id: roomId,
    kind: parsed.kind,
    title: meta.title || "",
    liveCount: participants.length,
    speakingUserId: speakerId(participants),
    participants,
    startedAt: meta.startedAt || null,
  };
  if (parsed.kind === "dm") {
    entry.title = meta.title || `DM · ${participants.map((p) => p.username).join(" · ")}`;
  } else if (parsed.kind === "group") {
    entry.groupId = parsed.key;
    entry.groupName = meta.groupName || "";
    entry.title = meta.groupName || meta.title || "Grup";
  } else if (parsed.kind === "server") {
    entry.channelId = parsed.key;
    entry.serverId = meta.serverId;
    entry.channelName = meta.channelName || "";
    entry.title = meta.channelName || meta.title || "Ses kanalı";
  }
  return entry;
}

function pruneLive() {
  const now = Date.now();
  for (const [roomId, row] of [...live.entries()]) {
    for (const [uid, st] of [...row.entries()]) {
      if (now - (st.at || 0) > LIVE_TTL_MS) row.delete(uid);
    }
    if (!row.size) {
      live.delete(roomId);
      liveMeta.delete(roomId);
    }
  }
}

function listRooms(kind) {
  pruneLive();
  const rooms = [];
  const seen = new Set();
  if (!kind || kind === "dm") {
    for (const call of listActiveDmCalls()) {
      const id = roomIdDm(call.callerId, call.calleeId);
      const people = [personFromId(call.callerId), personFromId(call.calleeId)];
      const participants = mergeLivePeople(id, people);
      const title = `DM · ${participants.map((p) => p.username).join(" · ")}`;
      rememberMeta(id, { title, startedAt: call.startedAt });
      rooms.push({
        id,
        kind: "dm",
        title,
        liveCount: participants.length,
        speakingUserId: speakerId(participants),
        participants,
        startedAt: call.startedAt,
      });
      seen.add(id);
    }
  }
  if (!kind || kind === "group") {
    for (const [groupId, call] of activeGroupCalls.entries()) {
      // Empty rooms only — a solo participant must still list.
      if (!call?.participants?.size) continue;
      const id = roomIdGroup(groupId);
      const participants = mergeLivePeople(
        id,
        [...call.participants].map((uid) => personFromId(uid, { username: call.initiatorUsername }))
      );
      const startedAt = call.startTime ? new Date(call.startTime).toISOString() : null;
      rememberMeta(id, { groupName: call.groupName || "", title: call.groupName || "Grup", startedAt });
      rooms.push({
        id,
        kind: "group",
        groupId,
        groupName: call.groupName || "",
        title: call.groupName || "Grup",
        liveCount: participants.length,
        speakingUserId: speakerId(participants),
        participants,
        startedAt,
      });
      seen.add(id);
    }
  }
  if (!kind || kind === "server") {
    for (const [channelId, call] of activeServerVoiceCalls.entries()) {
      // Empty rooms only — a solo user in a channel must still list.
      if (!call?.participants?.size) continue;
      const id = roomIdServer(channelId);
      const raw = [...call.participants.values()].map((p) =>
        personFromId(p.id, {
          username: p.username,
          displayName: p.displayName || p.display_name,
          avatarUrl: p.avatarUrl || p.avatar_url,
        })
      );
      const participants = mergeLivePeople(id, raw);
      const startedAt = call.startTime ? new Date(call.startTime).toISOString() : null;
      rememberMeta(id, {
        serverId: call.serverId,
        channelName: call.channelName || "",
        title: call.channelName || "Ses kanalı",
        startedAt,
      });
      rooms.push({
        id,
        kind: "server",
        serverId: call.serverId,
        channelId,
        channelName: call.channelName || "",
        title: call.channelName || "Ses kanalı",
        liveCount: participants.length,
        speakingUserId: speakerId(participants),
        participants,
        startedAt,
      });
      seen.add(id);
    }
  }
  for (const roomId of live.keys()) {
    if (seen.has(roomId)) continue;
    const parsed = parseRoomId(roomId);
    if (!parsed) continue;
    if (kind && parsed.kind !== kind) continue;
    // Server occupancy is the source of truth. Named leftovers after hangup
    // are leaked taps and must not keep Admin Canlı forever.
    if (parsed.kind === "server") continue;
    const entry = liveOnlyRoom(roomId);
    if (entry) rooms.push(entry);
  }
  return rooms;
}

function getRoom(id) {
  const parsed = parseRoomId(id);
  if (!parsed) return null;
  return listRooms(parsed.kind).find((r) => r.id === id) || null;
}

function setSpeaking(roomId, userId, { level = 0, speaking = false } = {}) {
  if (!roomId || !userId) return;
  let row = live.get(roomId);
  if (!row) {
    row = new Map();
    live.set(roomId, row);
  }
  const prev = row.get(String(userId)) || {};
  row.set(String(userId), {
    ...prev,
    level: Math.max(0, Math.min(1, Number(level) || 0)),
    speaking: Boolean(speaking),
    at: Date.now(),
  });
  scheduleBroadcast();
}

function pushPcm(roomId, userId, int16) {
  if (!roomId || !userId || !int16?.length) return;
  let row = live.get(roomId);
  if (!row) {
    row = new Map();
    live.set(roomId, row);
  }
  const prev = row.get(String(userId)) || { level: 0, speaking: false, at: Date.now() };
  prev.pcm = int16;
  prev.pcmAt = Date.now();
  row.set(String(userId), prev);
}

function mixFrame() {
  const out = new Int16Array(FRAME_SAMPLES);
  const now = Date.now();
  const speakers = [];
  for (const row of live.values()) {
    for (const st of row.values()) {
      if (!st.pcm || now - (st.pcmAt || 0) > PCM_TTL_MS) continue;
      if (!st.speaking && (st.level || 0) < 0.04) continue;
      speakers.push(st.pcm);
    }
  }
  if (!speakers.length) return out;
  for (let i = 0; i < FRAME_SAMPLES; i += 1) {
    let sum = 0;
    for (const pcm of speakers) {
      sum += pcm[i] || pcm[pcm.length - 1] || 0;
    }
    out[i] = Math.max(-32768, Math.min(32767, sum));
  }
  return out;
}

function mixRoomFrame(roomId) {
  const row = live.get(roomId);
  const out = new Int16Array(FRAME_SAMPLES);
  if (!row) return out;
  const now = Date.now();
  const frames = [];
  for (const st of row.values()) {
    if (!st.pcm || now - (st.pcmAt || 0) > PCM_TTL_MS) continue;
    frames.push(st.pcm);
  }
  if (!frames.length) return out;
  for (let i = 0; i < FRAME_SAMPLES; i += 1) {
    let sum = 0;
    for (const pcm of frames) sum += pcm[i] || 0;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(sum / Math.min(frames.length, 3))));
  }
  return out;
}

function scheduleBroadcast() {
  if (broadcastTimer || !ioRef) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    try {
      const rooms = listRooms();
      emitVoiceLive({ rooms, at: Date.now() });
    } catch {
      /* ignore */
    }
  }, 180);
}

function pipeMp3(roomId, res) {
  if (!res.headersSent) {
    res.status(200);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") res.flushHeaders();
  }
  let ff;
  try {
  ff = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-fflags",
      "nobuffer",
      "-probesize",
      "32",
      "-analyzeduration",
      "0",
      "-f",
      "s16le",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-f",
      "mp3",
      "-write_xing",
      "0",
      "-id3v2_version",
      "0",
      "-b:a",
      "64k",
      "-flush_packets",
      "1",
      "pipe:1",
    ],
    { stdio: ["pipe", "pipe", "pipe"] }
  );
  } catch (e) {
    if (!res.headersSent) return res.status(204).end();
    return res.end();
  }
  let alive = true;
  ff.on("error", () => {
    alive = false;
    if (!res.headersSent) res.status(204).end();
    else res.end();
  });
  ff.stderr?.on("data", () => {});
  ff.stdout.pipe(res);
  const tick = setInterval(() => {
    if (!alive || res.writableEnded) {
      clearInterval(tick);
      try {
        ff.stdin.end();
      } catch {
        /* ignore */
      }
      ff.kill("SIGKILL");
      return;
    }
    const frame = mixRoomFrame(roomId);
    try {
      ff.stdin.write(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength));
    } catch {
      alive = false;
    }
  }, FRAME_MS);
  res.on("close", () => {
    alive = false;
    clearInterval(tick);
    try {
      ff.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  });
}

function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function occupancyHas(userId, roomId) {
  const parsed = parseRoomId(roomId);
  if (!parsed || userId == null) return false;
  const uid = String(userId);
  if (parsed.kind === "server") {
    const call = activeServerVoiceCalls.get(parsed.key);
    if (!call?.participants) return false;
    if (call.participants.has(uid) || call.participants.has(userId)) return true;
    for (const [k, p] of call.participants.entries()) {
      if (sameId(k, uid) || sameId(p?.id, uid)) return true;
    }
    return false;
  }
  if (parsed.kind === "group") {
    const call = activeGroupCalls.get(parsed.key);
    if (!call?.participants) return false;
    if (call.participants.has(uid) || call.participants.has(userId)) return true;
    for (const k of call.participants) if (sameId(k, uid)) return true;
    return false;
  }
  if (parsed.kind === "dm") {
    const ids = parsed.key.split(":").filter(Boolean);
    if (ids.some((id) => sameId(id, uid))) return true;
    const room = getRoom(roomId);
    return Boolean(room && (room.participants || []).some((p) => sameId(p.id, uid)));
  }
  return false;
}

function liveHas(userId, roomId) {
  const row = live.get(roomId);
  if (!row || userId == null) return false;
  const uid = String(userId);
  return row.has(uid) || row.has(userId);
}

/**
 * Occupancy, live-map speaker, or authenticated self-emit on a well-formed
 * dm/group/server roomId. Occupancy is not required so speaking/join can seed
 * Canlı after a Render restart. DM still requires the emitter is one of the
 * two ids in the room key (cannot spoof someone else's DM).
 */
function userInRoom(userId, roomId) {
  const parsed = parseRoomId(roomId);
  if (!parsed || userId == null) return false;
  const uid = String(userId);
  if (occupancyHas(uid, roomId) || liveHas(uid, roomId)) return true;
  if (parsed.kind === "dm") {
    const ids = parsed.key.split(":").filter(Boolean);
    return ids.some((id) => sameId(id, uid));
  }
  // Group: authenticated emitter may seed live after a restart.
  // Server: occupancy is the source of truth — do not treat every
  // well-formed server roomId as "in the channel" (that kept Admin Canlı).
  return parsed.kind === "group";
}

function ensureLiveRow(roomId, userId) {
  let row = live.get(roomId);
  if (!row) {
    row = new Map();
    live.set(roomId, row);
  }
  const uid = String(userId);
  const prev = row.get(uid) || { level: 0, speaking: false, at: Date.now() };
  if (!row.has(uid)) row.set(uid, prev);
  return row;
}

function joinLive(roomId, userId, extra = {}) {
  const parsed = parseRoomId(roomId);
  if (!parsed || userId == null) return false;
  const uid = String(userId);
  // Server Canlı follows occupancy. A leftover tap must not re-seed live Map
  // after the user already left the channel.
  if (parsed.kind === "server" && !occupancyHas(uid, roomId)) return false;
  if (parsed.kind === "dm") {
    const ids = parsed.key.split(":").filter(Boolean);
    if (!ids.some((id) => sameId(id, uid))) return false;
    const peerId = ids.find((id) => !sameId(id, uid));
    if (peerId && typeof ensureActiveDmCall === "function") {
      try {
        ensureActiveDmCall({ userId: uid, peerId });
      } catch {
        /* occupancy seed is best-effort */
      }
    }
  }
  leaveUserExcept(uid, roomId);
  const row = ensureLiveRow(roomId, uid);
  const prev = row.get(uid) || { level: 0, speaking: false, at: Date.now() };
  row.set(uid, { ...prev, at: Date.now() });
  rememberMeta(roomId, extra);
  scheduleBroadcast();
  return true;
}

function leaveUserExcept(userId, keepRoomId) {
  const uid = String(userId);
  let changed = false;
  for (const [roomId, row] of [...live.entries()]) {
    if (keepRoomId && roomId === keepRoomId) continue;
    if (!row.has(uid) && !row.has(userId)) continue;
    row.delete(uid);
    row.delete(userId);
    changed = true;
    if (!row.size) {
      live.delete(roomId);
      liveMeta.delete(roomId);
    }
  }
  if (changed) scheduleBroadcast();
}

function leaveUser(userId) {
  leaveUserExcept(userId, null);
}

function dropRoom(roomId) {
  if (!roomId) return;
  const had = live.has(roomId) || liveMeta.has(roomId);
  live.delete(roomId);
  liveMeta.delete(roomId);
  if (had) scheduleBroadcast();
}

function leaveLive(roomId, userId) {
  if (!roomId || userId == null) return;
  const row = live.get(roomId);
  if (!row) return;
  const uid = String(userId);
  if (!row.has(uid) && !row.has(userId)) return;
  row.delete(uid);
  row.delete(userId);
  if (!row.size) {
    live.delete(roomId);
    liveMeta.delete(roomId);
  }
  scheduleBroadcast();
}

function resetLive() {
  live.clear();
  liveMeta.clear();
}

function emitVoiceLive(payload) {
  if (!ioRef) return;
  try {
    ioRef.to("admin").emit("admin:voice-live", payload);
    for (const sock of ioRef.sockets?.sockets?.values?.() || []) {
      const u = sock.user || {};
      if (u.username === "admin" || u.is_admin) sock.emit("admin:voice-live", payload);
    }
  } catch {
    /* ignore */
  }
}

module.exports = {
  SAMPLE_RATE,
  FRAME_SAMPLES,
  setIo,
  roomIdDm,
  roomIdGroup,
  roomIdServer,
  parseRoomId,
  listRooms,
  getRoom,
  setSpeaking,
  pushPcm,
  pipeMp3,
  userInRoom,
  occupancyHas,
  joinLive,
  leaveLive,
  dropRoom,
  leaveUser,
  resetLive,
  scheduleBroadcast,
};
