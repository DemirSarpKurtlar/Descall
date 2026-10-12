/**
 * Dev-only visual states for the desktop glass QA harness.
 * Loaded with a dynamic import that production builds drop
 * (`if (!import.meta.env.DEV) return` before the import).
 * Nothing here runs unless the page dispatches `descall:glass-qa`.
 */

function paint(color, label) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;left:0;top:0;width:4px;height:4px;opacity:0;pointer-events:none";
  document.body?.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const draw = () => {
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.ellipse(320, 168, 78, 92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(320, 340, 150, 90, 0, Math.PI, 0, true);
    ctx.fill();
    void label;
  };
  draw();
  const stream = canvas.captureStream?.(15) || null;
  const track = stream?.getVideoTracks?.()[0];
  if (track) {
    track.enabled = true;
    try { track.requestFrame?.(); } catch { /* ignore */ }
  }
  const timer = setInterval(() => {
    draw();
    try { track?.requestFrame?.(); } catch { /* ignore */ }
  }, 200);
  window.__glassQaPaint = window.__glassQaPaint || [];
  window.__glassQaPaint.push({ canvas, timer, stream });
  return stream;
}

function onScene(scene, handler) {
  const run = (detail) => {
    if (!detail || detail.scene !== scene) return;
    try {
      handler(detail);
    } catch (err) {
      console.warn("[glass-qa]", err);
    }
  };
  const listener = (event) => run(event?.detail || {});
  window.addEventListener("descall:glass-qa", listener);
  for (const detail of window.__glassQaScenes || []) run(detail);
  return () => window.removeEventListener("descall:glass-qa", listener);
}

export function bindDmCallQa(api) {
  return onScene("dm-call", (detail) => {
    const mode = detail.mode || "active";
    api.modeRef.current = mode;
    api.peerRef.current = detail.peer || null;
    api.setPeer(detail.peer || null);
    api.setCallType(detail.callType || "video");
    api.setMode(mode);
    api.setCallAnchorAt(Date.now() - (detail.elapsedMs || 754000));
    api.setDuration(detail.durationSeconds ?? 754);
    window.__DESCALL_QA_NET__ = detail.networkStats || {
      rttMs: 18,
      jitterMs: 2,
      packetLossPct: 0,
      bitrateKbps: 2400,
    };
    api.setConnectionQuality(detail.quality || "excellent");
    api.setPeerConnectionState("connected");
    api.setRemoteMediaReady(true);
    api.setMuted(Boolean(detail.muted));
    api.setCameraOn(detail.cameraOn !== false);
    api.setRemoteCameraOn(detail.remoteCameraOn !== false);
    api.setRemoteMuted(false);
    api.setScreenSharing(false);
    const local = paint(detail.localColor || "#3d4e8a", detail.localLabel || "Sen");
    const remote = paint(detail.remoteColor || "#6a3d55", detail.remoteLabel || "");
    if (api.localStreamRef) api.localStreamRef.current = local;
    if (api.remoteStreamRef) api.remoteStreamRef.current = remote;
    api.setLocalStream(local);
    api.setRemoteStream(remote);
    if (api.localVideoRef?.current && local) {
      api.localVideoRef.current.srcObject = local;
      api.localVideoRef.current.play?.().catch(() => {});
    }
    if (api.remoteVideoRef?.current && remote) {
      api.remoteVideoRef.current.srcObject = remote;
      api.remoteVideoRef.current.play?.().catch(() => {});
    }
  });
}

export function bindGroupCallQa(api) {
  return onScene("group-call", (detail) => {
    api.isInCallRef.current = true;
    api.activeGroupIdRef.current = detail.groupId || null;
    api.setIsInCall(true);
    api.setActiveGroupId(detail.groupId || null);
    api.setCallType(detail.callType || "video");
    api.setIsCameraOn(detail.cameraOn !== false);
    api.setIsMuted(false);
    api.setDuration(detail.durationSeconds ?? 502);
    const local = paint(detail.localColor || "#3d4e8a", detail.localLabel || "Sen");
    if (api.localStreamRef) api.localStreamRef.current = local;
    api.setLocalStream(local);
    const people = Array.isArray(detail.participants) ? detail.participants : [];
    api.setParticipants(people.map((person, index) => ({
      ...person,
      isCameraOn: person.isCameraOn !== false,
      isMuted: Boolean(person.isMuted),
      stream: person.stream || paint(person.color || ["#5a3d6e", "#2f6b4f", "#6b4a2f"][index % 3], person.displayName || person.username || ""),
    })));
  });
}

export function bindServerVoiceQa(api) {
  return onScene("server-voice", (detail) => {
    const channelId = detail.channelId || null;
    api.activeChannelIdRef.current = channelId;
    api.setActiveChannelId(channelId);
    api.setActiveServerId(detail.serverId || null);
    api.setChannelName(detail.channelName || "Ses");
    api.setChannelType("voice");
    api.setLiveKitLink("connected");
    api.setConnecting(false);
    api.setCanSpeak(true);
    api.setCanStream(true);
    const people = Array.isArray(detail.participants) ? detail.participants : [];
    api.setParticipants(people.map((person) => {
      const screen = person.screen ? paint(person.screenColor || "#1c2438", person.screenLabel || "Ekran") : null;
      return {
        ...person,
        hasAudio: true,
        isScreenSharing: Boolean(person.screen),
        screenStream: screen,
      };
    }));
  });
}
