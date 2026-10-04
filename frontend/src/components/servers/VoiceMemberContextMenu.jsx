import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightLeft,
  Copy,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  Radio,
  User,
  Volume2,
} from "lucide-react";
import { useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { resolveDisplayName } from "../../lib/userProfile";

export default function VoiceMemberContextMenu({
  menu,
  canMove,
  canMute,
  canDeafen = false,
  voiceChannels = [],
  serverId,
  serverVoice,
  onClose,
  voiceVolume = 100,
  onVoiceVolume,
  onToggleVoiceMute,
  showScreenVolume = false,
  screenVolume = 100,
  onScreenVolume,
  onViewProfile,
  onCopyId,
}) {
  const t = useT();
  const { toast } = useToast();
  const [moveOpen, setMoveOpen] = useState(false);

  useEffect(() => {
    if (!menu?.user) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu?.user, onClose]);

  useEffect(() => {
    if (!menu?.user) return undefined;
    const onModError = (event) => {
      const message = event?.detail?.message;
      if (message) toast(message, "error");
    };
    window.addEventListener("descall:server-voice-mod-error", onModError);
    return () => window.removeEventListener("descall:server-voice-mod-error", onModError);
  }, [menu?.user, toast]);

  if (!menu?.user) return null;
  const user = menu.user;
  const isSelf = Boolean(menu.isSelf);
  const channelId = menu.channelId;
  const currentChannel = voiceChannels.find((c) => c.id === channelId);
  const isStage = currentChannel?.type === "stage";
  const left = Math.min(menu.x || 12, (typeof window !== "undefined" ? window.innerWidth : 400) - 260);
  const top = Math.min(menu.y || 12, (typeof window !== "undefined" ? window.innerHeight : 400) - 420);
  const voiceLevel = Math.max(0, Math.min(100, Number(voiceVolume) || 0));
  const screenLevel = Math.max(0, Math.min(100, Number(screenVolume) || 0));
  // Per-listener volume / local mute / screen volume make no sense for yourself.
  const voiceVolumeHandler = isSelf ? null : onVoiceVolume;
  const voiceMuteHandler = isSelf ? null : onToggleVoiceMute;
  const showScreenSlider = !isSelf && showScreenVolume;
  const hasUserActions = Boolean(voiceVolumeHandler || voiceMuteHandler || onViewProfile || onCopyId || showScreenSlider);

  const menuNode = (
    <>
      <button
        type="button"
        className="server-voice-menu-backdrop"
        aria-label={t("Close")}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />
      <div
        className="server-voice-member-menu"
        style={{ left, top }}
        role="menu"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="server-voice-member-menu-title">
          {resolveDisplayName(user) || user.username}
        </div>
        {typeof voiceVolumeHandler === "function" && (
          <label className="server-voice-menu-slider">
            <span>
              {t("Volume")}
              <b>{voiceLevel}%</b>
            </span>
            <input
              aria-label={t("Volume")}
              type="range"
              min="0"
              max="100"
              value={voiceLevel}
              onChange={(event) => voiceVolumeHandler(Number(event.target.value))}
            />
          </label>
        )}
        {typeof voiceMuteHandler === "function" && (
          <button type="button" className="server-dropdown-item" onClick={voiceMuteHandler}>
            {voiceLevel <= 0 ? <Mic size={14} /> : <MicOff size={14} />}
            {voiceLevel <= 0 ? t("Unmute") : t("Mute")}
          </button>
        )}
        {showScreenSlider && typeof onScreenVolume === "function" && (
          <label className="server-voice-menu-slider">
            <span>
              <Monitor size={13} aria-hidden />
              {t("Screen share volume")}
              <b>{screenLevel}%</b>
            </span>
            <input
              aria-label={t("Screen share volume")}
              type="range"
              min="0"
              max="100"
              value={screenLevel}
              onChange={(event) => onScreenVolume(Number(event.target.value))}
            />
          </label>
        )}
        {typeof onViewProfile === "function" && (
          <button type="button" className="server-dropdown-item" onClick={onViewProfile}>
            <User size={14} />
            {t("View profile")}
          </button>
        )}
        {typeof onCopyId === "function" && (
          <button type="button" className="server-dropdown-item" onClick={onCopyId}>
            <Copy size={14} />
            {t("Copy ID")}
          </button>
        )}
        {hasUserActions && (canMute || canDeafen || canMove) ? (
          <div className="server-voice-menu-sep" />
        ) : null}
        {canMute && (
          <button
            type="button"
            className="server-dropdown-item"
            onClick={() => {
              serverVoice?.serverMute?.(serverId, channelId, user.id, !user.serverMuted);
              onClose();
            }}
          >
            <MicOff size={14} />
            {user.serverMuted ? t("Server unmute") : t("Server mute")}
          </button>
        )}
        {canDeafen && (
          <button
            type="button"
            className="server-dropdown-item"
            onClick={() => {
              serverVoice?.serverDeafen?.(serverId, channelId, user.id, !user.serverDeafened);
              onClose();
            }}
          >
            {user.serverDeafened ? <Headphones size={14} /> : <HeadphoneOff size={14} />}
            {user.serverDeafened ? t("Undeafen") : t("Server deafen")}
          </button>
        )}
        {canMove && isStage && (
          <button
            type="button"
            className="server-dropdown-item"
            onClick={() => {
              serverVoice?.setStageParticipantRole?.(
                serverId,
                channelId,
                user.id,
                user.stageRole === "speaker" ? "audience" : "speaker"
              );
              onClose();
            }}
          >
            <Radio size={14} />
            {user.stageRole === "speaker" ? t("Move to Audience") : t("Invite to Speak")}
          </button>
        )}
        {canMove && (
          <>
            <button
              type="button"
              className="server-dropdown-item danger"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                serverVoice?.disconnectMember?.(serverId, channelId, user.id);
                onClose();
              }}
            >
              <PhoneOff size={14} />
              {t("Disconnect")}
            </button>
            <button
              type="button"
              className="server-dropdown-item"
              onClick={() => setMoveOpen((v) => !v)}
            >
              <ArrowRightLeft size={14} />
              {t("Move to…")}
            </button>
            {moveOpen &&
              voiceChannels
                .filter((c) => c.id !== channelId)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="server-dropdown-item nested"
                    onClick={() => {
                      serverVoice?.moveMember?.(serverId, user.id, channelId, c.id);
                      onClose();
                    }}
                  >
                    <Volume2 size={14} />
                    {c.name}
                  </button>
                ))}
          </>
        )}
      </div>
    </>
  );

  if (typeof document === "undefined") return menuNode;
  return createPortal(menuNode, document.body);
}
