import { afterFirstScreen } from "../lib/afterFirstScreen.js";
import { publishActiveSpeakers } from "../lib/activeSpeakers";
import {
  abandonPendingRooms,
  adoptConnectedRoom,
  dropPendingRoom,
  isLiveRoom,
  supersededRoomError,
  trackPendingRoom,
} from "../lib/liveKitRoomSlot.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rumDone } from "../lib/perf/rum.js";
import { preloadIceServers } from "../lib/iceConfig";
import { isNativeAndroid } from "../lib/platform";
import { useVoiceDiagSnapshot } from "./useVoiceDiagSnapshot";
import { subscribeNetworkChange } from "../lib/networkChange";
import { createPeerConnection, attachLocalTracks, safeClosePeer, commitLocalDescription } from "../lib/webrtcPeerFactory";
import { applyPlaybackGain, releasePlaybackGain } from "../lib/voiceGain";
import { sampleConnectionStats } from "../lib/connectionStats";
import { applyAdaptiveAudioEncoding, applyAdaptiveJitterBuffer } from "../lib/adaptiveBitrate";
import {
  clampGain,
  liveKitMicPublishOptions,
  liveKitRoomOptions,
  micRecapturePlan,
  pickFastestLiveKitUrl,
  primeCapturedMic,
  readLocalMute,
  readParticipantGain,
  tuneAudioReceiver,
  writeLocalMute,
  writeParticipantGain,
} from "../lib/voiceProfile";
import { apiBase } from "../lib/nodeRouting";
import { getToken, getUser } from "../lib/storage";
import { emitRoomOnce } from "../lib/socketResubscribe";
import { startDesCoinHeartbeat } from "../lib/descoinHeartbeat";
import {
  captureScreenShareStream,
  showElectronScreenPicker,
  optimizeScreenShareTrack,
  optimizeScreenShareSender,
  ensureScreenShareAudioTrack,
  resolveScreenCaptureSize,
  screenBitrateForPeerCount,
  isMobileScreenCapture,
  tuneLateScreenSender,
} from "../lib/webrtcScreenShare";
import { localDecodeFamilies, localVideoCaps, screenEncoderFor } from "../lib/screenShareEncoder";
import { pickSfuScreenCodec, sanitizeVideoDecode } from "../lib/screenShareCodec";
import {
  addDedicatedSender,
  announcementFromSenders,
  classifyInboundMedia,
  collectScreenAudioTrackIds,
  describeRtcTrackEvent,
  dropScreenEntries,
  liveKitCameraPublishOptions,
  liveKitScreenAudioPublishOptions,
  liveKitScreenVideoPublishOptions,
  mergeScreenAnnouncement,
  partitionInbound,
  sanitizeScreenAnnouncement,
  stopDedicatedSender,
} from "../lib/screenShareIdentity";
import {
  acquireVoiceMicStream,
  disposeNoiseSuppressionSession,
  getNoiseSuppressionRawTrack,
  preloadNoiseSuppression,
  setNoiseSuppressedTrackEnabled,
} from "../lib/noiseSuppression";
import { isVoiceMicError, voiceMicErrorCopy } from "../lib/voiceMicError";
import {
  adoptLateScreenShare,
  classifyLiveKitTrack,
  nextScreenStream,
  screenShareStillLive,
} from "../lib/screenShareTracks";
import { useToast } from "../context/ToastContext";
import { IOS_NATIVE } from "../lib/iosCallKit";
import { beginIosCallAudio, endIosCallAudio } from "../lib/iosAudioRoute";
import { useIosAudioRoute } from "./useIosAudioRoute";
import { liveMicDeviceId, readAudioPrefs, setOutputSink, writeAudioPref } from "../lib/callAudioDevices";
import { t as tRuntime } from "../i18n/runtime";
import audioManager from "../lib/audioManager";
import { playJoinCue } from "../lib/joinSounds";
import { primeVoiceActivity } from "../lib/voiceActivity";
import { registerLiveKitVideoTrack, unregisterLiveKitVideoTrack } from "../lib/liveKitVideoBinding";
import { createCallTelemetrySender } from "../lib/callTelemetry";
import { createGroupCallTelemetry } from "../lib/groupCallTelemetry";
import {
  mergeRejoinRoster,
  isNewRemoteSession,
  isPoliteSide,
  peerLinkDecision,
  dropResultFor,
  dropReasonToken,
  liveKitDropAction,
  liveKitRetryBudget,
  dropMessageKey,
  moveMessageKey,
  unmuteDeniedKey,
} from "../lib/serverVoiceRecovery";
import { cleanServerScreenQuality, readServerScreenQuality, writeServerScreenQuality } from "../lib/serverScreenQuality";
import { setScreenCeiling } from "../plus2/screenCeiling.js";
import { platformHeaders } from "../plus2/platform.js";
import {
  isScreenCompanionIdentity,
  parseLiveKitIdentity,
  routeLiveKitTrack,
  speakerIdsWithoutCompanions,
} from "../lib/screenCompanion";
import {
  nativeBroadcastSupported,
  onBroadcastState,
  startNativeBroadcast,
  stopNativeBroadcast,
} from "../lib/iosScreenBroadcast";
import {
  INITIAL_SHARE_STATE,
  nextShareState,
  shareTransition,
  tokenErrorKey,
} from "../lib/iosScreenBroadcastModel";

let liveKitApiPromise = null;
function loadLiveKit() {
  if (!liveKitApiPromise) liveKitApiPromise = import("livekit-client");
  return liveKitApiPromise;
}

const CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
};

/**
 * Mesh voice hangout for server voice channels (Step 10).
 * Existing members offer to new joiners; joiner answers.
 */
export function useServerVoice(socket) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [activeServerId, setActiveServerId] = useState(null);
  const [channelName, setChannelName] = useState("");
  const [participants, setParticipants] = useState([]);
  const [muted, setMuted] = useState(readLocalMute);
  const [linkQualityByUser, setLinkQualityByUser] = useState({});
  const [connecting, setConnecting] = useState(false);
  const [liveKitLink, setLiveKitLink] = useState("idle");
  const [error, setError] = useState("");
  /** serverId -> { channelId -> { members, memberCount } } */
  const [voiceStatesByServer, setVoiceStatesByServer] = useState({});

  const localStreamRef = useRef(null);
  const pcMapRef = useRef(new Map()); // userId -> { pc, pendingIce }
  // calls-02: voice diagnostic snapshot for feedback (useVoiceDiagSnapshot.js).
  useVoiceDiagSnapshot({
    active: Boolean(activeChannelId),
    kind: "server",
    muted,
    getPeers: () => Array.from(pcMapRef.current.values()).map((peerData) => peerData?.pc).filter(Boolean),
  });
  const remoteAudioRefs = useRef(new Map());
  const remoteStreamMapRef = useRef(new Map()); // userId -> MediaStream
  const remoteScreenStreamsRef = useRef(new Map());
  const screenExpectedRef = useRef(new Set());
  const screenAnnouncementsRef = useRef(new Map());
  const participantVolumeRef = useRef(new Map());
  const lastParticipantVolumeRef = useRef(new Map());
  const screenVolumeRef = useRef(new Map());
  const audioInputIdRef = useRef(IOS_NATIVE ? "" : readAudioPrefs().input);
  const inputIdsRef = useRef([]);
  const setAudioInputRef = useRef(null);
  const replacingMicRef = useRef(false);
  const audioOutputIdRef = useRef(IOS_NATIVE ? "" : readAudioPrefs().output);
  const videoInputIdRef = useRef("");
  const activeChannelIdRef = useRef(null);
  const voiceJoinEpochRef = useRef(0);
  const activeServerIdRef = useRef(null);
  const lastVoiceChannelIdRef = useRef(null);
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const myIdRef = useRef(getUser()?.id || null);
  const mutedRef = useRef(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreamsVersion, setRemoteStreamsVersion] = useState(0);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [videoInputDevices, setVideoInputDevices] = useState([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState(() => audioInputIdRef.current);
  const [selectedAudioOutput, setSelectedAudioOutput] = useState(() => audioOutputIdRef.current);
  const [selectedVideoInput, setSelectedVideoInput] = useState("");
  const [participantVolumes, setParticipantVolumes] = useState({});
  const [screenVolumes, setScreenVolumes] = useState({});
  const [serverMuted, setServerMuted] = useState(false);
  const serverMutedRef = useRef(false);
  const [serverDeafened, setServerDeafened] = useState(false);
  const serverDeafenedRef = useRef(false);
  const [deafened, setDeafened] = useState(false);
  const deafenedRef = useRef(false);
  const mutedByDeafenRef = useRef(false);
  const joinRef = useRef(null);
  // The server sends the LiveKit token with the confirmed seat (server:voice:joined).
  // The join flow waits for it here instead of asking before the seat exists.
  const joinedTokenWaiterRef = useRef(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const screenStreamRef = useRef(null);
  const stopScreenShareRef = useRef(null);
  // SFU screen codec (screenShareCodec.pickSfuScreenCodec): every other member's video
  // decode list from channel state, the live publication ({ track, codec, quality, fps })
  // and the debounce of a codec change when the room changes.
  const memberDecodeRef = useRef(new Map());
  const sfuScreenRef = useRef(null);
  const sfuCodecTimerRef = useRef(null);
  const startScreenShareRef = useRef(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const cameraStreamRef = useRef(null);
  const stopCameraRef = useRef(null);
  const [channelType, setChannelType] = useState("voice");
  const channelTypeRef = useRef("voice");
  const [stageRole, setStageRole] = useState("speaker");
  const stageRoleRef = useRef("speaker");
  const [requestedToSpeak, setRequestedToSpeak] = useState(false);
  const [canRequestToSpeak, setCanRequestToSpeak] = useState(false);
  const [canSpeak, setCanSpeak] = useState(true);
  const canSpeakRef = useRef(true);
  const [canStream, setCanStream] = useState(true);
  const canStreamRef = useRef(true);
  const [mediaMode, setMediaMode] = useState("mesh");
  const sfuModeRef = useRef(false);
  const liveKitRoomRef = useRef(null);
  /** Rooms still connecting; a leave abandons them (lib/liveKitRoomSlot.js). */
  const liveKitPendingRef = useRef(new Set());
  /** Mirrors liveKitLink for socket handlers (they are bound once per socket). */
  const liveKitLinkRef = useRef("idle");
  /** Mesh link recovery and LiveKit re-connect, filled in further down (voice-drops-03 / -06). */
  const recoverPeerRef = useRef(null);
  const handlePeerLinkRef = useRef(null);
  const reconnectLiveKitRef = useRef(null);
  const onLiveKitDroppedRef = useRef(null);
  /** Seat facts the unmute refusal toast names (AFK channel, moderator mute). */
  const afkChannelRef = useRef(false);
  const modMutedRef = useRef(false);
  const toggleDeafenRef = useRef(null);
  const liveKitRecoverRef = useRef({ attempts: [], timer: null });
  /** Per-session link counters for the drop telemetry (voice-drops-05). */
  const linkStatsRef = useRef({ sockDrops: 0, pcFailed: 0, iceRestarts: 0, rebuilds: 0, startedAt: 0 });
  /** LiveKit URL the voice room connected to (the iOS screen companion uses the same edge). */
  const liveKitUrlRef = useRef(null);
  /** iOS whole-screen sharing (ReplayKit broadcast + native screen companion). */
  const [nativeShare, setNativeShare] = useState(INITIAL_SHARE_STATE);
  const nativeShareRef = useRef(INITIAL_SHARE_STATE);
  const participantsRef = useRef([]);
  const channelNameRef = useRef("");
  const liveKitConfigRef = useRef(null);
  // Screen share quality from the owner-picked quality window (server-voice-21),
  // remembered per device. Mesh caps still apply in resolveScreenCaptureSize.
  const [screenQuality, setScreenQualityState] = useState(readServerScreenQuality);
  const setScreenQuality = useCallback((next) => {
    const clean = cleanServerScreenQuality(next);
    setScreenQualityState(clean);
    writeServerScreenQuality(clean);
  }, []);

  useEffect(() => {
    // Warm-up only: after the first app screen, not during the cold start. Android app:
    // no noise-suppression warm-up at all (about 500 KB of WASM and worklets on every
    // start, voice or not); acquireJoinMic warms it when a channel is joined.
    afterFirstScreen(() => {
      preloadIceServers().catch(() => {});
      if (!isNativeAndroid()) preloadNoiseSuppression();
    });
  }, []);

  useEffect(() => {
    liveKitLinkRef.current = liveKitLink;
  }, [liveKitLink]);

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
    if (activeChannelId) lastVoiceChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  // DesCoin in server voice channels (owner approved, Nov 2026): same heartbeat as DM /
  // group calls. The server pays only for a real seat held by this socket, with someone
  // else seated, speaking (not muted / server-muted / timed out) or actually sharing.
  useEffect(() => {
    if (!activeChannelId) return undefined;
    return startDesCoinHeartbeat({
      getSocket: () => socketRef.current,
      getLocalStream: () => (mutedRef.current ? null : localStreamRef.current),
      isActive: () => Boolean(activeChannelIdRef.current),
      isScreenSharing: () => Boolean(screenStreamRef.current),
      getContext: () => ({
        context: "server",
        channelId: activeChannelIdRef.current || activeChannelId,
        serverId: activeServerIdRef.current || null,
      }),
    });
  }, [activeChannelId]);

  // wifi ↔ cellular (and coming back online) while a voice channel is open.
  useEffect(() => {
    if (!activeChannelId) return undefined;
    return subscribeNetworkChange(() => {
      const room = liveKitRoomRef.current;
      if (room?.engine?.attemptReconnect) {
        try {
          room.engine.attemptReconnect();
        } catch {
          /* LiveKit also retries from its own connection monitor */
        }
        return;
      }
      // Mesh: restartIce() alone only flags the next offer; the recovery sends
      // the restart offer (voice-drops-03).
      for (const userId of [...pcMapRef.current.keys()]) recoverPeerRef.current?.(userId, "network");
    });
  }, [activeChannelId]);

  useEffect(() => {
    if (!activeChannelId) return undefined;
    let alive = true;
    const samples = new Map();
    const audioTrackers = new Map();
    const timer = setInterval(async () => {
      if (!alive || sfuModeRef.current) return;
      const qualityByUser = {};
      for (const [userId, peerData] of pcMapRef.current.entries()) {
        const pc = peerData?.pc;
        if (!pc || pc.connectionState === "closed") continue;
        try {
          const result = await sampleConnectionStats(pc, samples.get(userId) || null);
          if (!result?.quality || !alive) continue;
          samples.set(userId, result.sample);
          const audioSender = pc.getSenders().find(
            (sender) => sender.track?.kind === "audio" && sender !== peerData.screenAudioSender
          );
          if (!audioTrackers.has(userId)) audioTrackers.set(userId, { current: null });
          applyAdaptiveAudioEncoding(audioSender, result.quality, audioTrackers.get(userId));
          const jt = audioTrackers.get(userId);
          if (!jt.jitter) jt.jitter = { current: null };
          applyAdaptiveJitterBuffer(pc, result.quality, jt.jitter);
          const screenAudioIds = collectScreenAudioTrackIds(
            peerData.inbound,
            peerData.screenAnnouncement
          );
          for (const receiver of pc.getReceivers()) {
            if (receiver.track?.kind !== "audio") continue;
            if (screenAudioIds.has(receiver.track.id)) continue;
            tuneAudioReceiver(receiver, result.quality);
          }
          qualityByUser[String(userId)] = result.quality;
        } catch {
          /* stats can fail while the peer is restarting */
        }
      }
      if (!alive || !Object.keys(qualityByUser).length) return;
      setLinkQualityByUser((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [id, quality] of Object.entries(qualityByUser)) {
          if (next[id] !== quality) {
            next[id] = quality;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [activeChannelId]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    channelNameRef.current = channelName;
  }, [channelName]);

  useEffect(() => {
    activeServerIdRef.current = activeServerId;
  }, [activeServerId]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    channelTypeRef.current = channelType || "voice";
  }, [channelType]);

  useEffect(() => {
    stageRoleRef.current = stageRole || "speaker";
  }, [stageRole]);

  useEffect(() => {
    canSpeakRef.current = Boolean(canSpeak);
  }, [canSpeak]);

  useEffect(() => {
    canStreamRef.current = Boolean(canStream);
  }, [canStream]);

  const canPublishVoice = useCallback(() => {
    if (channelTypeRef.current === "stage") {
      return stageRoleRef.current === "speaker" && canSpeakRef.current;
    }
    return canSpeakRef.current;
  }, []);

  const canPublishVideo = useCallback(() => canPublishVoice() && canStreamRef.current, [canPublishVoice]);

  const voiceVolumeFor = useCallback((userId) => {
    const key = String(userId);
    let stored = participantVolumeRef.current.get(key);
    if (stored == null) {
      const remembered = readParticipantGain(userId);
      if (remembered != null) {
        participantVolumeRef.current.set(key, remembered);
        stored = remembered;
      }
    }
    return stored == null ? 1 : stored;
  }, []);

  const applyVoiceElement = useCallback((userId, el) => {
    if (!el) return;
    const earsOff = Boolean(serverDeafenedRef.current || deafenedRef.current);
    el.muted = earsOff;
    applyPlaybackGain(el, earsOff ? 0 : voiceVolumeFor(userId));
    const sinkId = audioOutputIdRef.current;
    if (sinkId && typeof el.setSinkId === "function") {
      el.setSinkId(sinkId).catch(() => {});
    }
  }, [voiceVolumeFor]);

  const publishLevelState = useCallback(() => {
    setParticipantVolumes(Object.fromEntries(participantVolumeRef.current));
    setScreenVolumes(Object.fromEntries(screenVolumeRef.current));
  }, []);

  const micConstraints = useCallback(() => {
    const id = audioInputIdRef.current;
    return id ? { audio: { deviceId: { exact: id } }, video: false } : { video: false };
  }, []);

  const cameraConstraints = useCallback(() => {
    const video = { ...CAMERA_CONSTRAINTS.video };
    const id = videoInputIdRef.current;
    if (id) video.deviceId = { exact: id };
    return { audio: false, video };
  }, []);

  const attachRemoteAudio = useCallback((userId, stream) => {
    let el = remoteAudioRefs.current.get(userId);
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      el.playsInline = true;
      el.style.display = "none";
      document.body.appendChild(el);
      remoteAudioRefs.current.set(userId, el);
    }
    el.srcObject = stream;
    applyVoiceElement(userId, el);
    el.play().catch(() => {});
    remoteStreamMapRef.current.set(userId, stream);
    setRemoteStreamsVersion((v) => v + 1);
    setParticipants((prev) => {
      const exists = prev.find((p) => p.id === userId);
      if (exists) return prev.map((p) => (p.id === userId ? { ...p, stream, hasAudio: true } : p));
      return [...prev, { id: userId, username: "Member", stream, hasAudio: true }];
    });
  }, [applyVoiceElement]);

  const applyRemoteDeafen = useCallback((deafened) => {
    serverDeafenedRef.current = Boolean(deafened);
    setServerDeafened(Boolean(deafened));
    for (const [userId, el] of remoteAudioRefs.current.entries()) {
      applyVoiceElement(userId, el);
    }
    if (deafened) {
      const track = localStreamRef.current?.getAudioTracks()?.[0];
      if (track) track.enabled = false;
      setMuted(true);
    }
  }, [applyVoiceElement]);

  const updateRemoteParticipant = useCallback((userId, patch) => {
    if (!userId) return;
    setParticipants((prev) => {
      const exists = prev.find((p) => p.id === userId);
      if (exists) return prev.map((p) => (p.id === userId ? { ...p, ...patch } : p));
      return [...prev, { id: userId, username: "Member", ...patch }];
    });
  }, []);

  const getMediaConfig = useCallback(async () => {
    if (liveKitConfigRef.current) return liveKitConfigRef.current;
    try {
      const res = await fetch(`${apiBase()}/api/webrtc/media-config`, {
        credentials: "omit",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("media-config failed");
      liveKitConfigRef.current = await res.json();
    } catch {
      liveKitConfigRef.current = { sfu: false };
    }
    return liveKitConfigRef.current;
  }, []);

  // 3.0.0 (A0): one aggregate setup summary per voice join (no ids).
  const voiceTelemetryRef = useRef(null);
  if (!voiceTelemetryRef.current) {
    const sender = createCallTelemetrySender({ getSocket: () => socketRef.current });
    voiceTelemetryRef.current = createGroupCallTelemetry({
      send: (summary) => sender.send(summary),
      context: () => ({ platform: IOS_NATIVE ? "ios-app" : "web" }),
    });
  }

  const getLiveKitToken = useCallback(async (channelId) => {
    const token = getToken();
    if (!token || !channelId) return { enabled: false };
    const res = await fetch(
      `${apiBase()}/api/webrtc/livekit-token?channelId=${encodeURIComponent(channelId)}`,
      {
        headers: { Authorization: `Bearer ${token}`, ...platformHeaders() },
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body?.error || "Could not prepare SFU voice.");
      err.code = `http-${res.status === 401 || res.status === 403 ? "auth" : res.status >= 500 ? "server" : "client"}`;
      throw err;
    }
    return res.json();
  }, []);

  /** iOS screen companion token (`<userId>:screen`, screen share only). */
  const getLiveKitScreenToken = useCallback(async (channelId) => {
    const token = getToken();
    if (!token || !channelId) {
      const err = new Error("Not signed in.");
      err.code = "AUTH";
      throw err;
    }
    const res = await fetch(
      `${apiBase()}/api/webrtc/livekit-screen-token?channelId=${encodeURIComponent(channelId)}`,
      { headers: { Authorization: `Bearer ${token}`, ...platformHeaders() }, cache: "no-store" }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.enabled || !body?.token) {
      const err = new Error(body?.error || "Could not prepare screen sharing.");
      err.code = body?.enabled === false ? "SFU_REQUIRED" : body?.code || `http-${res.status}`;
      throw err;
    }
    return body;
  }, []);

  /**
   * iOS broadcast share state. The share counts as published (isScreenSharing,
   * server:voice:screen:start) only once the native room says "live", so a
   * dismissed picker never shows a share that did not start.
   */
  const applyNativeShare = useCallback((event) => {
    const prev = nativeShareRef.current;
    const next = nextShareState(prev, event);
    if (next === prev) return;
    nativeShareRef.current = next;
    setNativeShare(next);
    const transition = shareTransition(prev, next);
    const channelId = activeChannelIdRef.current;
    const sock = socketRef.current;
    if (transition === "started") {
      if (!channelId) {
        void stopNativeBroadcast("left-channel");
        return;
      }
      setIsScreenSharing(true);
      if (sock?.connected) sock.emit("server:voice:screen:start", { channelId });
      audioManager.play("screenShareStart");
    } else if (transition === "stopped") {
      setIsScreenSharing(false);
      if (channelId && sock?.connected) sock.emit("server:voice:screen:stop", { channelId });
      audioManager.play("screenShareStop");
    }
    if (next.error && next.error !== prev.error) toastRef.current?.(tRuntime(next.error), "error");
  }, []);

  /** Mint the companion token and hand it to the native room (picker optional). */
  const beginNativeShare = useCallback(
    async ({ anchor = null, showPicker = true } = {}) => {
      const channelId = activeChannelIdRef.current;
      if (!channelId) return;
      if (!sfuModeRef.current || !liveKitRoomRef.current) {
        // The broadcast is published through LiveKit; a mesh fallback session cannot carry it.
        applyNativeShare({ type: "fail", error: tokenErrorKey("SFU_REQUIRED") });
        if (!showPicker) void stopNativeBroadcast("no-sfu");
        return;
      }
      applyNativeShare({ type: "request" });
      try {
        const data = await getLiveKitScreenToken(channelId);
        // Cancelled (or left the channel) while the token was minted.
        if (activeChannelIdRef.current !== channelId || nativeShareRef.current.phase !== "preparing") {
          if (nativeShareRef.current.phase === "preparing") applyNativeShare({ type: "reset" });
          return;
        }
        const url = liveKitUrlRef.current || data.livekitUrl;
        // Descall+ 2.0: the broadcast never encodes above the plan's ceiling (iOS already tops out at 1080p / 15).
        const ceil = data.screenCeiling && data.screenCeiling.locked ? data.screenCeiling : null;
        await startNativeBroadcast({ url, token: data.token, anchor, showPicker, ...(ceil ? { maxHeight: Math.min(1080, ceil.height), fps: Math.min(15, ceil.fps) } : {}) });
      } catch (err) {
        console.warn("[ServerVoice] iOS screen broadcast failed:", err?.code || "", err?.message || err);
        applyNativeShare({ type: "fail", error: tokenErrorKey(err?.code) });
        if (!showPicker) void stopNativeBroadcast("token-failed");
      }
    },
    [applyNativeShare, getLiveKitScreenToken]
  );

  const disconnectLiveKit = useCallback(() => {
    publishActiveSpeakers(null, []);
    // A room still connecting (join left or replaced meanwhile) must never come up later
    // as a second voice session.
    abandonPendingRooms(liveKitPendingRef.current);
    const room = liveKitRoomRef.current;
    liveKitRoomRef.current = null;
    setLiveKitLink("idle");
    if (room) {
      try {
        room.disconnect();
      } catch {
        /* ignore */
      }
    }
    sfuModeRef.current = false;
    setMediaMode("mesh");
  }, []);

  const cleanupPeer = useCallback((userId) => {
    const peer = pcMapRef.current.get(userId);
    if (peer?.recoveryTimer) {
      clearTimeout(peer.recoveryTimer);
      peer.recoveryTimer = null;
    }
    safeClosePeer(peer?.pc);
    pcMapRef.current.delete(userId);
    if (remoteStreamMapRef.current.has(userId)) {
      remoteStreamMapRef.current.delete(userId);
      setRemoteStreamsVersion((v) => v + 1);
    }
    const el = remoteAudioRefs.current.get(userId);
    if (el) {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        /* ignore */
      }
      releasePlaybackGain(el);
      remoteAudioRefs.current.delete(userId);
    }
    remoteScreenStreamsRef.current.delete(userId);
  }, []);

  const connectLiveKitRoom = useCallback(
    async (channelId, tokenData, stream) => {
      if (!tokenData?.enabled || !tokenData?.livekitUrl || !tokenData?.token) return false;
      const { Room, RoomEvent, Track } = await loadLiveKit();
      const room = trackPendingRoom(liveKitPendingRef.current, new Room(liveKitRoomOptions()));
      // Events of an abandoned room (left while connecting) must not touch the session.
      const live = () => isLiveRoom(liveKitRoomRef, liveKitPendingRef.current, room);
      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        if (!live()) return;
        const userId = participant?.identity;
        if (!userId || isScreenCompanionIdentity(userId)) return;
        const next = String(quality || "").toLowerCase();
        if (!next || next === "unknown") return;
        setLinkQualityByUser((prev) => (prev[userId] === next ? prev : { ...prev, [userId]: next }));
      });
      // 3D world speaking rings (lib/activeSpeakers.js): no React state, no re-render.
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (liveKitRoomRef.current && liveKitRoomRef.current !== room) return;
        publishActiveSpeakers(channelId, speakerIdsWithoutCompanions((speakers || []).map((p) => p?.identity)));
      });
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (!live()) return;
        const parsed = parseLiveKitIdentity(participant?.identity);
        if (parsed.companion === "screen") {
          // An iOS screen broadcast ended: the owner stays, only their share goes.
          const ownerId = parsed.userId;
          if (String(ownerId) === String(myIdRef.current)) return;
          remoteScreenStreamsRef.current.delete(ownerId);
          setParticipants((prev) =>
            prev.map((p) => (String(p.id) === String(ownerId) ? { ...p, screenStream: null, isScreenSharing: false } : p))
          );
          return;
        }
        cleanupPeer(participant.identity);
        setParticipants((prev) => prev.filter((p) => p.id !== participant.identity));
      });
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (!live()) {
          try {
            publication?.setSubscribed?.(false);
          } catch {
            /* ignore */
          }
          return;
        }
        // `<userId>:screen` (iOS broadcast companion) is the owner's screen share.
        const routed = routeLiveKitTrack({ identity: participant?.identity, myUserId: myIdRef.current });
        if (routed.ignore) {
          try {
            publication?.setSubscribed?.(false);
          } catch {
            /* ignore */
          }
          return;
        }
        const userId = routed.userId;
        const mediaTrack = track.mediaStreamTrack;
        if (!userId || !mediaTrack) return;
        const source = publication?.source || track?.source;
        const role = routed.companion ? "screen" : classifyLiveKitTrack({
          kind: track.kind,
          source,
          trackName: publication?.trackName || track?.name || null,
          displaySurface: mediaTrack.getSettings?.().displaySurface,
          label: mediaTrack.label,
          announcement: screenAnnouncementsRef.current.get(String(userId)) || null,
        });
        // adaptiveStream: the panel's <video> elements report size/visibility
        // for this track (lib/liveKitVideoBinding.js), or the SFU pauses it.
        if (track.kind === "video") registerLiveKitVideoTrack(mediaTrack, track);
        if (role === "screen") {
          const merged = nextScreenStream(remoteScreenStreamsRef.current.get(userId) || null, mediaTrack);
          remoteScreenStreamsRef.current.set(userId, merged);
          updateRemoteParticipant(userId, { screenStream: merged, isScreenSharing: true });
          return;
        }
        if (role === "mic") {
          voiceTelemetryRef.current?.mark("lkFirstAudioMs");
          attachRemoteAudio(userId, new MediaStream([mediaTrack]));
          return;
        }
        updateRemoteParticipant(userId, {
          cameraStream: new MediaStream([mediaTrack]),
          cameraOn: true,
        });
      });
      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (!live()) return;
        const routed = routeLiveKitTrack({ identity: participant?.identity, myUserId: myIdRef.current });
        if (routed.ignore) return;
        const userId = routed.userId;
        if (!userId) return;
        const source = publication?.source || track?.source;
        const mediaTrack = track?.mediaStreamTrack;
        if (track?.kind === "video") unregisterLiveKitVideoTrack(mediaTrack);
        const role = routed.companion ? "screen" : classifyLiveKitTrack({
          kind: track.kind,
          source,
          trackName: publication?.trackName || track?.name || null,
          announcement: screenAnnouncementsRef.current.get(String(userId)) || null,
        });
        if (role === "screen") {
          const stream = remoteScreenStreamsRef.current.get(userId) || null;
          if (stream && mediaTrack) {
            try {
              stream.removeTrack(mediaTrack);
            } catch {
              /* ignore */
            }
          }
          if (!screenShareStillLive(stream)) {
            remoteScreenStreamsRef.current.delete(userId);
            updateRemoteParticipant(userId, { screenStream: null, isScreenSharing: false });
          } else {
            updateRemoteParticipant(userId, { screenStream: stream, isScreenSharing: true });
          }
          return;
        }
        if (role === "mic") {
          cleanupPeer(userId);
          return;
        }
        updateRemoteParticipant(userId, { cameraStream: null, cameraOn: false });
      });
      room.on(RoomEvent.Reconnecting, () => {
        if (liveKitRoomRef.current !== room) return;
        voiceTelemetryRef.current?.countReconnect();
        setLiveKitLink("reconnecting");
      });
      room.on(RoomEvent.Reconnected, () => {
        if (liveKitRoomRef.current !== room) return;
        setLiveKitLink("connected");
      });
      room.on(RoomEvent.Disconnected, (reason) => {
        if (liveKitRoomRef.current !== room) return;
        setLiveKitLink("disconnected");
        liveKitLinkRef.current = "disconnected";
        onLiveKitDroppedRef.current?.(channelId, reason);
      });
      const livekitUrls = tokenData.livekitUrls?.length ? tokenData.livekitUrls : [tokenData.livekitUrl];
      let probed = false;
      let livekitUrl = tokenData.livekitUrl;
      try {
        livekitUrl =
          (await pickFastestLiveKitUrl(livekitUrls, { onProbe: () => { probed = true; } })) || tokenData.livekitUrl;
        if (!probed) voiceTelemetryRef.current?.set("urlProbeSkipped", true);
        voiceTelemetryRef.current?.mark("urlProbeMs");
        if (!live()) throw supersededRoomError();
        await room.connect(livekitUrl, tokenData.token);
      } catch (err) {
        dropPendingRoom(liveKitPendingRef.current, room);
        throw err;
      }
      // Left or switched channel while connecting: this room is closed, never adopted.
      if (!adoptConnectedRoom({ slot: liveKitRoomRef, pending: liveKitPendingRef.current, room, wanted: activeChannelIdRef.current === channelId })) {
        throw supersededRoomError();
      }
      liveKitUrlRef.current = livekitUrl;
      voiceTelemetryRef.current?.mark("lkConnectMs");
      voiceTelemetryRef.current?.set("media", "sfu");
      setLiveKitLink("connected");
      sfuModeRef.current = true;
      setMediaMode("sfu");
      const audioTrack = stream?.getAudioTracks?.()[0] || null;
      // A server mute / AFK lock gives a token without publish rights: do not publish.
      if (audioTrack && canPublishVoice() && tokenData.canPublish !== false) {
        await room.localParticipant.publishTrack(audioTrack, liveKitMicPublishOptions(Track.Source.Microphone));
        voiceTelemetryRef.current?.mark("published");
      }
      return true;
    },
    [attachRemoteAudio, canPublishVoice, cleanupPeer, updateRemoteParticipant]
  );

  /**
   * The server enforces mutes in LiveKit (publish / subscribe rights). When a lock is
   * lifted, put the microphone back and resubscribe to the room's tracks.
   */
  const restoreLiveKitRights = useCallback(async ({ publish = false, subscribe = false } = {}) => {
    const room = liveKitRoomRef.current;
    if (!room || !sfuModeRef.current) return;
    try {
      if (subscribe) {
        for (const participant of room.remoteParticipants?.values?.() || []) {
          for (const pub of participant.trackPublications?.values?.() || []) {
            if (!pub.isSubscribed) pub.setSubscribed?.(true);
          }
        }
      }
      if (publish && canPublishVoice()) {
        const track = localStreamRef.current?.getAudioTracks?.()[0] || null;
        const { Track } = await loadLiveKit();
        const published = room.localParticipant?.getTrackPublication?.(Track.Source.Microphone);
        if (track && !published) {
          await room.localParticipant.publishTrack(track, liveKitMicPublishOptions(Track.Source.Microphone));
        }
      }
    } catch (err) {
      console.warn("[ServerVoice] LiveKit rights restore failed:", err?.message || err);
    }
  }, [canPublishVoice]);

  /**
   * LiveKit room lost while we still hold the seat (server-voice-06). The server's
   * `server:voice:joined` for a re-join carries a fresh token; connect with it.
   */
  const reconnectLiveKit = useCallback(
    async (channelId, tokenData) => {
      if (!tokenData?.token || !channelId || activeChannelIdRef.current !== channelId) return;
      if (reconnectLiveKitRef.busy) return;
      reconnectLiveKitRef.busy = true;
      try {
        disconnectLiveKit();
        setLiveKitLink("connecting");
        const stream = localStreamRef.current || new MediaStream();
        await connectLiveKitRoom(channelId, tokenData, stream);
        voiceTelemetryRef.current?.countReconnect();
      } catch (err) {
        if (err?.code === "LIVEKIT_SUPERSEDED") return;
        console.warn("[ServerVoice] LiveKit reconnect failed:", err?.message || err);
        setLiveKitLink("disconnected");
      } finally {
        reconnectLiveKitRef.busy = false;
      }
    },
    [connectLiveKitRoom, disconnectLiveKit]
  );

  const onLiveKitDropped = useCallback((channelId, reason) => {
    if (!channelId || activeChannelIdRef.current !== channelId) return;
    const action = liveKitDropAction(reason);
    if (action === "none") return;
    if (action === "other-device") {
      // The same account joined voice elsewhere: this device leaves quietly.
      cleanupAllRef.current?.({ emitLeave: false, result: "dropped", reason: "other_device" });
      setError("callui.voice.disconnected");
      return;
    }
    const budget = liveKitRetryBudget(liveKitRecoverRef.current.attempts);
    if (!budget.allowed) {
      // Gave up: say so instead of sitting in a silent "connected" seat.
      cleanupAllRef.current?.({ result: "dropped", reason: "livekit_lost" });
      setError("callui.voice.disconnected");
      return;
    }
    liveKitRecoverRef.current.attempts = [...budget.kept, Date.now()];
    const rejoin = () => {
      liveKitRecoverRef.current.timer = null;
      const sock = socketRef.current;
      const serverId = activeServerIdRef.current;
      if (activeChannelIdRef.current !== channelId || !sock?.connected || !serverId) return;
      // Re-take the seat: the answer (server:voice:joined, no join waiter) brings the token.
      sock.emit("server:voice:join", { serverId, channelId });
    };
    if (liveKitRecoverRef.current.timer) clearTimeout(liveKitRecoverRef.current.timer);
    // Removed / room gone: a moderator force-disconnect may be on its way; let it win.
    liveKitRecoverRef.current.timer = setTimeout(rejoin, action === "rejoin-later" ? 1500 : 300);
  }, []);

  useEffect(() => {
    reconnectLiveKitRef.current = reconnectLiveKit;
    onLiveKitDroppedRef.current = onLiveKitDropped;
  }, [reconnectLiveKit, onLiveKitDropped]);

  const removeUserFromVoiceStates = useCallback((channelId, userId, serverId = null) => {
    if (!channelId || !userId) return;
    const uid = String(userId);
    setVoiceStatesByServer((prev) => {
      const next = { ...prev };
      const serverIds = serverId
        ? [String(serverId)]
        : Object.keys(next);
      let changed = false;
      for (const sid of serverIds) {
        const channels = next[sid];
        if (!channels?.[channelId]) continue;
        const members = (channels[channelId].members || []).filter(
          (m) => String(m?.id) !== uid
        );
        if (members.length === (channels[channelId].members || []).length) continue;
        changed = true;
        next[sid] = {
          ...channels,
          [channelId]: {
            members,
            memberCount: members.length,
          },
        };
      }
      return changed ? next : prev;
    });
  }, []);

  const emitVoiceLeave = useCallback(() => {
    const channelId = activeChannelIdRef.current || lastVoiceChannelIdRef.current;
    const sock = socketRef.current;
    if (!channelId || !sock) return;
    try {
      sock.emit("server:voice:leave", { channelId });
    } catch (err) {
      console.warn("[ServerVoice] leave emit failed:", err?.message || err);
    }
  }, []);

  /**
   * Leave locally. `emitLeave: false` when the server already dropped the seat
   * (force-disconnect, refused join): a leave for a seat we no longer hold made the
   * server drop seats of the user's other device. `result` / `reason` feed the drop
   * telemetry (voice-drops-05); event objects passed by UI handlers are ignored.
   */
  const cleanupAll = useCallback((opts) => {
    const options = opts && typeof opts === "object" && !("nativeEvent" in opts) && !("target" in opts) ? opts : {};
    const { emitLeave = true, result = "ended", reason = null } = options;
    const telemetry = voiceTelemetryRef.current;
    const stats = linkStatsRef.current;
    if (telemetry) {
      telemetry.set("sockDrops", stats.sockDrops);
      telemetry.set("pcFailed", stats.pcFailed);
      telemetry.set("iceRestarts", stats.iceRestarts);
      telemetry.set("rebuilds", stats.rebuilds);
      if (stats.startedAt) telemetry.set("sessionS", Math.round((Date.now() - stats.startedAt) / 1000));
      if (reason) telemetry.set("dropReason", dropReasonToken(reason));
      telemetry.finish(result);
    }
    linkStatsRef.current = { sockDrops: 0, pcFailed: 0, iceRestarts: 0, rebuilds: 0, startedAt: 0 };
    if (liveKitRecoverRef.current.timer) clearTimeout(liveKitRecoverRef.current.timer);
    liveKitRecoverRef.current = { attempts: [], timer: null };
    if (emitLeave) emitVoiceLeave();
    const leavingChannelId = activeChannelIdRef.current || lastVoiceChannelIdRef.current;
    const leavingServerId = activeServerIdRef.current;
    const meId = myIdRef.current;
    disconnectLiveKit();
    for (const userId of [...pcMapRef.current.keys()]) cleanupPeer(userId);
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);
    if (nativeShareRef.current.phase !== "idle") {
      // Leaving voice ends the iOS broadcast too (the server also removes the companion).
      void stopNativeBroadcast("left-channel");
      nativeShareRef.current = INITIAL_SHARE_STATE;
      setNativeShare(INITIAL_SHARE_STATE);
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setCameraStream(null);
    setIsCameraOn(false);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    disposeNoiseSuppressionSession({ stopRaw: true });
    remoteStreamMapRef.current = new Map();
    setLocalStream(null);
    setRemoteStreamsVersion((v) => v + 1);
    // Drop own ghost from sidebar voice lists immediately
    if (leavingChannelId && meId) {
      removeUserFromVoiceStates(leavingChannelId, meId, leavingServerId);
    }
    // Sync refs immediately so follow-up join/leave races don't use stale channel ids.
    activeChannelIdRef.current = null;
    activeServerIdRef.current = null;
    setActiveChannelId(null);
    setActiveServerId(null);
    setChannelName("");
    setParticipants([]);
    setMuted(readLocalMute());
    setLinkQualityByUser({});
    setServerMuted(false);
    serverMutedRef.current = false;
    setServerDeafened(false);
    serverDeafenedRef.current = false;
    setDeafened(false);
    deafenedRef.current = false;
    mutedByDeafenRef.current = false;
    setChannelType("voice");
    setStageRole("speaker");
    setRequestedToSpeak(false);
    setCanRequestToSpeak(false);
    setCanSpeak(true);
    setCanStream(true);
    setConnecting(false);
  }, [cleanupPeer, disconnectLiveKit, emitVoiceLeave, removeUserFromVoiceStates]);

  const flushIce = async (pc, userId) => {
    const peer = pcMapRef.current.get(userId);
    if (!peer?.pendingIce?.length) return;
    for (const c of peer.pendingIce) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* ignore */
      }
    }
    peer.pendingIce = [];
  };

  const setupPc = useCallback(
    (pc, stream, userId, channelId) => {
      if (canPublishVoice()) {
        attachLocalTracks(pc, stream);
      }
      if (cameraStreamRef.current && canPublishVideo()) {
        const peer = pcMapRef.current.get(userId);
        const v = cameraStreamRef.current.getVideoTracks()[0];
        if (v && peer) peer.cameraSender = pc.addTrack(v, cameraStreamRef.current);
      }
      // If we are already screen sharing, attach those tracks to new peers
      if (screenStreamRef.current && canPublishVideo()) {
        const peer = pcMapRef.current.get(userId);
        const ss = screenStreamRef.current;
        const v = ss.getVideoTracks()[0];
        const a = ss.getAudioTracks()[0];
        if (v && peer) {
          peer.screenSender = addDedicatedSender(pc, v, ss);
          if (a) peer.screenAudioSender = addDedicatedSender(pc, a, ss);
          void tuneLateScreenSender(pc, peer.screenSender, Math.max(1, pcMapRef.current.size));
        }
      }
      pc.ontrack = (e) => {
        const track = e.track;
        const peer = pcMapRef.current.get(userId);
        const described = describeRtcTrackEvent(e);
        if (peer) {
          peer.inbound = (peer.inbound || []).filter(
            (entry) => entry.track && entry.track !== track && entry.track.readyState !== "ended"
          );
          peer.inbound.push(described);
        }
        const role = classifyInboundMedia({
          ...described,
          announcement: peer?.screenAnnouncement || screenAnnouncementsRef.current.get(String(userId)) || null,
        });
        if (role === "mic") tuneAudioReceiver(e.receiver);
        const remote = e.streams?.[0] || new MediaStream([track]);
        const isScreenVideo = role === "screen";
        const isScreenAudio = role === "screen-audio";
        if (isScreenVideo || isScreenAudio) {
          if (isScreenVideo && peer) peer.expectScreenShare = false;
          setParticipants((prev) => {
            const exists = prev.find((p) => p.id === userId);
            const existingScreen = exists?.screenStream || null;
            let screenStream = remote;
            if (existingScreen) {
              const kept = existingScreen
                .getTracks()
                .filter((t) => t.readyState !== "ended" && t.kind !== track.kind);
              const incoming = remote
                .getTracks()
                .filter((t) => t.readyState !== "ended");
              const merged = new MediaStream([...kept, ...incoming]);
              if (!merged.getTracks().includes(track) && track.readyState !== "ended") {
                merged.addTrack(track);
              }
              screenStream = merged;
            }
            if (exists) {
              return prev.map((p) =>
                p.id === userId
                  ? { ...p, screenStream, isScreenSharing: true, hasAudio: true }
                  : p
              );
            }
            return [
              ...prev,
              {
                id: userId,
                username: "Member",
                screenStream,
                isScreenSharing: true,
              },
            ];
          });
          return;
        }
        if (track.kind === "video") {
          setParticipants((prev) => {
            const exists = prev.find((p) => p.id === userId);
            if (exists) {
              return prev.map((p) =>
                p.id === userId ? { ...p, cameraStream: remote, cameraOn: true } : p
              );
            }
            return [...prev, { id: userId, username: "Member", cameraStream: remote, cameraOn: true }];
          });
          return;
        }
        attachRemoteAudio(userId, remote);
      };
      pc.onicecandidate = (e) => {
        if (e.candidate && socket?.connected) {
          socket.emit("server:voice:ice", {
            channelId,
            toUserId: userId,
            candidate: e.candidate,
          });
        }
      };
      // A failed link is healed (ICE restart, then a rebuild), never dropped from
      // the roster: the server's seat list decides who is in the channel
      // (voice-drops-03; this used to delete the peer for good on "failed").
      pc.onconnectionstatechange = () => {
        const current = pcMapRef.current.get(userId);
        if (!current || current.pc !== pc) return;
        handlePeerLinkRef.current?.(userId, pc.connectionState);
      };
    },
    [attachRemoteAudio, canPublishVideo, canPublishVoice, socket]
  );

  const renegotiateWithPeer = useCallback(
    async (userId, peerData) => {
      if (!peerData?.pc || !socket?.connected) return;
      if (peerData.pc.connectionState === "closed" || peerData.pc.signalingState === "closed") {
        return;
      }
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (peerData.pc.signalingState === "stable") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (peerData.pc.signalingState !== "stable") return;
      const channelId = activeChannelIdRef.current;
      if (!channelId) return;
      try {
        const offer = await peerData.pc.createOffer();
        await commitLocalDescription(peerData.pc, offer);
        const screen = peerData.screenSender
          ? announcementFromSenders(
              peerData.pc,
              screenStreamRef.current,
              peerData.screenSender,
              peerData.screenAudioSender
            )
          : null;
        socket.emit("server:voice:offer", {
          channelId,
          toUserId: userId,
          offer: peerData.pc.localDescription,
          ...(screen ? { screen } : {}),
        });
      } catch (err) {
        console.warn("[ServerVoice] renegotiate failed:", err);
      }
    },
    [socket]
  );

  const offerToPeer = useCallback(
    async (user, channelId) => {
      if (!user?.id || !localStreamRef.current || !socket) return;
      if (sfuModeRef.current) return;
      if (pcMapRef.current.has(user.id)) return;
      const pc = createPeerConnection({});
      const peer = { pc, pendingIce: [] };
      pcMapRef.current.set(user.id, peer);
      setupPc(pc, localStreamRef.current, user.id, channelId);
      setParticipants((prev) => {
        if (prev.find((p) => p.id === user.id)) {
          return prev.map((p) => (p.id === user.id ? { ...p, ...user } : p));
        }
        return [...prev, { ...user, hasAudio: true }];
      });
      try {
        const offer = await pc.createOffer();
        await commitLocalDescription(pc, offer);
        const screen = peer.screenSender
          ? announcementFromSenders(pc, screenStreamRef.current, peer.screenSender, peer.screenAudioSender)
          : null;
        socket.emit("server:voice:offer", {
          channelId,
          toUserId: user.id,
          offer: pc.localDescription,
          ...(screen ? { screen } : {}),
        });
      } catch (err) {
        console.warn("[ServerVoice] offer failed:", err);
        cleanupPeer(user.id);
      }
    },
    [cleanupPeer, setupPc, socket]
  );

  /* ---------------------------------------------- mesh link recovery (voice-drops-03) */

  const setPeerTrouble = useCallback((userId, trouble) => {
    setParticipants((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        if (String(p.id) !== String(userId) || Boolean(p.linkTrouble) === trouble) return p;
        changed = true;
        return { ...p, linkTrouble: trouble };
      });
      return changed ? next : prev;
    });
  }, []);

  /** ICE restart: flag it and send the restart offer (mesh has no negotiationneeded handler). */
  const restartPeerIce = useCallback(
    async (userId) => {
      const peer = pcMapRef.current.get(userId);
      const pc = peer?.pc;
      if (!pc || sfuModeRef.current || pc.signalingState === "closed") return;
      const sock = socketRef.current;
      if (!sock?.connected) {
        // Held while the socket is down; the rejoin on connect runs it.
        peer.restartPending = true;
        return;
      }
      peer.restartPending = false;
      linkStatsRef.current.iceRestarts += 1;
      try {
        // An offer lost while the socket was down would block the restart forever.
        if (pc.signalingState === "have-local-offer") await pc.setLocalDescription({ type: "rollback" });
      } catch {
        /* older engines: renegotiateWithPeer waits for stable */
      }
      try {
        pc.restartIce();
      } catch {
        /* createOffer({ iceRestart }) below still asks for new credentials */
      }
      await renegotiateWithPeer(userId, peer);
    },
    [renegotiateWithPeer]
  );

  /** Close a link that did not heal and build a new one (the impolite side offers). */
  const rebuildPeer = useCallback(
    (userId) => {
      const channelId = activeChannelIdRef.current;
      const peer = pcMapRef.current.get(userId);
      if (!channelId || !peer) return;
      if (!isPoliteSide(myIdRef.current, userId)) {
        linkStatsRef.current.rebuilds += 1;
        const user = participantsRef.current.find((p) => String(p.id) === String(userId)) || { id: userId };
        cleanupPeer(userId);
        void offerToPeer({ ...user, id: userId }, channelId);
      } else {
        // Polite side waits for the fresh offer (onOffer replaces the old link).
        peer.troubleSince = Date.now();
        peer.restartAttempt = 0;
      }
    },
    [cleanupPeer, offerToPeer]
  );

  const runPeerRecovery = useCallback(
    async (userId) => {
      const peer = pcMapRef.current.get(userId);
      if (!peer) return;
      peer.recoveryTimer = null;
      const state = peer.pc?.connectionState;
      if (state === "connected" || state === "closed" || !activeChannelIdRef.current) return;
      // No longer seated with us (left, moved): stop healing a link nobody needs.
      if (!participantsRef.current.some((p) => String(p.id) === String(userId))) {
        cleanupPeer(userId);
        return;
      }
      const polite = isPoliteSide(myIdRef.current, userId);
      const decision = peerLinkDecision({
        state: "failed",
        troubleSinceMs: peer.troubleSince,
        nowMs: Date.now(),
        attempt: peer.restartAttempt || 0,
        polite,
      });
      if (decision.action === "rebuild") {
        rebuildPeer(userId);
        const again = pcMapRef.current.get(userId);
        if (again && again === peer && !peer.recoveryTimer) {
          peer.recoveryTimer = setTimeout(() => void runPeerRecoveryRef.current?.(userId), decision.delayMs || 15000);
        }
        return;
      }
      await restartPeerIce(userId);
      peer.restartAttempt = (peer.restartAttempt || 0) + 1;
      if (pcMapRef.current.get(userId) !== peer || peer.recoveryTimer) return;
      const next = peerLinkDecision({ state: "failed", attempt: peer.restartAttempt, polite });
      peer.recoveryTimer = setTimeout(() => void runPeerRecoveryRef.current?.(userId), next.delayMs || 15000);
    },
    [cleanupPeer, rebuildPeer, restartPeerIce]
  );
  const runPeerRecoveryRef = useRef(runPeerRecovery);
  runPeerRecoveryRef.current = runPeerRecovery;

  const handlePeerLink = useCallback(
    (userId, state) => {
      const peer = pcMapRef.current.get(userId);
      if (!peer) return;
      if (state === "connected") {
        if (peer.recoveryTimer) clearTimeout(peer.recoveryTimer);
        peer.recoveryTimer = null;
        peer.troubleSince = null;
        peer.restartAttempt = 0;
        peer.restartPending = false;
        setPeerTrouble(userId, false);
        return;
      }
      if (state !== "disconnected" && state !== "failed") return;
      if (state === "failed") linkStatsRef.current.pcFailed += 1;
      if (peer.troubleSince == null) {
        peer.troubleSince = Date.now();
        setPeerTrouble(userId, true);
      }
      if (peer.recoveryTimer) return;
      const decision = peerLinkDecision({
        state,
        troubleSinceMs: peer.troubleSince,
        nowMs: Date.now(),
        attempt: peer.restartAttempt || 0,
        polite: isPoliteSide(myIdRef.current, userId),
      });
      if (decision.action === "restart") {
        peer.recoveryTimer = setTimeout(() => void runPeerRecoveryRef.current?.(userId), decision.delayMs);
      } else if (decision.action === "rebuild") {
        rebuildPeer(userId);
      }
    },
    [rebuildPeer, setPeerTrouble]
  );

  /**
   * Heal one peer link now: "network" (Wi-Fi <-> cellular, back online) restarts
   * at once; "rejoin" (socket came back) restarts links that broke or whose
   * restart was held while the socket was down.
   */
  const recoverPeer = useCallback(
    (userId, reason) => {
      if (userId == null || sfuModeRef.current) return;
      const peer = pcMapRef.current.get(userId);
      if (!peer?.pc || peer.pc.connectionState === "closed") return;
      const state = peer.pc.connectionState;
      if (reason !== "network") {
        if (state === "connected" && !peer.restartPending) return;
        if ((state === "new" || state === "connecting") && !peer.restartPending) return;
      }
      if (peer.troubleSince == null) peer.troubleSince = Date.now();
      if (peer.recoveryTimer) clearTimeout(peer.recoveryTimer);
      peer.recoveryTimer = null;
      void runPeerRecoveryRef.current?.(userId);
    },
    []
  );

  useEffect(() => {
    handlePeerLinkRef.current = handlePeerLink;
    recoverPeerRef.current = recoverPeer;
  }, [handlePeerLink, recoverPeer]);

  const leave = useCallback(() => {
    const wasIn = Boolean(activeChannelIdRef.current);
    voiceJoinEpochRef.current += 1;
    if (isScreenSharing) {
      stopScreenShareRef.current?.({ quiet: true });
    }
    cleanupAll();
    if (wasIn) audioManager.play("channelLeave");
  }, [cleanupAll, isScreenSharing]);

  const acquireJoinMic = useCallback(async () => {
    if (isNativeAndroid()) preloadNoiseSuppression();
    try {
      return await acquireVoiceMicStream(micConstraints());
    } catch (err) {
      const savedId = audioInputIdRef.current;
      if (!savedId || (err?.name !== "OverconstrainedError" && err?.name !== "NotFoundError")) throw err;
      console.warn("[ServerVoice] saved microphone unavailable, using the default:", err?.name);
      audioInputIdRef.current = "";
      setSelectedAudioInput("");
      writeAudioPref("input", "");
      toastRef.current?.(tRuntime("The saved microphone was not found, using the default microphone."), "info");
      return acquireVoiceMicStream({ video: false });
    }
  }, [micConstraints]);

  const join = useCallback(
    async (serverId, channel) => {
      if (!socket?.connected || !channel?.id || !serverId) return;
      if (activeChannelIdRef.current === channel.id) return;
      if (activeChannelIdRef.current) leave();
      const epoch = ++voiceJoinEpochRef.current;
      const stillJoining = () => voiceJoinEpochRef.current === epoch;
      const joinStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

      setConnecting(true);
      setError("");
      primeVoiceActivity();
      // Fetch media-config while the microphone starts (cached after the
      // first join) instead of serially after the join emit.
      const mediaConfigPromise = getMediaConfig();
      const telemetry = voiceTelemetryRef.current;
      telemetry?.finish("ended");
      telemetry?.begin("server", "outgoing", "voice");
      linkStatsRef.current = { sockDrops: 0, pcFailed: 0, iceRestarts: 0, rebuilds: 0, startedAt: Date.now() };
      telemetry?.mark("gumStart");
      // The LiveKit SDK loads in parallel with the mic. The token itself now comes with
      // the confirmed seat (server:voice:joined); a token without a seat is refused.
      if (liveKitConfigRef.current?.sfu || liveKitConfigRef.current?.preferSfu || !liveKitConfigRef.current) {
        loadLiveKit().catch(() => {});
      }
      let resolveJoinedToken = null;
      const joinedToken = new Promise((resolve) => {
        resolveJoinedToken = resolve;
      });
      joinedTokenWaiterRef.current = { channelId: channel.id, resolve: (data) => resolveJoinedToken?.(data) };
      let joinStep = "mic";
      try {
        const nextChannelType = channel.type === "stage" ? "stage" : "voice";
        const isStage = nextChannelType === "stage";
        // 3.7.15: the saved microphone may be gone (headset unplugged, USB mic
        // renamed). Chromium rejects the exact deviceId with an OverconstrainedError
        // whose message is empty, so the join used to end on the generic "Could not
        // join voice channel." Fall back to the system default like DM calls do.
        const stream = isStage ? new MediaStream() : await acquireJoinMic();
        telemetry?.mark("gumEnd");
        telemetry?.watch(() => Array.from(pcMapRef.current.entries()).map(([key, peer]) => [key, peer?.pc]));
        if (!stillJoining()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        const mutedNow = isStage || primeCapturedMic(stream);
        stream.getAudioTracks().forEach((t) => {
          t.enabled = !mutedNow;
        });
        setNoiseSuppressedTrackEnabled(!mutedNow);
        activeChannelIdRef.current = channel.id;
        activeServerIdRef.current = serverId;
        lastVoiceChannelIdRef.current = channel.id;
        setActiveChannelId(channel.id);
        setActiveServerId(serverId);
        setChannelName(channel.name || "");
        channelTypeRef.current = nextChannelType;
        stageRoleRef.current = isStage ? "audience" : "speaker";
        canSpeakRef.current = !isStage;
        canStreamRef.current = true;
        setChannelType(nextChannelType);
        setStageRole(isStage ? "audience" : "speaker");
        setCanSpeak(!isStage);
        setCanStream(true);
        setCanRequestToSpeak(isStage);
        setRequestedToSpeak(false);
        setParticipants([]);
        setMuted(mutedNow);
        socket.emit("server:voice:join", { serverId, channelId: channel.id });
        joinStep = "sfu";
        // Prefer LiveKit SFU whenever media-config reports it. Retry once on
        // transient token/connect failures before optionally falling back to mesh.
        const mediaConfig = await mediaConfigPromise;
        if (!stillJoining()) return;
        if (mediaConfig?.sfu || mediaConfig?.preferSfu) {
          let sfuConnected = false;
          let lastSfuErr = null;
          for (let attempt = 0; attempt < 2 && !sfuConnected; attempt += 1) {
            try {
              if (attempt > 0) {
                liveKitConfigRef.current = null;
                await new Promise((r) => setTimeout(r, 350));
                if (!stillJoining()) return;
              }
              // First attempt: the token from server:voice:joined (servers before
              // 2026-11-15 send none; then, and on retry, ask the token route).
              const fromJoin =
                attempt === 0
                  ? await Promise.race([joinedToken, new Promise((r) => window.setTimeout(() => r(null), 6000))])
                  : null;
              if (!stillJoining() || activeChannelIdRef.current !== channel.id) return;
              const tokenData = fromJoin?.token ? fromJoin : (await getLiveKitToken(channel.id).catch((tokenErr) => {
                telemetry?.set("tokenError", tokenErr?.code || "network");
                throw tokenErr;
              }));
              telemetry?.mark("tokenMs");
              if (!stillJoining()) return;
              if (!tokenData?.enabled) {
                lastSfuErr = new Error(tokenData?.error || "LiveKit token unavailable");
                continue;
              }
              // canSpeak = permission (SPEAK, stage speaker); a server mute is a
              // separate lock, so lifting it later needs no new token.
              const speakPerm = tokenData.canSpeak !== undefined ? tokenData.canSpeak : tokenData.canPublish;
              canSpeakRef.current = Boolean(speakPerm);
              setCanSpeak(Boolean(speakPerm));
              // Descall+ 2.0: the server's screen ceiling for this person here (null = no limit).
              if (tokenData.screenCeiling !== undefined) setScreenCeiling(tokenData.screenCeiling, activeServerIdRef.current || "");
              if (tokenData.canStream !== undefined) {
                canStreamRef.current = Boolean(tokenData.canStream);
                setCanStream(Boolean(tokenData.canStream));
              }
              if (tokenData.channelType) {
                channelTypeRef.current = tokenData.channelType;
                setChannelType(tokenData.channelType);
              }
              if (tokenData.stageRole) {
                stageRoleRef.current = tokenData.stageRole;
                setStageRole(tokenData.stageRole);
              }
              setCanRequestToSpeak(Boolean(tokenData.canRequestToSpeak));
              await connectLiveKitRoom(channel.id, tokenData, stream);
              if (!stillJoining()) return;
              sfuConnected = true;
            } catch (sfuErr) {
              // Left or switched channel while this room connected: the newer session owns
              // the LiveKit slot now; disconnecting here would end that one.
              if (!stillJoining() || sfuErr?.code === "LIVEKIT_SUPERSEDED") return;
              if (sfuErr?.code) telemetry?.set("tokenError", sfuErr.code);
              lastSfuErr = sfuErr;
              disconnectLiveKit();
            }
          }
          if (!sfuConnected) {
            if (mediaConfig?.forceSfu) {
              throw lastSfuErr || new Error("LiveKit SFU is required but unavailable.");
            }
            console.warn("[ServerVoice] SFU connect failed; falling back to mesh:", lastSfuErr);
          }
        }
        // Performans: "Sese katılma" = join click -> seat confirmed and media connected.
        if (stillJoining()) rumDone("voicejoin", { route: "app/ses", kind: sfuModeRef.current ? "sfu" : "mesh", fallbackStart: joinStartedAt });
      } catch (err) {
        if (!stillJoining()) return;
        telemetry?.finish(isVoiceMicError(err) ? "mic-error" : "failed");
        cleanupAll();
        // Never a silent generic error: log the real name, and say which step failed.
        console.error("[ServerVoice] join failed:", err?.name || "", err?.message || "", err);
        const msg = isVoiceMicError(err) || err?.name === "OverconstrainedError"
          ? voiceMicErrorCopy(err)
          : err?.message
            || (joinStep === "mic" ? "Could not access the microphone." : "Could not connect to the voice server.");
        setError(msg);
        if (isVoiceMicError(err)) toast(tRuntime(msg), "error");
      } finally {
        if (joinedTokenWaiterRef.current?.channelId === channel.id) joinedTokenWaiterRef.current = null;
        if (stillJoining()) setConnecting(false);
      }
    },
    [acquireJoinMic, cleanupAll, connectLiveKitRoom, disconnectLiveKit, getLiveKitToken, getMediaConfig, leave, micConstraints, socket, toast]
  );

  const setMicEnabled = useCallback((enabled, { persist = false, sound = true, ptt = false } = {}) => {
    if ((deafenedRef.current || serverMutedRef.current) && enabled) return;
    const track = localStreamRef.current?.getAudioTracks()?.[0];
    if (!track || track.enabled === enabled) return;
    track.enabled = enabled;
    setNoiseSuppressedTrackEnabled(enabled);
    const nextMuted = !enabled;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    if (persist) writeLocalMute(nextMuted);
    if (!nextMuted) mutedByDeafenRef.current = false;
    if (sound) audioManager.play(nextMuted ? "mute" : "unmute");
    const channelId = activeChannelIdRef.current;
    const s = socketRef.current;
    if (channelId && s?.connected) {
      s.emit("server:voice:media-state", {
        channelId,
        muted: nextMuted,
        deafened: deafenedRef.current,
        cameraOn: cameraStreamRef.current?.getVideoTracks?.()[0]?.readyState === "live",
        // Push-to-talk: a DesCoin beat right after the release still counts (2d75c4d3).
        ptt: Boolean(ptt),
      });
    }
  }, []);
  const setMicEnabledRef = useRef(setMicEnabled);
  setMicEnabledRef.current = setMicEnabled;

  const toggleMute = useCallback(async () => {
    if (serverMutedRef.current) {
      // Say why the mic stays off (server-voice-11): AFK channel, no SPEAK, or a moderator.
      const key = unmuteDeniedKey({
        afkChannel: afkChannelRef.current,
        canSpeak: canSpeakRef.current,
        modMuted: modMutedRef.current,
      });
      toastRef.current?.(tRuntime(key), "info");
      return;
    }
    if (!canPublishVoice()) {
      // A toast, not the room status: the red header status is for the connection.
      toastRef.current?.(
        tRuntime(channelTypeRef.current === "stage" ? "callui.voice.needInvite" : "callui.voice.noSpeakPerm"),
        "info"
      );
      return;
    }
    // Discord parity: unmuting while deafened undeafens too (it was a silent no-op).
    if (deafenedRef.current) {
      toggleDeafenRef.current?.();
      const live = localStreamRef.current?.getAudioTracks()?.[0];
      if (live && !live.enabled && !serverMutedRef.current) setMicEnabled(true, { persist: true });
      return;
    }
    let track = localStreamRef.current?.getAudioTracks()?.[0];
    if (!track) {
      const stream = await acquireVoiceMicStream(micConstraints());
      track = stream.getAudioTracks()[0];
      localStreamRef.current = stream;
      setLocalStream(stream);
      if (sfuModeRef.current && liveKitRoomRef.current && track) {
        const { Track } = await loadLiveKit();
        await liveKitRoomRef.current.localParticipant.publishTrack(
          track,
          liveKitMicPublishOptions(Track.Source.Microphone)
        );
      } else if (track) {
        for (const [userId, peerData] of pcMapRef.current.entries()) {
          try {
            peerData.audioSender = peerData.pc.addTrack(track, localStreamRef.current);
            await renegotiateWithPeer(userId, peerData);
          } catch (err) {
            console.warn("[ServerVoice] mic addTrack failed:", err);
          }
        }
      }
    }
    if (!track) return;
    setMicEnabled(!track.enabled, { persist: true });
  }, [canPublishVoice, micConstraints, renegotiateWithPeer, setMicEnabled]);

  useEffect(() => {
    const onPtt = (event) => {
      if (!activeChannelIdRef.current || !canPublishVoice()) return;
      setMicEnabledRef.current?.(Boolean(event.detail?.down), { persist: false, ptt: true });
    };
    window.addEventListener("descall:ptt", onPtt);
    return () => window.removeEventListener("descall:ptt", onPtt);
  }, []);

  const toggleDeafen = useCallback(() => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    for (const [userId, el] of remoteAudioRefs.current.entries()) {
      applyVoiceElement(userId, el);
    }
    const track = localStreamRef.current?.getAudioTracks()?.[0];
    if (next) {
      if (track?.enabled) {
        track.enabled = false;
        setMuted(true);
        mutedByDeafenRef.current = true;
      }
      audioManager.play("deafen");
    } else {
      if (mutedByDeafenRef.current && track && !serverMutedRef.current) {
        track.enabled = true;
        setMuted(false);
        mutedByDeafenRef.current = false;
      }
      audioManager.play("undeafen");
    }
    // Always publish, remote tiles show the headphones-off badge even when
    // the mic was already muted before deafening.
    const channelId = activeChannelIdRef.current;
    if (channelId && socket?.connected) {
      socket.emit("server:voice:media-state", {
        channelId,
        muted: track ? !track.enabled : Boolean(mutedRef.current),
        deafened: next,
        cameraOn: cameraStreamRef.current?.getVideoTracks?.()[0]?.readyState === "live",
      });
    }
  }, [applyVoiceElement, socket]);
  toggleDeafenRef.current = toggleDeafen;

  const applyLocalMute = useCallback((nextMuted, { forced = false } = {}) => {
    const track = localStreamRef.current?.getAudioTracks()?.[0];
    if (track) track.enabled = !nextMuted;
    setMuted(Boolean(nextMuted));
    if (forced) {
      setServerMuted(true);
      serverMutedRef.current = true;
    }
  }, []);

  const disconnectMember = useCallback(
    (serverId, channelId, userId) => {
      if (!serverId || !userId) return;
      const sock = socketRef.current || socket;
      if (sock) sock.emit("server:voice:disconnect", { serverId, channelId, userId });
      if (channelId) removeUserFromVoiceStates(channelId, userId, serverId);
    },
    [removeUserFromVoiceStates, socket]
  );

  const moveMember = useCallback(
    (serverId, userId, fromChannelId, toChannelId) => {
      if (!socket?.connected || !serverId || !userId || !toChannelId) return;
      socket.emit("server:voice:move", { serverId, userId, fromChannelId, toChannelId });
    },
    [socket]
  );

  const serverMute = useCallback(
    (serverId, channelId, userId, muted) => {
      if (!socket?.connected || !serverId || !userId) return;
      socket.emit("server:voice:server-mute", {
        serverId,
        channelId,
        userId,
        muted: Boolean(muted),
      });
    },
    [socket]
  );

  const serverDeafen = useCallback(
    (serverId, channelId, userId, deafened) => {
      if (!socket?.connected || !serverId || !userId) return;
      socket.emit("server:voice:server-deafen", {
        serverId,
        channelId,
        userId,
        deafened: Boolean(deafened),
      });
    },
    [socket]
  );

  const requestToSpeak = useCallback(() => {
    const channelId = activeChannelIdRef.current;
    if (!socket?.connected || !channelId || channelTypeRef.current !== "stage") return;
    socket.emit("server:voice:stage:request", { channelId });
    setRequestedToSpeak(true);
  }, [socket]);

  const setStageParticipantRole = useCallback(
    (serverId, channelId, userId, nextStageRole) => {
      if (!socket?.connected || !serverId || !channelId || !userId) return;
      socket.emit("server:voice:stage:set-role", {
        serverId,
        channelId,
        userId,
        stageRole: nextStageRole === "speaker" ? "speaker" : "audience",
      });
    },
    [socket]
  );

  const stopScreenShare = useCallback(async (opts = {}) => {
    if (nativeShareRef.current.phase !== "idle") {
      // iOS broadcast: ask the extension to finish; "ended" from the native room
      // clears the share (and sends server:voice:screen:stop) once it really stopped.
      // Still minting the token: nothing native runs yet, just drop the request.
      applyNativeShare({ type: nativeShareRef.current.phase === "preparing" ? "reset" : "stop" });
      await stopNativeBroadcast("user-stopped");
      return;
    }
    if (!isScreenSharing && !screenStreamRef.current) return;
    if (sfuCodecTimerRef.current) clearTimeout(sfuCodecTimerRef.current);
    sfuCodecTimerRef.current = null;
    const sfuScreen = sfuScreenRef.current;
    sfuScreenRef.current = null;
    if (sfuModeRef.current && liveKitRoomRef.current && screenStreamRef.current) {
      for (const track of screenStreamRef.current.getTracks()) {
        try {
          liveKitRoomRef.current.localParticipant.unpublishTrack(track);
        } catch {
          /* ignore */
        }
      }
    }
    // A codec switch published a clone of the capture: retire and stop it as well.
    if (sfuScreen?.track && !screenStreamRef.current?.getTracks?.().includes(sfuScreen.track)) {
      try {
        liveKitRoomRef.current?.localParticipant?.unpublishTrack(sfuScreen.track, true);
      } catch {
        /* ignore */
      }
      try {
        sfuScreen.track.stop();
      } catch {
        /* ignore */
      }
    }
    for (const [userId, peerData] of pcMapRef.current.entries()) {
      try {
        if (peerData.screenSender) {
          stopDedicatedSender(peerData.pc, peerData.screenSender);
          delete peerData.screenSender;
        }
        if (peerData.screenAudioSender) {
          stopDedicatedSender(peerData.pc, peerData.screenAudioSender);
          delete peerData.screenAudioSender;
        }
        await renegotiateWithPeer(userId, peerData);
      } catch (err) {
        console.warn("[ServerVoice] screen removeTrack failed:", err);
      }
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);
    const channelId = activeChannelIdRef.current;
    if (channelId && socket?.connected) {
      socket.emit("server:voice:screen:stop", { channelId });
    }
    if (!opts?.quiet) audioManager.play("screenShareStop");
  }, [applyNativeShare, isScreenSharing, renegotiateWithPeer, socket]);

  /** The codec an SFU screen publish should use now (best one every member decodes). */
  const desiredSfuCodec = useCallback((track) => {
    const session = track ? screenEncoderFor(track) : null;
    return pickSfuScreenCodec({
      encode: localVideoCaps().encode,
      viewers: [...memberDecodeRef.current.values()],
      blocked: session?.blocked || [],
      av1Allowed: session ? session.av1Ok() : false,
    });
  }, []);

  const sfuEncodingFor = useCallback((family, quality, fps) => ({
    family,
    contentHint: quality?.contentHint || "motion",
    maxBitrate: screenBitrateForPeerCount(1, quality?.resolution || "1080p", fps, "sfu"),
    fps,
  }), []);

  /**
   * Move the SFU screen share to another codec without stopping it: publish a clone of the
   * capture with the new codec, then retire the old publication (viewers merge the new
   * track into the same screen stream before the old one leaves, so the stage stays up).
   */
  const swapSfuScreenCodec = useCallback(async (codec) => {
    const room = liveKitRoomRef.current;
    const cur = sfuScreenRef.current;
    const source = screenStreamRef.current?.getVideoTracks?.()[0] || null;
    if (!room || !cur || !source || !sfuModeRef.current || source.readyState !== "live") return false;
    if (codec === cur.codec) return true;
    let next = null;
    try {
      next = source.clone();
      const pub = await room.localParticipant.publishTrack(
        next,
        liveKitScreenVideoPublishOptions(sfuEncodingFor(codec, cur.quality, cur.fps))
      );
      if (sfuScreenRef.current !== cur || screenStreamRef.current?.getVideoTracks?.()[0] !== source) {
        // The share stopped or restarted while publishing: drop the clone.
        try {
          room.localParticipant.unpublishTrack(next, true);
        } catch {
          next.stop();
        }
        return false;
      }
      try {
        await room.localParticipant.unpublishTrack(cur.track, cur.track !== source);
      } catch {
        /* already gone */
      }
      sfuScreenRef.current = { ...cur, track: next, codec };
      const sender = pub?.track?.sender;
      if (sender) screenEncoderFor(source)?.attach(null, sender);
      return true;
    } catch (err) {
      console.warn("[ServerVoice] screen codec switch failed, keeping the current one:", err?.message || err);
      try {
        next?.stop();
      } catch {
        /* ignore */
      }
      return false;
    }
  }, [sfuEncodingFor]);

  /** Re-check the SFU codec after the room changed (debounced, the backup codec covers the gap). */
  const scheduleSfuCodecCheck = useCallback((delayMs = 4000) => {
    if (sfuCodecTimerRef.current) clearTimeout(sfuCodecTimerRef.current);
    sfuCodecTimerRef.current = null;
    if (!sfuScreenRef.current) return;
    sfuCodecTimerRef.current = setTimeout(() => {
      sfuCodecTimerRef.current = null;
      const source = screenStreamRef.current?.getVideoTracks?.()[0] || null;
      if (!sfuScreenRef.current || !source) return;
      const want = desiredSfuCodec(source);
      if (want !== sfuScreenRef.current.codec) void swapSfuScreenCodec(want);
    }, delayMs);
  }, [desiredSfuCodec, swapSfuScreenCodec]);

  const scheduleSfuCodecCheckRef = useRef(null);
  scheduleSfuCodecCheckRef.current = scheduleSfuCodecCheck;

  const startScreenShare = useCallback(async (opts = {}) => {
    if (isScreenSharing || !activeChannelIdRef.current) return;
    if (!canPublishVideo()) {
      setError("callui.voice.needShareMedia");
      return;
    }
    if (nativeBroadcastSupported()) {
      // iPhone / iPad app: whole-screen ReplayKit broadcast (system picker, Descall preselected).
      if (nativeShareRef.current.phase !== "idle") return;
      await beginNativeShare({ anchor: opts?.anchor || null, showPicker: true });
      return;
    }
    const quality = opts?.quality ? cleanServerScreenQuality(opts.quality) : screenQuality;
    if (opts?.quality) setScreenQuality(quality);
    let announced = false;
    let stream = null;
    try {
      const peerCount = Math.max(1, pcMapRef.current.size);
      // SFU: one upload whatever the room size; mesh: one encode per peer, so the mesh cap.
      const { width, height, fps: frameRate } = resolveScreenCaptureSize(quality, {
        peerCount: sfuModeRef.current ? 1 : peerCount + 1,
        serverId: activeServerIdRef.current || "",
      });
      const maxBitrate = screenBitrateForPeerCount(
        sfuModeRef.current ? 1 : peerCount,
        quality.resolution || "720p",
        frameRate,
        sfuModeRef.current ? "sfu" : "mesh"
      );
      stream = await captureScreenShareStream({
        width,
        height,
        fps: frameRate,
        // Full OS picker on desktop (window / screen / tab), DES-10.
        preferTab: false,
        pickSource: showElectronScreenPicker,
      });
      const screenTrack = stream.getVideoTracks()[0];
      await optimizeScreenShareTrack(screenTrack, {
        width,
        height,
        fps: frameRate,
        contentHint: quality.contentHint || "motion",
        resolution: quality.resolution,
        peerCount: sfuModeRef.current ? 1 : peerCount,
        transport: sfuModeRef.current ? "sfu" : "mesh",
      });
      // CPU fallback (AV1 -> VP9 -> default): SFU republishes with the lighter codec,
      // a mesh peer gets one more offer when the engine cannot switch a live sender.
      screenEncoderFor(screenTrack)?.setRenegotiator(async ({ pc }) => {
        if (sfuModeRef.current) {
          await swapSfuScreenCodec(desiredSfuCodec(screenTrack));
          return;
        }
        for (const [uid, pd] of pcMapRef.current.entries()) {
          if (pd?.pc === pc) await renegotiateWithPeer(uid, pd);
        }
      });
      if (screenTrack.readyState !== "live") {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const { track: screenAudioTrack } = await ensureScreenShareAudioTrack(stream);
      screenStreamRef.current = stream;
      setScreenStream(stream);

      const channelId = activeChannelIdRef.current;
      const announce = () => {
        if (announced || !socket?.connected || !channelId) return;
        announced = true;
        socket.emit("server:voice:screen:start", {
          channelId,
          screen: sanitizeScreenAnnouncement({ streamId: stream.id }),
        });
      };

      if (sfuModeRef.current && liveKitRoomRef.current) {
        // One encode for the room: AV1 / VP9 only when every member decodes it (VP8 backup
        // codec for anyone who joins later), L1T3, bitrate ceiling of the picked tier.
        const codec = desiredSfuCodec(screenTrack);
        let videoOptions = liveKitScreenVideoPublishOptions(sfuEncodingFor(codec, quality, frameRate));
        const audioOptions = liveKitScreenAudioPublishOptions();
        let publishedCodec = codec;
        let videoPub = null;
        try {
          videoPub = await liveKitRoomRef.current.localParticipant.publishTrack(screenTrack, {
            ...videoOptions,
            source: videoOptions.source,
            name: videoOptions.name,
          });
        } catch (err) {
          if (codec === "vp8") throw err;
          // SFU or engine refused the modern codec: the share still goes out in VP8.
          console.warn("[ServerVoice] screen publish with", codec, "failed, using VP8:", err?.message || err);
          publishedCodec = "vp8";
          videoOptions = liveKitScreenVideoPublishOptions(sfuEncodingFor("vp8", quality, frameRate));
          videoPub = await liveKitRoomRef.current.localParticipant.publishTrack(screenTrack, {
            ...videoOptions,
            source: videoOptions.source,
            name: videoOptions.name,
          });
        }
        sfuScreenRef.current = { track: screenTrack, codec: publishedCodec, quality, fps: frameRate };
        const lkSender = videoPub?.track?.sender;
        if (lkSender) screenEncoderFor(screenTrack)?.attach(null, lkSender);
        if (screenAudioTrack) {
          await liveKitRoomRef.current.localParticipant.publishTrack(screenAudioTrack, {
            ...audioOptions,
            source: audioOptions.source,
            name: audioOptions.name,
          });
        }
        // Announce only once the share is really published (server-voice-23): a failed
        // publish no longer leaves the seat "sharing" (and earning) with nothing sent.
        announce();
        screenTrack.onended = () => {
          stopScreenShareRef.current?.();
        };
        setIsScreenSharing(true);
        audioManager.play("screenShareStart");
        return;
      }

      // Mesh: peers classify the incoming track by this announcement, so it goes first.
      announce();

      for (const [userId, peerData] of pcMapRef.current.entries()) {
        try {
          peerData.screenSender = addDedicatedSender(peerData.pc, screenTrack, stream);
          if (screenAudioTrack) {
            peerData.screenAudioSender = addDedicatedSender(peerData.pc, screenAudioTrack, stream);
          }
          await optimizeScreenShareSender(peerData.screenSender, {
            maxBitrate,
            maxFramerate: frameRate,
            pc: peerData.pc,
          });
          await renegotiateWithPeer(userId, peerData);
        } catch (err) {
          console.warn("[ServerVoice] screen addTrack failed:", err);
        }
      }

      screenTrack.onended = () => {
        stopScreenShareRef.current?.();
      };
      setIsScreenSharing(true);
      audioManager.play("screenShareStart");
    } catch (err) {
      // Never leave a half-started share: stop the capture, unpublish, tell the room.
      if (stream) {
        const room = liveKitRoomRef.current;
        for (const track of stream.getTracks()) {
          try {
            if (sfuModeRef.current && room) room.localParticipant.unpublishTrack(track);
          } catch {
            /* not published */
          }
          track.stop();
        }
        if (screenStreamRef.current === stream) {
          screenStreamRef.current = null;
          setScreenStream(null);
        }
        if (announced && socket?.connected && activeChannelIdRef.current) {
          socket.emit("server:voice:screen:stop", { channelId: activeChannelIdRef.current });
        }
      }
      if (err?.name === "AbortError" || err?.name === "NotAllowedError") return;
      console.error("[ServerVoice] screen share failed:", err);
      toastRef.current?.(tRuntime("Could not start screen share."), "error");
    }
  }, [beginNativeShare, canPublishVideo, desiredSfuCodec, isScreenSharing, renegotiateWithPeer, screenQuality, setScreenQuality, sfuEncodingFor, socket, swapSfuScreenCodec]);

  /** Quality changed while sharing: restart the capture with the new settings. */
  const restartScreenShareWithQuality = useCallback(
    async (quality) => {
      const clean = cleanServerScreenQuality(quality);
      setScreenQuality(clean);
      if (!screenStreamRef.current) return;
      await stopScreenShareRef.current?.({ quiet: true });
      await startScreenShareRef.current?.({ quality: clean });
    },
    [setScreenQuality]
  );

  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
    startScreenShareRef.current = startScreenShare;
  }, [stopScreenShare, startScreenShare]);

  // Native broadcast events. "orphan" = a broadcast was started outside the app
  // (Control Center > Screen Broadcast > Descall) with no companion session yet:
  // attach it to the current voice channel, or end it when sharing is not possible.
  const nativeOrphanRef = useRef(null);
  nativeOrphanRef.current = () => {
    if (nativeShareRef.current.phase !== "idle") return;
    if (!activeChannelIdRef.current || !canPublishVideo()) {
      void stopNativeBroadcast("no-session");
      toastRef.current?.(
        tRuntime(activeChannelIdRef.current ? "iosShare.errPermission" : "iosShare.errJoinFirst"),
        "error"
      );
      return;
    }
    void beginNativeShare({ showPicker: false });
  };
  useEffect(
    () =>
      onBroadcastState((data) => {
        if (data?.phase === "orphan") {
          nativeOrphanRef.current?.();
          return;
        }
        applyNativeShare({ type: "native", phase: data?.phase, reason: data?.reason || null, at: data?.at });
      }),
    [applyNativeShare]
  );

  const stopCamera = useCallback(async () => {
    if (!isCameraOn && !cameraStreamRef.current) return;
    const stream = cameraStreamRef.current;
    if (sfuModeRef.current && liveKitRoomRef.current && stream) {
      for (const track of stream.getTracks()) {
        try {
          liveKitRoomRef.current.localParticipant.unpublishTrack(track);
        } catch {
          /* ignore */
        }
      }
    }
    for (const [userId, peerData] of pcMapRef.current.entries()) {
      try {
        if (peerData.cameraSender) {
          peerData.pc.removeTrack(peerData.cameraSender);
          delete peerData.cameraSender;
        }
        await renegotiateWithPeer(userId, peerData);
      } catch (err) {
        console.warn("[ServerVoice] camera removeTrack failed:", err);
      }
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setCameraStream(null);
    setIsCameraOn(false);
    const channelId = activeChannelIdRef.current;
    if (channelId && socket?.connected) {
      socket.emit("server:voice:camera:stop", { channelId });
      socket.emit("server:voice:media-state", { channelId, muted: mutedRef.current, cameraOn: false, deafened: deafenedRef.current });
    }
  }, [isCameraOn, renegotiateWithPeer, socket]);

  const startCamera = useCallback(async () => {
    if (isCameraOn || !activeChannelIdRef.current) return;
    if (!canPublishVideo()) {
      setError("callui.voice.needCamera");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
      const cameraTrack = stream.getVideoTracks()[0];
      if (!cameraTrack || cameraTrack.readyState !== "live") {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      const channelId = activeChannelIdRef.current;
      if (socket?.connected && channelId) {
        socket.emit("server:voice:camera:start", { channelId });
        socket.emit("server:voice:media-state", { channelId, muted: mutedRef.current, cameraOn: true, deafened: deafenedRef.current });
      }
      if (sfuModeRef.current && liveKitRoomRef.current) {
        const cameraOptions = liveKitCameraPublishOptions();
        await liveKitRoomRef.current.localParticipant.publishTrack(cameraTrack, {
          source: cameraOptions.source,
          name: cameraOptions.name,
        });
      } else {
        for (const [userId, peerData] of pcMapRef.current.entries()) {
          try {
            peerData.cameraSender = peerData.pc.addTrack(cameraTrack, stream);
            await renegotiateWithPeer(userId, peerData);
          } catch (err) {
            console.warn("[ServerVoice] camera addTrack failed:", err);
          }
        }
      }
      cameraTrack.onended = () => {
        stopCameraRef.current?.();
      };
      setIsCameraOn(true);
    } catch (err) {
      if (err?.name !== "NotAllowedError") {
        setError(err?.message || "callui.voice.cameraFailed");
      }
    }
  }, [cameraConstraints, canPublishVideo, isCameraOn, renegotiateWithPeer, socket]);

  useEffect(() => {
    stopCameraRef.current = stopCamera;
  }, [stopCamera]);

  const toggleCamera = useCallback(async () => {
    if (isCameraOn) await stopCamera();
    else await startCamera();
  }, [isCameraOn, startCamera, stopCamera]);

  const setParticipantVolume = useCallback((userId, volume) => {
    if (userId == null) return;
    const key = String(userId);
    const safe = clampGain(volume);
    if (safe > 0) lastParticipantVolumeRef.current.set(key, safe);
    participantVolumeRef.current.set(key, safe);
    writeParticipantGain(userId, safe);
    applyVoiceElement(key, remoteAudioRefs.current.get(userId) || remoteAudioRefs.current.get(key));
    publishLevelState();
  }, [applyVoiceElement, publishLevelState]);

  const toggleParticipantMute = useCallback((userId) => {
    const current = voiceVolumeFor(userId);
    if (current > 0.001) setParticipantVolume(userId, 0);
    else setParticipantVolume(userId, lastParticipantVolumeRef.current.get(String(userId)) || 1);
  }, [setParticipantVolume, voiceVolumeFor]);

  const setScreenShareVolume = useCallback((userId, volume) => {
    if (userId == null) return;
    const next = Math.max(0, Math.min(200, Number(volume)));
    screenVolumeRef.current.set(String(userId), Number.isFinite(next) ? next : 100);
    publishLevelState();
  }, [publishLevelState]);

  const setAudioInput = useCallback(async (deviceId, opts = {}) => {
    const id = deviceId || "";
    audioInputIdRef.current = id;
    setSelectedAudioInput(id);
    if (opts.persist !== false && !IOS_NATIVE) writeAudioPref("input", id);
    const current = localStreamRef.current;
    if (!current?.getAudioTracks?.().length) return;
    replacingMicRef.current = true;
    try {
      disposeNoiseSuppressionSession({ stopRaw: true });
      const fresh = await acquireVoiceMicStream({ ...micConstraints(), applyStoredMute: false });
      const newTrack = fresh.getAudioTracks()[0];
      if (!newTrack) return;
      current.getAudioTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignore */ }
        current.removeTrack(track);
      });
      current.addTrack(newTrack);
      setNoiseSuppressedTrackEnabled(!mutedRef.current && !serverMutedRef.current);
      newTrack.enabled = !mutedRef.current && !serverMutedRef.current;
      newTrack.addEventListener("ended", () => {
        if (replacingMicRef.current) return;
        if (localStreamRef.current?.getAudioTracks?.()[0] !== newTrack) return;
        if (!activeChannelIdRef.current) return;
        void setAudioInputRef.current?.("");
      });
      if (sfuModeRef.current && liveKitRoomRef.current) {
        const { Track } = await loadLiveKit();
        const pubs = liveKitRoomRef.current.localParticipant.audioTrackPublications;
        for (const pub of pubs.values()) {
          if (pub.source === Track.Source.Microphone && pub.track?.replaceTrack) {
            await pub.track.replaceTrack(newTrack);
          }
        }
      }
      for (const peerData of pcMapRef.current.values()) {
        const sender = peerData.pc?.getSenders?.().find(
          (item) => item?.track?.kind === "audio" && item !== peerData.screenAudioSender
        );
        if (sender) await sender.replaceTrack(newTrack);
      }
      setLocalStream(current);
    } catch (err) {
      console.warn("[ServerVoice] setAudioInput failed:", err?.name || err?.message || err);
      toastRef.current?.(tRuntime("Couldn't switch the microphone."), "error");
      // A saved device that is gone: fall back to the default capture.
      if (id && (err?.name === "OverconstrainedError" || err?.name === "NotFoundError")) {
        audioInputIdRef.current = "";
      }
    } finally {
      replacingMicRef.current = false;
    }
  }, [micConstraints]);
  setAudioInputRef.current = setAudioInput;

  const setAudioOutput = useCallback(async (deviceId) => {
    const id = deviceId || "";
    audioOutputIdRef.current = id;
    setSelectedAudioOutput(id);
    writeAudioPref("output", id);
    for (const [userId, el] of remoteAudioRefs.current.entries()) {
      applyVoiceElement(userId, el);
    }
    // All voice elements, boost contexts and screen-audio sinks.
    const res = await setOutputSink(id);
    console.info("[AudioOutput] switched", res);
    if (res.failed && !res.applied) toastRef.current?.(tRuntime("Couldn't switch the speaker."), "error");
  }, [applyVoiceElement]);

  const setVideoInput = useCallback(async (deviceId) => {
    const id = deviceId || "";
    videoInputIdRef.current = id;
    setSelectedVideoInput(id);
    if (!cameraStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
      const newTrack = stream.getVideoTracks()[0];
      if (!newTrack || newTrack.readyState !== "live") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignore */ }
      });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      if (sfuModeRef.current && liveKitRoomRef.current) {
        const { Track } = await loadLiveKit();
        const pubs = liveKitRoomRef.current.localParticipant.videoTrackPublications;
        let replaced = false;
        for (const pub of pubs.values()) {
          if (pub.source === Track.Source.Camera && pub.track?.replaceTrack) {
            await pub.track.replaceTrack(newTrack);
            replaced = true;
          }
        }
        if (!replaced) {
          await liveKitRoomRef.current.localParticipant.publishTrack(newTrack, {
            source: Track.Source.Camera,
          });
        }
      }
      for (const peerData of pcMapRef.current.values()) {
        if (peerData.cameraSender) await peerData.cameraSender.replaceTrack(newTrack);
      }
      newTrack.onended = () => {
        stopCameraRef.current?.();
      };
    } catch (err) {
      console.warn("[ServerVoice] setVideoInput failed:", err);
    }
  }, [cameraConstraints]);

  const refreshMediaDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === "audioinput");
      setAudioInputDevices(inputs);
      setAudioOutputDevices(devices.filter((device) => device.kind === "audiooutput"));
      setVideoInputDevices(devices.filter((device) => device.kind === "videoinput"));
      const currentId = liveMicDeviceId(localStreamRef.current, getNoiseSuppressionRawTrack());
      const plan = micRecapturePlan({
        previousIds: inputIdsRef.current,
        inputs,
        currentDeviceId: currentId,
        preferredId: audioInputIdRef.current,
      });
      inputIdsRef.current = inputs.map((device) => device.deviceId).filter(Boolean);
      if (
        activeChannelIdRef.current &&
        localStreamRef.current?.getAudioTracks?.().length &&
        plan.reason &&
        !replacingMicRef.current
      ) {
        void setAudioInputRef.current?.(plan.deviceId);
      }
    } catch {
      /* permissions or unsupported enumerateDevices */
    }
  }, []);

  useEffect(() => {
    refreshMediaDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshMediaDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshMediaDevices);
  }, [refreshMediaDevices]);

  const subscribedServerIdRef = useRef(null);

  const subscribeServer = useCallback(
    (serverId) => {
      if (!socket || !serverId) return;
      subscribedServerIdRef.current = serverId;
      socket.emit("server:voice:subscribe", { serverId });
      socket.emit("server:subscribe", { serverId });
    },
    [socket]
  );

  const checkChannel = useCallback(
    (channelId) => {
      if (!socket || !channelId) return;
      socket.emit("server:voice:check", { channelId });
    },
    [socket]
  );

  // Closing or reloading the page leaves voice at once; the server otherwise keeps the
  // seat for a short reconnect grace while another tab or device stays online.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onPageHide = (event) => {
      if (event?.persisted) return;
      if (activeChannelIdRef.current) emitVoiceLeave();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [emitVoiceLeave]);

  // Re-subscribe after reconnect, rooms are cleared server-side on disconnect.
  useEffect(() => {
    if (!socket) return undefined;
    const onConnect = () => {
      const serverId = subscribedServerIdRef.current;
      if (serverId) {
        emitRoomOnce(socket, "server:voice:subscribe", { serverId });
        emitRoomOnce(socket, "server:subscribe", { serverId });
      }
      // Re-take the voice seat even when no server view is subscribed (voice joined
      // and the user moved on to DMs): otherwise the seat ran out after the grace.
      const channelId = activeChannelIdRef.current;
      const liveServerId = activeServerIdRef.current;
      if (channelId && liveServerId) {
        socket.emit("server:voice:join", { serverId: liveServerId, channelId });
      } else if (channelId) {
        emitRoomOnce(socket, "server:voice:check", { channelId });
      }
    };
    const onDisconnect = () => {
      if (activeChannelIdRef.current) linkStatsRef.current.sockDrops += 1;
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return undefined;
    myIdRef.current = getUser()?.id || myIdRef.current;

    const onJoined = ({
      channelId,
      serverId,
      channelName: name,
      channelType: type,
      participants: others,
      canSpeak: canSpeakNow,
      canStream: canStreamNow,
      canRequestToSpeak: canRequest,
      stageRole: role,
      requestedToSpeak: requested,
      serverMuted: forcedMute,
      serverDeafened: forcedDeafen,
      afkChannel,
      livekit,
      rejoin,
    } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current) return;
      const waiter = joinedTokenWaiterRef.current;
      const initialJoin = Boolean(waiter && String(waiter.channelId) === String(channelId));
      if (initialJoin) {
        joinedTokenWaiterRef.current = null;
        waiter.resolve(livekit?.token ? livekit : null);
      }
      // A socket reconnect re-emits the join for the seat we already hold (onConnect).
      // Keep the roster and its media, no join sound (voice-drops-01, server-voice-05).
      const isRejoin = !initialJoin && (Boolean(rejoin) || Boolean(activeChannelIdRef.current));
      // Tell the room which video codecs this device decodes (screen share codec choice
      // with an SFU). Servers without the event ignore it.
      const videoDecode = localDecodeFamilies();
      if (videoDecode) socket.emit("server:voice:codecs", { channelId, videoDecode });
      memberDecodeRef.current = new Map(
        (Array.isArray(others) ? others : [])
          .filter((u) => u?.id != null && String(u.id) !== String(myIdRef.current))
          .map((u) => [String(u.id), sanitizeVideoDecode(u.videoDecode)])
      );
      afkChannelRef.current = Boolean(afkChannel);
      modMutedRef.current = Boolean(forcedMute) && !afkChannel;
      if (forcedDeafen) applyRemoteDeafen(true);
      setActiveServerId(serverId || null);
      if (name) setChannelName(name);
      if (type) {
        channelTypeRef.current = type;
        setChannelType(type);
      }
      if (role) {
        stageRoleRef.current = role;
        setStageRole(role);
      }
      if (canSpeakNow !== undefined) {
        canSpeakRef.current = Boolean(canSpeakNow);
        setCanSpeak(Boolean(canSpeakNow));
      }
      if (canStreamNow !== undefined) {
        canStreamRef.current = Boolean(canStreamNow);
        setCanStream(Boolean(canStreamNow));
      }
      if (canRequest !== undefined) setCanRequestToSpeak(Boolean(canRequest));
      setRequestedToSpeak(Boolean(requested));
      if (isRejoin) {
        const list = Array.isArray(others) ? others : [];
        const keep = new Set(list.map((u) => String(u?.id)));
        if (rejoin) {
          // The server kept our seat, so its list is complete: someone missing left
          // while we were offline.
          setParticipants((prev) => mergeRejoinRoster(prev, list));
          for (const peerId of [...pcMapRef.current.keys()]) {
            if (!keep.has(String(peerId))) cleanupPeer(peerId);
          }
        } else {
          // Server restarted (deploy): the others re-join in a moment; keep everyone
          // we still have a link to.
          setParticipants((prev) => {
            const merged = mergeRejoinRoster(prev, list);
            const extra = prev.filter((p) => !keep.has(String(p.id)) && pcMapRef.current.has(p.id));
            return [...merged, ...extra];
          });
        }
        // Links that broke during the outage heal with an ICE restart.
        for (const u of list) recoverPeerRef.current?.(u?.id, "rejoin");
        // SFU: the room dropped while the socket was away: connect with the new token.
        if (livekit?.token && (!liveKitRoomRef.current || liveKitLinkRef.current === "disconnected")) {
          reconnectLiveKitRef.current?.(channelId, livekit);
        }
      } else {
        setParticipants(Array.isArray(others) ? others.map((u) => ({ ...u, hasAudio: true })) : []);
        audioManager.play("channelJoin");
      }
      if (forcedMute || canSpeakNow === false) {
        applyLocalMute(true, { forced: Boolean(forcedMute) });
        const ch = activeChannelIdRef.current;
        if (ch && socket?.connected) {
          socket.emit("server:voice:media-state", { channelId: ch, muted: true, cameraOn: false, deafened: deafenedRef.current });
        }
      }
    };

    const onMemberJoined = ({ channelId, user, rejoin } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current || !user?.id) return;
      if (String(user.id) === String(myIdRef.current)) return;
      const existing = pcMapRef.current.get(user.id);
      const linkUp = existing?.pc?.connectionState === "connected";
      // Roster entry with the real name / avatar in every mode (SFU added a
      // "Member" placeholder only when a track arrived, server-voice-04).
      setParticipants((prev) => {
        if (prev.find((p) => String(p.id) === String(user.id))) {
          return prev.map((p) => (String(p.id) === String(user.id) ? { ...p, ...user, id: p.id } : p));
        }
        return [...prev, { ...user, hasAudio: true }];
      });
      // A reconnect of someone already here (rejoin, or a server restart while our
      // link to them never broke) is not a join: no sound, keep the link.
      if (!rejoin && !linkUp) playJoinCue(user);
      if (sfuModeRef.current) return;
      if (existing) {
        if (linkUp) return;
        if (rejoin) {
          recoverPeerRef.current?.(user.id, "rejoin");
          return;
        }
        // A new seat with a dead link: build a fresh connection (a stale one
        // made the new offer wait for the old transport to time out).
        cleanupPeer(user.id);
      }
      // We are already in the room, offer to the new joiner
      offerToPeer(user, channelId);
    };

    const onMemberLeft = ({ serverId, channelId, userId } = {}) => {
      if (!channelId || !userId) return;
      const uid = String(userId);
      // Always clear sidebar / presence lists (viewers not in the call)
      removeUserFromVoiceStates(channelId, uid, serverId || null);
      // If we're in that channel, tear down the peer + in-call roster
      if (channelId === activeChannelIdRef.current) {
        if (uid !== String(myIdRef.current)) audioManager.play("userLeave");
        cleanupPeer(uid);
        setParticipants((prev) => prev.filter((p) => String(p.id) !== uid));
      }
    };

    const onOffer = async ({ channelId, fromUserId, fromUser, offer, screen } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current || !fromUserId || !offer) return;
      if (sfuModeRef.current) return;
      const stream = localStreamRef.current;
      if (!stream) return;

      const incomingScreen = sanitizeScreenAnnouncement(screen);
      let peer = pcMapRef.current.get(fromUserId);
      // An offer from a brand-new remote connection (they rebuilt it, or re-took a
      // seat after the grace): reusing our dead connection kept everyone silent
      // until its old transport timed out, ~6.5 s (voice-drops-04).
      if (peer && isNewRemoteSession(peer.pc?.remoteDescription?.sdp, offer?.sdp)) {
        cleanupPeer(fromUserId);
        peer = null;
      }
      // Glare (both sides restarted at once): the polite side rolls back its own
      // offer, the impolite side keeps its offer and ignores this one.
      if (peer && peer.pc.signalingState === "have-local-offer") {
        if (!isPoliteSide(myIdRef.current, fromUserId)) return;
        try {
          await peer.pc.setLocalDescription({ type: "rollback" });
        } catch {
          /* engines without rollback: setRemoteDescription below rolls back implicitly */
        }
      }
      if (!peer) {
        const pc = createPeerConnection({});
        peer = { pc, pendingIce: [] };
        pcMapRef.current.set(fromUserId, peer);
        setupPc(pc, stream, fromUserId, channelId);
      }
      if (incomingScreen) {
        peer.screenAnnouncement = mergeScreenAnnouncement(peer.screenAnnouncement, incomingScreen);
        peer.expectScreenShare = true;
        screenAnnouncementsRef.current.set(String(fromUserId), peer.screenAnnouncement);
      }
      setParticipants((prev) => {
        const base = fromUser || { id: fromUserId };
        const merge = (p) => {
          const next = {
            ...p,
            ...base,
            id: p.id,
            cameraStream: p.cameraStream,
            screenStream: p.screenStream,
            cameraAnnounced: p.cameraAnnounced,
          };
          return next.isScreenSharing ? adoptLateScreenShare(next) : next;
        };
        if (prev.find((p) => String(p.id) === String(fromUserId))) {
          return prev.map((p) => (String(p.id) === String(fromUserId) ? merge(p) : p));
        }
        const created = { ...base, hasAudio: true };
        return [...prev, created.isScreenSharing ? adoptLateScreenShare(created) : created];
      });
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
        await flushIce(peer.pc, fromUserId);
        const answer = await peer.pc.createAnswer();
        await commitLocalDescription(peer.pc, answer);
        socket.emit("server:voice:answer", {
          channelId,
          toUserId: fromUserId,
          answer: peer.pc.localDescription,
        });
      } catch (err) {
        console.warn("[ServerVoice] answer failed:", err);
      }
    };

    const onAnswer = async ({ channelId, fromUserId, answer } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current || !fromUserId || !answer) return;
      const peer = pcMapRef.current.get(fromUserId);
      if (!peer || peer.pc.signalingState !== "have-local-offer") return;
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushIce(peer.pc, fromUserId);
      } catch (err) {
        console.warn("[ServerVoice] setRemote answer failed:", err);
      }
    };

    const onIce = async ({ channelId, fromUserId, candidate } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current || !fromUserId || !candidate) return;
      const peer = pcMapRef.current.get(fromUserId);
      if (!peer) {
        // Early ICE, stash when PC appears via offer/answer path isn't ready
        return;
      }
      if (!peer.pc.remoteDescription) {
        peer.pendingIce.push(candidate);
        return;
      }
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* ignore */
      }
    };

    const onMediaState = ({
      channelId,
      fromUserId,
      muted: isMuted,
      serverMuted: sMuted,
      serverDeafened: sDeafened,
      deafened: selfDeafened,
      cameraOn,
    } = {}) => {
      if (!channelId || !fromUserId) return;
      if (channelId === activeChannelIdRef.current) {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === fromUserId
              ? {
                  ...p,
                  muted: Boolean(isMuted),
                  serverMuted: Boolean(sMuted),
                  serverDeafened: sDeafened !== undefined ? Boolean(sDeafened) : p.serverDeafened,
                  deafened: selfDeafened !== undefined ? Boolean(selfDeafened) : p.deafened,
                  cameraOn: cameraOn !== undefined ? Boolean(cameraOn) : p.cameraOn,
                }
              : p
          )
        );
      }
    };

    const onForceDisconnected = ({ serverId, channelId, reason, byUserId } = {}) => {
      const ch = channelId || activeChannelIdRef.current;
      const meId = myIdRef.current;
      if (ch && meId) removeUserFromVoiceStates(ch, meId, serverId || activeServerIdRef.current);
      if (ch && ch === activeChannelIdRef.current) {
        audioManager.play("disconnect");
        // The server already removed the seat: no leave (it would hit the user's
        // other device), and the session counts as dropped, not ended.
        cleanupAll({ emitLeave: false, result: dropResultFor(reason), reason: reason || (byUserId ? "moderator" : "disconnected") });
        // Say why (server-voice-25): "other device", timeout, kick, deleted channel...
        const key = dropMessageKey(reason, { byUserId });
        setError(key);
        toastRef.current?.(tRuntime(key), reason === "other_device" ? "info" : "error");
      } else if (ch) {
        // This device was not in that channel (the event goes to every device of
        // the user): only clear a leftover roster entry, no red status here.
        setParticipants((prev) => prev.filter((p) => String(p.id) !== String(meId)));
      }
    };

    const onForceMoved = ({
      toChannelId,
      channelName: name,
      channelType: type,
      serverId,
      reason,
      byUserId,
    } = {}) => {
      if (!toChannelId || !serverId) return;
      const activeId = activeChannelIdRef.current;
      // Only the device that is in voice follows a move; an idle device of the same
      // user must not grab the mic and race for the seat (server-voice-03).
      if (!activeId) return;
      if (String(activeId) === String(toChannelId)) return;
      // The server already moved the seat: tear down locally, no leave for the old channel.
      cleanupAll({ emitLeave: false, result: "moved", reason: reason === "afk" ? "afk" : "moved" });
      const moveKey = moveMessageKey(reason, { byUserId });
      if (moveKey) toastRef.current?.(tRuntime(moveKey, { channel: name || "Voice" }), "info");
      // Rejoin destination after brief cleanup so tracks/LiveKit fully release.
      window.setTimeout(() => {
        joinRef.current?.(serverId, {
          id: toChannelId,
          name: name || "Voice",
          type: type || "voice",
        });
      }, 120);
    };

    const onForceMute = ({ channelId, muted: isMuted, canSpeak: speakPerm } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current) return;
      modMutedRef.current = Boolean(isMuted);
      if (isMuted) {
        applyLocalMute(true, { forced: true });
      } else {
        setServerMuted(false);
        serverMutedRef.current = false;
        if (speakPerm !== undefined) {
          canSpeakRef.current = Boolean(speakPerm);
          setCanSpeak(Boolean(speakPerm));
        }
        void restoreLiveKitRights({ publish: true });
      }
    };

    const onForceDeafen = ({ channelId, deafened } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current) return;
      if (deafened) {
        applyLocalMute(true, { forced: true });
        applyRemoteDeafen(true);
      } else {
        setServerDeafened(false);
        serverDeafenedRef.current = false;
        applyRemoteDeafen(false);
        void restoreLiveKitRights({ subscribe: true, publish: !serverMutedRef.current });
      }
    };

    // Permission change while in voice (role / channel edit): SPEAK / STREAM follow.
    const onRights = ({ channelId, canSpeak: speakNow, canStream: streamNow, canRequestToSpeak: requestNow } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current) return;
      if (streamNow !== undefined) {
        canStreamRef.current = Boolean(streamNow);
        setCanStream(Boolean(streamNow));
        if (!streamNow) {
          stopCameraRef.current?.();
          stopScreenShareRef.current?.();
        }
      }
      if (requestNow !== undefined) setCanRequestToSpeak(Boolean(requestNow));
      if (speakNow !== undefined && !serverMutedRef.current) {
        canSpeakRef.current = Boolean(speakNow);
        setCanSpeak(Boolean(speakNow));
        if (!speakNow) applyLocalMute(true);
        else void restoreLiveKitRights({ publish: true });
      }
    };

    const onChannelState = ({ serverId, channelId, members, memberCount } = {}) => {
      if (!serverId || !channelId) return;
      const list = Array.isArray(members) ? members : [];
      setVoiceStatesByServer((prev) => ({
        ...prev,
        [serverId]: {
          ...(prev[serverId] || {}),
          [channelId]: { members: list, memberCount: memberCount ?? list.length },
        },
      }));
      // Keep in-call roster in sync when server authoritatively drops someone
      if (channelId === activeChannelIdRef.current) {
        const ids = new Set(list.map((m) => String(m?.id)));
        // Members' decode lists: an SFU screen share re-checks its codec when they change.
        const decode = new Map(
          list
            .filter((m) => m?.id != null && String(m.id) !== String(myIdRef.current))
            .map((m) => [String(m.id), sanitizeVideoDecode(m.videoDecode)])
        );
        const key = (map) => [...map].map(([id, d]) => `${id}:${(d || []).join("+")}`).sort().join(",");
        const changed = key(decode) !== key(memberDecodeRef.current);
        memberDecodeRef.current = decode;
        if (changed) scheduleSfuCodecCheckRef.current?.();
        setParticipants((prev) => {
          const next = prev.filter((p) => ids.has(String(p.id)));
          return next.length === prev.length ? prev : next;
        });
        for (const peerId of [...pcMapRef.current.keys()]) {
          if (!ids.has(String(peerId))) cleanupPeer(peerId);
        }
      }
    };

    const onStates = ({ serverId, states } = {}) => {
      if (!serverId) return;
      const map = {};
      for (const s of states || []) {
        map[s.channelId] = { members: s.members || [], memberCount: s.memberCount || 0 };
      }
      setVoiceStatesByServer((prev) => ({ ...prev, [serverId]: map }));
    };

    const onError = ({ message, code, channelId, phase } = {}) => {
      // A refused join (channel full, timed out, no access, channel gone): the server
      // has no seat for us, so leave locally instead of staying "in voice" alone with
      // the mic open on the mesh fallback (server-voice-20). Also covers a refused
      // re-join after a reconnect.
      if (
        phase === "join" &&
        channelId &&
        activeChannelIdRef.current &&
        String(channelId) === String(activeChannelIdRef.current)
      ) {
        const waiter = joinedTokenWaiterRef.current;
        if (waiter && String(waiter.channelId) === String(channelId)) {
          joinedTokenWaiterRef.current = null;
          waiter.resolve(null);
        }
        voiceJoinEpochRef.current += 1;
        if (code === "RULES_REQUIRED") window.dispatchEvent(new CustomEvent("descall:server-rules-required"));
        cleanupAll({ emitLeave: false, result: "refused", reason: code ? String(code).toLowerCase() : "refused" });
        const text = message || "Could not join voice channel.";
        setError(text);
        if (code !== "RULES_REQUIRED") toastRef.current?.(tRuntime(text), "error");
        return;
      }
      // Moderation failures (move/disconnect/mute) are emitted without a channelId
      // and must not kick the moderator out of their own voice session.
      const isJoinContext =
        Boolean(channelId) &&
        (!activeChannelIdRef.current || String(channelId) === String(activeChannelIdRef.current));
      const waiter = joinedTokenWaiterRef.current;
      const joinPending = Boolean(isJoinContext && waiter && String(waiter.channelId) === String(channelId));
      if (joinPending) {
        joinedTokenWaiterRef.current = null;
        waiter.resolve(null);
      }
      if (code === "RULES_REQUIRED") {
        window.dispatchEvent(new CustomEvent("descall:server-rules-required"));
        if (isJoinContext) cleanupAll();
        return;
      }
      if (!isJoinContext) {
        // Not about our connection: never the room's red status (server-voice-09).
        if (message) {
          window.dispatchEvent(
            new CustomEvent("descall:server-voice-mod-error", {
              detail: { message, code: code || null },
            })
          );
        }
        return;
      }
      // Join refusals arrive tagged (phase "join", handled above). While our own join
      // is still pending, an untagged refusal rolls back too. A refused screen share or
      // camera (also MISSING_PERMISSION) used to take the user out of voice.
      if (joinPending) {
        if (message) setError(message);
        if (code === "MISSING_PERMISSION" || code === "NOT_MEMBER" || /failed to join|microphone|could not join/i.test(message || "")) {
          cleanupAll();
        }
        return;
      }
      // An action in the channel was refused (screen share, camera, stage): a toast,
      // the connection status stays as it is.
      if (message) toastRef.current?.(tRuntime(message), "error");
    };

    const onLeft = ({ channelId } = {}) => {
      if (channelId && channelId === activeChannelIdRef.current) cleanupAll();
    };

    const onScreenStarted = ({ channelId, fromUserId, fromUser, screen, streamId, videoMid, audioMid } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current || !fromUserId) return;
      if (fromUserId === myIdRef.current) return;
      audioManager.play("screenShareStart");
      const announcement = sanitizeScreenAnnouncement(screen || { streamId, videoMid, audioMid });
      if (announcement) {
        screenAnnouncementsRef.current.set(
          String(fromUserId),
          mergeScreenAnnouncement(screenAnnouncementsRef.current.get(String(fromUserId)), announcement)
        );
      }
      const peer = pcMapRef.current.get(fromUserId);
      if (peer) {
        peer.expectScreenShare = true;
        if (announcement) {
          peer.screenAnnouncement = mergeScreenAnnouncement(peer.screenAnnouncement, announcement);
        }
        const { screen: screenTracks } = partitionInbound(peer.inbound || [], peer.screenAnnouncement);
        if (screenTracks.length) peer.screenStream = new MediaStream(screenTracks);
      }
      screenExpectedRef.current.add(String(fromUserId));
      setParticipants((prev) => {
        const uid = String(fromUserId);
        if (prev.some((p) => String(p.id) === uid)) {
          return prev.map((p) =>
            String(p.id) === uid
              ? adoptLateScreenShare({
                  ...p,
                  ...fromUser,
                  id: p.id,
                  cameraStream: p.cameraStream,
                  screenStream: peer?.screenStream || p.screenStream,
                  cameraAnnounced: p.cameraAnnounced,
                })
              : p
          );
        }
        return [...prev, adoptLateScreenShare({ ...(fromUser || { id: fromUserId }) })];
      });
    };

    const onScreenStopped = ({ channelId, fromUserId } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current || !fromUserId) return;
      if (String(fromUserId) !== String(myIdRef.current)) audioManager.play("screenShareStop");
      const peer = pcMapRef.current.get(fromUserId)
        ?? [...pcMapRef.current].find(([id]) => String(id) === String(fromUserId))?.[1];
      screenAnnouncementsRef.current.delete(String(fromUserId));
      if (peer) {
        peer.inbound = dropScreenEntries(peer.inbound || [], peer.screenAnnouncement);
        peer.screenAnnouncement = null;
        peer.expectScreenShare = false;
        peer.screenStream = null;
      }
      screenExpectedRef.current.delete(String(fromUserId));
      setParticipants((prev) =>
        prev.map((p) =>
          String(p.id) === String(fromUserId) ? { ...p, isScreenSharing: false, screenStream: null } : p
        )
      );
    };

    const onCameraStarted = ({ channelId, fromUserId, fromUser } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current || !fromUserId) return;
      if (fromUserId === myIdRef.current) return;
      setParticipants((prev) => {
        if (prev.find((p) => p.id === fromUserId)) {
          return prev.map((p) =>
            p.id === fromUserId ? { ...p, ...fromUser, cameraOn: true, cameraAnnounced: true } : p
          );
        }
        return [...prev, { ...(fromUser || { id: fromUserId }), cameraOn: true, cameraAnnounced: true }];
      });
    };

    const onCameraStopped = ({ channelId, fromUserId } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current || !fromUserId) return;
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === fromUserId
            ? { ...p, cameraOn: false, cameraAnnounced: false, cameraStream: null }
            : p
        )
      );
    };

    const onStageState = ({ channelId, userId, requestedToSpeak: requested, stageRole: role } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current || !userId) return;
      if (userId === myIdRef.current) {
        if (requested !== undefined) setRequestedToSpeak(Boolean(requested));
        if (role) {
          stageRoleRef.current = role;
          setStageRole(role);
          const nextCanSpeak = role === "speaker";
          canSpeakRef.current = nextCanSpeak;
          setCanSpeak(nextCanSpeak);
        }
      }
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === userId
            ? {
                ...p,
                requestedToSpeak: requested !== undefined ? Boolean(requested) : p.requestedToSpeak,
                stageRole: role || p.stageRole,
              }
            : p
        )
      );
    };

    const onStageRole = ({ channelId, stageRole: role, serverMuted: stillMuted } = {}) => {
      if (!channelId || channelId !== activeChannelIdRef.current || !role) return;
      stageRoleRef.current = role;
      setStageRole(role);
      setRequestedToSpeak(false);
      const nextCanSpeak = role === "speaker";
      canSpeakRef.current = nextCanSpeak;
      setCanSpeak(nextCanSpeak);
      // A server mute stays in place across a promotion (servers from 2026-11-15 say so).
      setServerMuted(Boolean(stillMuted));
      serverMutedRef.current = Boolean(stillMuted);
      if (!nextCanSpeak) {
        applyLocalMute(true);
        stopCameraRef.current?.();
        stopScreenShareRef.current?.();
      }
      if (liveKitRoomRef.current) {
        const stream = localStreamRef.current || new MediaStream();
        getLiveKitToken(channelId)
          .then(async (tokenData) => {
            disconnectLiveKit();
            if (tokenData?.enabled) await connectLiveKitRoom(channelId, tokenData, stream);
          })
          .catch((err) => console.warn("[ServerVoice] stage LiveKit refresh failed:", err));
      }
    };

    socket.on("server:voice:joined", onJoined);
    socket.on("server:voice:member-joined", onMemberJoined);
    socket.on("server:voice:member-left", onMemberLeft);
    socket.on("server:voice:offer", onOffer);
    socket.on("server:voice:answer", onAnswer);
    socket.on("server:voice:ice", onIce);
    socket.on("server:voice:media-state", onMediaState);
    socket.on("server:voice:channel-state", onChannelState);
    socket.on("server:voice:states", onStates);
    socket.on("server:voice:error", onError);
    socket.on("server:voice:left", onLeft);
    socket.on("server:voice:force-disconnected", onForceDisconnected);
    socket.on("server:voice:force-moved", onForceMoved);
    socket.on("server:voice:force-mute", onForceMute);
    socket.on("server:voice:force-deafen", onForceDeafen);
    socket.on("server:voice:screen:started", onScreenStarted);
    socket.on("server:voice:screen:stopped", onScreenStopped);
    socket.on("server:voice:camera:started", onCameraStarted);
    socket.on("server:voice:camera:stopped", onCameraStopped);
    socket.on("server:voice:stage-state", onStageState);
    socket.on("server:voice:stage-role", onStageRole);
    socket.on("server:voice:rights", onRights);

    return () => {
      socket.off("server:voice:joined", onJoined);
      socket.off("server:voice:member-joined", onMemberJoined);
      socket.off("server:voice:member-left", onMemberLeft);
      socket.off("server:voice:offer", onOffer);
      socket.off("server:voice:answer", onAnswer);
      socket.off("server:voice:ice", onIce);
      socket.off("server:voice:media-state", onMediaState);
      socket.off("server:voice:channel-state", onChannelState);
      socket.off("server:voice:states", onStates);
      socket.off("server:voice:error", onError);
      socket.off("server:voice:left", onLeft);
      socket.off("server:voice:force-disconnected", onForceDisconnected);
      socket.off("server:voice:force-moved", onForceMoved);
      socket.off("server:voice:force-mute", onForceMute);
      socket.off("server:voice:force-deafen", onForceDeafen);
      socket.off("server:voice:screen:started", onScreenStarted);
      socket.off("server:voice:screen:stopped", onScreenStopped);
      socket.off("server:voice:camera:started", onCameraStarted);
      socket.off("server:voice:camera:stopped", onCameraStopped);
      socket.off("server:voice:stage-state", onStageState);
      socket.off("server:voice:stage-role", onStageRole);
      socket.off("server:voice:rights", onRights);
    };
  }, [
    applyLocalMute,
    applyRemoteDeafen,
    cleanupAll,
    cleanupPeer,
    connectLiveKitRoom,
    disconnectLiveKit,
    getLiveKitToken,
    offerToPeer,
    removeUserFromVoiceStates,
    restoreLiveKitRights,
    setupPc,
    socket,
  ]);

  useEffect(() => {
    joinRef.current = join;
  }, [join]);

  const cleanupAllRef = useRef(cleanupAll);
  cleanupAllRef.current = cleanupAll;
  useEffect(() => () => {
    cleanupAllRef.current?.();
  }, []);

  const remoteStreams = useMemo(() => {
    void remoteStreamsVersion;
    return new Map(remoteStreamMapRef.current);
  }, [remoteStreamsVersion]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    let stop = () => {};
    let cancelled = false;
    import("../dev/glassQaBridge.js")
      .then((mod) => {
        if (cancelled) return;
        stop = mod.bindServerVoiceQa({
          setActiveChannelId,
          setActiveServerId,
          setChannelName,
          setChannelType,
          setLiveKitLink,
          setConnecting,
          setCanSpeak,
          setCanStream,
          setParticipants,
          activeChannelIdRef,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  // Native iOS: voice channels get the same output router as calls, so the
  // output menu (Ahize / Hoparlör / Bluetooth) really switches (27 Nov 2026:
  // "sesteyken ahizeye geçmiyor": the menu listed WKWebView devices, none).
  const inVoiceForRoute = Boolean(activeChannelId);
  useEffect(() => {
    if (!IOS_NATIVE) return undefined;
    if (!inVoiceForRoute) return undefined;
    void beginIosCallAudio({ video: false, owner: "server" });
    return () => {
      void endIosCallAudio("server");
    };
  }, [inVoiceForRoute]);
  const iosRouteHook = useIosAudioRoute(inVoiceForRoute);

  return {
    iosAudioRoute: iosRouteHook.iosAudioRoute,
    selectIosRoute: iosRouteHook.selectIosRoute,
    isInVoice: Boolean(activeChannelId),
    activeChannelId,
    activeServerId,
    channelName,
    participants,
    muted,
    deafened,
    serverMuted,
    serverDeafened,
    connecting,
    liveKitLink,
    error,
    voiceStatesByServer,
    localStream,
    remoteStreams,
    isScreenSharing,
    screenStream,
    /** iOS broadcast: { phase: idle|preparing|picker|live|stopping, startedAt, error }. */
    nativeScreenShare: nativeShare,
    isCameraOn,
    cameraStream,
    channelType,
    stageRole,
    requestedToSpeak,
    canRequestToSpeak,
    canSpeak,
    canStream,
    mediaMode,
    myUserId: myIdRef.current,
    join,
    leave,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    startCamera,
    stopCamera,
    startScreenShare,
    stopScreenShare,
    screenQuality,
    setScreenQuality,
    restartScreenShareWithQuality,
    audioInputDevices,
    audioOutputDevices,
    videoInputDevices,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
    setAudioInput,
    setAudioOutput,
    setVideoInput,
    participantVolumes,
    linkQualityByUser,
    screenVolumes,
    setParticipantVolume,
    toggleParticipantMute,
    setScreenShareVolume,
    refreshMediaDevices,
    requestToSpeak,
    subscribeServer,
    checkChannel,
    disconnectMember,
    moveMember,
    serverMute,
    serverDeafen,
    setStageParticipantRole,
  };
}

export default useServerVoice;
