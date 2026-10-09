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
  isRemoteScreenVideoTrack,
  ensureScreenShareAudioTrack,
  isMobileScreenCapture,
  captureScreenShareStream,
  showElectronScreenPicker,
  screenShareUnavailableOnIos,
} from "../lib/webrtcScreenShare";
import { useToast } from "../context/ToastContext";
import { t as tRuntime } from "../i18n/runtime";
import {
  applyRemoteOffer,
  isPolitePeer,
} from "../lib/webrtcNegotiation";
import { preloadIceServers } from "../lib/iceConfig";
import { createPeerConnection, attachLocalTracks, safeClosePeer } from "../lib/webrtcPeerFactory";
import { getUser } from "../lib/storage";
import useConnectionStats from "./useConnectionStats";
import { applyAdaptiveVideoEncoding, applyAdaptiveAudioEncoding } from "../lib/adaptiveBitrate";
import { acquireCallWakeLock, releaseCallWakeLock, pulseCallWakeLock } from "../lib/callWakeLock";
import { startDesCoinHeartbeat } from "../lib/descoinHeartbeat";
import {
  acquireVoiceMicStream,
  disposeNoiseSuppressionSession,
  getVoiceAudioConstraints,
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
import { createCallSetupTimeline } from "../lib/callSetupTimeline";

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
  const [muted, setMuted] = useState(false);
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
  // "incoming" | "outgoing" — native iOS: only incoming calls use CallKit audio.
  const callDirectionRef = useRef(null);

  // Keep the screen awake / tab exempt from background throttling for as
  // long as a call is ringing or active — screen lock and aggressive tab
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
  const [selectedAudioInput, setSelectedAudioInput] = useState("");
  const [selectedAudioOutput, setSelectedAudioOutput] = useState("");
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

  const pcRef = useRef(null);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const networkStats = useConnectionStats(pcRef, { active: mode === "active" });
  const lastAdaptiveVideoQualityRef = useRef(null);
  const lastAdaptiveAudioQualityRef = useRef(null);
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
  }, [mode, networkStats.quality]);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteScreenStreamRef = useRef(null);
  const remoteScreenSharingRef = useRef(false);
  // Set only by screen:share-start/stop. The UI flag is also flipped when a
  // track is attached, and using that to classify the next track hid cameras.
  const remoteScreenExpectedRef = useRef(false);
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
  // Keep the original stream association so a late screen-share signal can
  // recover only a likely display track, never an arbitrary camera receiver.
  const receivedVideoTracksRef = useRef(new Map());

  // Tap → audio timeline, logged once per call (lib/callSetupTimeline.js).
  const setupTimelineRef = useRef(null);
  if (!setupTimelineRef.current) {
    setupTimelineRef.current = createCallSetupTimeline({
      report: reportDiagnostic,
      context: () => ({ platform: callPlatformTag() }),
    });
  }

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

  // Enumerate audio devices on mount and on device change
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === "audioinput");
        const outputs = devices.filter(d => d.kind === "audiooutput");
        const cameras = devices.filter(d => d.kind === "videoinput");
        setAudioInputDevices(inputs);
        setAudioOutputDevices(outputs);
        setVideoInputDevices(cameras);
        if (!selectedAudioInput && inputs.length > 0) setSelectedAudioInput(inputs[0].deviceId);
        if (!selectedAudioOutput && outputs.length > 0) setSelectedAudioOutput(outputs[0].deviceId);
      } catch (_) {}
    };
    getDevices();
    navigator.mediaDevices.addEventListener("devicechange", getDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", getDevices);
  }, []);

  const cleanup = useCallback(() => {
    setupTimelineRef.current?.end();
    micGuardRef.current?.reset();
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
    receivedVideoTracksRef.current.clear();
    if (iceRecoveryTimerRef.current) {
      clearTimeout(iceRecoveryTimerRef.current);
      iceRecoveryTimerRef.current = null;
    }
    negotiateRef.current = null;
    setMode(null);
    setCallAnchorAt(null);
    setCallType(null);
    setCallUuid(null);
    setPeer(null);
    setMuted(false);
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

  const gracefulEnd = useCallback(() => {
    if (modeRef.current === "active") {
      setPeerConnectionState("disconnected");
      setRemoteMediaReady(false);
      setPeer(null);
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = setTimeout(() => {
        cleanupTimerRef.current = null;
        cleanup();
      }, 320);
      return;
    }
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    if (mode !== "active") return;
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode]);

  // Handle call sounds based on mode
  useEffect(() => {
    const prev = prevCallModeRef.current;
    prevCallModeRef.current = mode;
    if (mode === "incoming") {
      // Native iOS: CallKit is already ringing — never ring twice.
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

  const attachRemoteScreenTrack = useCallback((track, stream = null) => {
    if (!track || (track.kind !== "video" && track.kind !== "audio")) return;
    // Always build a fresh MediaStream so React re-renders when audio arrives
    // after video on the same underlying capture stream (mobile especially
    // won't rebind <audio srcObject> if the object identity is unchanged).
    setRemoteScreenStream((prev) => {
      const tracks = [];
      const push = (t) => {
        if (!t || t.readyState === "ended" || tracks.includes(t)) return;
        tracks.push(t);
      };
      if (prev) prev.getTracks().forEach(push);
      if (stream) stream.getTracks().forEach(push);
      push(track);
      const next = new MediaStream(tracks);
      remoteScreenStreamRef.current = next;
      // If we got a live screen track without the socket signal, still flip
      // the sharing flag so CallOverlay mounts the dedicated <audio>.
      if (!remoteScreenSharingRef.current) {
        remoteScreenSharingRef.current = true;
        setRemoteScreenSharing(true);
      }
      return next;
    });

    track.onended = () => {
      receivedVideoTracksRef.current.delete(track.id);
      setRemoteScreenStream((prev) => {
        if (!prev) return null;
        const remaining = prev.getTracks().filter((item) => item !== track && item.readyState !== "ended");
        const next = remaining.length ? new MediaStream(remaining) : null;
        remoteScreenStreamRef.current = next;
        if (!next) {
          remoteScreenSharingRef.current = false;
          setRemoteScreenSharing(false);
          remoteScreenExpectedRef.current = false;
        }
        return next;
      });
    };
  }, [])

  // A mid-call camera often lands on the screen stream because its MediaStream
  // id differs from the microphone. Pull it back when the peer says the camera
  // is on and they have not announced a screen share.
  const reclaimMisfiledCamera = useCallback(() => {
    if (remoteScreenExpectedRef.current) return;
    const screen = remoteScreenStreamRef.current;
    if (!screen?.getVideoTracks) return;
    const cameras = screen.getVideoTracks().filter(
      (track) => track && track.readyState !== "ended" && !isRemoteScreenVideoTrack(track, {})
    );
    if (!cameras.length) return;
    setRemoteStream((prev) => {
      const tracks = prev ? prev.getTracks().filter((track) => track.readyState !== "ended") : [];
      for (const track of cameras) {
        if (!tracks.includes(track)) tracks.push(track);
      }
      const next = new MediaStream(tracks);
      remoteStreamRef.current = next;
      return next;
    });
    const remaining = screen.getTracks().filter(
      (track) => !cameras.includes(track) && track.readyState !== "ended"
    );
    const nextScreen = remaining.length ? new MediaStream(remaining) : null;
    remoteScreenStreamRef.current = nextScreen;
    setRemoteScreenStream(nextScreen);
    if (!nextScreen) {
      remoteScreenSharingRef.current = false;
      setRemoteScreenSharing(false);
    }
    setCallType("video");
    callTypeRef.current = "video";
  }, []);

  const setupPeerConnection = useCallback((pc, stream, isInitiator) => {
    setPeerConnectionState("connecting");
    attachLocalTracks(pc, stream);

    pc.ontrack = (e) => {
      const track = e.track;
      // Mid-call camera renegotiation may omit e.streams — wrap the track.
      const raw = e.streams?.[0];
      const rs = (raw && raw.getTracks().length > 0) ? raw : new MediaStream([track]);
      if (track?.kind === "video") {
        receivedVideoTracksRef.current.set(track.id, {
          track,
          stream: rs,
          receivedAt: Date.now(),
          hasAudio: Boolean(raw?.getAudioTracks?.().length),
        });
      }
      const isScreenTrack = isRemoteScreenVideoTrack(track, {
        rawStream: raw,
        peerExpectsScreen: remoteScreenExpectedRef.current,
        mainRemoteStream: remoteStreamRef.current,
        participantHasCameraVideo: Boolean(remoteStreamRef.current?.getVideoTracks().length),
      });

      if (isScreenTrack) {
        attachRemoteScreenTrack(track, rs);
        return;
      }

      // A display stream can carry both its video and approved tab/system
      // audio. Keep that audio with the screen stream (attached to the
      // durable screen-share <audio> sink) instead of mixing it into
      // the participant microphone audio element.
      //
      // MediaStream identity is unreliable after we clone into a fresh
      // remoteScreenStream for React rebinds — also match by shared video
      // tracks, or the expect-screen signal vs the long-lived mic stream.
      const sharesScreenVideo =
        Boolean(raw) &&
        Boolean(remoteScreenStreamRef.current) &&
        raw.getVideoTracks?.().some((vt) =>
          remoteScreenStreamRef.current.getVideoTracks().includes(vt)
        );
      const isScreenAudioTrack =
        track?.kind === "audio" &&
        Boolean(raw) &&
        (
          sharesScreenVideo ||
          (remoteScreenStreamRef.current && raw.id === remoteScreenStreamRef.current.id) ||
          (remoteScreenExpectedRef.current &&
            (!remoteStreamRef.current || raw.id !== remoteStreamRef.current.id))
        );
      if (isScreenAudioTrack) {
        attachRemoteScreenTrack(track, raw);
        return;
      }

      // Force a state update even when the same MediaStream gains a new track
      // (same object identity would otherwise skip React re-renders).
      setRemoteStream((prev) => {
        let next;
        if (prev && prev !== rs) {
          // Merge newly arrived track into the existing remote stream when possible
          try {
            if (track && !prev.getTracks().includes(track)) prev.addTrack(track);
            next = new MediaStream(prev.getTracks());
            remoteStreamRef.current = next;
            return next;
          } catch {
            /* fall through */
          }
        }
        next = prev === rs ? new MediaStream(rs.getTracks()) : rs;
        remoteStreamRef.current = next;
        return next;
      });
      markRemoteMediaReady(rs);

      // Voice → camera upgrade: flip call type so UI mounts the remote <video>
      if (track?.kind === "video") {
        setCallType("video");
        setRemoteCameraOn((current) => current ?? true);
      }

      const attachMedia = () => {
        if (track.kind === "audio" && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = rs;
          remoteAudioRef.current.muted = deafenedRef.current;
          remoteAudioRef.current.volume = deafenedRef.current ? 0 : remoteVolumeRef.current;
          remoteAudioRef.current.play().catch(() => {});
        }
        if (track.kind === "video" && remoteVideoRef.current) {
          remoteVideoRef.current.muted = true;
          remoteVideoRef.current.srcObject = rs;
          remoteVideoRef.current.play().catch(() => {});
        }
        if (remoteAudioRef.current && !remoteAudioRef.current.srcObject) {
          remoteAudioRef.current.srcObject = rs;
          remoteAudioRef.current.muted = deafenedRef.current;
          remoteAudioRef.current.volume = deafenedRef.current ? 0 : remoteVolumeRef.current;
          remoteAudioRef.current.play().catch(() => {});
        }
        if (remoteVideoRef.current && !remoteVideoRef.current.srcObject && track.kind === "video") {
          remoteVideoRef.current.muted = true;
          remoteVideoRef.current.srcObject = rs;
          remoteVideoRef.current.play().catch(() => {});
        }
      };

      attachMedia();

      if (track?.muted) {
        track.onunmute = () => {
          markRemoteMediaReady(rs);
          if (track.kind === "video") setCallType("video");
          attachMedia();
        };
      }

      track.onended = () => {
        receivedVideoTracksRef.current.delete(track.id);
        setRemoteStream((prev) => {
          if (!prev) return prev;
          const remaining = prev.getTracks().filter((t) => t !== track && t.readyState !== "ended");
          const next = remaining.length ? new MediaStream(remaining) : null;
          remoteStreamRef.current = next;
          return next;
        });
      };
    };

    pc.onicecandidate = (e) => {
      const sock = socketRef.current;
      if (e.candidate && peerRef.current?.id && sock?.connected) {
        sock.emit("call:ice-candidate", { toUserId: peerRef.current.id, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        setMode("active");
        modeRef.current = "active";
        setConnectionQuality("good");
        setPeerConnectionState("connected");
        iceRestartAttemptedRef.current = false;
        if (iceRecoveryTimerRef.current) {
          clearTimeout(iceRecoveryTimerRef.current);
          iceRecoveryTimerRef.current = null;
        }
      } else if (state === "connecting") {
        setPeerConnectionState("connecting");
        setConnectionQuality("connecting");
      } else if (state === "disconnected") {
        setPeerConnectionState("reconnecting");
        setConnectionQuality("poor");
      } else if (state === "failed") {
        setPeerConnectionState("disconnected");
        setConnectionQuality("failed");
        audioManager.play("disconnect");
      } else if (state === "closed") {
        setPeerConnectionState("disconnected");
      }
    };

    const attemptIceRecovery = () => {
      if (modeRef.current !== "active") return;
      if (iceRestartAttemptedRef.current) return;
      iceRestartAttemptedRef.current = true;
      setPeerConnectionState("reconnecting");
      setConnectionQuality("poor");
      try {
        if (negotiateRef.current) {
          void negotiateRef.current({ iceRestart: true });
        } else {
          pc.restartIce();
        }
      } catch {
        /* ignore — UI already shows reconnecting */
      }
    };

    pc.oniceconnectionstatechange = () => {
      const ice = pc.iceConnectionState;
      if (ice === "connected" || ice === "completed") {
        setupTimelineRef.current?.mark("ice");
        setConnectionQuality("good");
        setPeerConnectionState("connected");
        iceRestartAttemptedRef.current = false;
        if (iceRecoveryTimerRef.current) {
          clearTimeout(iceRecoveryTimerRef.current);
          iceRecoveryTimerRef.current = null;
        }
      } else if (ice === "checking") {
        setPeerConnectionState("connecting");
        setConnectionQuality("connecting");
      } else if (ice === "disconnected") {
        // Brief drops often self-heal; if still broken after a short wait,
        // renegotiate with iceRestart (group-call parity). Do NOT hang up.
        setPeerConnectionState("reconnecting");
        setConnectionQuality("poor");
        if (iceRecoveryTimerRef.current) clearTimeout(iceRecoveryTimerRef.current);
        iceRecoveryTimerRef.current = setTimeout(() => {
          iceRecoveryTimerRef.current = null;
          if (!pcRef.current || pcRef.current !== pc) return;
          const still = pc.iceConnectionState;
          if (still === "disconnected" || still === "failed") {
            attemptIceRecovery();
          }
        }, 2500);
      } else if (ice === "failed") {
        attemptIceRecovery();
        setPeerConnectionState("reconnecting");
        setConnectionQuality("poor");
      }
    };

    // A single serialized offer path for camera/screen changes. This mirrors
    // group-call peer behavior and avoids a second, delayed screen offer
    // racing the browser's negotiationneeded event.
    let negotiateFailures = 0;
    const negotiate = async (opts = {}) => {
      const sock = socketRef.current;
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
      try {
        const offer = await pc.createOffer(opts.iceRestart ? { iceRestart: true } : undefined);
        if (pc.signalingState !== "stable") {
          negotiationQueuedRef.current = true;
          return;
        }
        await pc.setLocalDescription(offer);
        negotiateFailures = 0;
        sock.emit("call:offer", {
          toUserId: peerRef.current.id,
          offer: pc.localDescription,
          callType: callTypeRef.current || "voice",
          renegotiate: true,
        });
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
    // Skip while dialing — startCall already sends the initial offer; a
    // renegotiation request remains queued until the connection is stable.
    pc.onnegotiationneeded = () => {
      negotiationQueuedRef.current = true;
      void negotiate();
    };
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === "stable" && negotiationQueuedRef.current) {
        void negotiate();
      }
    };
  }, [attachRemoteScreenTrack, markRemoteMediaReady]);

  // When returning from background (mobile home / app switcher), resume
  // remote audio and recover ICE — never hang up just because we left.
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

      const audio = remoteAudioRef.current;
      if (audio) {
        try {
          audio.muted = false;
          const p = audio.play();
          if (p?.catch) p.catch(() => {});
        } catch {
          /* ignore */
        }
      }
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
      iceRestartAttemptedRef.current = false;
      setPeerConnectionState("reconnecting");
      setConnectionQuality("poor");
      try {
        if (negotiateRef.current) void negotiateRef.current({ iceRestart: true });
        else pc.restartIce();
        iceRestartAttemptedRef.current = true;
      } catch {
        /* ignore */
      }
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
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", resumeAfterBackground);
      window.removeEventListener("focus", resumeAfterBackground);
    };
  }, [mode, toast]);

  useEffect(() => {
    if (!socket) return;

    const onOffer = async ({ fromUser, offer, callType: incomingType, callUuid: incomingCallUuid } = {}) => {
      if (!fromUser?.id || !offer) return;
      if (callOccupancyRef?.current?.groupActive) {
        socketRef.current?.emit("call:decline", { toUserId: fromUser.id });
        return;
      }
      
      const pc = pcRef.current;
      const isRenegotiation = pc && modeRef.current === "active" && peerRef.current?.id === fromUser.id;
      
      if (isRenegotiation) {
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
          await pc.setLocalDescription(answer);
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

      // Already ringing / dialing this peer → refresh SDP, keep popup
      if (
        peerRef.current?.id === fromUser.id &&
        (modeRef.current === "incoming" || modeRef.current === "outgoing")
      ) {
        incomingOfferRef.current = offer;
        if (incomingType) incomingCallTypeRef.current = incomingType;
        return;
      }

      // Busy with another call — do not steal the UI
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
          from: fromUser.username,
          fromId: fromUser.id,
          type: incomingType || "voice",
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
        gracefulEnd();
      }
    };

    const onMediaState = ({
      fromUserId,
      muted: peerMuted,
      cameraOn: peerCameraOn,
      deafened: peerDeafened,
      requestState,
    } = {}) => {
      if (!fromUserId || fromUserId !== peerRef.current?.id) return;
      setRemoteMuted(Boolean(peerMuted));
      setRemoteCameraOn(Boolean(peerCameraOn));
      setRemoteDeafened(Boolean(peerDeafened));
      if (peerCameraOn) reclaimMisfiledCamera();
      // The peer just connected / reconnected and has no idea about our
      // mute / deafen / camera state yet — answer once (never with a request).
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
    // local ring only — that device already told the caller.
    const onHandledElsewhere = ({ fromUserId } = {}) => {
      if (modeRef.current !== "incoming") return;
      const peerId = peerRef.current?.id;
      if (fromUserId && peerId && fromUserId !== peerId) return;
      audioManager.stop("incomingCall");
      gracefulEnd();
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
    const acquire = () =>
      acquireVoiceMicStream(
        type === "video"
          ? { video: { width: 1280, height: 720, facingMode: "user" } }
          : { video: false }
      );
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
      console.warn("[Call] startCall ignored — already in a call:", modeRef.current);
      return;
    }
    try {
      callDirectionRef.current = "outgoing";
      setupTimelineRef.current?.start("outgoing", type);
      micGuardRef.current?.noteCaptureStart();
      const stream = await acquireCallMicStream(type);
      setupTimelineRef.current?.mark("gum");
      localStreamRef.current = stream;
      setLocalStream(stream);
      setNoiseSuppressedTrackEnabled(true);
      micGuardRef.current?.watchTrack(stream.getAudioTracks()[0]);

      // Sync peerRef immediately — unreachable/decline can arrive before React commit
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

      const pc = createPeerConnection({});
      pcRef.current = pc;
      setupPeerConnection(pc, stream, true);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
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
      timeline?.start("incoming", incomingCallTypeRef.current || "voice");
    }
    if (IOS_NATIVE && opts?.fromCallKit !== true && modeRef.current === "incoming" && interceptUiAnswer()) {
      return;
    }
    const offer = incomingOfferRef.current;
    const type = incomingCallTypeRef.current || "voice";
    // Use peerRef — Electron Accept IPC can fire with a stale React `peer` closure
    const currentPeer = peerRef.current || peer;
    if (!currentPeer?.id || !offer || !socketRef.current?.connected) return;
    if (modeRef.current !== "incoming" && modeRef.current !== "idle") {
      // Only accept while ringing (or allow if somehow idle with offer still set)
      if (modeRef.current !== "incoming") return;
    }
    try {
      micGuardRef.current?.noteCaptureStart();
      const stream = await acquireCallMicStream(type);
      timeline?.mark("gum");
      // The ring may have ended while the capture was pending (iOS defers
      // getUserMedia until the app is visible, e.g. answered on a locked phone).
      if (modeRef.current !== "incoming" || peerRef.current?.id !== currentPeer.id || incomingOfferRef.current !== offer) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      setNoiseSuppressedTrackEnabled(true);
      micGuardRef.current?.watchTrack(stream.getAudioTracks()[0]);
      setCallType(type);
      setCameraOn(type === "video");

      if (localVideoRef.current && type === "video") {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const pc = createPeerConnection({});
      pcRef.current = pc;
      setupPeerConnection(pc, stream, false);

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (!socketRef.current?.connected) {
        cleanup();
        return;
      }
      socketRef.current.emit("call:answer", { toUserId: currentPeer.id, answer: pc.localDescription });
      timeline?.mark("answerSent");
      timeline?.watch(pc);
      setMode("active");
      modeRef.current = "active";
    } catch (err) {
      toast(tRuntime(voiceMicErrorCopy(err)), "error");
      cleanup();
    }
  }, [peer, cleanup, setupPeerConnection, toast, acquireCallMicStream]);

  const endCall = useCallback((toUserId) => {
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
    gracefulEnd();
  }, [gracefulEnd]);

  const declineIncoming = useCallback(() => {
    audioManager.play("callReject");
    const targetId = peerRef.current?.id ?? peer?.id;
    if (targetId && socketRef.current?.connected) {
      socketRef.current.emit('call:decline', { toUserId: targetId });
    }
    cleanup();
  }, [peer, cleanup]);

  // Electron notification Accept / Decline — refs avoid stale closures from mount-once effect
  const acceptIncomingRef = useRef(acceptIncoming);
  const declineIncomingRef = useRef(declineIncoming);
  useEffect(() => { acceptIncomingRef.current = acceptIncoming; }, [acceptIncoming]);
  useEffect(() => { declineIncomingRef.current = declineIncoming; }, [declineIncoming]);

  useEffect(() => {
    if (!window.electronAPI?.onCallAccept) return;
    const unsubAccept = window.electronAPI.onCallAccept(() => {
      // Only handle DM incoming ring — group hook owns group-call accepts
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
  // buttons, CallKit mute, deafen-implied mute) with fresh values — the old
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
    const onReconnect = () => emitLocalMediaState({ requestState: true });
    s.on("connect", onReconnect);
    return () => s.off("connect", onReconnect);
  }, [mediaStateActive, peerIdForMedia, socket, emitLocalMediaState]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      const nextMuted = !track.enabled;
      setMuted(nextMuted);
      if (!nextMuted) mutedByDeafenRef.current = false;
      audioManager.play(nextMuted ? "mute" : "unmute");
      // Remote tile state is published by the media-state effect below.
    }
  }, []);

  const toggleDeafen = useCallback(() => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    const audio = remoteAudioRef.current;
    if (audio) {
      audio.muted = next;
      audio.volume = next ? 0 : remoteVolumeRef.current;
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
      if (mutedByDeafenRef.current && track) {
        track.enabled = true;
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

        const cameraSender = pc.getSenders().find(
          (item) => item !== screenSenderRef.current && (item.track?.kind === "video" || item.track === videoTrack)
        );
        const recvOnly = pc.getTransceivers().find((item) => {
          if (item.sender === screenSenderRef.current || item.sender === cameraSender) return false;
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
        // Full OS picker on desktop (window / screen / tab) — DES-10.
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
              : "No system/tab audio selected — enable “Share audio” in the picker for sound."
          ),
          "info"
        );
      }

      // Tell the peer to reserve the next video track for the screen layout
      // before WebRTC can deliver that track.
      if (peerRef.current?.id && socketRef.current?.connected) {
        socketRef.current.emit("screen:share-start", { toUserId: peerRef.current.id });
      }

      // Add screen track - this triggers onnegotiationneeded
      const screenSender = pc.addTrack(screenTrack, screenStream);
      if (screenAudioTrack) {
        screenAudioSenderRef.current = pc.addTrack(screenAudioTrack, screenStream);
      }
      await optimizeScreenShareSender(screenSender, {
        maxBitrate: 1_500_000,
        maxFramerate: fps,
      });
      screenSenderRef.current = screenSender;
      screenStreamRef.current = screenStream;
      setScreenStream(screenStream);
      screenSharingRef.current = true;
      intentionalScreenStopRef.current = false;
      screenEndedInBackgroundRef.current = false;
      pulseCallWakeLock();

      // `addTrack` schedules the sole renegotiation through
      // `onnegotiationneeded`. A second delayed offer causes glare and was the
      // main source of tracks arriving before their screen-share signal.

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = screenStream;
        screenVideoRef.current.play().catch((e) => {});
      }

      screenTrack.onended = () => {
        // Browser ends display tracks when the app backgrounds or the user
        // leaves a tab-only capture. Don't treat that as a deliberate stop
        // while hidden — clean up, then toast when they return.
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

    if (screenSenderRef.current) {
      try { pc.removeTrack(screenSenderRef.current); } catch {}
      screenSenderRef.current = null;
    }
    if (screenAudioSenderRef.current) {
      try { pc.removeTrack(screenAudioSenderRef.current); } catch {}
      screenAudioSenderRef.current = null;
    }
    if (screenAudioCtxRef.current) {
      try { screenAudioCtxRef.current.close(); } catch { /* ignore */ }
      screenAudioCtxRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    screenSharingRef.current = false;
    setScreenStream(null);
    setScreenSharing(false);
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

  const handleRemoteScreenShareStart = useCallback((fromUserId) => {
    if (!fromUserId || fromUserId !== peerRef.current?.id) return;
    remoteScreenExpectedRef.current = true;
    remoteScreenSharingRef.current = true;
    setRemoteScreenSharing(true);
    audioManager.play("screenShareStart");

    // Screen signaling can arrive after a fast ontrack callback. Display
    // streams carry no audio; select the most recently received such track
    // instead of blindly moving the latest receiver (which can be a camera).
    const candidate = [...receivedVideoTracksRef.current.values()]
      .filter(({ track, hasAudio }) => track.readyState !== "ended" && !hasAudio)
      .sort((a, b) => b.receivedAt - a.receivedAt)[0];
    const screenTrack = candidate?.track;
    if (!screenTrack || remoteScreenStreamRef.current?.getVideoTracks().includes(screenTrack)) return;

    setRemoteStream((prev) => {
      if (!prev?.getVideoTracks().includes(screenTrack)) return prev;
      const remaining = prev.getTracks().filter((track) => track !== screenTrack);
      const next = remaining.length ? new MediaStream(remaining) : null;
      remoteStreamRef.current = next;
      return next;
    });
    attachRemoteScreenTrack(screenTrack, candidate.stream);
  }, [attachRemoteScreenTrack]);

  const handleRemoteScreenShareStop = useCallback((fromUserId) => {
    if (!fromUserId || fromUserId !== peerRef.current?.id) return;
    remoteScreenExpectedRef.current = false;
    remoteScreenSharingRef.current = false;
    setRemoteScreenSharing(false);
    audioManager.play("screenShareStop");
    setRemoteScreenStream(null);
    remoteScreenStreamRef.current = null;
  }, []);

  // DM screen events are separate from SDP. The explicit signal is needed to
  // reserve/recover the display track before camera-layout heuristics run.
  useEffect(() => {
    if (!socket) return;

    const onScreenShareStart = ({ fromUserId } = {}) => {
      handleRemoteScreenShareStart(fromUserId);
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

  // Change active microphone mid-call
  const setAudioInput = useCallback(async (deviceId) => {
    setSelectedAudioInput(deviceId);
    if (!localStreamRef.current) return;
    try {
      disposeNoiseSuppressionSession({ stopRaw: true });
      const newStream = await acquireVoiceMicStream({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      });
      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) return;
      localStreamRef.current.getAudioTracks().forEach(t => { t.stop(); localStreamRef.current.removeTrack(t); });
      localStreamRef.current.addTrack(newTrack);
      setNoiseSuppressedTrackEnabled(true);
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === "audio");
        if (sender) await sender.replaceTrack(newTrack);
      }
      setLocalStream(localStreamRef.current);
    } catch (_) {}
  }, []);

  // Change active speaker/output mid-call
  const setAudioOutput = useCallback((deviceId) => {
    setSelectedAudioOutput(deviceId);
    if (remoteAudioRef.current?.setSinkId) {
      remoteAudioRef.current.setSinkId(deviceId).catch(() => {});
    }
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

  const setParticipantVolume = useCallback((_userId, volume) => {
    const next = Math.max(0, Math.min(1, Number(volume)));
    const safe = Number.isFinite(next) ? next : 1;
    if (safe > 0) lastRemoteVolumeRef.current = safe;
    remoteVolumeRef.current = safe;
    if (remoteAudioRef.current) remoteAudioRef.current.volume = safe;
  }, []);

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
      void beginIosCallAudio({ video: callType === "video" });
    } else if (!mode && iosRouteActiveRef.current) {
      iosRouteActiveRef.current = false;
      void endIosCallAudio();
    }
  }, [mode, callType]);

  /** CallKit didActivate (from useIosCallKitBridge). */
  const onCallAudioSessionActivated = useCallback(() => {
    micGuardRef.current?.onAudioSessionActivated();
    if (iosRouteActiveRef.current) void beginIosCallAudio({ video: callTypeRef.current === "video" });
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

  return {
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
    screenVideoRef,
    mode,
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
    refreshMicrophone,
    onCallAudioSessionActivated,
    setVideoInput,
    setParticipantVolume,
    toggleParticipantMute,
  };
}
