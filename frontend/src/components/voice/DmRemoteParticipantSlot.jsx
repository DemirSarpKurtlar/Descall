import { useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HeadphoneOff, Mic, MicOff, VideoOff, Wifi, WifiOff } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import AdminBadge from "../social/AdminBadge";
import { BadgeIcon, NameEffectText } from "../ui/Cosmetics";
import { resolveAvatarUrl } from "../../lib/avatar";
import { resolveDisplayName } from "../../lib/userProfile";
import {
  deriveDmConnectionStatus,
  getConnectionStatusLabel,
} from "../../hooks/useDmRemoteParticipant";
import { useT } from "../../context/LocaleContext";
import { dmChipStatus } from "../../lib/callTileState";
import useHeldSpeaking from "../../hooks/useHeldSpeaking";
import SpeakingRings from "./SpeakingRings";
import ParticipantStateIcons from "./ParticipantStateIcons";
import useGlassUi from "../../hooks/useGlassUi";
import { useVideoPresence } from "../../hooks/useVideoPresence";

const PARTICIPANT_EASE = [0.16, 1, 0.3, 1];

function ConnectionBadge({ status }) {
  const t = useT();
  const labelRaw = getConnectionStatusLabel(status);
  const label = labelRaw ? t(labelRaw) : labelRaw;
  if (!label) return null;

  const isReconnecting = status === "reconnecting" || status === "connecting";
  const isDisconnected = status === "disconnected";

  return (
    <div
      className={`call-conn-chip${isReconnecting ? " is-reconnecting" : isDisconnected ? " is-disconnected" : " is-connected"}`}
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 20,
        // Frosted glass chip; the tint carries the state.
        backdropFilter: "blur(12px) saturate(140%)",
        WebkitBackdropFilter: "blur(12px) saturate(140%)",
        boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.18), inset 0 0 0 0.5px rgba(255,255,255,0.08)",
        background: isDisconnected
          ? "rgba(237,66,69,0.2)"
          : isReconnecting
          ? "rgba(240,178,50,0.18)"
          : "rgba(59,165,93,0.18)",
        color: isDisconnected ? "#ed4245" : isReconnecting ? "#f0b232" : "#3ba55d",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.01em",
      }}
    >
      {isDisconnected ? <WifiOff size={11} /> : isReconnecting ? <span className="call-conn-chip-spinner" aria-hidden="true" /> : <Wifi size={11} />}
      {label}
    </div>
  );
}

function ConnectingPlaceholder({ username, user, status }) {
  const t = useT();
  const displayName = resolveDisplayName(user) || username || t("Participant");
  const avatarSize = 96;
  const shellPad = Math.round(avatarSize * 0.2);
  const shellSize = avatarSize + shellPad * 2;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: PARTICIPANT_EASE }}
      className="dm-remote-connecting participant-tile--avatar-only"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        minWidth: 0,
        minHeight: 0,
        width: "100%",
        height: "100%",
        willChange: "transform, opacity",
        overflow: "visible",
      }}
    >
      <motion.div
        className="participant-tile-avatar-shell"
        style={{ width: shellSize, height: shellSize }}
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      >
        <div className="participant-tile-avatar-core" style={{ width: avatarSize, height: avatarSize }}>
          <Avatar
            name={displayName}
            size={avatarSize}
            user={user}
            imageUrl={resolveAvatarUrl(user)}
            animate="speaking"
            isSpeaking={false}
          />
        </div>
      </motion.div>
      <div className="participant-tile-identity">
        <span className="participant-tile-identity-name">
          <NameEffectText user={user}>{displayName}</NameEffectText>
          <BadgeIcon user={user} />
        </span>
        <AdminBadge user={user} variant="chip" />
        <ConnectionBadge status={status || "connecting"} />
      </div>
    </motion.div>
  );
}

/**
 * Calm "Yeniden bağlanıyor…" layer: the tile underneath stays mounted and
 * is only dimmed / blurred (CSS .is-reconnecting), with a small spinner.
 * Shown after the debounced status says the link is really in trouble.
 */
export function ReconnectOverlay({ show }) {
  const t = useT();
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="reconnect"
          className="call-reconnect-overlay"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: PARTICIPANT_EASE }}
        >
          <span className="call-reconnect-spinner" aria-hidden="true" />
          <span className="call-reconnect-label">{t("Reconnecting…")}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function DmRemoteParticipantSlot({
  displayPeer,
  phase,
  connectionStatus,
  isMediaReady,
  hasVideo,
  videoRef,
  remoteStream,
  isSpeaking: speakingRaw = false,
  level = 0,
  onTile = null,
  isMuted = false,
  isDeafened = false,
  cameraOn = true,
  onContextMenu,
}) {
  const t = useT();
  const glass = useGlassUi();
  // Hold the off-edge so VAD flapping can't blink the ring between words.
  const heldSpeaking = useHeldSpeaking(speakingRaw && !isMuted);
  const isSpeaking = isMuted ? false : heldSpeaking;
  const speakLevel = isSpeaking ? Math.max(0, Math.min(1, Number(level) || 0)) : 0;
  const user = displayPeer;
  const username = resolveDisplayName(displayPeer) || displayPeer?.username || t("User");

  const remoteVideoCallbackRef = useCallback(
    (el) => {
      if (!videoRef) return;
      videoRef.current = el;
      if (el && remoteStream) {
        el.muted = true;
        if (el.srcObject !== remoteStream) el.srcObject = remoteStream;
        el.play().catch(() => {});
      }
    },
    [videoRef, remoteStream]
  );

  // Camera off (signaled, or the remote track went muted / ended) returns
  // the tile to the avatar; the <video> stays mounted so camera on again
  // fades straight back in (lib/videoPresence.js).
  const presence = useVideoPresence(remoteStream, { cameraOn });
  const mountVideo = Boolean(hasVideo && videoRef && presence.mount);
  const showVideo = Boolean(mountVideo && presence.show);

  useEffect(() => {
    const el = videoRef?.current;
    if (!el || !remoteStream || !mountVideo) return;
    el.muted = true;
    if (el.srcObject !== remoteStream) el.srcObject = remoteStream;
    if (showVideo) el.play().catch(() => {});
  }, [remoteStream, mountVideo, showVideo, videoRef]);

  const reconnecting = phase === "reconnecting";
  const live = Boolean(isMediaReady);
  const avatarOnly = !(live && showVideo);

  // ONE element per peer for the whole call (key = peer id in the grid).
  // Connecting → live swaps only the inside; reconnecting is an overlay on
  // top of the live tile, so video / avatar never remount during ICE blips.
  return (
    <div
      ref={onTile}
      className={`participant-tile dm-remote-tile${isSpeaking && !reconnecting ? " is-speaking" : ""}${
        avatarOnly ? " participant-tile--avatar-only" : ""
      }${reconnecting ? " is-reconnecting" : ""}`}
      data-phase={phase}
      style={{ position: "relative", width: "100%", height: "100%" }}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu?.(event);
      }}
    >
      {!live ? (
        <ConnectingPlaceholder
          username={username}
          user={user}
          status={connectionStatus || "connecting"}
        />
      ) : (
        <div className="dm-remote-tile-media" style={{ display: "contents" }}>
          {mountVideo ? (
            <video
              ref={remoteVideoCallbackRef}
              autoPlay
              playsInline
              muted
              className={`tile-video-layer${showVideo ? " is-shown" : ""}`}
              aria-hidden={showVideo ? undefined : "true"}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : null}
          {showVideo ? null : (
            <div className="participant-tile-avatar-stack tile-avatar-layer">
              <div
                className="participant-tile-avatar-shell"
                style={{ width: 96 + 38, height: 96 + 38, position: "relative" }}
              >
                <div className="participant-tile-avatar-core" style={{ width: 96, height: 96 }}>
                  {/* Always mounted, only fades; see SpeakingRings. */}
                  <SpeakingRings speaking={isSpeaking} level={speakLevel} />
                  {glass ? (
                    <span
                      className={`g-speak-ring${isSpeaking ? " is-active" : ""}`}
                      style={{ "--speak-level": speakLevel.toFixed(3) }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <Avatar
                    name={username}
                    size={96}
                    user={user}
                    imageUrl={resolveAvatarUrl(user)}
                    animate="speaking"
                    isSpeaking={isSpeaking}
                  />
                </div>
              </div>
              <div className="participant-tile-identity">
                <span className="participant-tile-identity-name">
                  <NameEffectText user={user}>{username}</NameEffectText>
                  <BadgeIcon user={user} />
                </span>
                <AdminBadge user={user} variant="chip" />
                {/* One source of truth (2.13.6): the chip follows the tile's
                    debounced phase. It used to say "Bağlandı" while a separate
                    "Yeniden bağlanıyor…" pill sat on the avatar. */}
                <ConnectionBadge status={dmChipStatus(phase, connectionStatus)} />
                <ParticipantStateIcons
                  muted={isMuted}
                  deafened={isDeafened}
                  cameraOff={cameraOn === false}
                />
              </div>
            </div>
          )}

          {showVideo && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "8px 12px",
              background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {isSpeaking && (
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#3ba55d",
                    flexShrink: 0,
                    animation: "callTilePulse 1.2s infinite",
                  }}
                />
              )}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  minWidth: 0,
                }}
              >
                <NameEffectText user={user}>{username}</NameEffectText>
                <BadgeIcon user={user} />
              </span>
            </div>
            {isMuted && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(237,66,69,0.85)",
                  flexShrink: 0,
                }}
                title={t("Muted")}
              >
                <MicOff size={12} color="#fff" />
              </span>
            )}
            {isDeafened && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(237,66,69,0.85)",
                  flexShrink: 0,
                }}
                title={t("Deafened")}
              >
                <HeadphoneOff size={12} color="#fff" />
              </span>
            )}
            {cameraOn === false && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(237,66,69,0.85)",
                  flexShrink: 0,
                }}
                title={t("Camera off")}
              >
                <VideoOff size={12} color="#fff" />
              </span>
            )}
            {!isMuted && isSpeaking && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(59,165,93,0.85)",
                  flexShrink: 0,
                }}
                title={t("Speaking")}
              >
                <Mic size={12} color="#fff" />
              </span>
            )}
          </div>
          )}
        </div>
      )}
      {/* Video tiles have no identity chip, so they keep the bottom pill;
          avatar tiles show the state in the chip under the name instead. */}
      <ReconnectOverlay show={reconnecting && live && showVideo} />
    </div>
  );
}

export { deriveDmConnectionStatus, getConnectionStatusLabel };
