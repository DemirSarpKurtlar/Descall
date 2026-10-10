import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { hapticWarning } from "../../lib/fluid/haptics";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { registerGlassConfirm } from "../../lib/glassConfirm";

/**
 * iPhone Liquid Glass alert (UIAlertController layout, heavy glass material).
 * Scrim tap does nothing. Warning haptic on mount when `danger` is set.
 * Desktop never mounts this — callers keep their existing dialogs.
 */
export default function GlassConfirm({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = true,
  busy = false,
  error = "",
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (danger) hapticWarning();
  }, [danger]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || busy) return;
      e.preventDefault();
      onCancel?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  const confirmText = String(confirmLabel || "");
  const cancelText = String(cancelLabel || "");
  const stacked = confirmText.length > 16 || cancelText.length > 16;
  const transition = reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize);
  const cardInitial = reduce ? { opacity: 0 } : { opacity: 0, scale: 1.1 };
  const cardAnimate = reduce ? { opacity: 1 } : { opacity: 1, scale: 1 };

  const cancelBtn = (
    <button
      type="button"
      className="g-alert-btn is-cancel"
      onClick={onCancel}
      disabled={busy}
    >
      {cancelLabel}
    </button>
  );
  const confirmBtn = (
    <button
      type="button"
      className={`g-alert-btn${danger ? " is-danger" : " is-action"}`}
      onClick={onConfirm}
      disabled={busy || confirmDisabled}
    >
      {confirmLabel}
    </button>
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      className="g-alert-scrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduce ? REDUCED_MOTION_FADE : { duration: 0.2, ease: "easeOut" }}
      onClick={() => {
        /* Alerts do not dismiss from the scrim. */
      }}
    >
      <motion.div
        className="g-alert g-glass g-heavy"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="g-alert-title"
        aria-describedby={message ? "g-alert-body" : undefined}
        initial={cardInitial}
        animate={cardAnimate}
        transition={transition}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="g-alert-copy">
          <h2 id="g-alert-title">{title}</h2>
          {message ? <p id="g-alert-body">{message}</p> : null}
          {error ? <p className="g-alert-error" role="alert">{error}</p> : null}
        </div>
        {children ? <div className="g-alert-extra">{children}</div> : null}
        <div className={`g-alert-actions${stacked ? " is-stacked" : ""}`}>
          {stacked ? (
            <>
              {confirmBtn}
              {cancelBtn}
            </>
          ) : (
            <>
              {cancelBtn}
              {confirmBtn}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

/** One host so non-React helpers (blockedUsers) can open the same alert. */
export function GlassConfirmHost() {
  const queue = useRef([]);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    return registerGlassConfirm((options) => new Promise((resolve) => {
      const item = { options, resolve, id: `${Date.now()}-${Math.random()}` };
      setCurrent((cur) => {
        if (cur) {
          queue.current.push(item);
          return cur;
        }
        return item;
      });
    }));
  }, []);

  if (!current) return null;
  const finish = (value) => {
    current.resolve(value);
    setCurrent(queue.current.shift() || null);
  };
  const o = current.options || {};
  return (
    <GlassConfirm
      key={current.id}
      title={o.title}
      message={o.message}
      confirmLabel={o.confirmLabel}
      cancelLabel={o.cancelLabel}
      danger={o.danger !== false}
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
    />
  );
}
