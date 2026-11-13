import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
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
  className = "",
}) {
  const reduce = useReducedMotion();
  // False while an AnimatePresence plays the exit: the answered alert is still
  // on screen for its fade, but a second click / Escape / Enter must do nothing.
  const isPresent = useIsPresent();
  const answerConfirm = (value) => {
    if (isPresent) onConfirm?.(value);
  };
  const answerCancel = () => {
    if (isPresent) onCancel?.();
  };
  const [draft, setDraft] = useState(input?.defaultValue ?? "");
  useEffect(() => {
    if (danger) hapticWarning();
  }, [danger]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || busy || !isPresent) return;
      e.preventDefault();
      onCancel?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, busy, isPresent]);

  const confirmText = String(confirmLabel || "");
  const cancelText = String(cancelLabel || "");
  const stacked = confirmText.length > 16 || cancelText.length > 16;
  const transition = reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize);
  const cardInitial = reduce ? { opacity: 0 } : { opacity: 0, scale: 1.1 };
  const cardAnimate = reduce ? { opacity: 1 } : { opacity: 1, scale: 1 };
  // Scrim and card leave together (under an AnimatePresence, e.g. the host
  // below): never a dim window after the alert is gone, never a one-frame drop.
  const scrimFade = reduce ? REDUCED_MOTION_FADE : { duration: 0.18, ease: "easeOut" };
  const cardExit = reduce
    ? { opacity: 0, transition: REDUCED_MOTION_FADE }
    : { opacity: 0, scale: 0.96, transition: { duration: 0.16, ease: "easeOut" } };

  const cancelBtn = (
    <AlertButton className="g-alert-btn is-cancel" onClick={answerCancel} disabled={busy}>
      {cancelLabel}
    </AlertButton>
  );
  const confirmBtn = (
    <AlertButton
      className={`g-alert-btn${danger ? " is-danger" : " is-action"}`}
      onClick={() => answerConfirm(input ? draft : undefined)}
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
      exit={{ opacity: 0 }}
      transition={scrimFade}
      onClick={() => {
        /* Alerts do not dismiss from the scrim. */
      }}
    >
      <motion.div
        className={`g-alert g-glass g-heavy${className ? ` ${className}` : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="g-alert-title"
        aria-describedby={message ? "g-alert-body" : undefined}
        initial={cardInitial}
        animate={cardAnimate}
        exit={cardExit}
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
              maxLength={input.maxLength || undefined}
              autoComplete="off"
              enterKeyHint="done"
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy && !confirmDisabled) {
                  e.preventDefault();
                  answerConfirm(draft);
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

  const finish = (value) => {
    current.resolve(value);
    setCurrent(queue.current.shift() || null);
  };
  const o = current?.options || {};
  // AnimatePresence: the answered alert fades out with its scrim instead of
  // vanishing in one frame (GlassConfirm ignores input while it leaves).
  return (
    <AnimatePresence>
      {current ? (
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
      ) : null}
    </AnimatePresence>
  );
}
