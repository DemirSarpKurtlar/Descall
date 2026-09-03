const RATE = 16000;
const FRAME_MS = 100;

export function roomIdFromMeta(meta = {}) {
  const kind = String(meta.kind || "").toLowerCase();
  if (kind === "dm") {
    const ids = [...new Set([...(meta.dmPeerIds || meta.participantIds || [])].map(String).filter(Boolean))].sort();
    if (ids.length < 2) return "";
    return `dm:${ids.join(":")}`;
  }
  if (kind === "group" && meta.groupId) return `group:${meta.groupId}`;
  if (kind === "server" && (meta.channelId || meta.channel_id)) {
    return `server:${meta.channelId || meta.channel_id}`;
  }
  return "";
}

function pickAudioTrack(stream) {
  if (!stream?.getAudioTracks) return null;
  return stream.getAudioTracks().find((t) => t && t.readyState !== "ended") || null;
}

function joinPayload(roomId, meta = {}) {
  return {
    roomId,
    groupName: meta.groupName,
    channelName: meta.channelName,
    serverId: meta.serverId,
    startedAt: meta.startedAt,
    title: meta.title,
  };
}

/**
 * Send local VAD + PCM to the server so Admin live-listen can follow speakers.
 * Re-announces occupancy via voice-live:join on start and socket reconnect
 * (Render deploys wipe in-memory occupancy while the call stays up).
 * Never throws. Stop on hangup.
 */
export function startVoiceLiveTap({ socket, getLocalStream, getMeta }) {
  let ctx = null;
  let src = null;
  let analyser = null;
  let timer = null;
  let stopped = false;
  let attachedId = "";
  let data = new Uint8Array(512);
  let lastRoomId = "";
  let joinedRoomId = "";
  let lastJoinAt = 0;
  const JOIN_HEARTBEAT_MS = 8000;

  function readMeta() {
    try {
      return getMeta?.() || {};
    } catch {
      return {};
    }
  }

  function currentRoomId(meta) {
    if (stopped) return "";
    const id = roomIdFromMeta(meta);
    if (id) lastRoomId = id;
    // After stop(), lastRoomId is cleared so a heartbeat cannot re-join.
    return id || lastRoomId;
  }

  function emitJoin() {
    if (stopped || !socket?.connected) return;
    const meta = readMeta();
    const roomId = currentRoomId(meta);
    if (!roomId) return;
    const now = Date.now();
    if (joinedRoomId === roomId && now - lastJoinAt < JOIN_HEARTBEAT_MS) return;
    if (joinedRoomId && joinedRoomId !== roomId) {
      try {
        socket.emit("voice-live:leave", { roomId: joinedRoomId });
      } catch {
        /* ignore */
      }
    }
    joinedRoomId = roomId;
    lastJoinAt = now;
    try {
      socket.emit("voice-live:join", joinPayload(roomId, meta));
    } catch {
      /* ignore */
    }
  }

  function onConnect() {
    joinedRoomId = "";
    lastJoinAt = 0;
    emitJoin();
  }

  function emitFrame() {
    if (stopped || !socket?.connected || !analyser) return;
    const meta = readMeta();
    const roomId = currentRoomId(meta);
    if (!roomId) return;
    if (joinedRoomId !== roomId) emitJoin();
    try {
      analyser.getByteTimeDomainData(data);
    } catch {
      return;
    }
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const speaking = rms > 0.012;
    socket.emit("voice-live:speaking", { roomId, level: Math.min(1, rms * 5), speaking });
    if (!speaking) return;
    const n = Math.max(80, Math.round((RATE * FRAME_MS) / 1000));
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i += 1) {
      const idx = Math.min(data.length - 1, Math.floor((i / n) * data.length));
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(((data[idx] - 128) / 128) * 32767)));
    }
    socket.emit("voice-live:chunk", { roomId, pcm: Array.from(pcm) });
  }

  function detach() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    try {
      src?.disconnect();
      ctx?.close();
    } catch {
      /* ignore */
    }
    ctx = null;
    src = null;
    analyser = null;
    attachedId = "";
  }

  function attach() {
    if (stopped) return;
    const stream = (() => {
      try {
        return getLocalStream?.();
      } catch {
        return null;
      }
    })();
    const track = pickAudioTrack(stream);
    if (!track) return;
    if (attachedId && attachedId === track.id && analyser) return;
    detach();
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      src = ctx.createMediaStreamSource(new MediaStream([track]));
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      data = new Uint8Array(analyser.fftSize);
      src.connect(analyser);
      attachedId = track.id;
      timer = setInterval(emitFrame, FRAME_MS);
    } catch {
      detach();
    }
  }

  emitJoin();
  if (socket?.on) socket.on("connect", onConnect);

  attach();
  const wait = setInterval(() => {
    if (stopped) {
      clearInterval(wait);
      return;
    }
    emitJoin();
    attach();
  }, 400);

  return {
    stop() {
      stopped = true;
      clearInterval(wait);
      detach();
      if (socket?.off) {
        try {
          socket.off("connect", onConnect);
        } catch {
          /* ignore */
        }
      }
      const leaveId = joinedRoomId || lastRoomId;
      if (leaveId) {
        try {
          socket?.emit?.("voice-live:leave", { roomId: leaveId });
        } catch {
          /* ignore */
        }
      }
      joinedRoomId = "";
      lastRoomId = "";
      lastJoinAt = 0;
    },
  };
}
