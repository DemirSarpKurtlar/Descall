import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pin, PinOff, X } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { computeAnchoredPopover, isOutside } from "../../lib/anchoredPopover";
import { useLocale } from "../../context/LocaleContext";
import { formatDate } from "../../i18n/format";
import "./PinnedMessagesPopover.css";

/**
 * Pinned messages as a Liquid Glass popover under the header pin button
 * (DM, group, server text channel). Portaled to <body> so no backdrop root,
 * overflow clip or docked-panel layout in the chat shell can move it.
 */
export default function PinnedMessagesPopover({
  open,
  anchorRef,
  onClose,
  items = [],
  t,
  resolveName,
  renderText,
  onUnpin,
}) {
  const reduce = useReducedMotion();
  const { locale } = useLocale();
  const panelRef = useRef(null);
  const [place, setPlace] = useState(null);

  const measure = useCallback(() => {
    if (typeof window === "undefined") return;
    const rect = anchorRef?.current?.getBoundingClientRect?.() || null;
    setPlace(computeAnchoredPopover({ anchor: rect, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }));
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => measure();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        anchorRef?.current?.focus?.();
      }
    };
    const onDown = (e) => {
      if (isOutside(e.target, panelRef.current, anchorRef?.current)) onClose?.();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    const id = requestAnimationFrame(() => panelRef.current?.focus?.({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, measure, onClose, anchorRef]);

  if (typeof document === "undefined") return null;

  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.16, ease: "easeOut" } }
    : {
        initial: { opacity: 0, scale: 0.92, y: -8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.94, y: -6 },
        // Critically damped (apple-design: damping 1.0, response ~0.35 s).
        transition: { type: "spring", bounce: 0, duration: 0.35 },
      };

  return createPortal(
    <AnimatePresence>
      {open && place ? (
        <motion.div
          key="pinned-popover"
          ref={panelRef}
          className="pinned-popover"
          role="dialog"
          aria-label={t("Pinned messages")}
          tabIndex={-1}
          style={{ top: place.top, left: place.left, width: place.width, maxHeight: place.maxHeight, transformOrigin: `${place.originX}px 0px` }}
          {...motionProps}
        >
          <div className="pinned-popover-header">
            <h4>
              <Pin size={15} aria-hidden="true" />
              <span>{t("Pinned messages")}</span>
              {items.length > 0 ? <span className="pinned-popover-count">{items.length}</span> : null}
            </h4>
            <button type="button" className="pinned-popover-close" onClick={onClose} title={t("Close")} aria-label={t("Close")}>
              <X size={15} />
            </button>
          </div>
          <div className="pinned-popover-scroll">
            {items.length === 0 ? (
              <div className="pinned-popover-empty">
                <span className="pinned-popover-empty-icon" aria-hidden="true">
                  <Pin size={22} />
                </span>
                <p className="pinned-popover-empty-title">{t("No pinned messages yet")}</p>
                <p className="pinned-popover-empty-hint">{t("Pin important messages from the message menu to find them here.")}</p>
              </div>
            ) : (
              items.map((pm) => {
                const author = pm.from || pm.sender;
                const name = resolveName(author);
                return (
                  <div key={pm.id} className="pinned-popover-row">
                    <Avatar name={name || "?"} size={32} user={author} />
                    <div className="pinned-popover-body">
                      <div className="pinned-popover-meta">
                        <span className="pinned-popover-author">{name}</span>
                        <span className="pinned-popover-time">{pm.timestamp ? formatDate(pm.timestamp, locale, { dateStyle: "short" }) : ""}</span>
                      </div>
                      <p className="pinned-popover-text">{renderText(pm)}</p>
                    </div>
                    <button type="button" className="pinned-popover-unpin" title={t("Unpin")} aria-label={t("Unpin")} onClick={() => onUnpin(pm.id)}>
                      <PinOff size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
