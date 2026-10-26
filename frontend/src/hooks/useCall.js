import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { patchUserAvatar, pickEquippedCosmetics } from "../lib/userProfile";
import audioManager from "../lib/audioManager";
import notificationService from "../lib/notificationService";
import {
  optimizeScreenShareSender,
  optimizeScreenShareTrack,
  resolveScreenCaptureSize,
  screenBitrateForPeerCount,
  DM_SCREEN_DEFAULT_QUALITY,
  ensureScreenShareAudioTrack,
  isMobileScreenCapture,
  captureScreenShareStream,
  showElectronScreenPicker,
  screenShareUnavailableOnIos,
} from "../lib/webrtcScreenShare";
import {
  addDedicatedSender,
  announcementFromSenders,
  classifyInboundMedia,
  describeRtcTrackEvent,
  dropScreenEntries,
  isScreenRole,
  mergeScreenAnnouncement,
  collectScreenAudioTrackIds,
  partitionInbound,
  sanitizeScreenAnnouncement,
  stopDedicatedSender,
} from "../lib/screenShareIdentity";
import { useToast } from "../context/ToastContext";
import { t as tRuntime } from "../i18n/runtime";
import {
  applyRemoteOffer,
  isPolitePeer,
} from "../lib/webrtcNegotiation";
import { ensureIceServersForCall, iceServersHaveTurn, preloadIceServers } from "../lib/iceConfig";
import { subscribeNetworkChange } from "../lib/networkChange";
import { createPeerConnection, attachLocalTracks, safeClosePeer, commitLocalDescription } from "../lib/webrtcPeerFactory";
import { applyPlaybackGain } from "../lib/voiceGain";
import {
  clampGain,
  micRecapturePlan,
  primeCapturedMic,
  readLocalMute,
  readParticipantGain,
  tuneAudioReceiver,
  writeLocalMute,
  writeParticipantGain,
} from "../lib/voiceProfile";
import { getUser } from "../lib/storage";
import { drainNativeTelemetry, getNativeCallSnapshot } from "../lib/iosNativeCall";
import { nativeOfferVerdict } from "../lib/iosNativeCallState";
import useConnectionStats from "./useConnectionStats";
import { applyAdaptiveVideoEncoding, applyAdaptiveAudioEncoding, applyAdaptiveJitterBuffer } from "../lib/adaptiveBitrate";
import { acquireCallWakeLock, releaseCallWakeLock, pulseCallWakeLock } from "../lib/callWakeLock";
import { startDesCoinHeartbeat } from "../lib/descoinHeartbeat";
import {
  acquireVoiceMicStream,
  disposeNoiseSuppressionSession,
  getNoiseSuppressionRawTrack,
  getVoiceAudioConstraints,
  preloadNoiseSuppression,
  setNoiseSuppressedTrackEnabled,
} from "../lib/noiseSuppression";
import { voiceMicErrorCopy } from "../lib/voiceMicError";
import { callKitOwnsIncomingRing, callKitManagesAudioSession, interceptUiAnswer } from "../lib/iosCallKitState";
import { IOS_NATIVE } from "../lib/iosCallKit";
import {
  beginIosCallAudio,
  endIosCallAudio,
  getIosAudioDiagnostics,
  getIosAudioRouteSnapshot,
  iosRoutesAsOutputDevices,
  reactivateIosCapture,
  selectIosAudioRoute,
  subscribeIosAudioRoute,
} from "../lib/iosAudioRoute";
import { createMicGuard, withCaptureRetry } from "../lib/iosCallMic";
import { reportDiagnostic } from "../lib/sentry";
import {
  liveMicDeviceId,
  readAudioPrefs,
  setOutputSink,
  swapMicTrack,
  writeAudioPref,
} from "../lib/callAudioDevices";
import { createRemoteAudioKeeper, inboundAudioVerdict, pickInboundAudio } from "../lib/remoteAudioKeeper";
import { createCallSetupTimeline } from "../lib/callSetupTimeline";
import { createCallTelemetrySender } from "../lib/callTelemetry";
import { hapticCallConnected, resetCallHaptic } from "../lib/fluid/haptics";
import { notifyCallAudioSession } from "../lib/voiceActivity";
import { createCallRecovery } from "../lib/callConnectionMachine";
import {
  INCOMING_RING_TIMEOUT_MS,
  createRingChannel,
  ringEventMatches,
} from "../lib/callRingSync";
import { createLocalLevelProbe, readRemoteAudioLevel } from "../lib/rtpAudioLevel";

/** Hang-up → overlay gone. The UI plays the leave transition inside this window. */
export const CALL_ENDING_MS = 1100;

// Telemetry tags for an answer: where it came from and which push woke us.
function incomingEntryMeta(opts) {
  if (opts?.fromCallKit === true) return { entry: "callkit", push: "voip" };
  if (opts?.entry === "notification") return { entry: "notification", push: "alert" };
  return { entry: "inapp", push: "none" };
}

function callPlatformTag() {
  if (IOS_NATIVE) return "ios-app";
  if (typeof window !== "undefined" && window.electronAPI?.isElectron) return "electron";
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    if (cap?.isNativePlatform?.() && cap.getPlatform?.() === "android") return "android-app";
  } catch {
    /* ignore */
  }
  return "web";
}

const noopSubscribe = () => () => {};
const getNoRoute = () => null;

/**
 * Unified WebRTC call hook supporting:
 * - Voice calls (audio only)
 * - Video calls (audio + camera)
 * - Screen sharing (getDisplayMedia)
 *
 * Signaling is done via Socket.io events:
 *   call:offer, call:answer, call:ice-candidate, call:ended, call:declined
 *   screen:share-start, screen:share-stop, screen:stream-replace
 */
export function useCall(socket, callOccupancyRef = null) {
  const { toast } = useToast();
  const [mode, setMode] = useState(null); // null | "incoming" | "outgoing" | "active"
  const [callAnchorAt, setCallAnchorAt] = useState(null);
  const [callType, setCallType] = useState(null); // null | "voice" | "video"
  const [peer, setPeer] = useState(null);
  const [muted, setMuted] = useState(readLocalMute);
  const [cameraOn, setCameraOn] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteCameraOn, setRemoteCameraOn] = useState(null);
  const [remoteDeafened, setRemoteDeafened] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState("unknown");
  const [peerConnectionState, setPeerConnectionState] = useState("idle");
  const [remoteMediaReady, setRemoteMediaReady] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  // Server-assigned id of the current ring (CallKit call UUID on native iOS).
  const [callUuid, setCallUuid] = useState(null);
  // Caller side: the callee answered on a locked iPhone and is unlocking.
  const [calleeAnswering, setCalleeAnswering] = useState(false);
  // Hang-up transition: { reason, at } while the overlay plays the leave
  // animation (media is already stopped), null otherwise.
  const [ending, setEnding] = useState(null);
  // "incoming" | "outgoing", native iOS: only incoming calls use CallKit audio.
  const callDirectionRef = useRef(null);

  // Keep the screen awake / tab exempt from background throttling for as
  // long as a call is ringing or active, screen lock and aggressive tab
  // suspension are common causes of calls silently dropping on mobile.
  useEffect(() => {
    if (mode) {
      // Native iOS with CallKit: CallKit owns the AVAudioSession for incoming
      // DM calls. preserveAudioCategory: never re-set the category WebKit
      // configured for the running microphone capture.
      acquireCallWakeLock({
        title: "Descall call",
        artist: peer?.username || "",
        skipNative: callKitManagesAudioSession(callDirectionRef.current || "incoming"),
        preserveAudioCategory: true,
      });
    } else {
      releaseCallWakeLock();
    }
  }, [mode, peer?.username]);

  useEffect(() => {
    if (mode !== "active" || !peer?.id) return undefined;
    return startDesCoinHeartbeat({
      getSocket: () => socketRef.current,
      getLocalStream: () => localStreamRef.current,
      isActive: () => modeRef.current === "active",
      isScreenSharing: () => Boolean(screenSharingRef.current),
      getContext: () => ({ context: "dm", peerId: peerRef.current?.id }),
    });
  }, [mode, peer?.id]);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [videoInputDevices, setVideoInputDevices] = useState([]);
  // Saved choice (Settings page and the in-call menus share it). iOS routes
  // natively (DescallAudioRouter), WKWebView device ids are not used there.
  const [selectedAudioInput, setSelectedAudioInput] = useState(() => (IOS_NATIVE ? "" : readAudioPrefs().input));
  const [selectedAudioOutput, setSelectedAudioOutput] = useState(() => (IOS_NATIVE ? "" : readAudioPrefs().output));
  const [selectedVideoInput, setSelectedVideoInput] = useState("");
  const videoInputIdRef = useRef("");
  const remoteVolumeRef = useRef(1);
  const lastRemoteVolumeRef = useRef(1);
  const [screenQuality, setScreenQuality] = useState(DM_SCREEN_DEFAULT_QUALITY);
  const screenQualityRef = useRef(screenQuality);

  useEffect(() => {
    screenQualityRef.current = screenQuality;
  }, [screenQuality]);

  useEffect(() => {
    preloadIceServers().catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== "incoming" && mode !== "outgoing") return;
    preloadIceServers().catch(() => {});
    preloadNoiseSuppression();
  }, [mode]);

  const pcRef = useRef(null);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const networkStats = useConnectionStats(pcRef, { active: mode === "active" });
  const lastAdaptiveVideoQualityRef = useRef(null);
  const lastAdaptiveAudioQualityRef = useRef(null);
  const lastJitterTargetRef = useRef(null);
  useEffect(() => {
    if (mode !== "active" || !networkStats.quality) return;
    const pc = pcRef.current;
    if (!pc) return;
    const senders = pc.getSenders();
    const videoSender = senders.find(
      (s) => s.track?.kind === "video" && s !== screenSenderRef.current
    );
    const audioSender = senders.find(
      (s) => s.track?.kind === "audio" && s !== screenAudioSenderRef.current
    );
    applyAdaptiveVideoEncoding(videoSender, networkStats.quality, lastAdaptiveVideoQualityRef);
    applyAdaptiveAudioEncoding(audioSender, networkStats.quality, lastAdaptiveAudioQualityRef);
    applyAdaptiveJitterBuffer(pc, networkStats.quality, lastJitterTargetRef);
    const screenAudioIds = collectScreenAudioTrackIds(
      inboundMediaRef.current,
      remoteScreenAnnouncementRef.current
    );
    for (const receiver of pc.getReceivers()) {
      if (receiver.track?.kind !== "audio") continue;
      if (screenAudioIds.has(receiver.track.id)) continue;
      tuneAudioReceiver(receiver, networkStats.quality);
    }
  }, [mode, networkStats.quality]);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteScreenStreamRef = useRef(null);
  const remoteScreenSharingRef = useRef(false);
  // Set only by screen:share-start/stop. The UI flag is also flipped when a
  // track is attached, and using that to classify the next track hid cameras.
  const remoteScreenExpectedRef = useRef(false);
  const remoteScreenAnnouncementRef = useRef(null);
  const inboundMediaRef = useRef([]);
  const suppressAutoNegotiateRef = useRef(false);
  // Bumped on every screen publish/stop so a late `finally` cannot clear the
  // suppress flag that a newer offer is still holding.
  const screenOfferEpochRef = useRef(0);
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const pendingIceRef = useRef([]);
  const incomingOfferRef = useRef(null);
  const incomingCallTypeRef = useRef(null);
  const incomingNotifFromIdRef = useRef(null);
  const prevCallModeRef = useRef(null);
  const suppressRemoteEndCueRef = useRef(false);
  const deafenedRef = useRef(false);
  const mutedByDeafenRef = useRef(false);
  const [deafened, setDeafened] = useState(false);
  const peerRef = useRef(null);
  const timerRef = useRef(null);
  const screenSenderRef = useRef(null);
  const screenAudioSenderRef = useRef(null);
  const screenAudioCtxRef = useRef(null);
  const screenSharingRef = useRef(false);
  const intentionalScreenStopRef = useRef(false);
  const screenEndedInBackgroundRef = useRef(false);
  const stopScreenShareRef = useRef(null);
  const cleanupTimerRef = useRef(null);
  const socketRef = useRef(socket);
  const callTypeRef = useRef(callType);
  const makingOfferRef = useRef(false);
  const negotiationQueuedRef = useRef(false);
  const iceRestartAttemptedRef = useRef(false);
  const iceRecoveryTimerRef = useRef(null);
  const negotiateRef = useRef(null);
  // Link recovery (lib/callConnectionMachine.js) for the current pc.
  const recoveryRef = useRef(null);
  // An ICE restart that could not be offered yet (socket down / not stable).
  const iceRestartQueuedRef = useRef(false);
  // Server-reported presence of the peer's sockets during a connected call.
  const peerOnlineRef = useRef(true);
  const endCallRef = useRef(null);
  const localLevelProbeRef = useRef(null);
  // Tap → audio timeline, logged once per call (lib/callSetupTimeline.js).
  const setupTimelineRef = useRef(null);
  // 3.0.0 (A0): summaries wait in a small sessionStorage queue while offline.
  const telemetrySenderRef = useRef(null);
  if (!telemetrySenderRef.current) {
    telemetrySenderRef.current = createCallTelemetrySender({ getSocket: () => socketRef.current });
  }
  if (!setupTimelineRef.current) {
    setupTimelineRef.current = createCallSetupTimeline({
      report: reportDiagnostic,
      context: () => ({ platform: callPlatformTag() }),
      onSummary: (summary) => telemetrySenderRef.current?.send(summary),
    });
  }

  // Remote <audio> playback (lib/remoteAudioKeeper.js): one srcObject per
  // track set, rebind after CallKit activation / mic restarts, resume pauses.
  const remoteAudioKeeperRef = useRef(null);
  const lastAudioActivationRef = useRef(0);
  if (!remoteAudioKeeperRef.current) {
    remoteAudioKeeperRef.current = createRemoteAudioKeeper({
      getElement: () => remoteAudioRef.current,
      getTracks: () => remoteStreamRef.current?.getAudioTracks?.() || [],
      isActive: () => modeRef.current === "active" || modeRef.current === "outgoing",
      isDeafened: () => deafenedRef.current,
      log: (...args) => console.info("[CallAudio]", ...args),
    });
  }

  // Inbound audio telemetry once connected: packets / decoded level from
  // getStats + the element state. Resumes a paused element, rebinds once on
  // iOS when the track was attached before CallKit activated, and sends one
  // non-personal diagnostic when no audio arrives (field data for "no sound").
  const inboundProbeRef = useRef({ pc: null, timers: [] });
  const stopInboundProbe = () => {
    inboundProbeRef.current.timers.forEach((id) => clearTimeout(id));
    inboundProbeRef.current = { pc: null, timers: [] };
  };
  const startInboundProbe = (pc) => {
    if (!pc || inboundProbeRef.current.pc === pc || typeof pc.getStats !== "function") return;
    stopInboundProbe();
    const startedAt = Date.now();
    const probe = { pc, timers: [], reported: false, rebound: false, flowingLogged: false };
    inboundProbeRef.current = probe;
    const sample = async (step) => {
      if (inboundProbeRef.current !== probe || pcRef.current !== pc || pc.connectionState === "closed") return;
      let inbound = null;
      try {
        inbound = pickInboundAudio(await pc.getStats());
      } catch {
        return;
      }
      const el = remoteAudioRef.current;
      const verdict = inboundAudioVerdict({
        inbound,
        elapsedMs: Date.now() - startedAt,
        hasElement: Boolean(el),
        elementPaused: Boolean(el?.paused),
      });
      const keeper = remoteAudioKeeperRef.current;
      const context = {
        step,
        verdict,
        platform: callPlatformTag(),
        direction: callDirectionRef.current || "",
        ...(inbound || {}),
        element: el ? { paused: Boolean(el.paused), muted: Boolean(el.muted), readyState: el.readyState, hasSrc: Boolean(el.srcObject) } : null,
        deafened: Boolean(deafenedRef.current),
        transceivers: (pc.getTransceivers?.() || []).map((t) => `${t.receiver?.track?.kind || "?"}:${t.currentDirection || t.direction || "?"}`).join(","),
        ...keeper.stats(),
      };
      if (verdict === "resume") keeper.kick("probe");
      if (verdict === "flowing" || verdict === "resume") {
        if (!probe.flowingLogged) {
          probe.flowingLogged = true;
          console.info("[CallAudio] time-to-audio", Date.now() - startedAt, "ms after connect", context);
        }
        if (IOS_NATIVE && !probe.rebound && lastAudioActivationRef.current > keeper.attachedAt() && keeper.attachedAt() > 0) {
          probe.rebound = true;
          keeper.rebind("attached-before-activation");
        }
        if (verdict === "resume" && !probe.reported) {
          probe.reported = true;
          reportDiagnostic("dm_call_remote_audio_paused", context);
        }
      } else if (verdict === "missing" && !probe.reported) {
        probe.reported = true;
        console.warn("[CallAudio] no inbound audio", context);
        reportDiagnostic("dm_call_inbound_audio_missing", context);
      }
    };
    [1500, 4000, 9000, 20000].forEach((ms, i) => probe.timers.push(setTimeout(() => void sample(i + 1), ms)));
  };

  // Native iOS: keep the microphone sending across CallKit audio-session
  // activation (lib/iosCallMic.js). null on web / Electron / Android.
  const micGuardRef = useRef(null);
  if (IOS_NATIVE && !micGuardRef.current) {
    micGuardRef.current = createMicGuard({
      getPc: () => pcRef.current,
      getLocalStream: () => localStreamRef.current,
      getScreenAudioSender: () => screenAudioSenderRef.current,
      isCallOngoing: () => modeRef.current === "active" || modeRef.current === "outgoing",
      getContext: () => ({
        direction: callDirectionRef.current || "",
        callType: callTypeRef.current || "",
        mode: modeRef.current || "",
        visibility: typeof document !== "undefined" ? document.visibilityState : "",
      }),
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      audioConstraints: () => getVoiceAudioConstraints().audio,
      reactivateCapture: reactivateIosCapture,
      getDiagnostics: getIosAudioDiagnostics,
      report: (kind, context) => {
        console.warn("[CallAudio]", kind, context);
        reportDiagnostic(kind, context);
      },
      // A fresh capture (and above all "stop every capture") reconfigures
      // WebKit's audio session: the remote track renderer must be rebuilt.
      onRefreshed: ({ reason } = {}) => {
        setTimeout(() => remoteAudioKeeperRef.current?.rebind(`mic-${reason || "refresh"}`), 150);
      },
      onUnrecoverable: (reason) => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(new CustomEvent("descall:ios-call-mic-unrecoverable", { detail: { reason } }));
      },
      log: (...args) => console.info("[CallAudio]", ...args),
    });
  }

  useEffect(() => { peerRef.current = peer; }, [peer]);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { callTypeRef.current = callType; }, [callType]);

  const selectedAudioInputRef = useRef(selectedAudioInput);
  const setAudioInputRef = useRef(null);
  const replacingMicRef = useRef(false);
  useEffect(() => {
    selectedAudioInputRef.current = selectedAudioInput;
  }, [selectedAudioInput]);

  // The saved speaker applies to all call audio from the start (not iOS: the
  // native router owns output there).
  useEffect(() => {
    if (IOS_NATIVE) return;
    const saved = readAudioPrefs().output;
    if (saved) void setOutputSink(saved);
  }, []);

  // Enumerate audio devices on mount and on device change. Empty selection
  // follows the system default; recapture only when the live mic is gone
  // or a headset appears while that default is in use.
  useEffect(() => {
    let previousIds = [];
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === "audioinput");
        const outputs = devices.filter(d => d.kind === "audiooutput");
        const cameras = devices.filter(d => d.kind === "videoinput");
        setAudioInputDevices(inputs);
        setAudioOutputDevices(outputs);
        setVideoInputDevices(cameras);
        const live = modeRef.current === "active" || modeRef.current === "outgoing";
        // The noise-suppressed track reports "WebAudio-…": use the raw capture id.
        const currentId = liveMicDeviceId(localStreamRef.current, getNoiseSuppressionRawTrack());
        const plan = micRecapturePlan({
          previousIds,
          inputs,
          currentDeviceId: currentId,
          preferredId: selectedAudioInputRef.current,
        });
        previousIds = inputs.map((device) => device.deviceId).filter(Boolean);
        if (live && localStreamRef.current && plan.reason && !replacingMicRef.current) {
          void setAudioInputRef.current?.(plan.deviceId);
        }
      } catch (_) {}
    };
    getDevices();
    navigator.mediaDevices.addEventListener("devicechange", getDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", getDevices);
  }, []);

  const cleanup = useCallback(() => {
    setupTimelineRef.current?.end();
    micGuardRef.current?.reset();
    stopInboundProbe();
    remoteAudioKeeperRef.current?.reset();
    recoveryRef.current?.dispose();
    recoveryRef.current = null;
    iceRestartQueuedRef.current = false;
    peerOnlineRef.current = true;
    localLevelProbeRef.current?.stop();
    localLevelProbeRef.current = null;
    setEnding(null);
    callDirectionRef.current = null;
    setCalleeAnswering(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setDuration(0);
    incomingOfferRef.current = null;
    incomingCallTypeRef.current = null;
    if (pcRef.current) {
      safeClosePeer(pcRef.current);
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    disposeNoiseSuppressionSession({ stopRaw: true });
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    remoteStreamRef.current = null;
    setRemoteScreenStream(null);
    remoteScreenStreamRef.current = null;
    setRemoteScreenSharing(false);
    remoteScreenSharingRef.current = false;
    remoteScreenExpectedRef.current = false;
    remoteScreenAnnouncementRef.current = null;
    inboundMediaRef.current = [];
    setScreenStream(null);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    pendingIceRef.current = [];
    screenSenderRef.current = null;
    screenAudioSenderRef.current = null;
    if (screenAudioCtxRef.current) {
      try { screenAudioCtxRef.current.close(); } catch { /* ignore */ }
      screenAudioCtxRef.current = null;
    }
    screenSharingRef.current = false;
    makingOfferRef.current = false;
    negotiationQueuedRef.current = false;
    iceRestartAttemptedRef.current = false;
    if (iceRecoveryTimerRef.current) {
      clearTimeout(iceRecoveryTimerRef.current);
      iceRecoveryTimerRef.current = null;
    }
    negotiateRef.current = null;
    resetCallHaptic();
    setMode(null);
    setCallAnchorAt(null);
    setCallType(null);
    setCallUuid(null);
    setPeer(null);
    setMuted(readLocalMute());
    setDeafened(false);
    deafenedRef.current = false;
    mutedByDeafenRef.current = false;
    setCameraOn(false);
    setRemoteMuted(false);
    setRemoteCameraOn(null);
    setRemoteDeafened(false);
    setScreenSharing(false);
    setConnectionQuality("unknown");
    setPeerConnectionState("idle");
    setRemoteMediaReady(false);
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    // Stop all call sounds
    audioManager.stop("incomingCall");
    audioManager.stop("outgoingCall");
  }, []);

  /**
   * End a connected call with the leave transition: media stops NOW (pc
   * closed, mic released, remote audio muted) but the overlay stays for
   * CALL_ENDING_MS so the leaver's tile can fade/scale out, the remaining
   * tile springs into place and "Arama sona erdi" fades in — instead of the
   * old 320 ms cut that left the leaver's rectangle alone and then vanished.
   */
  const gracefulEnd = useCallback((reason = "ended") => {
    if (modeRef.current === "active") {
      if (cleanupTimerRef.current) return; // already ending
      recoveryRef.current?.dispose();
      recoveryRef.current = null;
      if (pcRef.current) {
        safeClosePeer(pcRef.current);
        pcRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      disposeNoiseSuppressionSession({ stopRaw: true });
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      stopInboundProbe();
      remoteAudioKeeperRef.current?.reset();
      const audio = remoteAudioRef.current;
      if (audio) {
        try { audio.muted = true; audio.srcObject = null; } catch { /* ignore */ }
      }
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setEnding({ reason: typeof reason === "string" ? reason : "ended", at: Date.now() });
      setPeerConnectionState("ended");
      cleanupTimerRef.current = setTimeout(() => {
        cleanupTimerRef.current = null;
        cleanup();
      }, CALL_ENDING_MS);
      return;
    }
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    if (mode !== "active" || ending) return;
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode, ending]);

  // Handle call sounds based on mode
  useEffect(() => {
    const prev = prevCallModeRef.current;
    prevCallModeRef.current = mode;
    if (mode === "incoming") {
      // Native iOS: CallKit is already ringing, never ring twice.
      if (!callKitOwnsIncomingRing()) audioManager.play("incomingCall", { loop: true });
    } else if (mode === "outgoing") {
      audioManager.play("outgoingCall", { loop: true });
    } else if (mode === "active") {
      audioManager.stop("incomingCall");
      audioManager.stop("outgoingCall");
      if (prev === "incoming" || prev === "outgoing") audioManager.play("callAccept");
    } else if (mode === null) {
      audioManager.stop("incomingCall");
      audioManager.stop("outgoingCall");
    }
    if (prev === "incoming" && mode !== "incoming") {
      const fromId = incomingNotifFromIdRef.current;
      incomingNotifFromIdRef.current = null;
      notificationService.dismissIncomingCall({ kind: "dm", fromId });
    }
  }, [mode]);

  useEffect(() => () => {
    if (modeRef.current !== "incoming") return;
    notificationService.dismissIncomingCall({
      kind: "dm",
      fromId: incomingNotifFromIdRef.current,
    });
  }, []);

  const flushIce = async (pc) => {
    for (const c of pendingIceRef.current) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    pendingIceRef.current = [];
  };

  const markRemoteMediaReady = useCallback((stream) => {
    if (!stream) return;
    const tracks = stream.getTracks?.() || [];
    if (tracks.length === 0) return;
    const hasUsable = tracks.some((t) => t.readyState === "live" || t.readyState === "new");
    if (hasUsable) setRemoteMediaReady(true);
  }, []);

  const applyInboundLayout = useCallback(() => {
    const { screen, main } = partitionInbound(
      inboundMediaRef.current,
      remoteScreenAnnouncementRef.current
    );
    const screenStream = screen.length ? new MediaStream(screen) : null;
    const mainStream = main.length ? new MediaStream(main) : null;
    remoteScreenStreamRef.current = screenStream;
    remoteStreamRef.current = mainStream;
    const sharing = screen.some((track) => track.kind === "video" && track.readyState !== "ended");
    remoteScreenSharingRef.current = sharing;
    remoteScreenExpectedRef.current = Boolean(remoteScreenAnnouncementRef.current);
    setRemoteScreenStream(screenStream);
    setRemoteScreenSharing(sharing);
    setRemoteStream(mainStream);
    if (mainStream?.getAudioTracks().some((track) => track.readyState !== "ended")) {
      markRemoteMediaReady(mainStream);
    }
    if (mainStream?.getVideoTracks().some((track) => track.readyState !== "ended")) {
      setCallType("video");
      callTypeRef.current = "video";
      setRemoteCameraOn(true);
    }
    const audio = remoteAudioRef.current;
    // srcObject changes only when the mic track set changes (every reassign
    // restarts WebKit's renderer; the overlay used to flip it back and forth).
    if (audio && remoteAudioKeeperRef.current.attach("inbound") !== "cleared") {
      applyPlaybackGain(audio, deafenedRef.current ? 0 : remoteVolumeRef.current);
    }
    const video = remoteVideoRef.current;
    const cameraTracks = mainStream?.getVideoTracks().filter((track) => track.readyState !== "ended") || [];
    if (video) {
      video.muted = true;
      video.srcObject = cameraTracks.length ? new MediaStream(cameraTracks) : null;
      if (cameraTracks.length) video.play().catch(() => {});
    }
  }, [markRemoteMediaReady]);

  const rememberInbound = useCallback((described) => {
    if (!described?.track) return;
    inboundMediaRef.current = inboundMediaRef.current.filter(
      (entry) => entry.track && entry.track !== described.track && entry.track.readyState !== "ended"
    );
    inboundMediaRef.current.push(described);
  }, []);

  const noteRemoteScreenAnnouncement = useCallback((announcement) => {
    const next = sanitizeScreenAnnouncement(announcement);
    if (!next) return;
    remoteScreenAnnouncementRef.current = mergeScreenAnnouncement(remoteScreenAnnouncementRef.current, next);
    remoteScreenExpectedRef.current = true;
    applyInboundLayout();
  }, [applyInboundLayout]);

  const clearRemoteScreen = useCallback(() => {
    inboundMediaRef.current = dropScreenEntries(
      inboundMediaRef.current,
      remoteScreenAnnouncementRef.current
    );
    remoteScreenAnnouncementRef.current = null;
    remoteScreenExpectedRef.current = false;
    applyInboundLayout();
  }, [applyInboundLayout]);

  const setupPeerConnection = useCallback((pc, stream, isInitiator) => {
    setPeerConnectionState("connecting");
    attachLocalTracks(pc, stream);

    pc.ontrack = (e) => {
      const track = e.track;
      if (!track) return;
      const described = describeRtcTrackEvent(e);
      const role = classifyInboundMedia({
        ...described,
        announcement: remoteScreenAnnouncementRef.current,
      });
      if (role === "mic") tuneAudioReceiver(e.receiver);
      rememberInbound(described);
      applyInboundLayout();
      if (track.muted) {
        track.onunmute = () => {
          if (!isScreenRole(role) && track.kind === "video") setCallType("video");
          applyInboundLayout();
        };
      }
      track.onended = () => {
        inboundMediaRef.current = inboundMediaRef.current.filter((entry) => entry.track !== track);
        applyInboundLayout();
      };
    };

    pc.onicecandidate = (e) => {
      const sock = socketRef.current;
      if (e.candidate && peerRef.current?.id && sock?.connected) {
        sock.emit("call:ice-candidate", { toUserId: peerRef.current.id, candidate: e.candidate });
      }
    };

    // One recovery machine per pc (lib/callConnectionMachine.js): a single
    // link state from both pc states, debounced UI status, ICE restarts with
    // backoff (never a teardown), restart held until the socket is back.
    recoveryRef.current?.dispose();
    const recovery = createCallRecovery({
      polite: isPolitePeer(getUser()?.id || null, peerRef.current?.id || null),
      restart: () => {
        if (pcRef.current !== pc || pc.connectionState === "closed") return;
        iceRestartQueuedRef.current = true;
        if (negotiateRef.current) void negotiateRef.current({ iceRestart: true });
        else {
          try { pc.restartIce(); } catch { /* next backoff step */ }
        }
      },
      onStatus: (status) => {
        if (pcRef.current !== pc) return;
        if (status === "connected") {
          setPeerConnectionState("connected");
          setConnectionQuality("good");
        } else if (status === "reconnecting") {
          setPeerConnectionState("reconnecting");
          setConnectionQuality("poor");
        } else if (status === "connecting") {
          setPeerConnectionState("connecting");
          setConnectionQuality("connecting");
        } else if (status === "lost") {
          setPeerConnectionState("disconnected");
          setConnectionQuality("failed");
          audioManager.play("disconnect");
        }
      },
      onLost: () => {
        if (pcRef.current !== pc || modeRef.current !== "active") return;
        toastRef.current?.(tRuntime("Connection lost. The call has ended."), "error");
        endCallRef.current?.(undefined, "lost");
      },
    });
    recovery.setPeerOnline(peerOnlineRef.current);
    recovery.socketChanged(Boolean(socketRef.current?.connected));
    recoveryRef.current = recovery;

    const onPcState = () => {
      if (pcRef.current !== pc && pcRef.current) return;
      const conn = pc.connectionState;
      const ice = pc.iceConnectionState;
      if (ice === "connected" || ice === "completed") setupTimelineRef.current?.mark("ice");
      if ((conn === "disconnected" || conn === "failed") && modeRef.current === "active") {
        setupTimelineRef.current?.count("reconnects");
      }
      if (conn === "connected" && modeRef.current !== "active") {
        hapticCallConnected();
        setMode("active");
        modeRef.current = "active";
      }
      if (conn === "connected") {
        startInboundProbe(pc);
        remoteAudioKeeperRef.current?.start();
      }
      if (conn === "connected" || ice === "connected" || ice === "completed") {
        iceRestartAttemptedRef.current = false;
        iceRestartQueuedRef.current = false;
      }
      recovery.update({ connectionState: conn, iceConnectionState: ice });
    };
    pc.onconnectionstatechange = onPcState;
    pc.oniceconnectionstatechange = onPcState;

    // A single serialized offer path for camera/screen changes. This mirrors
    // group-call peer behavior and avoids a second, delayed screen offer
    // racing the browser's negotiationneeded event.
    let negotiateFailures = 0;
    let offerWatchdog = null;
    let staleOffer = false;
    const negotiate = async (opts = {}) => {
      const sock = socketRef.current;
      if (opts.iceRestart) iceRestartQueuedRef.current = true;
      // An offer whose answer never came back (lost while the socket was
      // down) would hold signaling in have-local-offer forever and block
      // every later restart: roll it back before trying again.
      if (
        (iceRestartQueuedRef.current || staleOffer) &&
        !makingOfferRef.current &&
        pc.signalingState === "have-local-offer" &&
        modeRef.current === "active" &&
        sock?.connected
      ) {
        try {
          await pc.setLocalDescription({ type: "rollback" });
        } catch {
          /* not rollback-able; the browser will reject the next offer too */
        }
        staleOffer = false;
      }
      // Early returns must not touch makingOfferRef. A nested call used to
      // clear that lock from `finally` and send a second camera offer that
      // collided, so the remote peer never attached the video.
      if (modeRef.current !== "active" || !peerRef.current?.id || !sock?.connected) {
        negotiationQueuedRef.current = true;
        return;
      }
      if (makingOfferRef.current || pc.signalingState !== "stable") {
        negotiationQueuedRef.current = true;
        return;
      }
      negotiationQueuedRef.current = false;
      makingOfferRef.current = true;
      const withIceRestart = Boolean(opts.iceRestart || iceRestartQueuedRef.current);
      try {
        const offer = await pc.createOffer(withIceRestart ? { iceRestart: true } : undefined);
        if (pc.signalingState !== "stable") {
          negotiationQueuedRef.current = true;
          return;
        }
        await commitLocalDescription(pc, offer);
        negotiateFailures = 0;
        const screen = screenSenderRef.current
          ? announcementFromSenders(
              pc,
              screenStreamRef.current,
              screenSenderRef.current,
              screenAudioSenderRef.current
            )
          : null;
        sock.emit("call:offer", {
          toUserId: peerRef.current.id,
          offer: pc.localDescription,
          callType: callTypeRef.current || "voice",
          renegotiate: true,
          ...(screen ? { screen } : {}),
        });
        if (withIceRestart) iceRestartQueuedRef.current = false;
        if (offerWatchdog) clearTimeout(offerWatchdog);
        offerWatchdog = setTimeout(() => {
          offerWatchdog = null;
          if (pcRef.current !== pc || pc.signalingState !== "have-local-offer") return;
          // No answer in time (lost on a dead socket): roll it back and offer
          // again — with an ICE restart if the link is not healthy.
          staleOffer = true;
          negotiationQueuedRef.current = true;
          const restart = withIceRestart || pc.connectionState !== "connected";
          void negotiate(restart ? { iceRestart: true } : {});
        }, 8000);
      } catch (err) {
        negotiateFailures += 1;
        negotiationQueuedRef.current = negotiateFailures < 3;
        console.warn("[WebRTC] negotiate failed:", err);
      } finally {
        makingOfferRef.current = false;
        if (
          negotiationQueuedRef.current &&
          pc.signalingState === "stable" &&
          modeRef.current === "active"
        ) {
          queueMicrotask(() => {
            void negotiate();
          });
        }
      }
    };
    negotiateRef.current = negotiate;
    // Skip while dialing, startCall already sends the initial offer; a
    // renegotiation request remains queued until the connection is stable.
    pc.onnegotiationneeded = () => {
      // Screen publish sends one explicit offer. A second automatic offer
      // raced the first and the remote answer never attached the display track.
      if (suppressAutoNegotiateRef.current) return;
      negotiationQueuedRef.current = true;
      void negotiate();
    };
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === "stable" && negotiationQueuedRef.current) {
        void negotiate();
      }
    };
  }, [applyInboundLayout, markRemoteMediaReady, rememberInbound]);

  // When returning from background (mobile home / app switcher), resume
  // remote audio and recover ICE, never hang up just because we left.
  // Also surface screen-share death that Safari/Chrome caused while hidden.
  useEffect(() => {
    if (mode !== "active") return undefined;

    const resumeAfterBackground = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      pulseCallWakeLock();

      if (screenEndedInBackgroundRef.current) {
        screenEndedInBackgroundRef.current = false;
        toast(
          tRuntime("Screen share ended while Descall was in the background."),
          "info"
        );
      }

      // Never unmute a deafened call; play() when paused, attach if missing.
      remoteAudioKeeperRef.current?.attach("visible");
      const video = remoteVideoRef.current;
      if (video) {
        try {
          const p = video.play();
          if (p?.catch) p.catch(() => {});
        } catch {
          /* ignore */
        }
      }
      const pc = pcRef.current;
      if (!pc || modeRef.current !== "active") return;
      const ice = pc.iceConnectionState;
      const conn = pc.connectionState;
      const unhealthy =
        ice === "disconnected" ||
        ice === "failed" ||
        conn === "disconnected" ||
        conn === "failed";
      if (!unhealthy) return;
      // Back from the background with a broken link: restart now, not after a backoff step.
      recoveryRef.current?.networkChanged();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Keep media pipeline warm while user switches apps during screen share.
        pulseCallWakeLock();
        return;
      }
      resumeAfterBackground();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", resumeAfterBackground);
    window.addEventListener("focus", resumeAfterBackground);
    const stopNetwork = subscribeNetworkChange(() => {
      if (modeRef.current !== "active") return;
      const pc = pcRef.current;
      if (!pc || pc.connectionState === "closed") return;
      // Wi-Fi ↔ cellular: the selected candidate pair is gone; restart now.
      recoveryRef.current?.networkChanged();
    });
    return () => {
      stopNetwork();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", resumeAfterBackground);
      window.removeEventListener("focus", resumeAfterBackground);
    };
  }, [mode, toast]);

  /**
   * Stop the incoming ring on THIS device only (ringtone, desktop / Electron
   * / service-worker notification, in-page card). Returns the peer whose
   * ring stopped, or null when the event was for another ring.
   */
  const stopRingLocally = useCallback((event = {}) => {
    const current = {
      mode: modeRef.current,
      peerId: peerRef.current?.id,
      callUuid: callUuidRef.current,
    };
    if (!ringEventMatches(current, event)) return null;
    const stoppedPeer = peerRef.current;
    audioManager.stop("incomingCall");
    notificationService.dismissIncomingCall({ kind: "dm", fromId: stoppedPeer?.id || event.fromUserId || null });
    cleanup();
    return stoppedPeer || { id: event.fromUserId };
  }, [cleanup]);
  const stopRingLocallyRef = useRef(stopRingLocally);
  stopRingLocallyRef.current = stopRingLocally;
  const callUuidRef = useRef(null);
  useEffect(() => { callUuidRef.current = callUuid; }, [callUuid]);

  // Other tabs of this browser profile: accept / decline here stops their
  // ring instantly, even when their socket is throttled (BroadcastChannel).
  const ringChannelRef = useRef(null);
  useEffect(() => {
    const channel = createRingChannel((msg) => {
      if (msg.type !== "handled") return;
      stopRingLocallyRef.current?.({ fromUserId: msg.fromUserId, callUuid: msg.callUuid });
    });
    ringChannelRef.current = channel;
    // The service worker got a call-ring-ended Web Push (this tab's socket
    // may be asleep in the background): stop ringing here too.
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : null;
    const onSwMessage = (event) => {
      const data = event?.data;
      if (!data || data.type !== "descall:call-ring-ended") return;
      stopRingLocallyRef.current?.({ fromUserId: data.fromUserId, callUuid: data.callUuid });
    };
    try { sw?.addEventListener?.("message", onSwMessage); } catch { /* ignore */ }
    return () => {
      channel.close();
      if (ringChannelRef.current === channel) ringChannelRef.current = null;
      try { sw?.removeEventListener?.("message", onSwMessage); } catch { /* ignore */ }
    };
  }, []);

  // While ringing: ask the server whether the ring is still on after every
  // reconnect (the ring-ended event may have been missed while this socket
  // was asleep), and never ring longer than INCOMING_RING_TIMEOUT_MS.
  useEffect(() => {
    if (mode !== "incoming" || !socket) return undefined;
    const ask = () => {
      const fromUserId = peerRef.current?.id;
      if (!fromUserId || !socket.connected) return;
      socket.emit("call:ring-status", { fromUserId, callUuid: callUuidRef.current || null });
    };
    socket.on("connect", ask);
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") ask();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    const timer = setTimeout(() => {
      if (modeRef.current !== "incoming") return;
      const missedFrom = peerRef.current;
      const ringType = incomingCallTypeRef.current || "voice";
      stopRingLocallyRef.current?.({ fromUserId: missedFrom?.id, callUuid: callUuidRef.current });
      if (missedFrom?.username) {
        void notificationService.missedCall({ from: missedFrom.username, fromId: missedFrom.id || null, type: ringType });
      }
    }, INCOMING_RING_TIMEOUT_MS);
    return () => {
      socket.off("connect", ask);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer);
    };
  }, [mode, socket]);

  // Outgoing ring: after the caller's socket comes back (phone was locked /
  // app backgrounded while it rang) fetch an answer that arrived meanwhile.
  useEffect(() => {
    if (mode !== "outgoing" || !socket) return undefined;
    const ask = () => {
      const toUserId = peerRef.current?.id;
      if (!toUserId || !socket.connected) return;
      socket.emit("call:caller-resume", { toUserId: String(toUserId) });
    };
    socket.on("connect", ask);
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") ask();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    return () => {
      socket.off("connect", ask);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
  }, [mode, socket]);

  // 3.0.0 (A0): call summaries queued while the socket was down go out now.
  useEffect(() => {
    if (!socket) return undefined;
    const flush = () => {
      telemetrySenderRef.current?.flush();
      if (IOS_NATIVE) {
        void drainNativeTelemetry().then((items) => items.forEach((item) => telemetrySenderRef.current?.send(item)));
      }
    };
    socket.on("connect", flush);
    if (socket.connected) flush();
    return () => socket.off("connect", flush);
  }, [socket]);

  // Signaling health for the link recovery machine while connected.
  useEffect(() => {
    if (mode !== "active" || !socket) return undefined;
    const onUp = () => {
      recoveryRef.current?.socketChanged(true);
      if (negotiationQueuedRef.current || iceRestartQueuedRef.current) void negotiateRef.current?.();
    };
    const onDown = () => recoveryRef.current?.socketChanged(false);
    socket.on("connect", onUp);
    socket.on("disconnect", onDown);
    recoveryRef.current?.socketChanged(Boolean(socket.connected));
    return () => {
      socket.off("connect", onUp);
      socket.off("disconnect", onDown);
    };
  }, [mode, socket]);

  useEffect(() => {
    if (!socket) return;

    const onOffer = async ({ fromUser, offer, callType: incomingType, callUuid: incomingCallUuid, renegotiate, screen } = {}) => {
      if (!fromUser?.id || !offer) return;
      if (callOccupancyRef?.current?.groupActive) {
        socketRef.current?.emit("call:decline", { toUserId: fromUser.id });
        return;
      }
      
      const pc = pcRef.current;
      const samePeer = String(peerRef.current?.id || "") === String(fromUser.id);
      const isRenegotiation = Boolean(pc) && samePeer && (renegotiate === true || modeRef.current === "active");
      
      if (isRenegotiation) {
        setupTimelineRef.current?.count("reneg");
        // Identity rides with the offer so ontrack can classify before any
        // "latest video" guess. Apply it before setRemoteDescription.
        if (screen) noteRemoteScreenAnnouncement(screen);
        // Renegotiation with glare handling (same polite-peer rule as group calls)
        try {
          const myId = getUser()?.id || null;
          const polite = isPolitePeer(myId, fromUser.id);
          const { accepted, rolledBack } = await applyRemoteOffer(pc, offer, {
            polite,
            makingOffer: Boolean(makingOfferRef.current),
          });
          if (!accepted) {
            // Impolite peer keeps its in-flight offer. Queue a follow-up so a
            // camera add that lost the glare is offered again after the answer.
            negotiationQueuedRef.current = true;
            return;
          }
          const answer = await pc.createAnswer();
          await commitLocalDescription(pc, answer);
          socketRef.current?.emit("call:answer", { toUserId: fromUser.id, answer: pc.localDescription });
          await flushIce(pc);
          // Peer upgraded voice → video (camera on): update UI mode
          if (incomingType === "video") {
            setCallType("video");
            callTypeRef.current = "video";
            setRemoteCameraOn(true);
          }
          if (rolledBack) {
            const cameraTrack = localStreamRef.current?.getVideoTracks?.()[0];
            const screenTrack = screenStreamRef.current?.getVideoTracks?.()[0];
            const cameraLive = cameraTrack && cameraTrack.readyState === "live" && cameraTrack.enabled;
            const screenLive = screenTrack && screenTrack.readyState === "live";
            if (cameraLive || screenLive) {
              negotiationQueuedRef.current = true;
              void negotiateRef.current?.();
            }
          }
        } catch (err) { console.error("[WebRTC] Renegotiation failed:", err); }
        return;
      }

      // A renegotiation offer for a call this tab isn't in (answered on another
      // device, or natively from the iOS lock screen) is never a new ring.
      if (renegotiate === true) return;

      // iOS: a call answered natively on the CallKit screen owns the audio.
      const nativeVerdict = nativeOfferVerdict(getNativeCallSnapshot(), fromUser.id);
      if (nativeVerdict === "ignore") return;
      if (nativeVerdict === "decline") {
        socket.emit("call:decline", { toUserId: fromUser.id });
        return;
      }

      // Already ringing / dialing this peer → refresh SDP, keep popup
      if (
        peerRef.current?.id === fromUser.id &&
        (modeRef.current === "incoming" || modeRef.current === "outgoing")
      ) {
        incomingOfferRef.current = offer;
        if (incomingType) incomingCallTypeRef.current = incomingType;
        return;
      }

      // Busy with another call, do not steal the UI
      if (modeRef.current === "active" || modeRef.current === "outgoing" || modeRef.current === "incoming") {
        socket.emit("call:decline", { toUserId: fromUser.id });
        return;
      }
      
      // New incoming call
      callDirectionRef.current = "incoming";
      incomingOfferRef.current = offer;
      incomingCallTypeRef.current = incomingType || "voice";
      setRemoteCameraOn(incomingType === "video");
      setPeer({
        ...fromUser,
        avatarUrl: fromUser?.avatarUrl || fromUser?.avatar_url || null,
      });
      setCallType(incomingType || "voice");
      setCallUuid(typeof incomingCallUuid === "string" ? incomingCallUuid : null);
      setCallAnchorAt(Date.now());
      setMode("incoming");
      modeRef.current = "incoming";
      incomingNotifFromIdRef.current = fromUser.id;
      if (!callKitOwnsIncomingRing()) {
        notificationService.incomingCall({
          from: fromUser.displayName || fromUser.display_name || fromUser.username,
          fromId: fromUser.id,
          type: incomingType || "voice",
          avatarUrl: fromUser.avatarUrl || fromUser.avatar_url || null,
        });
      }
    };

    const onAnswer = async ({ fromUserId, answer } = {}) => {
      if (!fromUserId || !answer || !pcRef.current) return;
      if (peerRef.current?.id && fromUserId !== peerRef.current.id) return;
      try {
        if (pcRef.current.signalingState !== "have-local-offer") return;
        setupTimelineRef.current?.mark("answerRecv");
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setupTimelineRef.current?.watch(pcRef.current);
        await flushIce(pcRef.current);
        hapticCallConnected();
        setMode("active");
        modeRef.current = "active";
        if (negotiationQueuedRef.current) void negotiateRef.current?.();
      } catch { /* ignore */ }
    };

    const onIce = async ({ fromUserId, candidate } = {}) => {
      if (!candidate || !fromUserId) return;
      if (peerRef.current?.id && fromUserId !== peerRef.current.id) return;
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingIceRef.current.push(candidate);
        return;
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ }
    };

    const onEnded = ({ fromUserId, reason } = {}) => {
      if (!fromUserId || peerRef.current?.id === fromUserId) {
        if (reason === "no_answer" && modeRef.current === "outgoing") {
          toastRef.current?.(tRuntime("No answer"), "info");
        }
        if (reason === "callee_unavailable" && modeRef.current === "outgoing") {
          // Answered on a locked iPhone but never got to join (native timeout).
          toastRef.current?.(
            tRuntime("They answered on a locked iPhone but couldn't join in time. Try calling again."),
            "info"
          );
        }
        if (!suppressRemoteEndCueRef.current) {
          if (modeRef.current === "incoming" || modeRef.current === "outgoing") audioManager.play("callReject");
          else if (modeRef.current === "active") audioManager.play("userLeave");
        }
        suppressRemoteEndCueRef.current = false;
        gracefulEnd("remote");
      }
    };

    const onMediaState = ({
      fromUserId,
      muted: peerMuted,
      cameraOn: peerCameraOn,
      deafened: peerDeafened,
      requestState,
    } = {}) => {
      if (!fromUserId || String(fromUserId) !== String(peerRef.current?.id || "")) return;
      setRemoteMuted(Boolean(peerMuted));
      setRemoteCameraOn(Boolean(peerCameraOn));
      setRemoteDeafened(Boolean(peerDeafened));
      if (peerCameraOn) applyInboundLayout();
      // The peer just connected / reconnected and has no idea about our
      // mute / deafen / camera state yet, answer once (never with a request).
      if (requestState) emitLocalMediaStateRef.current?.();
    };

    const onCancelled = ({ fromUserId } = {}) => {
      if (!fromUserId || peerRef.current?.id === fromUserId) {
        audioManager.stop('incomingCall');
        audioManager.play("callReject");
        gracefulEnd();
      }
    };

    // Another tab/device of this user already answered or declined. Stop the
    // local ring only, that device already told the caller.
    const onHandledElsewhere = ({ fromUserId, callUuid: endedUuid } = {}) => {
      stopRingLocallyRef.current?.({ fromUserId, callUuid: endedUuid });
    };

    // Server fan-out (lib/callRingFanout.js): the ring is over for every
    // device of mine — answered / declined elsewhere, cancelled, missed.
    const onRingEnded = ({ fromUserId, callUuid: endedUuid, reason } = {}) => {
      const ringType = incomingCallTypeRef.current || "voice";
      const stopped = stopRingLocallyRef.current?.({ fromUserId, callUuid: endedUuid });
      if (stopped && reason === "answered_elsewhere") {
        toastRef.current?.(tRuntime("The call was answered on another device."), "info");
      } else if (stopped && reason === "declined_elsewhere") {
        toastRef.current?.(tRuntime("The call was declined on another device."), "info");
      }
      if (stopped && reason === "missed") {
        const from = stopped.username || stopped.displayName || "";
        if (from) void notificationService.missedCall({ from, fromId: stopped.id || fromUserId || null, type: ringType });
      }
    };

    // Answer to call:ring-status after this socket reconnected mid-ring.
    const onRingStatus = ({ fromUserId, callUuid: askedUuid, state } = {}) => {
      if (state === "ringing") return;
      stopRingLocallyRef.current?.({ fromUserId, callUuid: askedUuid });
    };

    const onPeerPresence = ({ peerId, online } = {}) => {
      if (!peerId || String(peerId) !== String(peerRef.current?.id || "")) return;
      peerOnlineRef.current = Boolean(online);
      recoveryRef.current?.setPeerOnline(Boolean(online));
    };

    const onProfileUpdated = ({ user } = {}) => {
      if (!user?.id) return;
      setPeer((prev) => {
        if (!prev || prev.id !== user.id) return prev;
        const withAvatar = patchUserAvatar(prev, user.avatarUrl || user.avatar_url, user.avatarVersion || user.updated_at);
        return {
          ...withAvatar,
          ...pickEquippedCosmetics(user),
          displayName: user.displayName ?? user.display_name ?? withAvatar.displayName,
          display_name: user.displayName ?? user.display_name ?? withAvatar.display_name,
        };
      });
    };

    const onCalleeAnswering = ({ fromUserId } = {}) => {
      if (!fromUserId || peerRef.current?.id !== fromUserId) return;
      if (modeRef.current !== "outgoing") return;
      setCalleeAnswering(true);
      setConnectionQuality("connecting");
      setPeerConnectionState("connecting");
    };

    const onUnreachable = ({ toUserId, reason } = {}) => {
      if (!toUserId || peerRef.current?.id !== toUserId) return;
      if (modeRef.current !== "outgoing") return;
      // Soft fail: keep the outgoing UI briefly so a flaky presence check
      // doesn't instantly hang up. Caller can cancel manually.
      console.warn("[Call] Callee unreachable:", toUserId, reason || "");
      setConnectionQuality("failed");
      setPeerConnectionState("disconnected");
    };

    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice-candidate', onIce);
    socket.on('call:ended', onEnded);
    socket.on('call:declined', onEnded);
    socket.on('call:cancelled', onCancelled);
    socket.on('call:answered-elsewhere', onHandledElsewhere);
    socket.on('call:declined-elsewhere', onHandledElsewhere);
    socket.on('call:ring-ended', onRingEnded);
    socket.on('call:ring-status:result', onRingStatus);
    socket.on('call:peer-presence', onPeerPresence);
    socket.on('call:unreachable', onUnreachable);
    socket.on('call:callee-answering', onCalleeAnswering);
    socket.on('call:media-state', onMediaState);

    socket.on('user:profile:updated', onProfileUpdated);

    return () => {
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice-candidate', onIce);
      socket.off('call:ended', onEnded);
      socket.off('call:declined', onEnded);
      socket.off('call:cancelled', onCancelled);
      socket.off("call:answered-elsewhere", onHandledElsewhere);
      socket.off("call:declined-elsewhere", onHandledElsewhere);
      socket.off('call:ring-ended', onRingEnded);
      socket.off('call:ring-status:result', onRingStatus);
      socket.off('call:peer-presence', onPeerPresence);
      socket.off('call:unreachable', onUnreachable);
      socket.off('call:callee-answering', onCalleeAnswering);
      socket.off('call:media-state', onMediaState);
      socket.off('user:profile:updated', onProfileUpdated);
    };
  }, [socket, gracefulEnd, cleanup]);

  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Mic (+ camera) for a DM call. Native iOS retries a capture that collides
  // with CallKit activating the audio session (NotReadableError).
  const acquireCallMicStream = useCallback((type) => {
    const base = type === "video"
      ? { video: { width: 1280, height: 720, facingMode: "user" } }
      : { video: false };
    // The saved microphone; a missing device falls back to the default.
    const preferred = IOS_NATIVE ? "" : selectedAudioInputRef.current || "";
    const capture = (id) =>
      acquireVoiceMicStream(id && id !== "default" ? { ...base, audio: { deviceId: { exact: id } } } : base);
    const acquire = () =>
      capture(preferred).catch((err) => {
        if (!preferred || (err?.name !== "OverconstrainedError" && err?.name !== "NotFoundError")) throw err;
        console.warn("[CallAudio] saved microphone unavailable, using the default");
        return capture("");
      });
    if (!IOS_NATIVE) return acquire();
    return withCaptureRetry(acquire, { log: (...args) => console.info("[CallAudio]", ...args) });
  }, []);

  const startCall = useCallback(async (friend, type = "voice") => {
    const peerId = friend?.id || friend?.userId;
    if (!peerId) return;
    // `startCall` is intentionally stable; reading the render-time `socket`
    // here captured its initial null value and made both DM call buttons no-op.
    if (!socketRef.current?.connected) {
      toast(tRuntime("Call connection unavailable. Please wait and try again."), "error");
      return;
    }
    if (modeRef.current === "outgoing" || modeRef.current === "active" || modeRef.current === "incoming") {
      console.warn("[Call] startCall ignored, already in a call:", modeRef.current);
      return;
    }
    try {
      callDirectionRef.current = "outgoing";
      setupTimelineRef.current?.start("outgoing", type, { entry: "tap", push: "none" });
      micGuardRef.current?.noteCaptureStart();
      // Fresh TURN credentials in parallel with the mic prompt (see iceConfig).
      setupTimelineRef.current?.mark("iceCfgStart");
      const icePromise = ensureIceServersForCall().finally(() => setupTimelineRef.current?.mark("iceCfgEnd"));
      setupTimelineRef.current?.mark("gumStart");
      const stream = await acquireCallMicStream(type);
      setupTimelineRef.current?.mark("gum");
      setupTimelineRef.current?.mark("gumEnd");
      localStreamRef.current = stream;
      setLocalStream(stream);
      const mutedNow = primeCapturedMic(stream);
      setNoiseSuppressedTrackEnabled(!mutedNow);
      setMuted(mutedNow);
      micGuardRef.current?.watchTrack(stream.getAudioTracks()[0]);

      // Sync peerRef immediately, unreachable/decline can arrive before React commit
      const peerObj = { ...friend, id: peerId };
      peerRef.current = peerObj;
      setPeer(peerObj);
      setCallType(type);
      setCallAnchorAt(Date.now());
      setMode("outgoing");
      modeRef.current = "outgoing";
      setCameraOn(type === "video");
      setConnectionQuality("connecting");
      setPeerConnectionState("connecting");

      if (localVideoRef.current && type === "video") {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const iceServers = await icePromise;
      setupTimelineRef.current?.mark(iceServersHaveTurn(iceServers) ? "iceCfgTurn" : "iceCfgStunOnly");
      if (modeRef.current !== "outgoing" || peerRef.current?.id !== peerId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const pc = createPeerConnection({ iceServers });
      pcRef.current = pc;
      setupPeerConnection(pc, stream, true);

      const offer = await pc.createOffer();
      await commitLocalDescription(pc, offer);
      // The initial offer already carries every track attached above. The
      // `negotiationneeded` that addTrack queued while dialing must not trigger
      // a second offer/answer right after the callee answers (an extra
      // signaling round trip at connect). If something really changes later,
      // the browser re-fires negotiationneeded once signaling is stable.
      negotiationQueuedRef.current = false;
      if (!socketRef.current?.connected) {
        cleanup();
        return;
      }
      socketRef.current.emit("call:offer", {
        toUserId: String(peerId),
        offer: pc.localDescription,
        callType: type,
        renegotiate: false,
      });
      setupTimelineRef.current?.mark("offerSent");
    } catch (err) {
      console.error("[Call] startCall failed:", err?.name || err?.message || err);
      toast(tRuntime(voiceMicErrorCopy(err)), "error");
      cleanup();
    }
  }, [cleanup, setupPeerConnection, toast, acquireCallMicStream]);

  const acceptIncoming = useCallback(async (opts) => {
    // iOS: an in-app Accept while CallKit owns the ring is answered on CallKit
    // first; the controller calls back here ({ fromCallKit }) once the audio
    // session is up. (UI handlers may pass a click event as `opts`.)
    const timeline = setupTimelineRef.current;
    const tlState = timeline?._state();
    if (opts?.fromCallKit === true && tlState && !tlState.done && tlState.direction === "incoming") {
      timeline.mark("callKitReady"); // in-app Accept answered via CallKit first
    } else if (modeRef.current === "incoming") {
      timeline?.start("incoming", incomingCallTypeRef.current || "voice", incomingEntryMeta(opts));
    }
    if (IOS_NATIVE && opts?.fromCallKit !== true && modeRef.current === "incoming" && interceptUiAnswer()) {
      return;
    }
    const offer = incomingOfferRef.current;
    const type = incomingCallTypeRef.current || "voice";
    // Use peerRef, Electron Accept IPC can fire with a stale React `peer` closure
    const currentPeer = peerRef.current || peer;
    if (!currentPeer?.id || !offer || !socketRef.current?.connected) return;
    if (modeRef.current !== "incoming" && modeRef.current !== "idle") {
      // Only accept while ringing (or allow if somehow idle with offer still set)
      if (modeRef.current !== "incoming") return;
    }
    try {
      micGuardRef.current?.noteCaptureStart();
      timeline?.mark("iceCfgStart");
      const icePromise = ensureIceServersForCall().finally(() => timeline?.mark("iceCfgEnd"));
      timeline?.mark("gumStart");
      const stream = await acquireCallMicStream(type);
      timeline?.mark("gum");
      timeline?.mark("gumEnd");
      const iceServers = await icePromise;
      timeline?.mark(iceServersHaveTurn(iceServers) ? "iceCfgTurn" : "iceCfgStunOnly");
      // The ring may have ended while the capture was pending (iOS defers
      // getUserMedia until the app is visible, e.g. answered on a locked phone).
      if (modeRef.current !== "incoming" || peerRef.current?.id !== currentPeer.id || incomingOfferRef.current !== offer) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      const mutedNow = primeCapturedMic(stream);
      setNoiseSuppressedTrackEnabled(!mutedNow);
      setMuted(mutedNow);
      micGuardRef.current?.watchTrack(stream.getAudioTracks()[0]);
      setCallType(type);
      setCameraOn(type === "video");

      if (localVideoRef.current && type === "video") {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const pc = createPeerConnection({ iceServers });
      pcRef.current = pc;
      setupPeerConnection(pc, stream, false);

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushIce(pc);
      const answer = await pc.createAnswer();
      await commitLocalDescription(pc, answer);
      if (!socketRef.current?.connected) {
        cleanup();
        return;
      }
      socketRef.current.emit("call:answer", { toUserId: currentPeer.id, answer: pc.localDescription });
      ringChannelRef.current?.post("handled", { fromUserId: currentPeer.id, callUuid: callUuidRef.current || null });
      timeline?.mark("answerSent");
      timeline?.watch(pc);
      hapticCallConnected();
      setMode("active");
      modeRef.current = "active";
    } catch (err) {
      toast(tRuntime(voiceMicErrorCopy(err)), "error");
      cleanup();
    }
  }, [peer, cleanup, setupPeerConnection, toast, acquireCallMicStream]);

  const endCall = useCallback((toUserId, reason = "local") => {
    const targetId = toUserId ?? peerRef.current?.id;
    const sock = socketRef.current;
    suppressRemoteEndCueRef.current = true;
    if (modeRef.current === "outgoing") audioManager.play("callReject");
    else if (modeRef.current === "active") audioManager.play("channelLeave");
    if (targetId && sock?.connected) {
      const currentMode = modeRef.current;
      if (currentMode === 'outgoing') {
        sock.emit('call:cancel', { toUserId: targetId });
      } else {
        sock.emit('call:end', { toUserId: targetId });
      }
    }
    gracefulEnd(reason);
  }, [gracefulEnd]);
  endCallRef.current = endCall;

  const declineIncoming = useCallback(() => {
    audioManager.play("callReject");
    const targetId = peerRef.current?.id ?? peer?.id;
    if (targetId && socketRef.current?.connected) {
      socketRef.current.emit('call:decline', { toUserId: targetId });
    }
    ringChannelRef.current?.post("handled", { fromUserId: targetId || null, callUuid: callUuidRef.current || null });
    notificationService.dismissIncomingCall({ kind: "dm", fromId: targetId || null });
    cleanup();
  }, [peer, cleanup]);

  // Electron notification Accept / Decline, refs avoid stale closures from mount-once effect
  const acceptIncomingRef = useRef(acceptIncoming);
  const declineIncomingRef = useRef(declineIncoming);
  useEffect(() => { acceptIncomingRef.current = acceptIncoming; }, [acceptIncoming]);
  useEffect(() => { declineIncomingRef.current = declineIncoming; }, [declineIncoming]);

  useEffect(() => {
    if (!window.electronAPI?.onCallAccept) return;
    const unsubAccept = window.electronAPI.onCallAccept(() => {
      // Only handle DM incoming ring, group hook owns group-call accepts
      if (modeRef.current !== "incoming") return;
      acceptIncomingRef.current?.();
    });
    const unsubDecline = window.electronAPI.onCallDecline(() => {
      if (modeRef.current !== "incoming") return;
      declineIncomingRef.current?.();
    });
    return () => {
      unsubAccept?.();
      unsubDecline?.();
    };
  }, []);

  // Remote participants render our mic / headphones / camera badges from
  // this presentation-only signal. One effect publishes every change (toggle
  // buttons, CallKit mute, deafen-implied mute) with fresh values, the old
  // per-toggle emits captured a stale `cameraOn` and never sent deafen.
  const localMediaStateRef = useRef({ muted: false, cameraOn: false, deafened: false });
  localMediaStateRef.current = { muted: Boolean(muted), cameraOn: Boolean(cameraOn), deafened: Boolean(deafened) };
  const emitLocalMediaState = useCallback((opts = {}) => {
    const toUserId = peerRef.current?.id;
    const s = socketRef.current;
    if (!toUserId || !s?.connected) return;
    s.emit("call:media-state", {
      toUserId,
      ...localMediaStateRef.current,
      ...(opts.requestState ? { requestState: true } : {}),
    });
  }, []);
  const emitLocalMediaStateRef = useRef(emitLocalMediaState);
  emitLocalMediaStateRef.current = emitLocalMediaState;
  const peerIdForMedia = peer?.id || null;
  const mediaStateActive = mode === "active" && Boolean(peerIdForMedia);
  useEffect(() => {
    if (!mediaStateActive) return;
    emitLocalMediaState();
  }, [mediaStateActive, peerIdForMedia, muted, cameraOn, deafened, emitLocalMediaState]);
  useEffect(() => {
    if (!mediaStateActive) return undefined;
    // Ask the peer for its state on connect and after every socket reconnect
    // (iOS foreground / network switch) so its badges are never stale.
    emitLocalMediaState({ requestState: true });
    const s = socket;
    if (!s) return undefined;
    const onReconnect = () => {
      emitLocalMediaState({ requestState: true });
      if (!screenSharingRef.current || !peerRef.current?.id) return;
      const screen = announcementFromSenders(
        pcRef.current,
        screenStreamRef.current,
        screenSenderRef.current,
        screenAudioSenderRef.current
      );
      if (screen) {
        socketRef.current?.emit("screen:share-start", { toUserId: peerRef.current.id, screen });
      }
      // A blind renegotiation on every reconnect raced the peer's own one
      // (both sides reconnect after a server restart → glare). Only offer when
      // something is actually queued; the recovery machine handles ICE.
      if (negotiationQueuedRef.current || iceRestartQueuedRef.current) void negotiateRef.current?.();
    };
    s.on("connect", onReconnect);
    return () => s.off("connect", onReconnect);
  }, [mediaStateActive, peerIdForMedia, socket, emitLocalMediaState]);

  const setMicEnabled = useCallback((enabled, { persist = false, sound = true } = {}) => {
    if (deafenedRef.current && enabled) return;
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track || track.enabled === enabled) return;
    track.enabled = enabled;
    setNoiseSuppressedTrackEnabled(enabled);
    const nextMuted = !enabled;
    setMuted(nextMuted);
    if (persist) writeLocalMute(nextMuted);
    if (!nextMuted) mutedByDeafenRef.current = false;
    if (sound) audioManager.play(nextMuted ? "mute" : "unmute");
  }, []);
  const setMicEnabledRef = useRef(setMicEnabled);
  setMicEnabledRef.current = setMicEnabled;

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    setMicEnabled(!track.enabled, { persist: true });
  }, [setMicEnabled]);

  useEffect(() => {
    const onPtt = (event) => {
      if (modeRef.current !== "active") return;
      setMicEnabledRef.current?.(Boolean(event.detail?.down), { persist: false });
    };
    window.addEventListener("descall:ptt", onPtt);
    return () => window.removeEventListener("descall:ptt", onPtt);
  }, []);

  const toggleDeafen = useCallback(() => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    const audio = remoteAudioRef.current;
    if (audio) {
      audio.muted = next;
      applyPlaybackGain(audio, next ? 0 : remoteVolumeRef.current);
    }
    const track = localStreamRef.current?.getAudioTracks()?.[0];
    if (next) {
      if (track?.enabled) {
        track.enabled = false;
        setNoiseSuppressedTrackEnabled(false);
        setMuted(true);
        mutedByDeafenRef.current = true;
      }
      audioManager.play("deafen");
    } else {
      if (mutedByDeafenRef.current && track) {
        track.enabled = true;
        setNoiseSuppressedTrackEnabled(true);
        setMuted(false);
        mutedByDeafenRef.current = false;
      }
      audioManager.play("undeafen");
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (cameraOn) {
      // Stop camera - disable track but don't remove
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = false;
      }
      if (localVideoRef.current) localVideoRef.current.style.display = "none";
      setCameraOn(false);
    } else {
      try {
        let videoTrack = localStreamRef.current?.getVideoTracks()[0];

        if (!videoTrack) {
          const videoDeviceId = videoInputIdRef.current;
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: videoDeviceId
              ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: 1280, height: 720, facingMode: "user" },
          });
          videoTrack = videoStream.getVideoTracks()[0];
          if (localStreamRef.current) {
            localStreamRef.current.addTrack(videoTrack);
          }
        }
        videoTrack.enabled = true;

        const cameraSender = pc.getSenders().find((item) => {
          if (item === screenSenderRef.current || item === screenAudioSenderRef.current) return false;
          const role = item.track?.__descallRole;
          if (role === "screen" || role === "screen-audio") return false;
          return item.track?.kind === "video" || item.track === videoTrack;
        });
        const recvOnly = pc.getTransceivers().find((item) => {
          if (item.sender === screenSenderRef.current || item.sender === screenAudioSenderRef.current || item.sender === cameraSender) return false;
          const role = item.sender?.track?.__descallRole;
          if (role === "screen" || role === "screen-audio") return false;
          const kind = item.receiver?.track?.kind;
          return kind === "video" && !item.sender?.track;
        });
        if (cameraSender && cameraSender.track !== videoTrack) {
          await cameraSender.replaceTrack(videoTrack);
        } else if (!cameraSender && recvOnly) {
          await recvOnly.sender.replaceTrack(videoTrack);
          if (recvOnly.direction === "recvonly" || recvOnly.direction === "inactive") {
            recvOnly.direction = "sendrecv";
          }
        } else if (!cameraSender) {
          pc.addTrack(videoTrack, localStreamRef.current);
        }

        if (localVideoRef.current) {
          localVideoRef.current.style.display = "block";
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(() => {});
        }
        setCameraOn(true);
        callTypeRef.current = "video";
        setCallType("video");

        // One serialized offer. Re-enabling an existing track still renegotiates
        // so a previous offer that lost glare is sent again.
        negotiationQueuedRef.current = true;
        void negotiateRef.current?.();
      } catch (err) {
        console.error("[WebRTC] toggleCamera failed:", err);
      }
    }
  }, [cameraOn, muted]);

  // Keep stopScreenShareRef always pointing to latest stopScreenShare
  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  });

  const startScreenShare = useCallback(async (qualityOverride, opts = {}) => {
    console.log('[ScreenShare] startScreenShare called');
    const pc = pcRef.current;
    if (!pc || screenSharingRef.current) {
      console.log('[ScreenShare] abort: no pc or already sharing');
      return;
    }
    if (screenShareUnavailableOnIos()) return; // no screen sharing on iPhone
    try {
      const effectiveQuality = qualityOverride || screenQualityRef.current || DM_SCREEN_DEFAULT_QUALITY;
      const { width, height, fps } = resolveScreenCaptureSize(effectiveQuality);
      let screenStream;

      console.log('[ScreenShare] capturing display media…');
      // Electron desktopCapturer or browser getDisplayMedia (multi-sharer OK).
      screenStream = await captureScreenShareStream({
        width,
        height,
        fps,
        // Full OS picker on desktop (window / screen / tab), DES-10.
        preferTab: false,
        pickSource: showElectronScreenPicker,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      await optimizeScreenShareTrack(screenTrack, {
        width,
        height,
        fps,
        contentHint: effectiveQuality.contentHint || "motion",
      });
      if (screenTrack.readyState !== "live") {
        screenStream.getTracks().forEach((t) => t.stop());
        return;
      }

      if (isMobileScreenCapture()) {
        toast(
          tRuntime("Share your entire screen so switching apps keeps the broadcast alive."),
          "info"
        );
      }

      const { track: screenAudioTrack } = await ensureScreenShareAudioTrack(screenStream);
      if (!screenAudioTrack) {
        toast(
          tRuntime(
            isMobileScreenCapture()
              ? "This device can’t share system/tab audio with screen share."
              : "No system/tab audio selected, enable “Share audio” in the picker for sound."
          ),
          "info"
        );
      }

      // Dedicated sendonly transceivers so the display track cannot reuse the
      // camera m-line. One explicit offer carries the stream id and mids.
      const epoch = (screenOfferEpochRef.current += 1);
      suppressAutoNegotiateRef.current = true;
      try {
        const screenSender = addDedicatedSender(pc, screenTrack, screenStream);
        screenSenderRef.current = screenSender;
        if (screenAudioTrack) {
          screenAudioSenderRef.current = addDedicatedSender(pc, screenAudioTrack, screenStream);
        }
        await optimizeScreenShareSender(screenSender, {
          maxBitrate: 1_500_000,
          maxFramerate: fps,
        });
        screenStreamRef.current = screenStream;
        setScreenStream(screenStream);
        screenSharingRef.current = true;
        intentionalScreenStopRef.current = false;
        screenEndedInBackgroundRef.current = false;
        pulseCallWakeLock();

        const screen = announcementFromSenders(
          pc,
          screenStream,
          screenSender,
          screenAudioSenderRef.current
        );
        if (peerRef.current?.id && socketRef.current?.connected) {
          socketRef.current.emit("screen:share-start", { toUserId: peerRef.current.id, screen });
        }
        negotiationQueuedRef.current = true;
        await negotiateRef.current?.();
      } finally {
        if (screenOfferEpochRef.current === epoch) suppressAutoNegotiateRef.current = false;
      }

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = screenStream;
        screenVideoRef.current.play().catch((e) => {});
      }

      screenTrack.onended = () => {
        // Browser ends display tracks when the app backgrounds or the user
        // leaves a tab-only capture. Don't treat that as a deliberate stop
        // while hidden, clean up, then toast when they return.
        if (intentionalScreenStopRef.current) {
          intentionalScreenStopRef.current = false;
          return;
        }
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          screenEndedInBackgroundRef.current = true;
        }
        stopScreenShareRef.current?.();
      };

      setScreenSharing(true);
      if (!opts?.quiet) audioManager.play("screenShareStart");
    } catch (err) {
      if (err?.name === "AbortError" || err?.name === "NotAllowedError") return;
      console.error("[ScreenShare] failed:", err);
      toast(tRuntime(err?.message || "Could not start screen share."), "error");
    }
  }, [toast]);

  const stopScreenShare = useCallback((opts = {}) => {
    const pc = pcRef.current;
    if (!pc || !screenSharingRef.current) return;
    intentionalScreenStopRef.current = true;
    screenSharingRef.current = false;
    setScreenSharing(false);

    const videoSender = screenSenderRef.current;
    const audioSender = screenAudioSenderRef.current;
    screenSenderRef.current = null;
    screenAudioSenderRef.current = null;
    const epoch = (screenOfferEpochRef.current += 1);
    suppressAutoNegotiateRef.current = true;
    stopDedicatedSender(pc, videoSender);
    stopDedicatedSender(pc, audioSender);
    negotiationQueuedRef.current = true;
    void Promise.resolve(negotiateRef.current?.()).finally(() => {
      if (screenOfferEpochRef.current === epoch) suppressAutoNegotiateRef.current = false;
    });
    if (screenAudioCtxRef.current) {
      try { screenAudioCtxRef.current.close(); } catch { /* ignore */ }
      screenAudioCtxRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    setScreenStream(null);
    if (peerRef.current?.id && socketRef.current?.connected) {
      socketRef.current.emit("screen:share-stop", { toUserId: peerRef.current.id });
    }
    if (!opts?.quiet) audioManager.play("screenShareStop");
  }, []);

  const restartScreenShareWithQuality = useCallback(
    async (nextQuality) => {
      if (!screenSharingRef.current) {
        setScreenQuality(nextQuality);
        return;
      }
      stopScreenShare({ quiet: true });
      await new Promise((r) => setTimeout(r, 120));
      setScreenQuality(nextQuality);
      screenQualityRef.current = nextQuality;
      await startScreenShare(nextQuality, { quiet: true });
    },
    [startScreenShare, stopScreenShare]
  );

  const handleRemoteScreenShareStart = useCallback((fromUserId, announcement) => {
    if (!fromUserId || String(fromUserId) !== String(peerRef.current?.id || "")) return;
    if (announcement) noteRemoteScreenAnnouncement(announcement);
    else applyInboundLayout();
    audioManager.play("screenShareStart");
  }, [applyInboundLayout, noteRemoteScreenAnnouncement]);

  const handleRemoteScreenShareStop = useCallback((fromUserId) => {
    if (!fromUserId || String(fromUserId) !== String(peerRef.current?.id || "")) return;
    audioManager.play("screenShareStop");
    clearRemoteScreen();
  }, [clearRemoteScreen]);

  // DM screen events are separate from SDP. The explicit signal is needed to
  // reserve/recover the display track before camera-layout heuristics run.
  useEffect(() => {
    if (!socket) return;

    const onScreenShareStart = ({ fromUserId, screen, streamId, videoMid, audioMid } = {}) => {
      handleRemoteScreenShareStart(fromUserId, screen || { streamId, videoMid, audioMid });
    };
    const onScreenShareStop = ({ fromUserId } = {}) => {
      handleRemoteScreenShareStop(fromUserId);
    };

    socket.on("screen:share-start", onScreenShareStart);
    socket.on("screen:share-stop", onScreenShareStop);
    return () => {
      socket.off("screen:share-start", onScreenShareStart);
      socket.off("screen:share-stop", onScreenShareStop);
    };
  }, [socket, handleRemoteScreenShareStart, handleRemoteScreenShareStop]);

  // Change active microphone mid-call: capture the device (exact id), then
  // RTCRtpSender.replaceTrack (no renegotiation). The choice is saved.
  const setAudioInput = useCallback(async (deviceId, opts = {}) => {
    const id = deviceId || "";
    setSelectedAudioInput(id);
    selectedAudioInputRef.current = id;
    if (opts.persist !== false && !IOS_NATIVE) writeAudioPref("input", id);
    const local = localStreamRef.current;
    if (!local) return true;
    const prevEnabled = local.getAudioTracks()[0]?.enabled !== false;
    const oldRaw = getNoiseSuppressionRawTrack();
    replacingMicRef.current = true;
    const capture = (devId) =>
      acquireVoiceMicStream({
        ...(devId && devId !== "default" ? { audio: { deviceId: { exact: devId } } } : {}),
        video: false,
        applyStoredMute: false,
      });
    try {
      const { track, replaced } = await swapMicTrack({
        pc: pcRef.current,
        stream: local,
        acquire: capture,
        deviceId: id,
        excludeSenders: [screenAudioSenderRef.current],
        enabled: prevEnabled,
      });
      // The noise-suppression graph keeps its own raw capture: release the old one.
      if (oldRaw && oldRaw !== getNoiseSuppressionRawTrack()) {
        try { oldRaw.stop(); } catch { /* ignore */ }
      }
      setNoiseSuppressedTrackEnabled(prevEnabled);
      track.addEventListener("ended", () => {
        if (replacingMicRef.current) return;
        if (localStreamRef.current?.getAudioTracks?.()[0] !== track) return;
        if (modeRef.current !== "active" && modeRef.current !== "outgoing") return;
        void setAudioInputRef.current?.("", { persist: false });
      });
      micGuardRef.current?.watchTrack?.(track);
      setLocalStream(local);
      console.info("[CallAudio] microphone switched", { replaced, device: id ? "chosen" : "default" });
      return true;
    } catch (err) {
      console.warn("[CallAudio] microphone switch failed:", err?.name || err?.message || err);
      toastRef.current?.(tRuntime("Couldn't switch the microphone."), "error");
      // The old capture may be gone (NS graph rebuilt): get the default back.
      const live = local.getAudioTracks()[0];
      if (id && (!live || live.readyState === "ended" || !getNoiseSuppressionRawTrack())) {
        try {
          await swapMicTrack({
            pc: pcRef.current,
            stream: local,
            acquire: capture,
            deviceId: "",
            excludeSenders: [screenAudioSenderRef.current],
            enabled: prevEnabled,
          });
          setLocalStream(local);
        } catch { /* nothing left to capture */ }
      }
      return false;
    } finally {
      replacingMicRef.current = false;
    }
  }, []);
  setAudioInputRef.current = setAudioInput;

  // Change speaker/output mid-call: every remote-audio element and boost
  // AudioContext follows (lib/callAudioDevices.js). The choice is saved.
  const setAudioOutput = useCallback(async (deviceId) => {
    const id = deviceId || "";
    setSelectedAudioOutput(id);
    writeAudioPref("output", id);
    const res = await setOutputSink(id);
    console.info("[AudioOutput] switched", res);
    if (res.failed && !res.applied) toastRef.current?.(tRuntime("Couldn't switch the speaker."), "error");
    return res.failed === 0;
  }, []);

  const setVideoInput = useCallback(async (deviceId) => {
    const id = deviceId || "";
    videoInputIdRef.current = id;
    setSelectedVideoInput(id);
    if (!cameraOn || !localStreamRef.current) return;
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: id
          ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: 1280, height: 720, facingMode: "user" },
      });
      const newTrack = videoStream.getVideoTracks()[0];
      if (!newTrack) return;
      const local = localStreamRef.current;
      const old = local.getVideoTracks()[0];
      if (old) {
        local.removeTrack(old);
        old.stop();
      }
      local.addTrack(newTrack);
      const sender = pcRef.current?.getSenders().find(
        (item) => item !== screenSenderRef.current && item.track?.kind === "video"
      );
      if (sender) await sender.replaceTrack(newTrack);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = local;
        localVideoRef.current.play().catch(() => {});
      }
      setLocalStream(local);
    } catch (err) {
      console.warn("[Call] setVideoInput failed:", err);
    }
  }, [cameraOn]);

  const setParticipantVolume = useCallback((userId, volume) => {
    const safe = clampGain(volume);
    if (safe > 0) lastRemoteVolumeRef.current = safe;
    remoteVolumeRef.current = safe;
    if (userId != null) writeParticipantGain(userId, safe);
    if (remoteAudioRef.current) {
      applyPlaybackGain(remoteAudioRef.current, deafenedRef.current ? 0 : safe);
    }
  }, []);

  useEffect(() => {
    const id = peer?.id;
    if (id == null) return;
    const stored = readParticipantGain(id);
    if (stored == null) return;
    remoteVolumeRef.current = stored;
    if (stored > 0) lastRemoteVolumeRef.current = stored;
    if (remoteAudioRef.current) {
      applyPlaybackGain(remoteAudioRef.current, deafenedRef.current ? 0 : stored);
    }
  }, [peer?.id]);

  const toggleParticipantMute = useCallback((userId) => {
    if (remoteVolumeRef.current > 0.001) setParticipantVolume(userId, 0);
    else setParticipantVolume(userId, lastRemoteVolumeRef.current || 1);
  }, [setParticipantVolume]);

  // ── Native iOS: microphone health + audio output routing ────────────────
  useEffect(() => {
    const guard = micGuardRef.current;
    if (!guard || mode !== "active") return undefined;
    guard.startMonitoring();
    return () => guard.stopMonitoring();
  }, [mode]);

  const iosRouteActiveRef = useRef(false);
  useEffect(() => {
    if (!IOS_NATIVE) return;
    if (mode === "outgoing" || mode === "active") {
      iosRouteActiveRef.current = true;
      void beginIosCallAudio({ video: callType === "video", owner: "dm" }).then(() => notifyCallAudioSession()).catch(() => {});
    } else if (!mode && iosRouteActiveRef.current) {
      iosRouteActiveRef.current = false;
      void endIosCallAudio("dm");
    }
  }, [mode, callType]);

  /** CallKit didActivate (from useIosCallKitBridge). */
  const onCallAudioSessionActivated = useCallback(() => {
    lastAudioActivationRef.current = Date.now();
    notifyCallAudioSession();
    // The remote track was attached before CallKit took the session (the
    // callee case): rebuild its renderer on the activated session.
    const keeper = remoteAudioKeeperRef.current;
    if (!keeper.rebind("callkit-activated")) keeper.attach("callkit-activated");
    micGuardRef.current?.onAudioSessionActivated();
    if (iosRouteActiveRef.current) void beginIosCallAudio({ video: callTypeRef.current === "video", owner: "dm" });
  }, []);

  /** Attach / resume the remote <audio> (overlay mount, bridge events). */
  const ensureRemoteAudio = useCallback((reason = "overlay") => {
    const audio = remoteAudioRef.current;
    const res = remoteAudioKeeperRef.current?.attach(reason);
    if (audio && res && res !== "cleared" && res !== "none") {
      applyPlaybackGain(audio, deafenedRef.current ? 0 : remoteVolumeRef.current);
    }
    return res;
  }, []);

  /** Re-acquire the microphone (native iOS recovery; no-op elsewhere). */
  const refreshMicrophone = useCallback(
    (reason = "manual", opts) => micGuardRef.current?.refresh(reason, opts) ?? Promise.resolve(false),
    []
  );

  const iosRoute = useSyncExternalStore(
    IOS_NATIVE ? subscribeIosAudioRoute : noopSubscribe,
    IOS_NATIVE ? getIosAudioRouteSnapshot : getNoRoute,
    IOS_NATIVE ? getIosAudioRouteSnapshot : getNoRoute
  );
  // iOS: a route change (AirPods, speaker, receiver) re-plans WebKit's audio
  // units; rebuild the remote renderer so the caller stays audible.
  const iosRouteCurrent = iosRoute?.current || "";
  const lastIosRouteRef = useRef("");
  useEffect(() => {
    if (!IOS_NATIVE) return;
    const prev = lastIosRouteRef.current;
    lastIosRouteRef.current = iosRouteCurrent;
    if (!prev || !iosRouteCurrent || prev === iosRouteCurrent) return;
    if (modeRef.current !== "active") return;
    const id = setTimeout(() => remoteAudioKeeperRef.current?.rebind(`route-${iosRouteCurrent}`), 250);
    return () => clearTimeout(id);
  }, [iosRouteCurrent]);
  const iosOutputDevices = useMemo(
    () => (IOS_NATIVE && iosRoute ? iosRoutesAsOutputDevices(iosRoute, tRuntime) : null),
    [iosRoute]
  );
  const setIosAudioOutput = useCallback((routeId) => {
    void selectIosAudioRoute(routeId);
  }, []);

  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  // Computed state properties for UI rendering
  const isInCall = mode === "active";
  const isCalling = mode === "outgoing";
  const isReceiving = mode === "incoming";

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    let stop = () => {};
    let cancelled = false;
    import("../dev/glassQaBridge.js")
      .then((mod) => {
        if (cancelled) return;
        stop = mod.bindDmCallQa({
          setMode,
          setPeer,
          setCallType,
          setCallAnchorAt,
          setDuration,
          setConnectionQuality,
          setPeerConnectionState,
          setRemoteMediaReady,
          setMuted,
          setCameraOn,
          setRemoteCameraOn,
          setRemoteMuted,
          setScreenSharing,
          setLocalStream,
          setRemoteStream,
          modeRef,
          peerRef,
          localStreamRef,
          remoteStreamRef,
          localVideoRef,
          remoteVideoRef,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  // Speaking rings read RTP audio levels too (lib/rtpAudioLevel.js): they
  // need no AudioContext, so they work while WebKit/Chromium keeps the
  // context suspended or interrupted, and they follow replaced tracks.
  const getRemoteAudioLevel = useCallback(() => readRemoteAudioLevel(pcRef.current, {
    excludeTrackIds: collectScreenAudioTrackIds(inboundMediaRef.current, remoteScreenAnnouncementRef.current),
  }), []);
  useEffect(() => {
    if (mode !== "active" || ending) return undefined;
    const probe = createLocalLevelProbe({
      getPc: () => pcRef.current,
      excludeSender: () => screenAudioSenderRef.current,
    });
    localLevelProbeRef.current = probe;
    probe.start();
    return () => {
      probe.stop();
      if (localLevelProbeRef.current === probe) localLevelProbeRef.current = null;
    };
  }, [mode, ending]);
  const getLocalAudioLevel = useCallback(() => localLevelProbeRef.current?.read() ?? null, []);

  return {
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    screenVideoRef,
    mode,
    ending,
    getRemoteAudioLevel,
    getLocalAudioLevel,
    callAnchorAt,
    callType,
    callUuid,
    calleeAnswering,
    peer,
    muted,
    deafened,
    cameraOn,
    remoteMuted,
    remoteCameraOn,
    remoteDeafened,
    screenSharing,
    duration,
    connectionQuality,
    networkStats,
    peerConnectionState,
    remoteMediaReady,
    localStream,
    remoteStream,
    remoteScreenStream,
    remoteScreenSharing,
    screenStream,
    isInCall,
    isCalling,
    isReceiving,
    formatDuration,
    startCall,
    endCall,
    acceptIncoming,
    declineIncoming,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    screenQuality,
    setScreenQuality,
    restartScreenShareWithQuality,
    handleRemoteScreenShareStart,
    handleRemoteScreenShareStop,
    cleanup,
    audioInputDevices,
    // Native iOS: native routes (iPhone / Speaker / AirPods…); setSinkId does nothing there.
    audioOutputDevices: iosOutputDevices || audioOutputDevices,
    audioOutputLabel: iosOutputDevices ? tRuntime("Audio output") : null,
    videoInputDevices,
    selectedAudioInput,
    selectedAudioOutput: iosOutputDevices ? iosRoute?.selected || "" : selectedAudioOutput,
    selectedVideoInput,
    setAudioInput,
    setAudioOutput: iosOutputDevices ? setIosAudioOutput : setAudioOutput,
    // Native iOS AVAudioSession routes for the in-call device menus (null elsewhere).
    iosAudioRoute: IOS_NATIVE ? iosRoute : null,
    selectIosRoute: setIosAudioOutput,
    refreshMicrophone,
    onCallAudioSessionActivated,
    ensureRemoteAudio,
    setVideoInput,
    setParticipantVolume,
    toggleParticipantMute,
  };
}
