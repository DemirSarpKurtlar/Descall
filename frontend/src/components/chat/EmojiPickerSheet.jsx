import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, motion, useDragControls, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { Clock, Search, X } from "lucide-react";
import { EMOJI_CATEGORIES, loadRecentEmojis, pushRecentEmoji, searchEmojis } from "../../lib/emojiCatalog";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticImpactLight } from "../../lib/fluid/haptics";
import "./EmojiPickerSheet.css";

/** Dismiss when dragged past this share of the sheet, or flicked faster than this. */
export const DISMISS_FRACTION = 0.25;
export const DISMISS_VELOCITY = 600;

export function shouldDismissSheet(offsetY, velocityY, height) {
  if (velocityY > DISMISS_VELOCITY) return true;
  if (velocityY < -DISMISS_VELOCITY) return false;
  return offsetY > Math.max(80, (height || 0) * DISMISS_FRACTION);
}

/**
 * Full emoji picker as a heavy frosted bottom sheet (iOS "More reactions").
 * Grabber + header drag the sheet (1:1, rubber-band upward), release hands the
 * finger's velocity to the sheet spring (apple-design.md §4–5). Reduced motion
 * cross-fades instead.
 */
export default function EmojiPickerSheet({ onPick, onClose, t = (s) => s, title }) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState(() => loadRecentEmojis());
  const [active, setActive] = useState(recent.length ? "recent" : EMOJI_CATEGORIES[0].id);
  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const closing = useRef(false);
  const drag = useDragControls();
  const y = useMotionValue(reduce ? 0 : 900);
  const scrimOpacity = useTransform(y, (v) => {
    const h = sheetRef.current?.offsetHeight || 600;
    return Math.max(0, Math.min(1, 1 - v / h));
  });
  const [faded, setFaded] = useState(!reduce);

  useEffect(() => {
    if (reduce) { setFaded(false); return undefined; }
    const h = sheetRef.current?.offsetHeight || 600;
    y.set(h);
    const c = animate(y, 0, framerSpring(SPRINGS.sheet));
    return () => c.stop();
  }, [reduce, y]);

  const close = useCallback((velocity) => {
    if (closing.current) return;
    closing.current = true;
    if (reduce) {
      setFaded(true);
      setTimeout(() => onClose?.(), 200);
      return;
    }
    const h = sheetRef.current?.offsetHeight || 600;
    animate(y, h + 40, { ...framerSpring(SPRINGS.sheet, velocity), restDelta: 1, onComplete: () => onClose?.() });
  }, [onClose, reduce, y]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  const pick = (emoji) => {
    hapticImpactLight();
    setRecent(pushRecentEmoji(emoji));
    onPick?.(emoji);
    close();
  };

  const results = useMemo(() => (query.trim() ? searchEmojis(query) : null), [query]);
  const sections = useMemo(() => {
    const list = EMOJI_CATEGORIES.map((c) => ({ id: c.id, label: t(c.nameKey), icon: c.icon, emojis: c.emojis }));
    return recent.length ? [{ id: "recent", label: t("Recent"), icon: null, emojis: recent }, ...list] : list;
  }, [recent, t]);

  const jump = (id) => {
    setActive(id);
    setQuery("");
    requestAnimationFrame(() => {
      const body = bodyRef.current;
      const el = body?.querySelector(`[data-cat="${id}"]`);
      if (body && el) body.scrollTo({ top: el.offsetTop - 4, behavior: reduce ? "auto" : "smooth" });
    });
  };

  const onScroll = () => {
    const body = bodyRef.current;
    if (!body || results) return;
    let cur = sections[0]?.id;
    for (const el of body.querySelectorAll("[data-cat]")) {
      if (el.offsetTop - body.scrollTop <= 24) cur = el.dataset.cat;
    }
    if (cur && cur !== active) setActive(cur);
  };

  const startDrag = (e) => { if (!reduce) drag.start(e); };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="emoji-sheet-layer">
      <motion.button
        type="button"
        className="emoji-sheet-scrim"
        aria-label={t("Close")}
        style={reduce ? undefined : { opacity: scrimOpacity }}
        animate={reduce ? { opacity: faded ? 0 : 1 } : undefined}
        initial={reduce ? { opacity: 0 } : false}
        transition={REDUCED_MOTION_FADE}
        onClick={() => close()}
      />
      <motion.div
        ref={sheetRef}
        className="emoji-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title || t("More reactions")}
        style={reduce ? undefined : { y }}
        animate={reduce ? { opacity: faded ? 0 : 1 } : undefined}
        initial={reduce ? { opacity: 0 } : false}
        transition={REDUCED_MOTION_FADE}
        drag={reduce ? false : "y"}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.08, bottom: 1 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          const h = sheetRef.current?.offsetHeight || 600;
          if (shouldDismissSheet(info.offset.y, info.velocity.y, h)) close(info.velocity.y);
          else animate(y, 0, framerSpring(SPRINGS.sheet, info.velocity.y));
        }}
      >
        <div className="emoji-sheet-handle" onPointerDown={startDrag}>
          <span className="emoji-sheet-grabber" aria-hidden="true" />
          <div className="emoji-sheet-head">
            <b>{title || t("More reactions")}</b>
            <button type="button" className="emoji-sheet-close" aria-label={t("Close")} onClick={() => close()}>
              <X size={16} />
            </button>
          </div>
        </div>
        <label className="emoji-sheet-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search emoji")}
            aria-label={t("Search emoji")}
            enterKeyHint="search"
            autoComplete="off"
          />
        </label>
        <div className="emoji-sheet-tabs" role="tablist" aria-label={t("Emoji categories")}>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={!results && active === s.id}
              aria-label={s.label}
              title={s.label}
              className="emoji-sheet-tab"
              onClick={() => jump(s.id)}
            >
              {s.icon ? <span>{s.icon}</span> : <Clock size={17} />}
            </button>
          ))}
        </div>
        <div ref={bodyRef} className="emoji-sheet-body" onScroll={onScroll}>
          {results ? (
            <section>
              <h3 className="emoji-sheet-cat">{t("Search results")}</h3>
              {results.length ? (
                <div className="emoji-sheet-grid">
                  {results.map((e) => (
                    <button key={e} type="button" className="emoji-sheet-emoji" onClick={() => pick(e)}>{e}</button>
                  ))}
                </div>
              ) : (
                <p className="emoji-sheet-empty">{t("No emoji found")}</p>
              )}
            </section>
          ) : sections.map((s) => (
            <section key={s.id} data-cat={s.id}>
              <h3 className="emoji-sheet-cat">{s.label}</h3>
              <div className="emoji-sheet-grid">
                {s.emojis.map((e) => (
                  <button key={`${s.id}-${e}`} type="button" className="emoji-sheet-emoji" onClick={() => pick(e)}>{e}</button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
