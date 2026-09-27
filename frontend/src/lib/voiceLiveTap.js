import { createPcmFramer, downsampleFloatToInt16 } from "./voiceLivePcm";

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
  let stopped = false;
  let attachedId = "";
  let lastRoomId = "";
  let joinedRoomId = "";
  let lastJoinAt = 0;
  let processor = null;
  let sink = null;
  const framer = createPcmFramer();
  const JOIN_HEARTBEAT_MS = 2000;

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

  function emitPcm(float32) {
    if (stopped || !socket?.connected || !ctx || !float32?.length) return;
    const meta = readMeta();
    const roomId = currentRoomId(meta);
    if (!roomId) return;
    if (joinedRoomId !== roomId) {
      framer.reset();
      emitJoin();
    }
    const { pcm, rms } = downsampleFloatToInt16(float32, ctx.sampleRate || 48000);
    const speaking = rms > 0.012;
    try {
      socket.emit("voice-live:speaking", { roomId, level: Math.min(1, rms * 4), speaking });
    } catch {
      /* ignore */
    }
    if (!speaking) return;
    for (const frame of framer.push(pcm)) {
      try {
        socket.emit("voice-live:chunk", { roomId, pcm: Array.from(frame) });
      } catch {
        /* ignore */
      }
    }
  }

  function resumeCtx() {
    if (stopped || !ctx || ctx.state !== "suspended") return;
    ctx.resume().catch(() => {});
  }

  function detach() {
    try {
      processor?.disconnect();
      sink?.disconnect();
      src?.disconnect();
      ctx?.close();
    } catch {
      /* ignore */
    }
    processor = null;
    sink = null;
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
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      resumeCtx();
      src = ctx.createMediaStreamSource(new MediaStream([track]));
      processor = ctx.createScriptProcessor(4096, 1, 1);
      sink = ctx.createGain();
      sink.gain.value = 0;
      processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer?.getChannelData?.(0);
        if (channel) emitPcm(channel);
      };
      src.connect(processor);
      processor.connect(sink);
      sink.connect(ctx.destination);
      analyser = processor;
      attachedId = track.id;
    } catch {
      detach();
    }
  }

  emitJoin();
  if (socket?.on) socket.on("connect", onConnect);

  const onGesture = () => resumeCtx();
  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
  }

  attach();
  const wait = setInterval(() => {
    if (stopped) {
      clearInterval(wait);
      return;
    }
    resumeCtx();
    emitJoin();
    attach();
  }, 400);

  return {
    stop() {
      stopped = true;
      clearInterval(wait);
      if (typeof window !== "undefined") {
        window.removeEventListener("pointerdown", onGesture, true);
        window.removeEventListener("keydown", onGesture, true);
      }
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
