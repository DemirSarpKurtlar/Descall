import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useDragControls, useReducedMotion } from "framer-motion";
import { X } from "../ui/Icon.jsx";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticImpactLight } from "../../lib/fluid/haptics";
import { shouldDismissSheet } from "../../lib/groupInfo";
import "./GroupSheet.css";

/**
 * Liquid Glass sheet for group flows (rename, add member, invite).
 * Phone: bottom sheet that springs up, drags down to dismiss (offset or
 * velocity, interruptible, velocity handed to the exit spring).
 * ≥760px: centred glass card. Esc / scrim tap close. Reduced motion → fade.
 *
 * Header is an iOS navigation bar: `leading` | title (+ subtitle) | `trailing`
 * (defaults to a round close button).
 */
export default function GroupSheet({
  open,
  onClose,
  title,
  subtitle,
  leading = null,
  trailing,
  children,
  testId,
  initialFocusRef,
  closeLabel = "Close",
  className = "",
  dismissible = true,
}) {
  const reduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const dismissV = useRef(0);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (dismissible) onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    // Focus after the presentation spring has started so iOS doesn't scroll the page.
    const id = setTimeout(() => {
      const target = initialFocusRef?.current || closeRef.current;
      target?.focus?.({ preventScroll: true });
    }, initialFocusRef ? 260 : 0);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearTimeout(id);
    };
  }, [open, dismissible, initialFocusRef]);

  const dismiss = (velocity = 0) => {
    if (!dismissible) return;
    dismissV.current = Number.isFinite(velocity) ? velocity : 0;
    onCloseRef.current?.();
  };

  const tree = (
    <AnimatePresence custom={dismissV.current}>
      {open ? (
        <motion.div
          key="gs-scrim"
          className="gs-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? REDUCED_MOTION_FADE : { duration: 0.22 }}
          onClick={() => dismiss(0)}
        >
          <motion.div
            className={`gs-sheet ${className}`.trim()}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            data-testid={testId}
            custom={dismissV.current}
            variants={{
              initial: reduceMotion ? { opacity: 0 } : { y: 64, opacity: 0, scale: 0.97 },
              animate: reduceMotion
                ? { opacity: 1, transition: REDUCED_MOTION_FADE }
                : { y: 0, opacity: 1, scale: 1, transition: framerSpring(SPRINGS.sheet) },
              exit: (velocity) => (reduceMotion
                ? { opacity: 0, transition: REDUCED_MOTION_FADE }
                : {
                  y: 560,
                  opacity: 0,
                  transition: {
                    ...framerSpring(SPRINGS.sheet, Number.isFinite(velocity) ? velocity : undefined),
                    restDelta: 4,
                    restSpeed: 40,
                    opacity: { duration: 0.18 },
                  },
                }),
            }}
            initial="initial"
            animate="animate"
            exit="exit"
            drag={reduceMotion || !dismissible ? false : "y"}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.55 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (shouldDismissSheet(info.offset.y, info.velocity.y)) {
                hapticImpactLight();
                dismiss(info.velocity.y);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <header
              className="gs-nav"
              onPointerDown={(event) => {
                if (reduceMotion || !dismissible) return;
                if (event.target.closest("button, a, input, textarea, select")) return;
                dragControls.start(event);
              }}
            >
              <div className="gs-grabber" aria-hidden="true" />
              <div className="gs-nav-row">
                <div className="gs-nav-side is-leading">{leading}</div>
                <div className="gs-nav-title">
                  <h2>{title}</h2>
                  {subtitle ? <p>{subtitle}</p> : null}
                </div>
                <div className="gs-nav-side is-trailing">
                  {trailing !== undefined ? trailing : (
                    <button ref={closeRef} type="button" className="gs-close" onClick={() => dismiss(0)} aria-label={closeLabel}>
                      <X size={16} strokeWidth={2.4} />
                    </button>
                  )}
                </div>
              </div>
            </header>
            <div className="gs-body">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return tree;
  return createPortal(tree, document.body);
}
