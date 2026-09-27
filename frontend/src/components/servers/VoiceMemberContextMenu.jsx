import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  Headphones,
  HeadphoneOff,
  MicOff,
  PhoneOff,
  Radio,
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
}) {
  const t = useT();
  const { toast } = useToast();
  const [moveOpen, setMoveOpen] = useState(false);

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
  const channelId = menu.channelId;
  const currentChannel = voiceChannels.find((c) => c.id === channelId);
  const isStage = currentChannel?.type === "stage";
  const left = Math.min(menu.x || 12, (typeof window !== "undefined" ? window.innerWidth : 400) - 220);
  const top = Math.min(menu.y || 12, (typeof window !== "undefined" ? window.innerHeight : 400) - 280);

  return (
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
}
