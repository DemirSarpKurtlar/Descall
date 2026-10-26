import { useState } from "react";
import { motion } from "framer-motion";
import { Phone, PhoneOff, Video, Users, BellOff } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { resolveAvatarUrl } from "../../lib/userProfile";
import { useT } from "../../context/LocaleContext";
import useGlassUi from "../../hooks/useGlassUi";

/**
 * FaceTime-style incoming call card, large avatar + ripple rings.
 * Replaces the old icon-only / small-avatar banners.
 *
 * Glass (3.0.0, mockup 01): full screen, the caller's photo blurred behind
 * everything, a round photo with one soft ring, the name on its own line,
 * an optional "Sessize al" pill (onSilence) and coloured Reddet / Kabul et.
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
  const [silenced, setSilenced] = useState(false);
  const isVideo = callType === "video";
  const name = username || user?.username || t("Someone");
  const photoUrl = glass && user ? resolveAvatarUrl(user) : null;
  const handle = user?.username && user.username !== name ? `@${user.username} · Descall` : null;
  const glassSub = subtitle || (isGroup ? t("Group call") : handle);

  return (
    <motion.div
      className={glass ? "incoming-call-card g-incoming" : "incoming-call-card"}
      initial={{ opacity: 0, y: -48, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -48, scale: 0.96 }}
      transition={{ type: "spring", damping: 24, stiffness: 280 }}
    >
      {glass ? (
        <div
          className={photoUrl ? "g-incoming-backdrop has-photo" : "g-incoming-backdrop"}
          style={photoUrl ? { backgroundImage: `url(${JSON.stringify(String(photoUrl))})` } : undefined}
          aria-hidden
        />
      ) : null}
      <div className="incoming-call-avatar-wrap">
        <span className="incoming-call-ring incoming-call-ring--a" aria-hidden />
        <span className="incoming-call-ring incoming-call-ring--b" aria-hidden />
        <span className="incoming-call-ring incoming-call-ring--c" aria-hidden />
        <motion.div
          className="incoming-call-avatar"
          animate={{ scale: glass ? [1, 1.02, 1] : [1, 1.04, 1] }}
          transition={{ repeat: Infinity, duration: glass ? 1.6 : 1.5, ease: "easeInOut" }}
        >
          <Avatar name={name} size={glass ? 144 : 72} user={user} />
        </motion.div>
        {glass ? null : (
          <div className={`incoming-call-badge ${isVideo ? "is-video" : "is-voice"}`}>
            {isVideo ? <Video size={13} color="#fff" /> : <Phone size={13} color="#fff" />}
          </div>
        )}
      </div>

      <div className="incoming-call-meta">
        <div className="incoming-call-kind">
          {glass ? (isVideo ? <Video size={14} strokeWidth={1.9} /> : <Phone size={14} strokeWidth={1.9} />) : null}
          {isVideo ? t("Incoming video call") : t("Incoming voice call")}
        </div>
        <div className="incoming-call-name">{glass && !isGroup ? name : t("{name} is calling", { name })}</div>
        {glass ? (
          glassSub ? (
            <div className="incoming-call-sub">
              <span>{glassSub}</span>
            </div>
          ) : null
        ) : (subtitle || isGroup) && (
          <div className="incoming-call-sub">
            {isGroup && !glass && <Users size={12} />}
            <span>{subtitle || (isVideo ? t("Video call") : isGroup ? t("Group call") : t("Voice call"))}</span>
          </div>
        )}
      </div>

      {glass && onSilence ? (
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

      {glass ? (
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
    </motion.div>
  );
}
