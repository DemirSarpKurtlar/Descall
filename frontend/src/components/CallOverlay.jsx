import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, Headphones, HeadphoneOff,
  Minus, Maximize2, Users, MessageSquare, MoreVertical, Check, X as XIcon,
  Volume2, ChevronUp, ChevronDown, Mic2, SlidersHorizontal,
} from "./ui/Icon.jsx";
import { Avatar } from "./ui/Avatar";
import MiniCallCard from "./call/MiniCallCard";
import StatusBadge from "./ui/StatusBadge";
import AdminBadge from "./social/AdminBadge";
import { NameEffectText } from "./ui/Cosmetics";
import DmRemoteParticipantSlot from "./voice/DmRemoteParticipantSlot";
import { useDmRemoteParticipant } from "../hooks/useDmRemoteParticipant";
import { resolveAvatarUrl } from "../lib/avatar";
import { resolveDisplayName } from "../lib/userProfile";
import ScreenShareQualityPanel from "./voice/ScreenShareQualityPanel";
import { screenShareUnavailableOnIos } from "../lib/webrtcScreenShare";
import IncomingCallCard from "./voice/IncomingCallCard";
import { useIsNarrowViewport } from "../lib/useIsNarrowViewport";
import useHeldSpeaking from "../hooks/useHeldSpeaking";
import SpeakingRings from "./voice/SpeakingRings";
import ParticipantStateIcons from "./voice/ParticipantStateIcons";
import useVoiceActivity from "../hooks/useVoiceActivity";
import { networkQualityTooltipKey, participantVolumePercent, readParticipantGain } from "../lib/voiceProfile";
import { applyPlaybackGain } from "../lib/voiceGain";
import { nextShareSelection } from "../lib/screenShareTracks";
import ShareFilmstrip, { ShareGridVideo } from "./voice/ShareFilmstrip";
import { useT } from "../context/LocaleContext";
import { useToast } from "../context/ToastContext";
import { DockDeviceSlot } from "./call/DevicePicker";
import { inputMenuGroups, outputMenuGroups } from "../lib/callDeviceMenus";
import VoiceMemberContextMenu from "./servers/VoiceMemberContextMenu";
import UserProfileModal from "./social/UserProfileModal";
import { subscribeCallKitUi, getCallKitUiSnapshot } from "../lib/iosCallKitState";
import useGlassUi from "../hooks/useGlassUi";
import { useGlassDesktop } from "../hooks/useGlassDesktop";
import { groupMosaicShape } from "../lib/groupMosaic";
import { dmRingingLabelKey, planCallGrid } from "../lib/callGridLayout";
import { hapticImpactLight, hapticImpactMedium, hapticSelection } from "../lib/fluid/haptics";
import { REDUCED_MOTION_FADE, SPRINGS, framerSpring } from "../lib/fluid/springs";
import {
  CALL_END_FADE_AT_MS,
  CALL_END_PILL_DELAY_MS,
  groupTileTroubled,
  tileMotion,
} from "../lib/callTileState";
import { ReconnectOverlay } from "./voice/DmRemoteParticipantSlot";
import { useVideoPresence } from "../hooks/useVideoPresence";
import { copyText } from "../lib/copyText";
import GlassVolumeSlider from "./ui/GlassVolumeSlider";

/*
 * Google Meet-style call overlay
 * - Large main video area (peer or screen share)
 * - Self-view picture-in-picture (bottom-right)
 * - Bottom control bar
 * - Top info bar
 * - Minimizable to floating widget
 */
const PULSE_STYLE = `@keyframes callTilePulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`;

/** True when a MediaStream has a usable (non-ended) camera video track. */
function streamHasLiveVideo(stream) {
  if (!stream?.getVideoTracks) return false;
  return stream.getVideoTracks().some((t) => t && t.readyState !== "ended");
}

/**
 * Always-mounted sink for remote screen/tab audio.
 * Lives outside ScreenShareLayout so minimize / layout swaps don't mute yayin sesi.
 */
function RemoteScreenAudioSink({ stream, volume = 100, sinkId = "" }) {
  const audioRef = useRef(null);
  const trackCount =
    stream?.getAudioTracks?.()?.filter((t) => t && t.readyState !== "ended").length || 0;

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    applyPlaybackGain(audioEl, Math.max(0, Math.min(200, Number(volume) || 0)) / 100);
    if (sinkId && typeof audioEl.setSinkId === "function") {
      audioEl.setSinkId(sinkId).catch(() => {});
    }
    if (!stream || trackCount === 0) {
      audioEl.muted = true;
      if (audioEl.srcObject) audioEl.srcObject = null;
      return;
    }
    audioEl.muted = false;
    // Force rebind so late-arriving audio tracks are picked up (mobile).
    audioEl.srcObject = null;
    audioEl.srcObject = stream;
    const play = () => audioEl.play().catch(() => {});
    play();
    stream.getAudioTracks().forEach((t) => {
      const prev = t.onunmute;
      t.onunmute = (ev) => {
        try {
          if (typeof prev === "function") prev.call(t, ev);
        } catch {
          /* ignore */
        }
        play();
      };
    });
  }, [stream, trackCount, volume, sinkId]);

  return <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} aria-hidden="true" />;
}

export default function CallOverlay({ call, groupCall, me, groupName = "", onReturnToCall }) {
  const t = useT();
  const { toast } = useToast();
  const callOverlayKey = me?.equippedCallOverlay?.effect_key || null;
  const callOverlayClass = callOverlayKey ? `cosmetic-call-overlay overlay-${callOverlayKey}` : "";
  const [minimized, setMinimized] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [screenExpanded, setScreenExpanded] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const outputMenuRef = useRef(null);
  const [showScreenQuality, setShowScreenQuality] = useState(false);
  const [screenShareVolume, setScreenShareVolume] = useState(100);
  const [screenVolumes, setScreenVolumes] = useState({});
  const [userVolumes, setUserVolumes] = useState({});
  const [userMenu, setUserMenu] = useState(null);
  const lastUserVolumeRef = useRef({});
  const [profileUser, setProfileUser] = useState(null);
  const openUserMenu = (event, user, sharing = false) => {
    if (!user?.id) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setUserMenu({
      user,
      sharing: Boolean(sharing || user.isScreenSharing || user.screenStream || user.isScreenSharing),
      x: event?.clientX || 0,
      y: event?.clientY || 0,
    });
  };
  const [copiedInfo, setCopiedInfo] = useState(false);
  const narrowViewport = useIsNarrowViewport(720);
  const glass = useGlassUi();
  const glassDesktop = useGlassDesktop();
  const reduceMotion = useReducedMotion();
  const shareEpochRef = useRef(0);
  const prevShareRef = useRef(false);
  const moreMenuRef = useRef(null);
  const screenQualityAnchorRef = useRef(null);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMoreMenu]);


  // Native iOS: CallKit shows the incoming ring; only fall back to the card
  // when CallKit couldn't report it. Always false on web/Electron/Android.
  const callKitUi = useSyncExternalStore(subscribeCallKitUi, getCallKitUiSnapshot, getCallKitUiSnapshot);
  const incomingShownByCallKit = callKitUi.enabled && !callKitUi.fallback;

  // Auto-decline unanswered DM incoming calls (match group modal)
  // No local auto-decline here: a 30 s decline from one device used to end
  // the ring on every device (as "declined") while the server still had
  // 15 s left. The server times the ring out (call:ring-ended "missed") and
  // useCall has its own local guard that only stops THIS device's ringing.

  // Hang-up transition (useCall.ending): leaver's tile exits, then the
  // "Arama sona erdi" pill, then the whole overlay fades out.
  const endingAt = call?.ending?.at || 0;
  const [endStage, setEndStage] = useState(0); // 0 none · 1 pill · 2 fading
  useEffect(() => {
    if (!endingAt) {
      setEndStage(0);
      return undefined;
    }
    const t1 = setTimeout(() => setEndStage(1), CALL_END_PILL_DELAY_MS);
    const t2 = setTimeout(() => setEndStage(2), CALL_END_FADE_AT_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [endingAt]);

  const isDmActive = call?.mode !== null && call?.mode !== undefined;
  const isGroupActive = groupCall?.isInCall;
  const active = isDmActive || isGroupActive;
  const isDm = isDmActive;

  useEffect(() => {
    if (!active) {
      setMinimized(false);
      setShowParticipants(false);
      setShowChat(false);
      setScreenExpanded(false);
      setShowScreenQuality(false);
    }
  }, [active]);

  useEffect(() => {
    if (!glass || !active) return undefined;
    const root = document.documentElement;
    root.classList.add("g-in-call");
    return () => root.classList.remove("g-in-call");
  }, [glass, active]);

  // `ontrack` can run while an incoming caller is still negotiating, before
  // the active-call UI mounts its <audio>. Retry attachment after each render
  // so the first remote audio track is never lost until a later renegotiation.
  // Same mic-only track set the hook attaches (lib/remoteAudioKeeper.js):
  // reassigning the full remote stream here restarted playback each render.
  useEffect(() => {
    if (!isDm || !call?.remoteStream) return;
    call?.ensureRemoteAudio?.("overlay");
  }, [isDm, call?.mode, call?.remoteAudioRef, call?.remoteStream, call?.ensureRemoteAudio]);

  if (!active) {
    const shot = glass && typeof window !== "undefined" ? window.__DESCALL_SHOT_CALL : null;
    if (shot) return <GlassCallShot kind={shot} />;
    return null;
  }

  const mode = isDm ? call.mode : "active";
  const peer = isDm ? call.peer : null;
  const callType = isDm ? call.callType : groupCall.callType;
  const muted = isDm ? call.muted : groupCall.isMuted;
  const deafened = isDm ? call.deafened : groupCall.deafened;
  const cameraOn = isDm ? call.cameraOn : groupCall.isCameraOn;
  const screenSharing = isDm ? call.screenSharing : groupCall.isScreenSharing;
  const duration = isDm ? call.duration : groupCall.duration;
  const formattedDuration = duration
    ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}`
    : "";
  const title = isDm
    ? (peer ? (resolveDisplayName(peer) || peer.username || t("User")) : t("User"))
    : (groupName || t("Group Call"));
  const participantCount = (groupCall.participants?.filter((p) => p.id !== me?.id).length ?? 0) + 1;
  const subtitle = isDm
    ? mode === "incoming"
      ? t("Incoming call...")
      : mode === "outgoing"
      ? (call?.calleeAnswering
          ? t("Answered on iPhone, waiting for unlock…")
          : call?.connectionQuality === "failed"
          ? t("User may be offline, waiting…")
          : t("Calling..."))
      : call?.ending
      ? t("Call ended")
      : call?.peerConnectionState === "reconnecting"
      ? t("Reconnecting…")
      : call?.mode === "active" && (call?.mediaFlow === "connecting" || call?.mediaFlow === "retry") && call?.remoteSending === false
      ? t("Their microphone is connecting…")
      : call?.peerConnectionState === "connecting" ||
        (call?.mode === "active" && !call?.remoteMediaReady) ||
        (call?.mode === "active" && (call?.mediaFlow === "connecting" || call?.mediaFlow === "retry"))
      ? t("Connecting…")
      : callType === "video"
      ? t("Video call")
      : t("Voice call")
    : participantCount <= 1
      ? t("Waiting for others to join…")
      : t("{count} participants", { count: participantCount });

  const remoteAudio = isDm ? (
    <audio
      ref={call?.remoteAudioRef}
      autoPlay
      playsInline
      style={{ display: "none" }}
      aria-hidden="true"
    />
  ) : null;

  // Screen-share audio must stay mounted even when the UI is minimized —
  // ScreenShareLayout unmounts and previously killed tab/system audio.
  const durableScreenAudioSources = isDm
    ? (call?.remoteScreenStream &&
      (call?.remoteScreenSharing ||
        streamHasLiveVideo(call?.remoteScreenStream) ||
        (call.remoteScreenStream.getAudioTracks?.() || []).some((t) => t && t.readyState !== "ended"))
        ? [{ id: call.peer?.id || "dm-screen", stream: call.remoteScreenStream }]
        : [])
    : (groupCall?.participants ?? [])
        .filter((p) => {
          if (p.id === me?.id || !p.screenStream) return false;
          const hasAudio = (p.screenStream.getAudioTracks?.() || []).some(
            (t) => t && t.readyState !== "ended"
          );
          return p.isScreenSharing || streamHasLiveVideo(p.screenStream) || hasAudio;
        })
        .map((p) => ({ id: p.id, stream: p.screenStream }));

  const durableScreenAudio = durableScreenAudioSources.map(({ id, stream }) => (
    <RemoteScreenAudioSink
      key={`screen-audio-${id}`}
      stream={stream}
      volume={screenVolumes[String(id)] ?? screenShareVolume}
      sinkId={(isDm ? call?.selectedAudioOutput : groupCall?.selectedAudioOutput) || ""}
    />
  ));

  /* ---------- Incoming DM: FaceTime-style avatar rings ---------- */
  if (isDm && mode === "incoming" && incomingShownByCallKit) {
    return (
      <>
        {remoteAudio}
        {durableScreenAudio}
      </>
    );
  }
  if (isDm && mode === "incoming") {
    return (
      <>
        {remoteAudio}
        {durableScreenAudio}
        <AnimatePresence>
          <IncomingCallCard
            key="dm-incoming-call"
            username={peer ? (resolveDisplayName(peer) || peer.username) : undefined}
            user={peer}
            callType={callType}
            onDecline={() => { hapticImpactLight(); call.declineIncoming?.(); }}
            onAccept={() => { hapticImpactLight(); call.acceptIncoming?.(); }}
          />
        </AnimatePresence>
      </>
    );
  }

  /* ---------- Minimized widget (2.11.1: draggable glass mini card) ---------- */
  if (minimized) {
    return (
      <>
        {remoteAudio}
        {durableScreenAudio}
        <MiniCallCard
          t={t}
          isDm={isDm}
          peer={peer}
          title={title}
          subtitle={subtitle}
          timer={formattedDuration}
          muted={muted}
          deafened={deafened}
          screenSharing={screenSharing}
          stream={isDm ? call?.remoteStream : null}
          pending={isDm && mode === "outgoing"}
          onReturn={() => { setMinimized(false); onReturnToCall?.(); }}
          onToggleMute={() => { hapticSelection(); (isDm ? call.toggleMute : groupCall.toggleMute)?.(); }}
          onToggleDeafen={() => { hapticSelection(); (isDm ? call.toggleDeafen : groupCall.toggleDeafen)?.(); }}
          onHangUp={() => { hapticImpactMedium(); isDm ? call.endCall(peer?.id) : groupCall.leaveCall(); }}
        />
      </>
    );
  }

  /* ---------- Fullscreen Meet-style overlay ---------- */
  const hasLocalVideo = cameraOn && (isDm ? call?.localStream : groupCall?.localStream);

  // Build unified participant list, remote only (local is rendered as a dedicated tile)
  const localId = me?.id;
  const remoteParticipants = isDm
    ? (call?.peer && call?.mode === "active"
        ? [{
            // Keep full peer (equipped frame / name effect / badge) for Avatar cosmetics
            ...call.peer,
            id: call.peer.id,
            username: resolveDisplayName(call.peer) || call.peer.username,
            avatarUrl: resolveAvatarUrl(call.peer),
            stream: call.remoteStream,
            hasVideo: call.remoteCameraOn !== false && streamHasLiveVideo(call.remoteStream),
            isMuted: Boolean(call.remoteMuted),
            isDeafened: Boolean(call.remoteDeafened),
            isCameraOn: call.remoteCameraOn,
            isScreenSharing: Boolean(call.remoteScreenSharing),
            screenStream: call.remoteScreenStream,
          }]
        : [])
    : (groupCall?.participants ?? []).filter((p) => p.id !== localId);

  // All screen sharers: remote peers sharing only (exclude local, handled separately by screenSharing flag)
  // Prefer the explicit remoteScreenSharing flag, but also recover when a
  // live screen stream is present without the socket signal (merge regression
  // / late signaling) so tab audio still mounts on the dedicated <audio>.
  const remoteScreenSharers = isDm
    ? ((call?.remoteScreenSharing || streamHasLiveVideo(call?.remoteScreenStream)) &&
      streamHasLiveVideo(call?.remoteScreenStream) &&
      call?.peer
        ? [{
            id: call.peer.id,
            username: resolveDisplayName(call.peer) || call.peer.username,
            stream: call.remoteScreenStream,
            isScreenSharing: true,
          }]
        : [])
    : (groupCall?.participants ?? [])
        .filter((p) => p.isScreenSharing && p.screenStream && p.id !== localId)
        .map((p) => ({
          id: p.id,
          username: p.displayName || p.display_name || p.username,
          stream: p.screenStream,
          isScreenSharing: true,
        }));
  const localUsername = resolveDisplayName(me) || me?.username || t("You");

  const allScreenSharers = [
    ...(screenSharing ? [{ id: "local", username: localUsername, isLocal: true }] : []),
    ...remoteScreenSharers.map((p) => ({
      id: p.id,
      username: p.username,
      stream: p.stream,
      isLocal: false,
    })),
  ];
  const anyScreenShare = allScreenSharers.length > 0;
  if (prevShareRef.current && !anyScreenShare) shareEpochRef.current += 1;
  prevShareRef.current = anyScreenShare;
  const returningFromShare = !anyScreenShare && shareEpochRef.current > 0;
  if (!anyScreenShare && screenExpanded) setScreenExpanded(false);
  const desktopGroupLine = glassDesktop && !isDm
    ? `${formattedDuration ? `${formattedDuration} · ` : ""}${callType === "video" ? t("Video call") : t("Voice call")}`
    : "";

  return (
    <>
    {remoteAudio}
    {durableScreenAudio}
    <motion.div
      data-call-overlay="true"
      className={`call-overlay-root ${callOverlayClass}${glass ? ` g-call${isDm ? " is-dm" : " is-group"}` : ""}`.trim()}
      initial={{ opacity: 0 }}
      animate={{ opacity: endStage === 2 ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={endStage === 2
        ? { type: "tween", duration: reduceMotion ? 0.2 : 0.42, ease: [0.4, 0, 0.2, 1] }
        : undefined}
      aria-busy={endStage ? "true" : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        pointerEvents: endingAt ? "none" : undefined,
        ...(callOverlayKey ? {} : { background: "#0f1115" }),
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>{PULSE_STYLE}</style>
      {/* ====== TOP INFO BAR ====== */}
      {glass ? (
        <div className="g-call-head">
          <button type="button" className="g-cbtn g-glass" onClick={() => setMinimized(true)} aria-label={t("Minimize")}>
            <ChevronDown size={22} strokeWidth={1.9} />
          </button>
          <div className="g-call-title g-glass">
            <div className="g-call-title-text">
              <div className="g-call-name">
                <span className="g-call-name-text">{title}</span>
                {isDm ? <AdminBadge user={peer} variant="inline" /> : null}
              </div>
              <div className="g-call-sub">
                {subtitle}{formattedDuration ? ` · ${formattedDuration}` : ""}
                {anyScreenShare ? ` · ${t("Presenting")}` : ""}
              </div>
            </div>
            {isDm && mode === "active" ? (
              <CallQualityHud quality={call?.connectionQuality || "unknown"} stats={glassQaNetStats(call?.networkStats)} />
            ) : null}
            {!isDm ? (
              <button
                type="button"
                className="g-cbtn g-glass g-call-people"
                onClick={() => setShowParticipants((v) => !v)}
                aria-label={t("Show participants")}
              >
                <Users size={18} strokeWidth={1.9} />
              </button>
            ) : null}
          </div>
        </div>
      ) : (
      <div
        className="call-top-bar"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          // Below the status bar / Dynamic Island; the gradient still runs edge to edge.
          padding:
            "calc(16px + env(safe-area-inset-top, 0px)) calc(20px + env(safe-area-inset-right, 0px)) 16px calc(20px + env(safe-area-inset-left, 0px))",
          boxSizing: "border-box",
          gap: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 4, minWidth: 0, pointerEvents: "auto" }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{title}</span>
          {anyScreenShare && !desktopGroupLine && (
            <span style={{ background: "#3ba55d", color: "#fff", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
              <Monitor size={12} />
              {t("Presenting")}
            </span>
          )}
          <span style={{ fontSize: 13, color: "#b5bac1" }}>
            {desktopGroupLine || `${subtitle}${formattedDuration ? ` · ${formattedDuration}` : ""}`}
          </span>
          {isDm && mode === "active" && (
            <CallQualityHud quality={call?.connectionQuality || "unknown"} stats={glassQaNetStats(call?.networkStats)} />
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, pointerEvents: "auto" }}>
          <TopIconBtn onClick={() => setShowParticipants(!showParticipants)} active={showParticipants}><Users size={18} /></TopIconBtn>
          <TopIconBtn onClick={() => setShowChat(!showChat)} active={showChat}><MessageSquare size={18} /></TopIconBtn>
          <TopIconBtn onClick={() => setMinimized(true)}><Minus size={18} /></TopIconBtn>
        </div>
      </div>
      )}

      {isDm && mode === "active" && call?.mediaFlow === "retry" && !call?.ending ? (
        <div
          className="call-media-retry"
          role="status"
          style={{
            position: "absolute",
            top: "calc(96px + env(safe-area-inset-top, 0px))",
            left: 16,
            right: 16,
            zIndex: 12,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 8px 8px 16px",
              borderRadius: 999,
              background: "rgba(20,22,28,0.72)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "#fff",
              fontSize: 14,
              pointerEvents: "auto",
            }}
          >
          <span>{t("Audio isn't coming through yet.")}</span>
          <button
            type="button"
            onClick={() => call?.retryMediaFlow?.()}
            style={{
              border: 0,
              borderRadius: 999,
              padding: "8px 14px",
              background: "#34c759",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t("Retry audio connection")}
          </button>
        </div>
        </div>
      ) : null}

      {/* ====== MAIN CONTENT AREA ====== */}
      {/* Reserve real control-bar height so screen share never sits under the buttons */}
      <div
        className="call-main-stage"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          // visible, catalog avatar frames extend past the tile (~132%)
          overflow: "visible",
          minHeight: 0,
          paddingTop: narrowViewport
            ? "calc(56px + env(safe-area-inset-top, 0px))"
            : "calc(60px + env(safe-area-inset-top, 0px))",
          paddingBottom: narrowViewport
            ? "calc(72px + env(safe-area-inset-bottom, 0px))"
            : "calc(96px + env(safe-area-inset-bottom, 0px))",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <motion.div
          key={anyScreenShare ? "share" : `grid-${shareEpochRef.current}`}
          className="call-stage-stack"
          initial={
            returningFromShare
              ? (reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 })
              : false
          }
          animate={{ opacity: 1, scale: 1 }}
          transition={reduceMotion ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.move)}
        >
        {anyScreenShare ? (
          <ScreenShareLayout
            allScreenSharers={allScreenSharers}
            screenExpanded={screenExpanded}
            setScreenExpanded={setScreenExpanded}
            isDm={isDm}
            call={call}
            groupCall={groupCall}
            remoteParticipants={remoteParticipants}
            hasLocalVideo={hasLocalVideo}
            cameraOn={cameraOn}
            localUsername={localUsername}
            localAvatarUrl={resolveAvatarUrl(me)}
            localUser={me}
            narrow={narrowViewport}
            screenShareVolume={screenShareVolume}
            screenVolumes={screenVolumes}
            onScreenShareVolumeChange={setScreenShareVolume}
            onScreenVolumeForSharer={(id, value) => {
              setScreenVolumes((prev) => ({ ...prev, [String(id)]: value }));
              setScreenShareVolume(value);
            }}
            onOpenUserMenu={openUserMenu}
          />
        ) : (
          <ParticipantGrid
            isDm={isDm}
            call={call}
            groupCall={groupCall}
            remoteParticipants={remoteParticipants}
            hasLocalVideo={hasLocalVideo}
            cameraOn={cameraOn}
            callType={callType}
            peer={peer}
            mode={mode}
            title={title}
            subtitle={subtitle}
            formattedDuration={formattedDuration}
            localUsername={localUsername}
            localAvatarUrl={resolveAvatarUrl(me)}
            localUser={me}
            onOpenUserMenu={openUserMenu}
          />
        )}
        <AnimatePresence>
          {endStage >= 1 ? (
            <motion.div
              key="call-ended-pill"
              className="call-ended-pill"
              role="status"
              aria-live="polite"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 6 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize)}
            >
              {t("Call ended")}
              {formattedDuration ? <span className="call-ended-pill-duration">{formattedDuration}</span> : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
        </motion.div>
      </div>

      {/* ====== BOTTOM CONTROL BAR ====== */}
      <div
        className={glass ? "call-control-bar g-call-ctrl g-glass" : "call-control-bar"}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          width: "100%",
          zIndex: 10,
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          alignItems: "center",
          justifyContent: "center",
          gap: narrowViewport ? 6 : 14,
          padding: narrowViewport
            ? "12px calc(12px + env(safe-area-inset-right, 0px)) calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px))"
            : "20px calc(24px + env(safe-area-inset-right, 0px)) calc(28px + env(safe-area-inset-bottom, 0px)) calc(24px + env(safe-area-inset-left, 0px))",
          background: "linear-gradient(to top, rgba(0,0,0,0.85) 40%, transparent)",
          boxSizing: "border-box",
        }}
      >
        {mode === "incoming" && isDm ? (
          <>
            <CircleBtn color="#3ba55d" size={64} onClick={() => { hapticImpactLight(); call.acceptIncoming?.(); }}>
              <Phone size={28} />
            </CircleBtn>
            <CircleBtn color="#ed4245" size={64} onClick={() => { hapticImpactLight(); call.declineIncoming?.(); }}>
              <PhoneOff size={28} />
            </CircleBtn>
          </>
        ) : (
          <>
            {/* Mic → input menu, deafen → output menu (chevron, long press, right click). */}
            <DockDeviceSlot
              menuLabel={t("Choose microphone")}
              groups={inputMenuGroups(isDm ? call : groupCall, t)}
            >
              <CircleBtn
                className={glass ? `g-cb${muted ? " is-on" : ""}` : undefined}
                size={narrowViewport ? 46 : 52}
                color={muted ? "#ed4245" : "#3c4043"}
                onClick={() => { hapticSelection(); (isDm ? call.toggleMute : groupCall.toggleMute)?.(); }}
                title={muted ? t("Unmute") : t("Mute")}
              >
                {muted ? <MicOff size={narrowViewport ? 19 : 22} /> : <Mic size={narrowViewport ? 19 : 22} />}
              </CircleBtn>
            </DockDeviceSlot>

            <DockDeviceSlot
              menuLabel={t("Choose speaker")}
              groups={outputMenuGroups(isDm ? call : groupCall, t)}
              controlRef={outputMenuRef}
            >
              <CircleBtn
                className={glass ? `g-cb${deafened ? " is-on" : ""}` : undefined}
                size={narrowViewport ? 46 : 52}
                color={deafened ? "#ed4245" : "#3c4043"}
                onClick={() => { hapticSelection(); (isDm ? call.toggleDeafen : groupCall.toggleDeafen)?.(); }}
                title={deafened ? t("Undeafen") : t("Deafen")}
              >
                {deafened ? <HeadphoneOff size={narrowViewport ? 19 : 22} /> : <Headphones size={narrowViewport ? 19 : 22} />}
              </CircleBtn>
            </DockDeviceSlot>

            <DockDeviceSlot
              menuLabel={t("Camera")}
              sections={[
                {
                  id: "cam",
                  label: t("Camera"),
                  devices: (isDm ? call : groupCall)?.videoInputDevices || [],
                  selectedId: (isDm ? call : groupCall)?.selectedVideoInput || "",
                  onSelect: (deviceId) => { hapticSelection(); (isDm ? call : groupCall)?.setVideoInput?.(deviceId); },
                },
              ]}
            >
              <CircleBtn
                className={glass ? `g-cb${cameraOn ? "" : " is-on"}` : undefined}
                size={narrowViewport ? 46 : 52}
                color={cameraOn ? "#3c4043" : "#ed4245"}
                onClick={() => { hapticSelection(); (isDm ? call.toggleCamera : groupCall.toggleCamera)?.(); }}
                title={cameraOn ? t("Turn off camera") : t("Turn on camera")}
              >
                {cameraOn ? <Video size={narrowViewport ? 19 : 22} /> : <VideoOff size={narrowViewport ? 19 : 22} />}
              </CircleBtn>
            </DockDeviceSlot>

            {/* iPhone (native app): no screen sharing, so the button is not shown. */}
            {!screenShareUnavailableOnIos() && (
            <div
              ref={screenQualityAnchorRef}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
            >
              <CircleBtn
                className={glass ? `g-cb${screenSharing ? " is-on" : ""}` : undefined}
                size={narrowViewport ? 46 : 52}
                color={screenSharing ? "#3ba55d" : "#3c4043"}
                onClick={() => {
                  setShowMoreMenu(false);
                  if (isDm) {
                    if (screenSharing) call.stopScreenShare();
                    else setShowScreenQuality((v) => !v);
                  } else {
                    if (groupCall.isScreenSharing) groupCall.stopScreenShare();
                    else setShowScreenQuality((v) => !v);
                  }
                }}
                title={screenSharing ? t("Stop presenting") : t("Present screen")}
              >
                <Monitor size={narrowViewport ? 19 : 22} />
              </CircleBtn>
              {(screenSharing || showScreenQuality) && (
                <button
                  type="button"
                  title={t("Screen quality")} aria-label={t("Screen quality")}
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowScreenQuality((v) => !v);
                  }}
                  style={{
                    width: narrowViewport ? 32 : 28,
                    height: narrowViewport ? 32 : 28,
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: showScreenQuality ? "rgba(88,101,242,0.35)" : "rgba(0,0,0,0.35)",
                    color: "#e8e8ec",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <SlidersHorizontal size={narrowViewport ? 15 : 14} />
                </button>
              )}
              <ScreenShareQualityPanel
                open={showScreenQuality}
                onClose={() => setShowScreenQuality(false)}
                anchorRef={screenQualityAnchorRef}
                isGroupCall={!isDm}
                participantCount={
                  isDm
                    ? 2
                    : (groupCall.participants?.length ?? 0) + 1
                }
                screenQuality={isDm ? call.screenQuality : groupCall.screenQuality}
                setScreenQuality={isDm ? call.setScreenQuality : groupCall.setScreenQuality}
                isScreenSharing={screenSharing}
                onStartWithQuality={async (q) => {
                  if (isDm) await call.startScreenShare(q);
                  else await groupCall.startScreenShare(q);
                }}
                onRestartWithQuality={async (q) => {
                  if (isDm) await call.restartScreenShareWithQuality(q);
                  else await groupCall.restartScreenShareWithQuality(q);
                }}
              />
            </div>
            )}

            <div ref={moreMenuRef} style={{ position: "relative", flexShrink: 0 }}>
              <CircleBtn
                className={glass ? "g-cb" : undefined}
                size={narrowViewport ? 46 : 52}
                color={showMoreMenu ? "rgba(255,255,255,0.15)" : "#3c4043"}
                title={t("More options")}
                onClick={() => {
                  setShowMoreMenu((v) => !v);
                  setShowScreenQuality(false);
                }}
              >
                <MoreVertical size={narrowViewport ? 19 : 22} />
              </CircleBtn>

              <AnimatePresence>
                {showMoreMenu && (
                  <motion.div
                    className="g-call-menu"
                    initial={narrowViewport ? { opacity: 0, y: 20 } : { opacity: 0, y: 8, scale: 0.95 }}
                    animate={narrowViewport ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={narrowViewport ? { opacity: 0, y: 20 } : { opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.14 }}
                    style={{
                      ...(narrowViewport
                        ? {
                            position: "fixed",
                            left: 12,
                            right: 12,
                            bottom: "max(12px, calc(env(safe-area-inset-bottom, 0px) + 72px))",
                            maxHeight: "min(55vh, 360px)",
                            overflowY: "auto",
                            zIndex: 10050,
                          }
                        : {
                            position: "absolute",
                            bottom: "calc(100% + 10px)",
                            right: 0,
                            minWidth: 210,
                            maxWidth: "min(280px, calc(100vw - 24px))",
                            zIndex: 100,
                          }),
                      background: "rgba(36,38,46,0.92)",
                      WebkitBackdropFilter: "blur(40px) saturate(160%)",
                      backdropFilter: "blur(40px) saturate(160%)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      overflow: "hidden",
                      boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                      boxSizing: "border-box",
                    }}
                  >
                    {glass && (
                      <MoreMenuItem
                        icon={<MessageSquare size={16} />}
                        label={t("Chat")}
                        onClick={() => {
                          setShowChat((v) => !v);
                          setShowMoreMenu(false);
                        }}
                      />
                    )}
                    {narrowViewport && (
                      <>
                        <MoreMenuItem
                          icon={<Volume2 size={16} />}
                          label={t("Audio output")}
                          onClick={() => {
                            setShowMoreMenu(false);
                            // Same menu as the deafen button's chevron.
                            requestAnimationFrame(() => outputMenuRef.current?.open());
                          }}
                        />
                        {!screenShareUnavailableOnIos() && (
                          <MoreMenuItem
                            icon={<SlidersHorizontal size={16} />}
                            label={t("Screen quality")}
                            onClick={() => {
                              setShowMoreMenu(false);
                              setShowScreenQuality(true);
                            }}
                          />
                        )}
                        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" }} />
                      </>
                    )}
                    <MoreMenuItem
                      icon={cameraOn ? <VideoOff size={16} /> : <Video size={16} />}
                      label={cameraOn ? t("Turn off camera") : t("Turn on camera")}
                      onClick={() => {
                        hapticSelection();
                        isDm ? call.toggleCamera?.() : groupCall.toggleCamera?.();
                        setShowMoreMenu(false);
                      }}
                    />
                    <MoreMenuItem
                      icon={muted ? <Mic size={16} /> : <MicOff size={16} />}
                      label={muted ? t("Unmute") : t("Mute microphone")}
                      onClick={() => {
                        hapticSelection();
                        isDm ? call.toggleMute?.() : groupCall.toggleMute?.();
                        setShowMoreMenu(false);
                      }}
                    />
                    <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" }} />
                    <MoreMenuItem
                      icon={<Users size={16} />}
                      label={t("Show participants")}
                      onClick={() => {
                        setShowParticipants((v) => !v);
                        setShowMoreMenu(false);
                      }}
                    />
                    <MoreMenuItem
                      icon={copiedInfo ? <Check size={16} color="#3ba55d" /> : <MessageSquare size={16} />}
                      label={copiedInfo ? t("Copied!") : t("Copy call info")}
                      onClick={() => {
                        const info = isDm
                          ? `Call with ${peer?.username}`
                          : t("Group call · {count} participants", { count: groupCall.participants?.length ?? 0 });
                        copyText(info).catch(() => {});
                        setCopiedInfo(true);
                        setTimeout(() => setCopiedInfo(false), 2000);
                      }}
                    />
                    <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" }} />
                    <MoreMenuItem
                      icon={<PhoneOff size={16} color="#ed4245" />}
                      label={t("Leave call")}
                      danger
                      onClick={() => {
                        setShowMoreMenu(false);
                        hapticImpactMedium();
                        isDm ? call.endCall?.(peer?.id) : groupCall.leaveCall?.();
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <CircleBtn
              className={glass ? "g-cb is-end" : "is-end"}
              color="#ed4245"
              size={narrowViewport ? 50 : 56}
              onClick={() => { hapticImpactMedium(); isDm ? call.endCall(peer?.id) : groupCall.leaveCall(); }}
              title={t("End call")}
            >
              <PhoneOff size={narrowViewport ? 21 : 24} />
            </CircleBtn>
          </>
        )}
      </div>

      {/* ====== PARTICIPANTS SIDEBAR ====== */}
      <AnimatePresence>
        {showParticipants && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: narrowViewport ? "min(100%, 320px)" : 300,
              maxWidth: "100vw",
              zIndex: 20,
              background: "#1e1f23",
              borderLeft: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              flexDirection: "column",
              boxSizing: "border-box",
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{t("People")}</span>
              <button
                onClick={() => setShowParticipants(false)}
                style={{ background: "none", border: "none", color: "#b5bac1", cursor: "pointer" }}
               aria-label={t("Close")}>
                <XIcon size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
              {isDm ? (
                <PersonRow name={peer?.username || t("User")} avatarUrl={resolveAvatarUrl(peer)} isHost />
              ) : (
                groupCall.participants?.map((p) => (
                  <PersonRow key={p.id} name={p.username} avatarUrl={resolveAvatarUrl(p)} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    <VoiceMemberContextMenu
      menu={userMenu}
      canMove={false}
      canMute={false}
      voiceChannels={[]}
      voiceVolume={participantVolumePercent(
        Object.prototype.hasOwnProperty.call(userVolumes, String(userMenu?.user?.id))
          ? userVolumes[String(userMenu?.user?.id)] / 100
          : readParticipantGain(userMenu?.user?.id),
        userMenu?.user?.id
      )}
      onVoiceVolume={(value) => {
        const id = userMenu?.user?.id;
        if (id == null) return;
        if (value > 0) lastUserVolumeRef.current[String(id)] = value;
        setUserVolumes((prev) => ({ ...prev, [String(id)]: value }));
        (isDm ? call : groupCall)?.setParticipantVolume?.(id, value / 100);
      }}
      onToggleVoiceMute={() => {
        const id = userMenu?.user?.id;
        if (id == null) return;
        const key = String(id);
        const current = userVolumes[key] ?? 100;
        const next = current > 0 ? 0 : (lastUserVolumeRef.current[key] || 100);
        if (current > 0) lastUserVolumeRef.current[key] = current;
        setUserVolumes((prev) => ({ ...prev, [key]: next }));
        (isDm ? call : groupCall)?.setParticipantVolume?.(id, next / 100);
      }}
      showScreenVolume={Boolean(userMenu?.sharing)}
      screenVolume={screenVolumes[String(userMenu?.user?.id)] ?? screenShareVolume}
      onScreenVolume={(value) => {
        const id = userMenu?.user?.id;
        if (id == null) return;
        setScreenVolumes((prev) => ({ ...prev, [String(id)]: value }));
      }}
      onViewProfile={() => {
        if (userMenu?.user?.id) setProfileUser(userMenu.user);
        setUserMenu(null);
      }}
      onCopyId={() => {
        const id = userMenu?.user?.id;
        if (id == null) return;
        copyText(String(id)).then(() => toast(t("Copied"), "success")).catch(() => {});
        setUserMenu(null);
      }}
      onClose={() => setUserMenu(null)}
    />
    <UserProfileModal
      open={Boolean(profileUser)}
      onClose={() => setProfileUser(null)}
      userId={profileUser?.id}
      username={profileUser?.username}
      displayName={profileUser?.displayName || profileUser?.display_name || profileUser?.username}
      avatarUrl={profileUser?.avatarUrl || profileUser?.avatar_url}
      createdAt={profileUser?.createdAt || profileUser?.created_at || null}
      me={me}
    />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────
   ParticipantTile, one rectangle in the grid or strip
   isSpeaking derived externally; videoRef only for remote video.
   ───────────────────────────────────────────────────────────────── */
function SpeakingRemoteSlot(props) {
  const [tileEl, setTileEl] = useState(null);
  const { speaking, level } = useVoiceActivity(props.remoteStream, {
    muted: Boolean(props.isMuted),
    observeEl: tileEl,
    levelProbe: props.levelProbe,
  });
  return (
    <DmRemoteParticipantSlot
      {...props}
      isSpeaking={speaking}
      level={level}
      onTile={setTileEl}
    />
  );
}

function glassQaNetStats(stats) {
  if (stats && (stats.rttMs != null || stats.packetLossPct != null || stats.bitrateKbps != null)) return stats;
  if (import.meta.env.DEV && typeof window !== "undefined" && window.__DESCALL_QA_NET__) {
    return window.__DESCALL_QA_NET__;
  }
  return stats || null;
}

function CallQualityHud({ quality = "unknown", stats = null }) {
  const t = useT();
  const [showDetails, setShowDetails] = useState(false);
  const detailsRef = useRef(null);
  const q = String(quality || "unknown");
  // Refine the coarse ICE-state bucket with real measured stats once the
  // connection has settled, so "good" can still surface as excellent/fair/poor.
  const measuredQuality = q === "good" ? (stats?.quality || "good") : q;
  const bars =
    measuredQuality === "excellent" ? 4 :
    measuredQuality === "good" ? 3 :
    q === "connecting" || q === "unknown" ? 2 :
    measuredQuality === "fair" || measuredQuality === "poor" || q === "poor" ? 1 :
    0;
  const label =
    measuredQuality === "excellent" ? t("Excellent") :
    measuredQuality === "good" ? t("Good") :
    q === "connecting" ? t("Connecting") :
    measuredQuality === "fair" ? t("Fair") :
    measuredQuality === "poor" || q === "poor" ? t("Weak") :
    q === "failed" ? t("Failed") :
    t("Link");
  const qualityTitleKey = networkQualityTooltipKey(
    q === "failed" || q === "poor" ? q : measuredQuality
  );

  const hasNumbers = stats && (stats.rttMs != null || stats.packetLossPct != null || stats.bitrateKbps != null);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined" || !window.__DESCALL_QA_NET__ || !hasNumbers) return;
    setShowDetails(true);
  }, [hasNumbers]);

  useEffect(() => {
    if (!showDetails) return;
    const onOutside = (e) => {
      if (detailsRef.current && !detailsRef.current.contains(e.target)) setShowDetails(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [showDetails]);

  return (
    <div
      ref={detailsRef}
      className={`call-quality-hud ${q}`}
      title={qualityTitleKey ? t(qualityTitleKey) : t("Connection: {label}", { label })}
      onClick={hasNumbers ? () => setShowDetails((v) => !v) : undefined}
      style={{ cursor: hasNumbers ? "pointer" : "default", position: "relative" }}
    >
      <div className="call-quality-bars" aria-hidden>
        <span className={bars >= 1 ? "on" : ""} style={{ height: 4 }} />
        <span className={bars >= 2 ? "on" : ""} style={{ height: 7 }} />
        <span className={bars >= 3 ? "on" : ""} style={{ height: 10 }} />
        <span className={bars >= 4 ? "on" : ""} style={{ height: 13 }} />
      </div>
      <span>{label}</span>
      {showDetails && hasNumbers && (
        <div
          className="call-quality-details"
          style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 30,
            background: "rgba(22, 24, 36, 0.95)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16, padding: "10px 12px", minWidth: 180,
            boxShadow: "0 16px 40px rgba(0,0,0,0.45)", fontSize: 12, color: "#dcddde",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, color: "#fff" }}>{t("Connection quality")}</div>
          {stats.rttMs != null && (
            <StatRow label={t("Latency")} value={`${stats.rttMs} ms`} />
          )}
          {stats.jitterMs != null && (
            <StatRow label={t("Jitter")} value={`${stats.jitterMs} ms`} />
          )}
          {stats.packetLossPct != null && (
            <StatRow label={t("Packet loss")} value={`${stats.packetLossPct}%`} />
          )}
          {stats.bitrateKbps != null && (
            <StatRow label={t("Bitrate")} value={`${stats.bitrateKbps} kbps`} />
          )}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "2px 0" }}>
      <span style={{ color: "#96989d" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function ParticipantTile({
  username,
  avatarUrl,
  user = null,
  status = null,
  isSpeaking: speakingProp,
  videoRef,
  hasVideo,
  isLocal,
  small = false,
  stream = null,
  muted = false,
  deafened = false,
  cameraOn = true,
  connectionQuality = null,
  onContextMenu,
  mosaicChip = false,
  reconnecting = false,
  levelProbe = null,
}) {
  const t = useT();
  const glass = useGlassUi();
  const elRef = useRef(null);
  const [tileEl, setTileEl] = useState(null);
  const { speaking: detected, level } = useVoiceActivity(stream, {
    muted: muted || (isLocal === false && !stream),
    observeEl: tileEl,
    levelProbe,
  });
  // Hold the off-edge (SPEAKING_HOLD_MS) so VAD flapping between words never blinks
  // the ring / restarts its animation.
  const heldSpeaking = useHeldSpeaking(Boolean(speakingProp || detected) && !muted);
  const isSpeaking = muted ? false : heldSpeaking;
  const avatarSize = small ? 36 : 96;
  // Frame overlay is ~132% of the avatar, pad the shell so overflow:hidden
  // ancestors (call stage / framer layout) don't clip catalog frames.
  const shellPad = small ? 6 : Math.round(avatarSize * 0.2);
  const shellSize = avatarSize + shellPad * 2;
  const presenceStatus = status || (isLocal ? "online" : null);
  // Camera off (signaled or the track went muted / ended / disabled) shows
  // the avatar again; the <video> stays mounted for a fade back in.
  const presence = useVideoPresence(stream, { cameraOn });
  const mountVideo = Boolean(hasVideo && cameraOn !== false && (videoRef || stream) && (!stream || presence.mount));
  const showVideo = Boolean(mountVideo && (!stream || presence.show));
  const displayName = resolveDisplayName(user) || username || "?";

  const setVideoEl = useCallback((el) => {
    elRef.current = el;
    if (typeof videoRef === "function") videoRef(el);
    else if (videoRef) videoRef.current = el;
    if (el && stream && el.srcObject !== stream) {
      el.muted = true;
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  }, [videoRef, stream]);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !mountVideo || !stream) return;
    el.muted = true;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (showVideo) el.play().catch(() => {});
  }, [stream, mountVideo, showVideo]);

  return (
    <div
      ref={setTileEl}
      className={`participant-tile${small ? " small" : ""}${isSpeaking && !reconnecting ? " is-speaking" : ""}${
        showVideo ? "" : " participant-tile--avatar-only"
      }${reconnecting ? " is-reconnecting" : ""}`}
      onContextMenu={
        isLocal
          ? undefined
          : (event) => {
              event.preventDefault();
              onContextMenu?.(event);
            }
      }
    >
      {mountVideo ? (
        <video
          ref={setVideoEl}
          autoPlay
          playsInline
          muted
          className={`tile-video-layer${showVideo ? " is-shown" : ""}`}
          aria-hidden={showVideo ? undefined : "true"}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            // Local preview behaves like a mirror; remote video and shared
            // screens preserve their actual orientation.
            transform: isLocal ? "scaleX(-1)" : undefined,
          }}
        />
      ) : null}
      {showVideo ? null : (
        <div className="participant-tile-avatar-stack tile-avatar-layer">
          <div
            className="participant-tile-avatar-shell"
            style={{ width: shellSize, height: shellSize }}
          >
            <div className="participant-tile-avatar-core" style={{ width: avatarSize, height: avatarSize }}>
              {/* Always mounted, speaking only fades it (no remount / restart). */}
              <SpeakingRings speaking={isSpeaking} level={level} />
              {glass ? (
                <span
                  className={`g-speak-ring${isSpeaking ? " is-active" : ""}`}
                  style={{ "--speak-level": (isSpeaking ? level : 0).toFixed(3) }}
                  aria-hidden="true"
                />
              ) : null}
              <Avatar
                name={displayName}
                size={avatarSize}
                user={user}
                imageUrl={avatarUrl}
                animate="speaking"
                isSpeaking={isSpeaking}
              />
              {/* No presence-flare here, flare glow skews the avatar ring on call tiles. */}
              <StatusBadge status={presenceStatus} />
            </div>
          </div>
          {!small && (
            <div className="participant-tile-identity">
              <span className="participant-tile-identity-name">
                <NameEffectText user={user}>{displayName}</NameEffectText>
              </span>
              <AdminBadge user={user} variant="chip" />
              <ParticipantStateIcons
                muted={muted}
                deafened={deafened}
                cameraOff={!mosaicChip && cameraOn === false}
              />
            </div>
          )}
        </div>
      )}
      {mosaicChip && cameraOn === false && (
        <span className="gd-mosaic-cam" title={t("Camera off")} aria-label={t("Camera off")}>
          <VideoOff size={14} />
        </span>
      )}

      {!showVideo && glass && !small && (
        <div className="participant-tile-label">
          {isSpeaking ? <span className="speaking-dot" /> : null}
          <span className="participant-tile-name">
            <NameEffectText user={user}>{displayName}</NameEffectText>
          </span>
          <AdminBadge user={user} variant="inline" />
          {muted && <MicOff size={14} aria-label={t("Muted")} title={t("Muted")} />}
          {deafened && <HeadphoneOff size={14} aria-label={t("Deafened")} title={t("Deafened")} />}
          {isLocal && cameraOn === false && muted && <VideoOff size={14} aria-label={t("Camera off")} title={t("Camera off")} />}
        </div>
      )}
      {glass && !small && (muted || (isLocal && cameraOn === false)) && (
        <div className={`g-call-corner${muted ? " is-mic" : " is-cam"}`} aria-hidden>
          {muted ? <MicOff size={14} /> : <VideoOff size={14} />}
        </div>
      )}
      {showVideo && (
        <div className="participant-tile-label">
          <span className="speaking-dot" />
          <span className="participant-tile-name">
            <NameEffectText user={user}>{displayName}</NameEffectText>
          </span>
          {muted && <MicOff size={14} aria-label={t("Muted")} title={t("Muted")} />}
          {deafened && <HeadphoneOff size={14} aria-label={t("Deafened")} title={t("Deafened")} />}
          {cameraOn === false && <VideoOff size={14} aria-label={t("Camera off")} title={t("Camera off")} />}
          {!isLocal && (connectionQuality === "poor" || connectionQuality === "fair") && (
            <span
              className={`participant-tile-net-badge ${connectionQuality}`}
              aria-label={t(networkQualityTooltipKey(connectionQuality) || "Weak connection")}
              title={t(networkQualityTooltipKey(connectionQuality) || "Weak connection")}
            />
          )}
        </div>
      )}
      {!showVideo && small && (muted || deafened || cameraOn === false) && (
        <div className="participant-tile-avatar-status">
          <ParticipantStateIcons
            muted={muted}
            deafened={deafened}
            cameraOff={cameraOn === false}
            size={11}
            className="is-compact"
          />
        </div>
      )}
      {isLocal ? null : <ReconnectOverlay show={reconnecting} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   ParticipantGrid, adaptive grid layout when no screen share
   ───────────────────────────────────────────────────────────────── */
function LocalVideoTile({ isDm, call, groupCall, hasVideo, username, avatarUrl, user = null, levelProbe = null }) {
  const localStream = isDm ? call?.localStream : groupCall?.localStream;

  const videoCallbackRef = useCallback((el) => {
    if (!el) return;
    // Register with hook so toggleCamera / setLocalVideo can drive it
    if (!isDm && groupCall?.setLocalVideo) groupCall.setLocalVideo(el);
    // Attach stream if already available
    if (localStream && el.srcObject !== localStream) {
      el.srcObject = localStream;
      el.play().catch(() => {});
    }
  }, [isDm, groupCall, localStream]);

  // Re-attach when stream changes (e.g. camera toggled on mid-call)
  useEffect(() => {
    const ref = isDm ? call?.localVideoRef : groupCall?.localVideoRef;
    if (!ref?.current || !localStream) return;
    if (ref.current.srcObject !== localStream) {
      ref.current.srcObject = localStream;
      ref.current.play().catch(() => {});
    }
  }, [localStream, isDm, call, groupCall]);

  return (
    <ParticipantTile
      username={username}
      avatarUrl={avatarUrl}
      user={user}
      videoRef={hasVideo ? videoCallbackRef : null}
      hasVideo={hasVideo}
      isLocal
      stream={localStream}
      muted={Boolean(isDm ? call?.muted : groupCall?.isMuted)}
      deafened={Boolean(isDm ? call?.deafened : groupCall?.deafened)}
      cameraOn={Boolean(isDm ? call?.cameraOn : groupCall?.isCameraOn)}
      levelProbe={levelProbe}
    />
  );
}

function CallRingingTile({ user, label }) {
  const t = useT();
  const displayName = resolveDisplayName(user) || user?.username || t("User");
  return (
    <div className="call-ring-tile participant-tile" role="status" aria-label={label}>
      <div className="participant-tile-avatar-stack">
        <div className="participant-tile-avatar-shell call-ring-shell">
          <span className="call-ring-pulse" aria-hidden="true" />
          <span className="call-ring-pulse is-late" aria-hidden="true" />
          <div className="participant-tile-avatar-core" style={{ width: 96, height: 96 }}>
            <Avatar
              name={displayName}
              size={96}
              user={user}
              imageUrl={resolveAvatarUrl(user)}
              animate="never"
            />
          </div>
        </div>
        <div className="participant-tile-identity">
          <span className="participant-tile-identity-name">
            <NameEffectText user={user}>{displayName}</NameEffectText>
          </span>
          <AdminBadge user={user} variant="chip" />
          <span className="call-ring-status">
            <span className="call-ring-dot" aria-hidden="true" />
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Grid cell with the join / leave transition. Grid cells must keep
 * `transform: none` (call-grid.css — a share-strip animation must never
 * leave a tile translated), so the cell itself only fades + blurs and the
 * inner wrapper does the scale. Re-flow of the remaining tiles is a CSS
 * flex-basis transition (no framer projection on the grid).
 */
function TileMotion({ children }) {
  const reduceMotion = useReducedMotion();
  const m = tileMotion({ reduced: Boolean(reduceMotion) });
  return (
    <motion.div
      className="call-tile-cell"
      initial="enter"
      animate="shown"
      exit="leave"
      variants={m.cell}
      style={{ minWidth: 0, minHeight: 0, position: "relative", overflow: "visible" }}
    >
      <motion.div className="call-tile-cell-inner" variants={m.inner}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function ParticipantGrid({ isDm, call, groupCall, remoteParticipants, hasLocalVideo, cameraOn, callType, peer, mode, title, subtitle, formattedDuration, localUsername, localAvatarUrl, localUser = null, onOpenUserMenu }) {
  const t = useT();
  const glass = useGlassUi();
  const dmRemote = useDmRemoteParticipant({
    peer: isDm ? call?.peer : null,
    mode: isDm ? call?.mode : null,
    remoteMediaReady: isDm ? call?.remoteMediaReady : false,
    peerConnectionState: isDm ? call?.peerConnectionState : "idle",
    connectionQuality: isDm ? call?.connectionQuality : "unknown",
    ending: isDm ? call?.ending || null : null,
  });

  const remoteTiles = remoteParticipants.map((p) => {
    const live = streamHasLiveVideo(p.stream) || Boolean(p.hasVideo) || Boolean(p.isCameraOn);
    return {
      id: p.id,
      username: p.username || t("Member"),
      avatarUrl: p.avatarUrl || resolveAvatarUrl(p),
      user: p,
      stream: p.stream || null,
      hasVideo: p.isCameraOn !== false && live,
      muted: Boolean(p.isMuted),
      deafened: Boolean(p.isDeafened),
      cameraOn: p.isCameraOn,
      connectionQuality: p.connectionQuality || null,
      reconnecting: groupTileTroubled(p),
    };
  });

  // A call's requested type is not evidence that the peer has a camera track.
  // Screen media is rendered only by ScreenShareLayout, never as a camera tile.
  const dmRemoteHasVideo = streamHasLiveVideo(call?.remoteStream);
  const ringing = isDm && mode === "outgoing" && !dmRemote.showSlot && Boolean(call?.peer);
  const plan = planCallGrid({
    isDm,
    remoteSlot: Boolean(isDm && dmRemote.showSlot),
    remoteCount: isDm ? 0 : remoteTiles.length,
    ringing,
  });
  const ringLabel = plan.ringing
    ? t(dmRingingLabelKey({
      connectionQuality: call?.connectionQuality,
      calleeAnswering: call?.calleeAnswering,
    }))
    : "";

  return (
    <div
      className={`call-participant-grid${glass ? " g-call-grid" : ""}${isDm ? " is-dm" : " is-group"} ${plan.bucket}${plan.ringing ? " is-ringing" : ""}`}
      style={{
        flex: 1,
        minHeight: 0,
        height: "100%",
        width: "100%",
      }}
    >
      <div style={{ minWidth: 0, minHeight: 0, overflow: "visible" }}>
        <LocalVideoTile
          isDm={isDm}
          call={call}
          groupCall={groupCall}
          hasVideo={hasLocalVideo}
          username={localUsername}
          avatarUrl={localAvatarUrl}
          user={localUser}
          levelProbe={isDm ? call?.getLocalAudioLevel : null}
        />
      </div>

      {plan.ringing && (
        <div
          key="dm-ringing"
          style={{ minWidth: 0, minHeight: 0, overflow: "visible" }}
        >
          <CallRingingTile user={call.peer} label={ringLabel} />
        </div>
      )}

      <AnimatePresence initial={false}>
      {isDm && dmRemote.showSlot && (
        <TileMotion key={`dm-remote-${dmRemote.displayPeer?.id || "peer"}`}>
          <SpeakingRemoteSlot
            displayPeer={dmRemote.displayPeer}
            phase={dmRemote.phase}
            connectionStatus={dmRemote.connectionStatus}
            isMediaReady={dmRemote.isMediaReady}
            hasVideo={dmRemoteHasVideo}
            videoRef={call?.remoteVideoRef}
            remoteStream={call?.remoteStream}
            isMuted={Boolean(call?.remoteMuted)}
            isDeafened={Boolean(call?.remoteDeafened)}
            cameraOn={call?.remoteCameraOn}
            onContextMenu={(event) => onOpenUserMenu?.(event, call?.peer, Boolean(call?.remoteScreenSharing))}
            levelProbe={call?.getRemoteAudioLevel}
          />
        </TileMotion>
      )}

      {!isDm && remoteTiles.map((tile) => (
        <TileMotion key={tile.id}>
          <ParticipantTile
            username={tile.username}
            avatarUrl={tile.avatarUrl}
            user={tile.user}
            videoRef={null}
            stream={tile.stream}
            hasVideo={tile.hasVideo}
            isLocal={false}
            muted={tile.muted}
            deafened={tile.deafened}
            cameraOn={tile.cameraOn}
            connectionQuality={tile.connectionQuality}
            reconnecting={tile.reconnecting}
            onContextMenu={(event) => onOpenUserMenu?.(event, tile.user, Boolean(tile.user?.isScreenSharing || tile.user?.screenStream))}
          />
        </TileMotion>
      ))}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   ScreenShareLayout, selected screen large on top, strip below
   ───────────────────────────────────────────────────────────────── */
function ScreenShareLayout({ allScreenSharers, screenExpanded, setScreenExpanded, isDm, call, groupCall, remoteParticipants, hasLocalVideo, cameraOn, localUsername, localAvatarUrl, localUser = null, narrow = false, screenShareVolume = 100, onScreenShareVolumeChange, screenVolumes = {}, onScreenVolumeForSharer, onOpenUserMenu }) {
  const t = useT();
  const glassDesktop = useGlassDesktop();
  const mosaic = glassDesktop && !isDm;
  const [activeSharerId, setActiveSharerId] = useState(null);
  const [pinnedSharerId, setPinnedSharerId] = useState(null);
  const [shareLayout, setShareLayout] = useState("stage");
  const [viewerCount] = useState(0);
  // Keep refs to both the normal and expanded video elements so we can set srcObject on each
  const normalVideoRef = useRef(null);
  const expandedVideoRef = useRef(null);
  const prevSharerIdsRef = useRef([]);
  const [aspectKey, setAspectKey] = useState("0x0");
  const sharerKey = allScreenSharers.map((sharer) => String(sharer.id)).join("|");

  // A new share takes the stage unless one is pinned. A share that stops
  // releases its pin and falls back to a share that is still live.
  useEffect(() => {
    const ids = sharerKey ? sharerKey.split("|") : [];
    const next = nextShareSelection({
      ids,
      activeId: activeSharerId,
      pinnedId: pinnedSharerId,
      previousIds: prevSharerIdsRef.current,
    });
    prevSharerIdsRef.current = ids;
    if (next.activeId !== (activeSharerId == null ? null : String(activeSharerId))) {
      setActiveSharerId(next.activeId);
    }
    if (next.pinnedId !== (pinnedSharerId == null ? null : String(pinnedSharerId))) {
      setPinnedSharerId(next.pinnedId);
    }
    if (!ids.length && shareLayout !== "stage") setShareLayout("stage");
  }, [sharerKey, activeSharerId, pinnedSharerId, shareLayout]);

  const activeSharer = allScreenSharers.find((sharer) => String(sharer.id) === String(activeSharerId))
    ?? allScreenSharers[0];
  const filmSharers = allScreenSharers.map((sharer) => ({
    ...sharer,
    label: sharer.isLocal ? t("Your Screen") : (sharer.username || ""),
    stream: sharer.isLocal
      ? (isDm ? call?.screenStream : groupCall?.screenStream)
      : sharer.stream,
  }));

  // Derive the stream to display for the active sharer
  const screenStream = activeSharer?.isLocal
    ? (isDm ? call?.screenStream : groupCall?.screenStream)
    : (activeSharer?.stream ?? null);

  const liveAspect = isDm ? call?.screenShareAspect : groupCall?.screenShareAspect;

  // Remount video when capture rotates (portrait → landscape) so layout/object-fit refresh
  useEffect(() => {
    const track = screenStream?.getVideoTracks?.()[0];
    const settings = track?.getSettings?.() || {};
    const w = liveAspect?.width || settings.width || 0;
    const h = liveAspect?.height || settings.height || 0;
    if (w && h) setAspectKey(`${w}x${h}`);
  }, [screenStream, liveAspect?.width, liveAspect?.height]);

  const attachStream = useCallback((el, stream) => {
    if (!el) return;
    // Video elements are always muted, dedicated <audio> owns screen sound
    // (avoids mid-call autoplay blocks that silently drop tab/system audio).
    el.muted = true;
    if (!stream) {
      if (el.srcObject) el.srcObject = null;
      return;
    }
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    const videoTracks = stream.getVideoTracks();
    const playWhenReady = () => el.play().catch(() => {});
    if (videoTracks.some((t) => t.muted || t.readyState !== "live")) {
      videoTracks.forEach((t) => {
        const prev = t.onunmute;
        t.onunmute = (ev) => {
          try {
            if (typeof prev === "function") prev.call(t, ev);
          } catch {
            /* ignore */
          }
          playWhenReady();
        };
      });
    }
    playWhenReady();
  }, []);

  // Screen/tab audio plays via CallOverlay's always-mounted RemoteScreenAudioSink
  // (survives minimize). Video stays muted here.

  // Re-attach via callback ref so remounts from key=sharerId always bind the stream
  const normalVideoCallbackRef = useCallback((el) => {
    normalVideoRef.current = el;
    if (el) attachStream(el, screenStream);
  }, [screenStream, attachStream]);

  // Callback ref for expanded video, fires immediately when the element mounts
  const expandedVideoCallbackRef = useCallback((el) => {
    expandedVideoRef.current = el;
    if (el) attachStream(el, screenStream);
  }, [screenStream, attachStream]);

  const sharerLabel = activeSharer
    ? (mosaic
      ? (activeSharer.isLocal ? localUsername : (activeSharer.username || ""))
      : (activeSharer.isLocal ? t("Your Screen") : t("{name}'s Screen", { name: activeSharer.username })))
    : "";

  // Strip tiles: all participants + local self
  const stripTiles = [
    {
      id: "local",
      username: localUsername,
      isLocal: true,
      hasVideo: hasLocalVideo,
      avatarUrl: localAvatarUrl,
      user: localUser,
      stream: isDm ? call?.localStream : groupCall?.localStream,
      muted: Boolean(isDm ? call?.muted : groupCall?.isMuted),
      deafened: Boolean(isDm ? call?.deafened : groupCall?.deafened),
      cameraOn: Boolean(isDm ? call?.cameraOn : groupCall?.isCameraOn),
    },
    ...remoteParticipants.map((p) => ({
      id: p.id,
      username: p.username,
      avatarUrl: p.avatarUrl,
      user: p,
      isLocal: false,
      hasVideo: streamHasLiveVideo(p.stream) || Boolean(p.hasVideo) || Boolean(p.isCameraOn),
      stream: p.stream || null,
      muted: Boolean(p.isMuted),
      deafened: Boolean(p.isDeafened),
      cameraOn: p.isCameraOn,
    })),
  ];

  const stripH = narrow ? 72 : 110;
  const tileW = narrow ? 112 : 160;
  const tileH = narrow ? 64 : 100;
  const mosaicSharerId = mosaic && activeSharer && !activeSharer.isLocal ? String(activeSharer.id) : null;
  const visibleStrip = mosaicSharerId
    ? stripTiles.filter((tile) => String(tile.id) !== mosaicSharerId)
    : stripTiles;

  if (mosaic && shareLayout !== "grid") {
    const mosaicPeople = [
      ...visibleStrip.filter((tile) => !tile.isLocal),
      ...visibleStrip.filter((tile) => tile.isLocal),
    ];
    const shape = groupMosaicShape(1 + mosaicPeople.length);
    return (
      <div className="gd-mosaic-frame">
        <div
          className={`call-screen-share-layout gd-group-mosaic${shape.rows > 4 ? " is-scroll" : ""}`}
          style={{ "--gd-cols": shape.cols, "--gd-rows": shape.rows }}
        >
          <div
            className="gd-mosaic-cell gd-mosaic-screen"
            onClick={() => setScreenExpanded((v) => !v)}
          >
            <video
              key={`${activeSharer?.id || "none"}-${aspectKey}`}
              ref={normalVideoCallbackRef}
              autoPlay
              playsInline
              muted
            />
            {!screenStream && (
              <div className="gd-mosaic-wait">{t("Waiting for screen…")}</div>
            )}
            <div className="gd-share-label" onClick={(e) => e.stopPropagation()}>
              <span className="speaking-dot" />
              <span className="gd-share-name">{sharerLabel}</span>
            </div>
            {screenExpanded && (
              <div
                className="gd-mosaic-expand"
                onClick={(e) => { e.stopPropagation(); setScreenExpanded(false); }}
              >
                <video
                  key={`exp-${activeSharer?.id || "none"}-${aspectKey}`}
                  ref={expandedVideoCallbackRef}
                  autoPlay
                  playsInline
                  muted
                />
              </div>
            )}
          </div>
          {mosaicPeople.map((tile) => {
            const videoRef = tile.isLocal
              ? (isDm ? call?.localVideoRef : groupCall?.localVideoRef)
              : null;
            return (
              <div key={tile.id} className="gd-mosaic-cell">
                <ParticipantTile
                  username={tile.username}
                  avatarUrl={tile.avatarUrl}
                  user={tile.user}
                  isSpeaking={tile.isSpeaking}
                  videoRef={tile.hasVideo ? videoRef : null}
                  stream={tile.stream}
                  hasVideo={tile.hasVideo}
                  isLocal={tile.isLocal}
                  muted={tile.muted}
                  deafened={tile.deafened}
                  cameraOn={tile.cameraOn}
                  mosaicChip
                  onContextMenu={
                    tile.isLocal
                      ? undefined
                      : (event) => onOpenUserMenu?.(event, tile.user, Boolean(tile.user?.isScreenSharing || tile.user?.screenStream))
                  }
                />
              </div>
            );
          })}
        </div>
        <ShareFilmstrip
          sharers={filmSharers}
          activeId={activeSharer?.id}
          pinnedId={pinnedSharerId}
          layout={shareLayout}
          onSelect={(id) => setActiveSharerId(id)}
          onTogglePin={(id) => {
            setPinnedSharerId((current) => (String(current) === String(id) ? null : id));
            setActiveSharerId(id);
          }}
          onToggleLayout={() => setShareLayout("grid")}
        />
      </div>
    );
  }

  const showGrid = shareLayout === "grid" && filmSharers.length > 1;

  return (
    <div
      className="call-screen-share-layout"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: narrow ? 6 : 8,
        padding: narrow ? "2px 8px 0" : "4px 12px",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Main screen share area ── */}
      {showGrid ? (
        <div className={`share-stage-grid is-n${Math.min(filmSharers.length, 6)}`}>
          {filmSharers.map((sharer) => (
            <button
              key={sharer.id}
              type="button"
              className={`share-grid-cell${String(sharer.id) === String(activeSharer?.id) ? " is-active" : ""}`}
              onClick={() => {
                setActiveSharerId(sharer.id);
                setShareLayout("stage");
              }}
            >
              <ShareGridVideo stream={sharer.stream} />
              <span className="share-film-live">{t("Live")}</span>
              <span className="share-film-name">{sharer.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div
        style={{
          flex: showGrid ? "0 0 0" : "1 1 auto",
          display: showGrid ? "none" : "block",
          position: "relative",
          borderRadius: narrow ? 12 : 14,
          overflow: "hidden",
          background: "#000",
          cursor: "pointer",
          minHeight: 0,
        }}
        onClick={() => setScreenExpanded((v) => !v)}
      >
        {/* key remounts on sharer change OR orientation flip (portrait↔landscape) */}
        <video
          key={`${activeSharer?.id || "none"}-${aspectKey}`}
          ref={normalVideoCallbackRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            // Promote to compositor layer, reduces paint jank on remote screen share
            transform: "translateZ(0)",
            willChange: "contents",
          }}
        />

        {!screenStream && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#b5bac1",
              fontSize: 14,
              pointerEvents: "none",
            }}
          >
            {t("Waiting for screen…")}
          </div>
        )}

        {/* Sharer name label, top-left */}
        <div
          className="gd-share-label"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(6px)",
            borderRadius: 8,
            padding: "6px 12px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {mosaic ? <span className="speaking-dot" /> : <Monitor size={13} color="#3ba55d" />}
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{sharerLabel}</span>
          {viewerCount > 0 && (
            <span style={{ fontSize: 11, color: "#b5bac1", marginLeft: 4 }}>
              <Users size={11} style={{ display: "inline", marginRight: 3 }} />
              {viewerCount} watching
            </span>
          )}
        </div>

        {!activeSharer?.isLocal && (
          <div
            className="gd-share-volume g-vol-chip gd-mosaic-chrome"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <GlassVolumeSlider
              compact
              narrow={narrow}
              min={0}
              max={200}
              step={1}
              value={screenVolumes?.[String(activeSharer?.id)] ?? screenShareVolume}
              label={t("Screen share volume")}
              onChange={(value) => {
                if (activeSharer?.id != null) onScreenVolumeForSharer?.(activeSharer.id, value);
                onScreenShareVolumeChange?.(value);
              }}
            />
          </div>
        )}

        {/* Expand/collapse hint, bottom-center */}
        <div
          className="gd-mosaic-chrome"
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            color: "#b5bac1",
            fontSize: 12,
            padding: "4px 12px",
            borderRadius: 6,
            pointerEvents: "none",
          }}
        >
          {screenExpanded ? t("Click to shrink") : t("Click to expand")}
        </div>

        {/* Expanded fullscreen overlay */}
        {screenExpanded && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "#000",
              cursor: "pointer",
            }}
            onClick={(e) => { e.stopPropagation(); setScreenExpanded(false); }}
          >
            <video
              key={`exp-${activeSharer?.id || "none"}-${aspectKey}`}
              ref={expandedVideoCallbackRef}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                transform: "translateZ(0)",
                willChange: "contents",
              }}
            />
            <div style={{ position: "absolute", top: "calc(16px + env(safe-area-inset-top, 0px))", left: "calc(16px + env(safe-area-inset-left, 0px))", display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.7)", borderRadius: 8, padding: "6px 14px" }}>
              <Monitor size={14} color="#3ba55d" />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{sharerLabel}</span>
            </div>
            <div style={{ position: "absolute", bottom: "calc(20px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.6)", color: "#b5bac1", fontSize: 12, padding: "5px 14px", borderRadius: 6 }}>
              {t("Click anywhere to exit fullscreen")}
            </div>
          </div>
        )}
      </div>

      <ShareFilmstrip
        sharers={filmSharers}
        activeId={activeSharer?.id}
        pinnedId={pinnedSharerId}
        layout={shareLayout}
        onSelect={(id) => {
          setActiveSharerId(id);
          if (shareLayout === "grid") setShareLayout("stage");
        }}
        onTogglePin={(id) => {
          setPinnedSharerId((current) => (String(current) === String(id) ? null : id));
          setActiveSharerId(id);
        }}
        onToggleLayout={() => setShareLayout((current) => (current === "grid" ? "stage" : "grid"))}
      />

      {/* ── Bottom participant strip ── */}
      <div
        className="call-screen-share-strip"
        style={{
          height: stripH,
          display: "flex",
          gap: 8,
          overflowX: "auto",
          overflowY: "hidden",
          flexShrink: 0,
          padding: "2px 0 4px",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {visibleStrip.map((tile) => {
          const videoRef = tile.isLocal
            ? (isDm ? call?.localVideoRef : groupCall?.localVideoRef)
            : null;
          return (
            <div key={tile.id} style={{ width: tileW, height: tileH, flexShrink: 0 }}>
              <ParticipantTile
                username={tile.username}
                avatarUrl={tile.avatarUrl}
                user={tile.user}
                isSpeaking={tile.isSpeaking}
                videoRef={tile.hasVideo ? videoRef : null}
                stream={tile.stream}
                hasVideo={tile.hasVideo}
                isLocal={tile.isLocal}
                muted={tile.muted}
                deafened={tile.deafened}
                cameraOn={tile.cameraOn}
                small={!mosaic}
                onContextMenu={
                  tile.isLocal
                    ? undefined
                    : (event) => onOpenUserMenu?.(event, tile.user, Boolean(tile.user?.isScreenSharing || tile.user?.screenStream))
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function CircleBtn({ children, color = "#3c4043", size = 52, onClick, title, className }) {
  const off = String(color).toLowerCase() === "#ed4245" && !String(className || "").includes("is-end");
  const on = String(color).toLowerCase() === "#3ba55d";
  const gdClass = ["gd-call-btn", off ? "is-off" : "", on ? "is-on" : "", className].filter(Boolean).join(" ");
  return (
    <button
      className={gdClass}
      onClick={onClick}
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        cursor: "pointer",
        transition: "transform 0.15s, opacity 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

function TopIconBtn({ children, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)",
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function PersonRow({ name, avatarUrl, isHost }) {
  const t = useT();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
      }}
    >
      <Avatar name={name} size={36} imageUrl={avatarUrl} animate="hover" />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{name}</span>
        {isHost && <span style={{ fontSize: 11, color: "#b5bac1" }}>{t("Host")}</span>}
      </div>
    </div>
  );
}

function MoreMenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        background: "none",
        border: "none",
        color: danger ? "#ed4245" : "#e3e5e8",
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "rgba(237,66,69,0.12)" : "rgba(255,255,255,0.07)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
    >
      <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

/** Screenshot-only stage (window.__DESCALL_SHOT_CALL). Never set in production. */
function GlassCallShot({ kind }) {
  const t = useT();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("g-in-call");
    return () => root.classList.remove("g-in-call");
  }, []);
  if (kind === "incoming" || kind === "group-incoming") {
    return (
      <IncomingCallCard
        username="Mert K."
        callType={kind === "video-incoming" ? "video" : "voice"}
        isGroup={kind === "group-incoming"}
        subtitle={kind === "group-incoming" ? t("Group call") : undefined}
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );
  }
  const group = kind === "group";
  const longName = kind === "dm-long";
  const tiles = group
    ? [
        { name: "Ayşe", letter: "A", speaking: true },
        { name: "Mert K.", letter: "M" },
        { name: "Elif", letter: "E", camOff: true },
        { name: t("You"), letter: "D", corner: "video" },
      ]
    : [
        { name: t("You"), letter: "D" },
        { name: "Ayşe Yılmaz", letter: "A", speaking: true },
      ];
  return (
    <div className={`call-overlay-root g-call${group ? " is-group" : " is-dm"}`} data-call-overlay="true" style={{ position: "fixed", inset: 0, zIndex: 9998, display: "flex", flexDirection: "column" }}>
      <div className="g-call-head">
        <button type="button" className="g-cbtn g-glass" aria-label={t("Minimize")}>
          <ChevronDown size={22} strokeWidth={1.9} />
        </button>
        <div className="g-call-title g-glass">
          <div className="g-call-title-text">
            <div className="g-call-name">
              <span className="g-call-name-text">{group ? "Akşam Ekibi" : longName ? "Ayşe Nur Karadenizlioğlu" : "Ayşe Yılmaz"}</span>
              {longName ? <AdminBadge user={{ is_admin: true, isAdmin: true, role: "admin" }} variant="inline" /> : null}
            </div>
            <div className="g-call-sub">{group ? "Grup araması · 4 katılımcı · 12:08" : "04:12 · Sesli arama"}</div>
          </div>
          <div className="call-quality-hud excellent" aria-hidden>
            <div className="call-quality-bars">
              <span className="on" style={{ height: 5 }} />
              <span className="on" style={{ height: 8 }} />
              <span className="on" style={{ height: 11 }} />
              <span className="on" style={{ height: 14 }} />
            </div>
          </div>
          {group ? (
            <button type="button" className="g-cbtn g-glass g-call-people" aria-label={t("Show participants")}>
              <Users size={18} strokeWidth={1.9} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="call-main-stage" style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div className={`call-participant-grid g-call-grid${group ? " is-group is-n4" : " is-dm is-n2"}`} style={{ flex: 1, minHeight: 0, height: "100%", width: "100%" }}>
          {tiles.map((tile) => (
            <div key={tile.name} className={`participant-tile participant-tile--avatar-only${tile.speaking ? " is-speaking" : ""}`}>
              {tile.speaking && !group ? (
                <div className="g-call-qchip">
                  <span className="call-quality-bars" aria-hidden="true">
                    <span className="on" style={{ height: 5 }} />
                    <span className="on" style={{ height: 8 }} />
                    <span className="on" style={{ height: 11 }} />
                    <span className="on" style={{ height: 14 }} />
                  </span>
                  Mükemmel
                </div>
              ) : null}
              {tile.corner ? <div className={`g-call-corner${tile.corner === "video" ? " is-cam" : " is-mic"}`}>{tile.corner === "video" ? <VideoOff size={14} /> : <MicOff size={14} />}</div> : null}
              <div className="participant-tile-avatar-stack">
                <div className="participant-tile-avatar-shell">
                  <div className="participant-tile-avatar-core" style={{ position: "relative" }}>
                    {tile.speaking ? <span className="g-speak-ring" /> : null}
                    <div className="ui-avatar letter-avatar" style={{ borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", fontWeight: 650 }}><span className="ui-avatar-letter">{tile.letter}</span></div>
                  </div>
                </div>
              </div>
              <div className="participant-tile-label">
                {tile.speaking ? <span className="speaking-dot" /> : null}
                <span className="participant-tile-name">{tile.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="call-control-bar g-call-ctrl g-glass">
        <button type="button" className="g-cb" aria-label={t("Mute")}><Mic size={23} /></button>
        <button type="button" className="g-cb" aria-label={t("Deafen")}><Headphones size={23} /></button>
        <button type="button" className="g-cb" aria-label={t("Turn on camera")}><Video size={23} /></button>
        <button type="button" className="g-cb" aria-label={t("Present screen")}><Monitor size={23} /><span className="g-qb"><SlidersHorizontal size={11} /></span></button>
        <button type="button" className="g-cb" aria-label={t("More options")}><MoreVertical size={23} /></button>
        <button type="button" className="g-cb is-end" aria-label={t("End call")}><PhoneOff size={24} /></button>
      </div>
    </div>
  );
}
