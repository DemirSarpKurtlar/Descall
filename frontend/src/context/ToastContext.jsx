import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "../components/ui/Icon.jsx";
import { Avatar } from "../components/ui/Avatar";
import StatusBadge from "../components/ui/StatusBadge";
import { nativeToastSupported, showPresenceCapsule } from "../lib/nativeToast.js";
import { getLocale } from "../i18n/runtime.js";
import "../styles/presence-toast.css";

const ToastContext = createContext(null);

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => (prev || []).filter((x) => x.id !== id));
  }, []);

  const pushWeb = useCallback((message, t, meta) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type: t, meta }]);
    const duration = meta && Object.prototype.hasOwnProperty.call(meta, "duration")
      ? meta.duration
      : (t === "presence" ? 4500 : 4000);
    if (duration && duration > 0) {
      setTimeout(() => {
        setToasts((prev) => (prev || []).filter((x) => x.id !== id));
      }, duration);
    }
  }, []);

  const push = useCallback((message, type = "info", meta = null) => {
    const allowed = ["info", "success", "error", "warning", "presence"];
    const t = allowed.includes(type) ? type : "info";
    // 3.0.0 (#07): on iOS a friend coming online is the native glass capsule;
    // the web card is only the fallback (older builds, plugin missing).
    if (t === "presence" && nativeToastSupported()) {
      showPresenceCapsule({ name: meta?.name || message, user: meta?.user || null, locale: getLocale() })
        .then((shown) => { if (!shown) pushWeb(message, t, meta); })
        .catch(() => pushWeb(message, t, meta));
      return;
    }
    pushWeb(message, t, meta);
  }, [pushWeb]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const onQa = (event) => {
      const detail = event?.detail || {};
      if (!detail.message) return;
      push(detail.message, detail.type || "info", detail.meta || null);
    };
    window.addEventListener("descall:glass-qa-toast", onQa);
    return () => window.removeEventListener("descall:glass-qa-toast", onQa);
  }, [push]);

  return (
    <ToastContext.Provider value={{ toast: push }}>
      {children}
      {/* Friend came online (3.1.2): its own stack, top right under the chat
          header pills, in the theme's glass (styles/presence-toast.css). */}
      <div className="presence-toasts" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.filter((t) => t.type === "presence").map((t) => {
            const user = t.meta?.user || null;
            const name = t.meta?.name || t.message;
            const open = t.meta?.onOpen;
            return (
              <motion.div
                key={t.id}
                layout
                className={`presence-toast${open ? " is-actionable" : ""}`}
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.16 } }}
                transition={{ type: "spring", stiffness: 520, damping: 34 }}
              >
                <button
                  type="button"
                  className="presence-toast-main"
                  disabled={!open}
                  onClick={() => { dismiss(t.id); open?.(); }}
                >
                  <span className="presence-toast-av">
                    <Avatar name={name} size={32} user={user} animate="always" />
                    <StatusBadge status="online" />
                  </span>
                  <span className="presence-toast-copy">
                    <b>{name}</b>
                    <span>{t.meta?.subtitle || "Online"}</span>
                  </span>
                </button>
                <button type="button" className="presence-toast-x" aria-label={t.meta?.dismissLabel || "Dismiss"} onClick={() => dismiss(t.id)}>
                  <X size={13} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <div className="toast-stack" aria-live="polite">
        <AnimatePresence>
          {toasts.filter((t) => t.type !== "presence").map((t) => {
            const Icon = ICONS[t.type] || Info;
            return (
              <motion.div
                key={t.id}
                className={`toast-item toast-${t.type}`}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
              >
                <Icon size={18} className="toast-icon" aria-hidden />
                <div className="toast-body">{t.message}</div>
                <button
                  type="button"
                  className="toast-dismiss"
                  aria-label="Dismiss"
                  onClick={() => dismiss(t.id)}
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { toast: () => {} };
  return ctx;
}
