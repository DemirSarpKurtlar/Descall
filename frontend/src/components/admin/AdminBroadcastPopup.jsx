import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Shield } from "../ui/Icon.jsx";
import RippleButton from "../ui/RippleButton";
import { useT } from "../../context/LocaleContext";
import OverlayPortal from "../ui/OverlayPortal";
import { livePopupIcon } from "../../lib/livePopupIcons";
import { sendPopupReceipt } from "../../lib/livePopupClient";

/**
 * The live popup a member sees (and the admin composer's preview).
 * Tracked popups (`track: true`) report back through `popup:receipt`:
 * seen when it is on screen while the app is visible, clicked (button),
 * acked ("Tamam"), dismissed (close, Esc, backdrop, auto-close).
 * A popup that needs an OK keeps its button and an "OK" after a button click.
 */

const SEVERITY_TONE = {
  info: { label: "Info", color: "#587AF5" },
  success: { label: "Success", color: "#34c77b" },
  warning: { label: "Warning", color: "#f2a93b" },
  urgent: { label: "Urgent", color: "#f23f43" },
};

function openCta(url) {
  const href = String(url || "").trim();
  if (!href) return;
  if (href.startsWith("/")) {
    window.location.assign(href);
    return;
  }
  if (/^https:\/\//i.test(href)) {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

export function AdminBroadcastPopupCard({ popup, onDismiss, onAck, onCta, preview = false, compact = false }) {
  const t = useT();
  if (!popup) return null;
  const tone = SEVERITY_TONE[popup.severity] || SEVERITY_TONE.info;
  const title = popup.title || (popup.kind === "correction" ? t("livePopup.member.correction") : t("Message from Descall"));
  const canSkip = !popup.requireAck;
  const Glyph = livePopupIcon(popup);
  const hasCta = Boolean(popup.ctaLabel && popup.ctaUrl);
  const ack = onAck || onDismiss;

  const handleCta = () => {
    if (!preview && popup.ctaUrl) openCta(popup.ctaUrl);
    if (onCta) onCta();
    else onDismiss?.();
  };

  return (
    <motion.div
      className={`admin-broadcast-card admin-broadcast-card--${popup.severity || "info"}${compact ? " is-compact" : ""}`}
      style={{ "--ab-accent": tone.color }}
      role={preview ? "group" : "dialog"}
      aria-modal={preview ? undefined : true}
      aria-labelledby={preview ? undefined : "admin-broadcast-title"}
      initial={preview ? false : { opacity: 0, scale: 0.88, y: 28 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={preview ? undefined : { opacity: 0, scale: 0.92, y: 16 }}
      transition={{ type: "spring", damping: 20, stiffness: 260 }}
    >
      {canSkip && (
        <button
          type="button"
          className="admin-broadcast-close"
          onClick={onDismiss}
          aria-label={t("Close")}
          tabIndex={preview ? -1 : undefined}
        >
          <X size={16} />
        </button>
      )}

      <div className="admin-broadcast-icon" aria-hidden="true">
        <Glyph size={compact ? 20 : 26} weight="regular" />
      </div>

      <div className="admin-broadcast-kicker">
        <Shield size={12} />
        <span>Descall</span>
        <span className="admin-broadcast-sev">{t(tone.label)}</span>
      </div>

      <h3 id={preview ? undefined : "admin-broadcast-title"}>{title}</h3>
      <p className="admin-broadcast-from">
        {t("{name} sent you", { name: popup.from?.username ? `@${popup.from.username}` : t("Descall staff") })}
      </p>
      <p className="admin-broadcast-body">{popup.body}</p>

      <div className="admin-broadcast-actions">
        {hasCta ? (
          <RippleButton className="btn-primary" onClick={handleCta} tabIndex={preview ? -1 : undefined}>
            {popup.ctaLabel}
          </RippleButton>
        ) : (
          <RippleButton className="btn-primary" onClick={ack} tabIndex={preview ? -1 : undefined}>
            {t("Got it")}
          </RippleButton>
        )}
        {hasCta && !canSkip && (
          <button type="button" className="us-link-btn" onClick={ack} tabIndex={preview ? -1 : undefined}>
            {t("Got it")}
          </button>
        )}
        {hasCta && canSkip && (
          <button type="button" className="us-link-btn" onClick={onDismiss} tabIndex={preview ? -1 : undefined}>
            {t("Dismiss")}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function AdminBroadcastPopup({ popup, onDismiss, preview = false, socket = null }) {
  const doneRef = useRef(null);
  const close = (kind) => {
    if (!preview && popup && doneRef.current !== popup) {
      doneRef.current = popup;
      sendPopupReceipt(socket, popup, kind);
    }
    onDismiss?.();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Seen = on screen while the app is in front.
  useEffect(() => {
    if (preview || !popup) return undefined;
    const report = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        sendPopupReceipt(socket, popup, "seen");
        return true;
      }
      return false;
    };
    if (report()) return undefined;
    const onVis = () => {
      if (report()) document.removeEventListener("visibilitychange", onVis);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [preview, popup, socket]);

  useEffect(() => {
    if (preview || !popup || popup.requireAck || !popup.durationMs) return undefined;
    const timer = window.setTimeout(() => closeRef.current("dismissed"), popup.durationMs);
    return () => window.clearTimeout(timer);
  }, [preview, popup]);

  useEffect(() => {
    if (preview || !popup || popup.requireAck) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") closeRef.current("dismissed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, popup]);

  if (preview) {
    return (
      <div className="admin-broadcast-preview">
        <AdminBroadcastPopupCard popup={popup} onDismiss={onDismiss} preview />
      </div>
    );
  }

  if (!popup) return null;

  const onCta = () => {
    sendPopupReceipt(socket, popup, "clicked");
    // A popup that needs an OK stays until "OK"; otherwise the click closes it.
    if (!popup.requireAck) {
      doneRef.current = popup;
      onDismiss?.();
    }
  };

  return (
    <OverlayPortal>
    <AnimatePresence>
      <motion.div
        className="admin-broadcast-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={popup.requireAck ? undefined : () => close("dismissed")}
      >
        <div onClick={(event) => event.stopPropagation()}>
          <AdminBroadcastPopupCard
            popup={popup}
            onDismiss={() => close("dismissed")}
            onAck={() => close("acked")}
            onCta={onCta}
          />
        </div>
      </motion.div>
    </AnimatePresence>
    </OverlayPortal>
  );
}
