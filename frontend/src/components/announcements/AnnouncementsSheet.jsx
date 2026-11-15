import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "framer-motion";
import { useLocale } from "../../context/LocaleContext";
import { AnnGlyph } from "./AnnGlyph.jsx";
import AnnouncementCard from "./AnnouncementCard.jsx";
import {
  configureAnnouncements,
  getAnnouncementsState,
  markRead,
  markSeen,
  openAnnouncementCta,
  refreshAnnouncements,
  subscribeAnnouncements,
  visibleItems,
} from "../../lib/announcementsFeed.js";
import "../../styles/announcements.css";

export function useAnnouncements() {
  return useSyncExternalStore(subscribeAnnouncements, getAnnouncementsState, getAnnouncementsState);
}

const READ_DWELL_MS = 1200;

function usePhoneSheet() {
  const q = "(max-width: 640px)";
  const [phone, setPhone] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : false));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(q);
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return phone;
}

/**
 * The announcements window: a centred glass window on desktop and iPad, a bottom
 * sheet on iPhone. Pinned ones first (the admin's order), unread filter, mark all
 * read. Cards report "seen" when shown and "read" after staying in view.
 */
export default function AnnouncementsSheet({ open, onClose, focusId = null }) {
  const { t, locale } = useLocale();
  const state = useAnnouncements();
  const phone = usePhoneSheet();
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState("all");
  const drag = useDragControls();
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    configureAnnouncements({ lang: locale });
  }, [locale]);

  useEffect(() => {
    if (!open) return undefined;
    refreshAnnouncements();
    setFilter("all");
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current?.();
      } else if (e.key === "Tab" && panelRef.current) {
        const els = [...panelRef.current.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    const raf = window.requestAnimationFrame?.(() => panelRef.current?.focus?.({ preventScroll: true }));
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (raf) window.cancelAnimationFrame?.(raf);
      try {
        opener?.focus?.({ preventScroll: true });
      } catch {
        /* opener gone */
      }
    };
  }, [open]);

  const items = useMemo(() => visibleItems(state.items), [state.items]);
  const shown = filter === "unread" ? items.filter((a) => !a.read) : items;
  const pinned = shown.filter((a) => a.pinned);
  const rest = shown.filter((a) => !a.pinned);

  // Everything rendered in the open window counts as seen.
  useEffect(() => {
    if (!open || !items.length) return;
    markSeen(items.map((a) => a.id));
  }, [open, items]);

  // Read: the card stayed at least half in view for a moment.
  useEffect(() => {
    if (!open || typeof IntersectionObserver === "undefined" || !listRef.current) return undefined;
    const timers = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.getAttribute("data-ann-id");
          if (!id) continue;
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            if (!timers.has(id)) timers.set(id, setTimeout(() => markRead([id]), READ_DWELL_MS));
          } else if (timers.has(id)) {
            clearTimeout(timers.get(id));
            timers.delete(id);
          }
        }
      },
      { root: listRef.current, threshold: [0, 0.5, 1] }
    );
    listRef.current.querySelectorAll("[data-ann-id]").forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      for (const tm of timers.values()) clearTimeout(tm);
    };
  }, [open, shown.length, filter]);

  useEffect(() => {
    if (!open || !focusId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-ann-id="${CSS.escape ? CSS.escape(focusId) : focusId}"]`);
    el?.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
    el?.classList.add("is-focus");
  }, [open, focusId, items.length, reduce]);

  const onCta = useCallback(
    (item) => {
      markRead([item.id]);
      if (openAnnouncementCta(item)) closeRef.current?.();
    },
    []
  );

  if (typeof document === "undefined") return null;
  const unread = items.filter((a) => !a.read).length;
  const sheetMotion = phone
    ? { initial: { y: reduce ? 0 : "100%", opacity: reduce ? 0 : 1 }, animate: { y: 0, opacity: 1 }, exit: { y: reduce ? 0 : "100%", opacity: reduce ? 0 : 1 }, transition: { type: "spring", damping: 32, stiffness: 340 } }
    : { initial: { opacity: 0, scale: reduce ? 1 : 0.97, y: reduce ? 0 : 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: reduce ? 1 : 0.98 }, transition: { duration: 0.18 } };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className={`ann-scrim${phone ? " is-sheet" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose?.();
          }}
        >
          <motion.section
            ref={panelRef}
            className={`ann-window${phone ? " is-sheet" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ann-window-title"
            tabIndex={-1}
            drag={phone && !reduce ? "y" : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120 || info.velocity.y > 700) onClose?.();
            }}
            {...sheetMotion}
          >
            {phone ? <div className="ann-grabber" aria-hidden="true" onPointerDown={(e) => drag.start(e)} /> : null}
            <header className="ann-window-head" onPointerDown={(e) => phone && !e.target.closest("button") && drag.start(e)}>
              <span className="ann-window-ic" aria-hidden="true">
                <AnnGlyph name="megaphone" size={18} />
              </span>
              <h3 id="ann-window-title">{t("annc.u.title")}</h3>
              {unread ? <span className="ann-count">{t("annc.u.unreadCount", { n: unread })}</span> : null}
              <span className="ann-sp" />
              {unread ? (
                <>
                  <button type="button" className="ann-link is-text" onClick={() => markRead(items.filter((a) => !a.read).map((a) => a.id))}>
                    {t("annc.u.markAll")}
                  </button>
                  <button type="button" className="ann-x ann-link-ic" aria-label={t("annc.u.markAll")} title={t("annc.u.markAll")} onClick={() => markRead(items.filter((a) => !a.read).map((a) => a.id))}>
                    <AnnGlyph name="tick" size={16} />
                  </button>
                </>
              ) : null}
              <button type="button" className="ann-x" onClick={onClose} aria-label={t("annc.close")}>
                <AnnGlyph name="x" size={16} />
              </button>
            </header>
            {items.length > 1 ? (
              <div className="ann-filter" role="tablist" aria-label={t("annc.u.filter")}>
                {["all", "unread"].map((f) => (
                  <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? "is-on" : ""} onClick={() => setFilter(f)}>
                    {f === "all" ? t("annc.u.all") : t("annc.u.unread")}
                    {f === "unread" && unread ? <em>{unread}</em> : null}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="ann-list" ref={listRef}>
              {!state.loaded && state.loading ? (
                <div className="ann-skel" aria-label={t("annc.loading")}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="ann-skel-card">
                      <i />
                      <div>
                        <b />
                        <u />
                        <u />
                      </div>
                    </div>
                  ))}
                </div>
              ) : state.error && !state.loaded ? (
                <div className="ann-empty">
                  <AnnGlyph name="alert" size={22} />
                  <p>{t("annc.u.loadError")}</p>
                  <button type="button" className="ann-btn" onClick={() => refreshAnnouncements()}>
                    {t("annc.retry")}
                  </button>
                </div>
              ) : !shown.length ? (
                <div className="ann-empty">
                  <AnnGlyph name={filter === "unread" ? "check" : "megaphone"} size={24} />
                  <b>{filter === "unread" ? t("annc.u.allRead") : t("annc.u.emptyTitle")}</b>
                  <p>{filter === "unread" ? t("annc.u.allReadBody") : t("annc.u.emptyBody")}</p>
                </div>
              ) : (
                <>
                  {pinned.length ? (
                    <div className="ann-sec">
                      <AnnGlyph name="pin" size={12} />
                      {t("annc.u.pinnedSection")}
                    </div>
                  ) : null}
                  {pinned.map((a) => (
                    <AnnouncementCard key={a.id} item={a} onCta={onCta} />
                  ))}
                  {pinned.length && rest.length ? <div className="ann-sec">{t("annc.u.otherSection")}</div> : null}
                  {rest.map((a) => (
                    <AnnouncementCard key={a.id} item={a} onCta={onCta} />
                  ))}
                </>
              )}
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
