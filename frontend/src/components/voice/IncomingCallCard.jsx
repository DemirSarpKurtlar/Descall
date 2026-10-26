import { useState } from "react";
import { motion } from "framer-motion";
import { Phone, PhoneOff, Video, Users, BellOff } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { resolveAvatarUrl } from "../../lib/userProfile";
import { useT } from "../../context/LocaleContext";
import useGlassUi from "../../hooks/useGlassUi";
import { useGlassDesktop } from "../../hooks/useGlassDesktop";

/** iPad (native or Safari): touch-first, no hover. Mouse desktops keep the banner. */
function isTouchTablet() {
  if (typeof window === "undefined") return false;
  try {
    if (window.Capacitor?.getPlatform?.() === "ios") return true;
    return Boolean(window.matchMedia?.("(hover: none) and (pointer: coarse)").matches) && (navigator.maxTouchPoints || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * FaceTime-style incoming call card, large avatar + ripple rings.
 * Replaces the old icon-only / small-avatar banners.
 *
 * Glass (3.0.0, mockup 01): full screen, the caller's photo blurred behind
 * everything, a round photo with one soft ring, the name on its own line,
 * an optional "Sessize al" pill (onSilence) and coloured Reddet / Kabul et.
 * iPad (glass-desktop on a touch tablet): the same pieces in a centred glass
 * sheet over the blurred photo (.gd-incoming / .gd-incoming-sheet).
 */
export default function IncomingCallCard({
  username,
  user,
  callType = "voice",
  subtitle,
  isGroup = false,
  onAccept,
  onDecline,
  onSilence,
}) {
  const t = useT();
  const glass = useGlassUi();
  const glassDesktop = useGlassDesktop();
  // 3.0.0 S14: iPad gets the same glass language as #01, as a centred sheet.
  const sheet = !glass && glassDesktop && isTouchTablet();
  const look = glass || sheet;
  const [silenced, setSilenced] = useState(false);
  const isVideo = callType === "video";
  const name = username || user?.username || t("Someone");
  const photoUrl = look && user ? resolveAvatarUrl(user) : null;
  const handle = user?.username && user.username !== name ? `@${user.username} · Descall` : null;
  const glassSub = subtitle || (isGroup ? t("Group call") : handle);

  return (
    <motion.div
      className={glass ? "incoming-call-card g-incoming" : sheet ? "incoming-call-card gd-incoming" : "incoming-call-card"}
      initial={{ opacity: 0, y: -48, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -48, scale: 0.96 }}
      transition={{ type: "spring", damping: 24, stiffness: 280 }}
    >
      {look ? (
        <div
          className={photoUrl ? "g-incoming-backdrop has-photo" : "g-incoming-backdrop"}
          style={photoUrl ? { backgroundImage: `url(${JSON.stringify(String(photoUrl))})` } : undefined}
          aria-hidden
        />
      ) : null}
      <div className={sheet ? "gd-incoming-sheet" : "incoming-call-body"} style={sheet ? undefined : { display: "contents" }}>
        <div className="incoming-call-avatar-wrap">
          <span className="incoming-call-ring incoming-call-ring--a" aria-hidden />
          <span className="incoming-call-ring incoming-call-ring--b" aria-hidden />
          <span className="incoming-call-ring incoming-call-ring--c" aria-hidden />
          <motion.div
            className="incoming-call-avatar"
            animate={{ scale: look ? [1, 1.02, 1] : [1, 1.04, 1] }}
            transition={{ repeat: Infinity, duration: look ? 1.6 : 1.5, ease: "easeInOut" }}
          >
            <Avatar name={name} size={look ? 144 : 72} user={user} />
          </motion.div>
          {look ? null : (
            <div className={`incoming-call-badge ${isVideo ? "is-video" : "is-voice"}`}>
              {isVideo ? <Video size={13} color="#fff" /> : <Phone size={13} color="#fff" />}
            </div>
          )}
        </div>

        <div className="incoming-call-meta">
          <div className="incoming-call-kind">
            {look ? (isVideo ? <Video size={14} strokeWidth={1.9} /> : <Phone size={14} strokeWidth={1.9} />) : null}
            {isVideo ? t("Incoming video call") : t("Incoming voice call")}
          </div>
          <div className="incoming-call-name">{look && !isGroup ? name : t("{name} is calling", { name })}</div>
          {look ? (
            glassSub ? (
              <div className="incoming-call-sub">
                <span>{glassSub}</span>
              </div>
            ) : null
          ) : (subtitle || isGroup) && (
            <div className="incoming-call-sub">
              {isGroup && !look && <Users size={12} />}
              <span>{subtitle || (isVideo ? t("Video call") : isGroup ? t("Group call") : t("Voice call"))}</span>
            </div>
          )}
        </div>

        {look && onSilence ? (
          <div className="g-incoming-extras">
            <button
              type="button"
              className={silenced ? "g-incoming-pill is-done" : "g-incoming-pill"}
              disabled={silenced}
              onClick={() => {
                setSilenced(true);
                onSilence();
              }}
            >
              <BellOff size={15} strokeWidth={1.9} />
              <span>{silenced ? t("Ringtone silenced") : t("Silence")}</span>
            </button>
          </div>
        ) : null}

        {look ? (
          <div className="incoming-call-actions g-incoming-actions">
            <div className="g-incoming-choice">
              <motion.button
                type="button"
                className="incoming-call-btn incoming-call-btn--decline"
                whileTap={{ scale: 0.97 }}
                onClick={onDecline}
                title={t("Decline")} aria-label={t("Decline")}
              >
                <PhoneOff size={28} />
              </motion.button>
              <span className="g-incoming-label">{t("Decline")}</span>
            </div>
            <div className="g-incoming-choice">
              <motion.button
                type="button"
                className="incoming-call-btn incoming-call-btn--accept"
                whileTap={{ scale: 0.97 }}
                onClick={onAccept}
                title={t("Accept")} aria-label={t("Accept")}
              >
                <Phone size={28} />
              </motion.button>
              <span className="g-incoming-label">{t("Accept")}</span>
            </div>
          </div>
        ) : (
        <div className="incoming-call-actions">
          <motion.button
            type="button"
            className="incoming-call-btn incoming-call-btn--decline"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={onDecline}
            title={t("Decline")} aria-label={t("Decline")}
          >
            <PhoneOff size={22} />
          </motion.button>
          <motion.button
            type="button"
            className="incoming-call-btn incoming-call-btn--accept"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAccept}
            title={t("Accept")} aria-label={t("Accept")}
          >
            <Phone size={22} />
          </motion.button>
        </div>
        )}
      </div>
    </motion.div>
  );
}
