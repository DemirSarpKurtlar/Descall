// One small frosted toast for badge actions ("Facebook takıldı · Geri al"). Mounted once in App.
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocale } from "../../context/LocaleContext";
import { SpecialBadgeIcon } from "./specialBadgeArt.jsx";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";

let current = null;
let seq = 0;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

/** Show a toast. { id?, text, undo?, tone?: "err" | "ok", action?: { label, run } } */
export function showBadgeToast(toast) {
  seq += 1;
  current = { ...toast, key: seq };
  emit();
}
export function dismissBadgeToast() {
  current = null;
  emit();
}

export function BadgeToast() {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const toast = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current, () => null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!toast || hover) return undefined;
    const ms = toast.action ? 8000 : toast.undo ? 5000 : 3200;
    const id = setTimeout(() => { if (current?.key === toast.key) dismissBadgeToast(); }, ms);
    return () => clearTimeout(id);
  }, [toast, hover]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="bp-toast-host" aria-live="polite">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.key}
            className={`bp-toast${toast.tone === "err" ? " is-err" : ""}`}
            role="status"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={(e) => e.stopPropagation()}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize)}
          >
            {toast.id ? <SpecialBadgeIcon id={toast.id} size={22} /> : null}
            <span className="bp-toast-text">{toast.text}</span>
            {toast.action ? (
              <button type="button" className="bp-toast-btn is-brand" onClick={() => { dismissBadgeToast(); toast.action.run(); }}>{toast.action.label}</button>
            ) : null}
            {toast.undo ? (
              <button type="button" className="bp-toast-btn" onClick={() => { dismissBadgeToast(); toast.undo(); }}>{t("badges.undo")}</button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
