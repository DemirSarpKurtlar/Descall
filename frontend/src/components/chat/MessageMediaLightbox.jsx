import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, Download, Copy, ExternalLink, ChevronLeft, ChevronRight, Plus, Minus } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";
import { usePrivateMediaUrl } from "../../lib/privateMediaUrls";
import {
  DOUBLE_TAP_SCALE, MAX_SCALE, clampPan, rubberBand, shouldDismiss, swipeStep, zoomAt,
} from "../../lib/mediaViewerMath";

const FIT = { scale: 1, x: 0, y: 0 };

function formatTime(at, t) {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const hm = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `${t("Today")} ${hm}`;
  return `${d.toLocaleDateString()} ${hm}`;
}

async function toPngBlob(blob) {
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

/**
 * Fullscreen chat image viewer (2.13.8 mockup): heavy frosted glass backdrop,
 * wheel/pinch zoom, pan, double-click/tap zoom, swipe-down dismiss (rubber band
 * + velocity), gallery arrows / swipe / ←→, download / copy / open original,
 * sender + time header, Esc. `items` = [{ id, raw, name, sender, avatar, at }].
 */
export default function MessageMediaLightbox({ open, src, alt = "", onClose, items = null, startId = null, sender = "", at = null }) {
  const t = useT();
  const reduce = useReducedMotion();
  const list = useMemo(() => (items && items.length ? items : [{ id: "single", raw: src, name: alt, sender, at }]), [items, src, alt, sender, at]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!open) return;
    const i = list.findIndex((it) => it.id === startId);
    setIndex(i >= 0 ? i : Math.max(0, list.findIndex((it) => it.raw === src)));
  }, [open, startId, src, list]);
  const item = list[index] || list[0];
  const resolved = usePrivateMediaUrl(item?.raw || "");
  const url = item?.raw === src && src ? src : resolved.url;

  const [view, setView] = useState(FIT);
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false, mode: null });
  const [toast, setToast] = useState("");
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(0);

  useEffect(() => { setView(FIT); setDrag({ dx: 0, dy: 0, active: false, mode: null }); }, [index, open]);

  const go = useCallback((step) => {
    setIndex((i) => Math.min(list.length - 1, Math.max(0, i + step)));
  }, [list.length]);

  const sizes = () => {
    const s = stageRef.current?.getBoundingClientRect();
    const im = imgRef.current;
    return { sw: s?.width || 1, sh: s?.height || 1, iw: im?.offsetWidth || 1, ih: im?.offsetHeight || 1, sx: s ? s.left + s.width / 2 : 0, sy: s ? s.top + s.height / 2 : 0 };
  };
  const setZoom = useCallback((next, cx, cy) => {
    const { sw, sh, iw, ih, sx, sy } = sizes();
    setView((v) => clampPan(zoomAt(v, next, (cx ?? sx) - sx, (cy ?? sy) - sy), iw, ih, sw, sh));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") setZoom(view.scale * 1.5);
      else if (e.key === "-") setZoom(view.scale / 1.5);
      else if (e.key === "0") setView(FIT);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener("keydown", onKey); };
  }, [open, onClose, go, setZoom, view.scale]);

  useEffect(() => {
    const el = stageRef.current;
    if (!open || !el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
      setZoom(view.scale * factor, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, setZoom, view.scale]);

  const onPointerDown = (e) => {
    e.stopPropagation();
    if (e.target.closest?.("button")) return;
    stageRef.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      gesture.current = { kind: "pinch", d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), s0: view.scale };
    } else {
      gesture.current = { kind: view.scale > 1 ? "pan" : "swipe", x0: e.clientX, y0: e.clientY, t0: performance.now(), v0: view, lastX: e.clientX, lastY: e.clientY, lastT: performance.now(), vx: 0, vy: 0, moved: false };
    }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const { sw, sh, iw, ih } = sizes();
    if (g.kind === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setZoom(g.s0 * (d / (g.d0 || 1)), (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      return;
    }
    const now = performance.now();
    const dt = Math.max(1, now - g.lastT);
    g.vx = (e.clientX - g.lastX) / dt; g.vy = (e.clientY - g.lastY) / dt;
    g.lastX = e.clientX; g.lastY = e.clientY; g.lastT = now;
    const dx = e.clientX - g.x0; const dy = e.clientY - g.y0;
    if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
    if (g.kind === "pan") {
      setView(clampPan({ ...g.v0, x: g.v0.x + dx, y: g.v0.y + dy }, iw, ih, sw, sh));
      return;
    }
    if (!g.axis && g.moved) g.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
    if (g.axis === "y") setDrag({ dx: 0, dy: dy > 0 ? dy : rubberBand(dy, sh), active: true, mode: "dismiss" });
    else if (g.axis === "x") {
      const edge = (dx > 0 && index === 0) || (dx < 0 && index === list.length - 1);
      setDrag({ dx: edge ? rubberBand(dx, sw) : dx, dy: 0, active: true, mode: "swipe" });
    }
  };
  const onPointerUp = (e) => {
    e.stopPropagation();
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size) return;
    gesture.current = null;
    if (!g) return;
    const { sw, sh } = sizes();
    if (g.kind === "swipe" && g.axis === "y") {
      if (shouldDismiss(drag.dy, g.vy, sh)) { onClose?.(); return; }
    } else if (g.kind === "swipe" && g.axis === "x") {
      const step = swipeStep(drag.dx, g.vx, sw);
      if (step) go(step);
    } else if (!g.moved && g.kind !== "pinch") {
      const now = performance.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        if (view.scale > 1) setView(FIT); else setZoom(DOUBLE_TAP_SCALE, e.clientX, e.clientY);
      } else {
        lastTap.current = now;
        // A single tap on the backdrop (outside the image) closes.
        if (view.scale === 1 && !e.target.closest?.(".mv-img")) {
          window.setTimeout(() => { if (lastTap.current === now) onClose?.(); }, 300);
        }
      }
    }
    setDrag({ dx: 0, dy: 0, active: false, mode: null });
  };

  const flash = (msg) => { setToast(msg); window.setTimeout(() => setToast(""), 1600); };
  const fetchBlob = async () => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.blob(); };
  const download = async () => {
    try {
      const blob = await fetchBlob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = item?.name || "descall-image";
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { window.open(url, "_blank", "noopener"); }
  };
  const copy = async () => {
    try {
      const blob = await toPngBlob(await fetchBlob());
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
      flash(t("Image copied"));
    } catch {
      try { await navigator.clipboard.writeText(url); flash(t("Link copied")); } catch { flash(t("Couldn't copy")); }
    }
  };
  const openOriginal = () => window.open(url, "_blank", "noopener,noreferrer");

  if (typeof document === "undefined") return null;
  const dismissProgress = drag.mode === "dismiss" ? Math.min(1, Math.max(0, drag.dy) / 400) : 0;
  const spring = reduce || drag.active || gesture.current?.kind === "pan" || gesture.current?.kind === "pinch"
    ? "none" : "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)";
  const imgStyle = {
    transform: `translate3d(${view.x + drag.dx}px, ${view.y + drag.dy}px, 0) scale(${view.scale * (1 - dismissProgress * 0.25)})`,
    transition: spring,
    cursor: view.scale > 1 ? "grab" : "zoom-in",
  };
  const seal = (event) => event.stopPropagation();
  const btn = (label, Icon, onClick, extra = "") => (
    <button type="button" className={`mv-btn ${extra}`} onClick={(e) => { seal(e); onClick(); }} aria-label={label} title={label}>
      <Icon size={20} strokeWidth={2} />
      <span className="mv-btn-label">{label}</span>
    </button>
  );

  return createPortal(
    <AnimatePresence>
      {open && (item?.raw || src) ? (
        <motion.div
          className="message-media-lightbox mv-root"
          role="dialog"
          aria-modal="true"
          aria-label={item?.name || alt || t("Image")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 - dismissProgress * 0.6 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          onPointerDown={seal}
          onPointerUp={seal}
          onTouchStart={seal}
          onTouchEnd={seal}
          onClick={seal}
        >
          <div className="mv-top g-glass-heavy" onPointerDown={seal}>
            <div className="mv-who">
              {item?.avatar ? <img className="mv-avatar" src={item.avatar} alt="" /> : <span className="mv-avatar mv-avatar-fallback">{String(item?.sender || "?").slice(0, 1).toUpperCase()}</span>}
              <div className="mv-who-text">
                <strong>{item?.sender || ""}</strong>
                <span>{formatTime(item?.at, t)}</span>
              </div>
            </div>
            <div className="mv-actions">
              {btn(t("Download"), Download, download)}
              {btn(t("Copy"), Copy, copy)}
              {btn(t("Open original"), ExternalLink, openOriginal)}
              {btn(t("Close"), X, () => onClose?.(), "mv-close")}
            </div>
          </div>

          <div
            ref={stageRef}
            className="mv-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="mv-frame g-glass-heavy" style={{ transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0) scale(${1 - dismissProgress * 0.12})`, transition: spring }}>
              <img
                ref={imgRef}
                key={url}
                src={url}
                alt={item?.name || alt || t("Image")}
                className="mv-img message-media-lightbox-img"
                style={{ ...imgStyle, transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}
                draggable={false}
                onError={resolved.onMediaError}
              />
            </div>
          </div>

          {list.length > 1 && index > 0 && (
            <button type="button" className="mv-nav mv-prev g-glass-heavy" onPointerDown={seal} onClick={(e) => { seal(e); go(-1); }} aria-label={t("Previous image")}><ChevronLeft size={26} /></button>
          )}
          {list.length > 1 && index < list.length - 1 && (
            <button type="button" className="mv-nav mv-next g-glass-heavy" onPointerDown={seal} onClick={(e) => { seal(e); go(1); }} aria-label={t("Next image")}><ChevronRight size={26} /></button>
          )}

          <div className="mv-bottom g-glass-heavy" onPointerDown={seal}>
            <button type="button" className="mv-zoom" onClick={(e) => { seal(e); setZoom(view.scale / 1.5); }} aria-label={t("Zoom out")} disabled={view.scale <= 1}><Minus size={18} /></button>
            <button type="button" className="mv-zoom-value" onClick={(e) => { seal(e); setView(FIT); }} aria-label={t("Reset zoom")}>{Math.round(view.scale * 100)}%</button>
            <button type="button" className="mv-zoom" onClick={(e) => { seal(e); setZoom(view.scale * 1.5); }} aria-label={t("Zoom in")} disabled={view.scale >= MAX_SCALE}><Plus size={18} /></button>
            {list.length > 1 && (
              <>
                <span className="mv-sep" />
                <span className="mv-count">{index + 1} / {list.length}</span>
                <span className="mv-dots" aria-hidden="true">
                  {list.slice(Math.max(0, index - 3), Math.max(0, index - 3) + 7).map((it) => (
                    <i key={it.id} className={it.id === item.id ? "on" : ""} />
                  ))}
                </span>
              </>
            )}
          </div>
          <p className="mv-hint">{t("Scroll to zoom · Double-click · Swipe down to close · Esc")}</p>
          {toast && <div className="mv-toast g-glass-heavy" role="status">{toast}</div>}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
