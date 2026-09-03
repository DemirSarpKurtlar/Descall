import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Shield } from "lucide-react";
import RippleButton from "../ui/RippleButton";
import { useT } from "../../context/LocaleContext";

const SEVERITY_TONE = {
  info: { label: "Info", color: "#6ea0ff" },
  success: { label: "Success", color: "#23a55a" },
  warning: { label: "Warning", color: "#f0b232" },
  urgent: { label: "Urgent", color: "#da373c" },
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

export function AdminBroadcastPopupCard({ popup, onDismiss, preview = false }) {
  const t = useT();
  if (!popup) return null;
  const tone = SEVERITY_TONE[popup.severity] || SEVERITY_TONE.info;
  const title = popup.title || t("Message from Descall");
  const canSkip = !popup.requireAck;

  const handleCta = () => {
    if (!preview && popup.ctaUrl) openCta(popup.ctaUrl);
    onDismiss?.();
  };

  return (
    <motion.div
      className={`admin-broadcast-card admin-broadcast-card--${popup.severity || "info"}`}
      style={{ "--ab-accent": tone.color }}
      role={preview ? "group" : "dialog"}
      aria-modal={preview ? undefined : true}
      aria-labelledby="admin-broadcast-title"
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
        >
          <X size={18} />
        </button>
      )}

      <div className="admin-broadcast-icon" aria-hidden="true">
        <span>{popup.emoji || "📢"}</span>
      </div>

      <div className="admin-broadcast-kicker">
        <Shield size={12} />
        <span>{t("Official Descall notice")}</span>
        <span className="admin-broadcast-sev">{t(tone.label)}</span>
      </div>

      <h3 id="admin-broadcast-title">{title}</h3>
      <p className="admin-broadcast-from">
        {t("{name} sent you", { name: popup.from?.username || t("Descall staff") })}
      </p>
      <p className="admin-broadcast-body">{popup.body}</p>

      <div className="admin-broadcast-actions">
        {popup.ctaLabel && popup.ctaUrl ? (
          <RippleButton className="btn-primary" onClick={handleCta}>
            {popup.ctaLabel}
          </RippleButton>
        ) : (
          <RippleButton className="btn-primary" onClick={onDismiss}>
            {t("Got it")}
          </RippleButton>
        )}
        {canSkip && popup.ctaLabel && popup.ctaUrl && (
          <button type="button" className="us-link-btn" onClick={onDismiss}>
            {t("Dismiss")}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function AdminBroadcastPopup({ popup, onDismiss, preview = false }) {
  useEffect(() => {
    if (preview || !popup || popup.requireAck || !popup.durationMs) return undefined;
    const timer = window.setTimeout(() => onDismiss?.(), popup.durationMs);
    return () => window.clearTimeout(timer);
  }, [preview, popup, onDismiss]);

  useEffect(() => {
    if (preview || !popup || popup.requireAck) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onDismiss?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, popup, onDismiss]);

  if (preview) {
    return (
      <div className="admin-broadcast-preview">
        <AdminBroadcastPopupCard popup={popup} onDismiss={onDismiss} preview />
      </div>
    );
  }

  if (!popup) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="admin-broadcast-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={popup.requireAck ? undefined : onDismiss}
      >
        <div onClick={(event) => event.stopPropagation()}>
          <AdminBroadcastPopupCard popup={popup} onDismiss={onDismiss} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
