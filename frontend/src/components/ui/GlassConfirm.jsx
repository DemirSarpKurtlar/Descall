import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { hapticWarning } from "../../lib/fluid/haptics";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { registerGlassConfirm } from "../../lib/glassConfirm";
import usePressFeedback from "../../hooks/usePressFeedback";

/**
 * Liquid Glass confirm. Frosted scrim, glass card, glass buttons.
 * Scrim tap does nothing. Warning haptic on mount when `danger` is set.
 * The same dialog is used on Electron, web, iOS, and Android.
 */
function AlertButton({ className, onClick, disabled, children }) {
  const press = usePressFeedback({ disabled });
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      {...press}
    >
      {children}
    </button>
  );
}

export default function GlassConfirm({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = true,
  busy = false,
  error = "",
  confirmDisabled = false,
  input = null,
  onConfirm,
  onCancel,
  children,
}) {
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState(input?.defaultValue ?? "");
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
    <AlertButton className="g-alert-btn is-cancel" onClick={onCancel} disabled={busy}>
      {cancelLabel}
    </AlertButton>
  );
  const confirmBtn = (
    <AlertButton
      className={`g-alert-btn${danger ? " is-danger" : " is-action"}`}
      onClick={() => onConfirm?.(input ? draft : undefined)}
      disabled={busy || confirmDisabled}
    >
      {confirmLabel}
    </AlertButton>
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
        {input ? (
          <div className="g-alert-extra">
            {input.label ? <label htmlFor="g-alert-input">{input.label}</label> : null}
            <input
              id="g-alert-input"
              value={draft}
              placeholder={input.placeholder || ""}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy && !confirmDisabled) {
                  e.preventDefault();
                  onConfirm?.(draft);
                }
              }}
            />
          </div>
        ) : null}
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
      input={o.input}
      onConfirm={(value) => finish(o.input ? String(value ?? "") : true)}
      onCancel={() => finish(o.input ? null : false)}
    />
  );
}
