import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocale } from "../../context/LocaleContext";
import { AnnGlyph, AnnTile } from "./AnnGlyph.jsx";
import AnnouncementsSheet, { useAnnouncements } from "./AnnouncementsSheet.jsx";
import { ctaInk } from "./AnnouncementCard.jsx";
import {
  attachAnnouncementsSocket,
  configureAnnouncements,
  detectPlatform,
  dismissToast,
  markRead,
  markSeen,
  openAnnouncementCta,
  setAnnouncementNavigator,
} from "../../lib/announcementsFeed.js";
import "../../styles/announcements.css";

export const OPEN_ANNOUNCEMENTS_EVENT = "descall:open-announcements";

/** Open the announcements window from anywhere (optionally scrolled to one). */
export function openAnnouncements(id = null) {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_ANNOUNCEMENTS_EVENT, { detail: { id } }));
  } catch {
    /* no window */
  }
}

const AUTO_CLOSE_MS = 9000;

function Toast({ item, onOpen, onClose }) {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(false);
  const urgent = item.priority === "urgent";
  useEffect(() => {
    if (urgent || hover) return undefined;
    const id = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [urgent, hover, onClose]);
  const color = /^#[0-9a-f]{6}$/i.test(String(item.color || "")) ? item.color : "#587af5";
  return (
    <motion.div
      layout
      className={`ann-toast is-${item.priority || "normal"}`}
      style={{ "--ann-c": color }}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      initial={{ opacity: 0, y: reduce ? 0 : -14, scale: reduce ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reduce ? 0 : -10, transition: { duration: 0.16 } }}
      transition={{ type: "spring", damping: 28, stiffness: 360 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <AnnTile item={item} color={color} size="md" />
      <div className="ann-toast-body">
        <div className="ann-toast-kicker">
          {item.test ? t("annc.u.testKicker") : t("annc.u.newKicker")}
          {item.priority === "urgent" || item.priority === "important" ? <span className={`ann-chip is-${item.priority}`}>{t(`annc.prio.${item.priority}`)}</span> : null}
        </div>
        <b className="ann-toast-title">{item.title}</b>
        <p className="ann-toast-text">{item.content}</p>
        <div className="ann-toast-actions">
          {item.ctaLabel && item.ctaUrl ? (
            <button type="button" className="ann-cta is-sm" style={{ background: color, color: ctaInk(color) }} onClick={() => { openAnnouncementCta(item); onClose(); }}>
              {item.ctaLabel}
            </button>
          ) : null}
          <button type="button" className="ann-btn is-sm" onClick={onOpen}>
            {t("annc.u.openAll")}
          </button>
        </div>
      </div>
      <button type="button" className="ann-x is-sm" onClick={onClose} aria-label={t("annc.close")}>
        <AnnGlyph name="x" size={14} />
      </button>
    </motion.div>
  );
}

/**
 * Mounted once in App: keeps the store connected to the socket, shows a toast
 * for important / urgent announcements (and the admin's test), and opens the
 * window on `descall:open-announcements` or a `?announcement=<id>` link (push tap).
 */
export default function AnnouncementLive({ socket, enabled = true, navigate = null }) {
  const { t, locale } = useLocale();
  const state = useAnnouncements();
  const [open, setOpen] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const navRef = useRef(navigate);
  navRef.current = navigate;

  useEffect(() => {
    configureAnnouncements({ lang: locale, platform: detectPlatform() });
  }, [locale]);

  useEffect(() => {
    setAnnouncementNavigator((url) => navRef.current?.(url));
    return () => setAnnouncementNavigator(null);
  }, []);

  useEffect(() => {
    if (!enabled || !socket) return undefined;
    return attachAnnouncementsSocket(socket);
  }, [socket, enabled]);

  useEffect(() => {
    const onOpen = (e) => {
      setFocusId(e?.detail?.id || null);
      setOpen(true);
    };
    window.addEventListener(OPEN_ANNOUNCEMENTS_EVENT, onOpen);
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("announcement");
      if (id && enabled) {
        setFocusId(id);
        setOpen(true);
        params.delete("announcement");
        const qs = params.toString();
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
      }
    } catch {
      /* no URL */
    }
    return () => window.removeEventListener(OPEN_ANNOUNCEMENTS_EVENT, onOpen);
  }, [enabled]);

  const toasts = enabled ? state.toasts : [];
  useEffect(() => {
    const ids = toasts.filter((x) => !x.test).map((x) => x.id);
    if (ids.length) markSeen(ids);
  }, [toasts]);

  if (typeof document === "undefined") return null;
  return (
    <>
      {createPortal(
        <div className="ann-toasts" aria-label={t("annc.u.title")}>
          <AnimatePresence initial={false}>
            {toasts.map((item) => (
              <Toast
                key={item.id}
                item={item}
                onClose={() => dismissToast(item.id)}
                onOpen={() => {
                  if (!item.test) markRead([item.id]);
                  dismissToast(item.id);
                  setFocusId(item.test ? null : item.id);
                  setOpen(true);
                }}
              />
            ))}
          </AnimatePresence>
        </div>,
        document.body
      )}
      <AnnouncementsSheet open={open} onClose={() => setOpen(false)} focusId={focusId} />
    </>
  );
}
