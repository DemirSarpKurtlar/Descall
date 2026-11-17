import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
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
} from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { resolveDisplayName } from "../../lib/userProfile";
import { userTextLang } from "../../lib/userTextLang";
import { placeContextMenu } from "../../lib/contextMenuPlacement";
import { armVoiceModFeedback, VOICE_MOD_ERROR_EVENT } from "../../lib/voiceModFeedback";
import GlassVolumeSlider from "../ui/GlassVolumeSlider";

/**
 * Right-click menu for a member in a server voice channel (voice room tile and sidebar row).
 * Placement is measured (lib/contextMenuPlacement.js): it flips above the pointer and stays
 * inside the window; a long channel list for "Move to" is its own scrolling page with a
 * back row, so nothing runs off the bottom (owner report, Nov 2026). Disconnect asks first
 * and is not offered on your own tile.
 */
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
  const [page, setPage] = useState("main"); // main | move | confirm-disconnect
  const [pos, setPos] = useState(null);
  const menuRef = useRef(null);
  const menuKey = menu?.user ? `${menu.user.id}|${menu.x}|${menu.y}` : "";

  useEffect(() => {
    setPage("main");
    setPos(null);
  }, [menuKey]);

  useEffect(() => {
    if (!menu?.user) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (page !== "main") setPage("main");
      else onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu?.user, onClose, page]);

  // A refused action that lands while the menu is still open (volume etc.) toasts too.
  useEffect(() => {
    if (!menu?.user) return undefined;
    const onModError = (event) => {
      const message = event?.detail?.message;
      if (message) toast(message, "error");
    };
    window.addEventListener(VOICE_MOD_ERROR_EVENT, onModError);
    return () => window.removeEventListener(VOICE_MOD_ERROR_EVENT, onModError);
  }, [menu?.user, toast]);

  // Measure and place inside the viewport; again whenever the page or size changes.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!menu?.user || !el || typeof window === "undefined") return undefined;
    const place = () => {
      const next = placeContextMenu({
        x: menu.x || 12,
        y: menu.y || 12,
        width: el.offsetWidth,
        height: el.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      setPos((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.maxHeight === next.maxHeight ? prev : next
      );
    };
    place();
    window.addEventListener("resize", place);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(place);
      ro.observe(el);
    }
    return () => {
      window.removeEventListener("resize", place);
      ro?.disconnect();
    };
  }, [menu?.user, menu?.x, menu?.y, page]);

  if (!menu?.user) return null;
  const user = menu.user;
  const isSelf = Boolean(menu.isSelf);
  const channelId = menu.channelId;
  const currentChannel = voiceChannels.find((c) => String(c.id) === String(channelId));
  const isStage = currentChannel?.type === "stage";
  const otherChannels = voiceChannels.filter((c) => String(c.id) !== String(channelId));
  const name = resolveDisplayName(user) || user.username;
  const voiceLevel = Math.max(0, Math.min(200, Number(voiceVolume) || 0));
  const screenLevel = Math.max(0, Math.min(200, Number(screenVolume) || 0));
  // Per-listener volume / local mute / screen volume make no sense for yourself.
  const voiceVolumeHandler = isSelf ? null : onVoiceVolume;
  const voiceMuteHandler = isSelf ? null : onToggleVoiceMute;
  const showScreenSlider = !isSelf && showScreenVolume;
  const hasUserActions = Boolean(voiceVolumeHandler || voiceMuteHandler || onViewProfile || onCopyId || showScreenSlider);
  const canDisconnect = Boolean(canMove && !isSelf);

  /** Run a moderation action: close at once, the server's refusal still reaches a toast. */
  const modAction = (fn) => () => {
    armVoiceModFeedback(toast);
    fn();
    onClose();
  };

  const mainPage = (
    <>
      <div className="server-voice-member-menu-title" lang={userTextLang(name)}>{name}</div>
      {typeof voiceVolumeHandler === "function" && (
        <div className="server-voice-menu-slider">
          <span>{t("Volume")}</span>
          <GlassVolumeSlider
            block
            surface
            min={0}
            max={200}
            step={1}
            value={voiceLevel}
            label={t("Volume")}
            onChange={voiceVolumeHandler}
          />
        </div>
      )}
      {typeof voiceMuteHandler === "function" && (
        <button type="button" role="menuitem" className="server-dropdown-item" onClick={voiceMuteHandler}>
          {voiceLevel <= 0 ? <Mic size={14} /> : <MicOff size={14} />}
          {voiceLevel <= 0 ? t("Unmute") : t("Mute")}
        </button>
      )}
      {showScreenSlider && typeof onScreenVolume === "function" && (
        <div className="server-voice-menu-slider">
          <span>
            <Monitor size={13} aria-hidden />
            {t("Screen share volume")}
          </span>
          <GlassVolumeSlider
            block
            surface
            min={0}
            max={200}
            step={1}
            value={screenLevel}
            label={t("Screen share volume")}
            onChange={onScreenVolume}
          />
        </div>
      )}
      {typeof onViewProfile === "function" && (
        <button type="button" role="menuitem" className="server-dropdown-item" onClick={onViewProfile}>
          <User size={14} />
          {t("View profile")}
        </button>
      )}
      {typeof onCopyId === "function" && (
        <button type="button" role="menuitem" className="server-dropdown-item" onClick={onCopyId}>
          <Copy size={14} />
          {t("Copy ID")}
        </button>
      )}
      {hasUserActions && (canMute || canDeafen || canMove) ? <div className="server-voice-menu-sep" /> : null}
      {canMute && (
        <button
          type="button"
          role="menuitem"
          className="server-dropdown-item"
          onClick={modAction(() => serverVoice?.serverMute?.(serverId, channelId, user.id, !user.serverMuted))}
        >
          <MicOff size={14} />
          {user.serverMuted ? t("Server unmute") : t("Server mute")}
        </button>
      )}
      {canDeafen && (
        <button
          type="button"
          role="menuitem"
          className="server-dropdown-item"
          onClick={modAction(() => serverVoice?.serverDeafen?.(serverId, channelId, user.id, !user.serverDeafened))}
        >
          {user.serverDeafened ? <Headphones size={14} /> : <HeadphoneOff size={14} />}
          {user.serverDeafened ? t("Undeafen") : t("Server deafen")}
        </button>
      )}
      {canMove && isStage && (
        <button
          type="button"
          role="menuitem"
          className="server-dropdown-item"
          onClick={modAction(() =>
            serverVoice?.setStageParticipantRole?.(
              serverId,
              channelId,
              user.id,
              user.stageRole === "speaker" ? "audience" : "speaker"
            )
          )}
        >
          <Radio size={14} />
          {user.stageRole === "speaker" ? t("Move to Audience") : t("Invite to Speak")}
        </button>
      )}
      {canMove && otherChannels.length > 0 && (
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          className="server-dropdown-item has-sub"
          onClick={() => setPage("move")}
        >
          <ArrowRightLeft size={14} />
          <span className="server-voice-menu-grow">{t("Move to…")}</span>
          <ChevronRight size={13} aria-hidden />
        </button>
      )}
      {canDisconnect && (
        <button
          type="button"
          role="menuitem"
          className="server-dropdown-item danger"
          onClick={() => setPage("confirm-disconnect")}
        >
          <PhoneOff size={14} />
          {t("Disconnect")}
        </button>
      )}
    </>
  );

  const movePage = (
    <>
      <button type="button" className="server-dropdown-item server-voice-menu-back" onClick={() => setPage("main")}>
        <ChevronLeft size={14} />
        <span className="server-voice-menu-grow">{t("svoice.moveTitle")}</span>
        <span className="server-voice-menu-who">{name}</span>
      </button>
      {currentChannel ? (
        <div className="server-voice-move-current" aria-disabled="true">
          <Volume2 size={13} aria-hidden />
          <span className="server-voice-menu-grow">{currentChannel.name}</span>
          <small>{t("svoice.currentChannel")}</small>
        </div>
      ) : null}
      <div className="server-voice-move-list" role="group" aria-label={t("svoice.moveTitle")}>
        {otherChannels.length === 0 ? (
          <div className="server-voice-move-empty">{t("svoice.noOtherChannels")}</div>
        ) : (
          otherChannels.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              className="server-dropdown-item nested"
              onClick={modAction(() => serverVoice?.moveMember?.(serverId, user.id, channelId, c.id))}
            >
              {c.type === "stage" ? <Radio size={14} /> : <Volume2 size={14} />}
              <span className="server-voice-menu-grow">{c.name}</span>
            </button>
          ))
        )}
      </div>
    </>
  );

  const confirmPage = (
    <div className="server-voice-menu-confirm" role="alertdialog" aria-label={t("svoice.confirmDisconnect", { name })}>
      <p>{t("svoice.confirmDisconnect", { name })}</p>
      <div className="server-voice-menu-confirm-row">
        <button type="button" className="server-voice-menu-confirm-btn" onClick={() => setPage("main")} autoFocus>
          {t("svoice.cancel")}
        </button>
        <button
          type="button"
          className="server-voice-menu-confirm-btn danger"
          onClick={modAction(() => serverVoice?.disconnectMember?.(serverId, channelId, user.id))}
        >
          <PhoneOff size={13} aria-hidden />
          {t("svoice.confirmDisconnectYes")}
        </button>
      </div>
    </div>
  );

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
        ref={menuRef}
        className={`server-voice-member-menu is-page-${page}`}
        style={{
          left: pos ? pos.left : menu.x || 12,
          top: pos ? pos.top : menu.y || 12,
          maxHeight: pos ? pos.maxHeight : undefined,
          visibility: pos ? undefined : "hidden",
        }}
        role="menu"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {page === "move" ? movePage : page === "confirm-disconnect" ? confirmPage : mainPage}
      </div>
    </>
  );

  if (typeof document === "undefined") return menuNode;
  return createPortal(menuNode, document.body);
}
