import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Monitor, Users } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import useVoiceActivity from "../../hooks/useVoiceActivity";
import {
  anchorPoint,
  bandAxis,
  clampDockPosition,
  dockInsets,
  nearestAnchor,
  readDockAnchor,
  releaseVelocity,
  springSettled,
  springStep,
  writeDockAnchor,
} from "../../lib/miniCallDock";

const DOCK_GAP = 16; // drag may approach the title bar up to the margin, never under it
const DRAG_SLOP = 4; // px before a press becomes a drag (a tap returns to the chat)
const KEEP_OUT = [".uvp", ".message-composer", ".mobile-tab-bar"];

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function keepOutRects() {
  const out = [];
  for (const sel of KEEP_OUT) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
  }
  return out;
}

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}

/**
 * Safe box below the Electron title bar (and macOS traffic lights) plus a
 * margin. The bar is measured when mounted; the CSS token is the fallback.
 */
function safeInsets() {
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  const electron = Boolean(api?.isElectron) || document.documentElement.classList.contains("electron-app");
  let titlebarH = NaN;
  let bottom = 0;
  if (electron) {
    const bar = document.querySelector(".titlebar");
    const r = bar?.getBoundingClientRect?.();
    if (r && r.height > 0) titlebarH = r.bottom;
    else {
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--electron-titlebar-h"));
      if (Number.isFinite(v) && v > 0) titlebarH = v;
    }
    const b = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--electron-bottom-inset"));
    if (Number.isFinite(b)) bottom = b;
  }
  return dockInsets({ electron, platform: api?.platform, titlebarH, bottom });
}

/** Five bars driven by the live audio level; flat when silent / muted. */
function Waveform({ level, active }) {
  const shape = [0.45, 0.8, 1, 0.7, 0.5];
  return (
    <span className={`mcc-wave${active ? " is-active" : ""}`} aria-hidden="true">
      {shape.map((s, i) => (
        <i key={i} style={{ transform: `scaleY(${active ? Math.max(0.18, Math.min(1, level * 2.4 * s + 0.12)) : 0.18})` }} />
      ))}
    </span>
  );
}

/**
 * Premium draggable mini call card (2.11.1). Heavy frosted glass, never
 * see-through. Tap the body to return to the call's chat; drag anywhere with
 * 1:1 tracking, rubber-banded edges, momentum projection and a spring snap to
 * the nearest corner/edge that keeps clear of the user panel and composer.
 */
export default function MiniCallCard({
  t,
  isDm,
  peer,
  title,
  subtitle,
  timer,
  muted,
  deafened,
  screenSharing,
  stream,
  pending,
  onReturn,
  onToggleMute,
  onToggleDeafen,
  onHangUp,
}) {
  const ref = useRef(null);
  const pos = useRef({ x: -9999, y: -9999 });
  const anchor = useRef(readDockAnchor());
  const anim = useRef(0);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const { speaking, level } = useVoiceActivity(stream || null, { muted: Boolean(deafened) });
  const voiceLive = Boolean(stream) && !deafened && !pending;

  const apply = useCallback(() => {
    const el = ref.current;
    if (el) el.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
  }, []);

  const size = () => {
    const el = ref.current;
    return el ? { w: el.offsetWidth, h: el.offsetHeight } : { w: 320, h: 76 };
  };

  const settleTo = useCallback((target, vel = { x: 0, y: 0 }) => {
    cancelAnimationFrame(anim.current);
    if (reducedMotion()) {
      pos.current = { ...target };
      apply();
      return;
    }
    let sx = { x: pos.current.x, v: vel.x };
    let sy = { x: pos.current.y, v: vel.y };
    let last = performance.now();
    const tick = (now) => {
      // Fixed sub-steps keep the integration stable on slow frames.
      let dt = Math.min(64, now - last);
      last = now;
      while (dt > 0) {
        const h = Math.min(8, dt);
        sx = springStep(sx, target.x, h);
        sy = springStep(sy, target.y, h);
        dt -= h;
      }
      pos.current = { x: sx.x, y: sy.x };
      apply();
      if (springSettled(sx, target.x) && springSettled(sy, target.y)) {
        pos.current = { ...target };
        apply();
        return;
      }
      anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  }, [apply]);

  const place = useCallback((animate) => {
    // Saved anchor → pixel point inside the safe box (clamped on load and on resize).
    const target = anchorPoint(anchor.current, viewport(), size(), keepOutRects(), safeInsets());
    if (animate) settleTo(target);
    else {
      pos.current = target;
      apply();
    }
  }, [apply, settleTo]);

  useLayoutEffect(() => {
    place(false);
  }, [place]);

  useEffect(() => {
    const onResize = () => { if (!drag.current) place(true); };
    window.addEventListener("resize", onResize);
    // The panel / composer can appear or grow after mount.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    for (const sel of [...KEEP_OUT, ".titlebar"]) document.querySelectorAll(sel).forEach((el) => ro?.observe(el));
    // The card itself can change height (long name, pending → live).
    if (ref.current) ro?.observe(ref.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
      cancelAnimationFrame(anim.current);
    };
  }, [place]);

  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    cancelAnimationFrame(anim.current);
    ref.current.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      ox: e.clientX - pos.current.x,
      oy: e.clientY - pos.current.y,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
    };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_SLOP) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    const vp = viewport();
    const c = size();
    const ins = d.insets || (d.insets = safeInsets());
    // 1:1 inside the safe box, rubber band past its edge (never up under the title bar).
    pos.current = {
      x: bandAxis(e.clientX - d.ox, 0, vp.w - c.w, c.w),
      y: Math.max(ins.top - DOCK_GAP, bandAxis(e.clientY - d.oy, ins.top - DOCK_GAP, vp.h - c.h, c.h)),
    };
    d.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (d.samples.length > 12) d.samples.shift();
    apply();
  };

  const finish = (e, cancelled) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    try { ref.current?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!d.moved) {
      if (!cancelled) onReturn?.();
      return;
    }
    setDragging(false);
    const vel = releaseVelocity(d.samples);
    const vp = viewport();
    const c = size();
    const avoid = keepOutRects();
    const ins = d.insets || safeInsets();
    anchor.current = nearestAnchor(pos.current, vel, vp, c, avoid, ins);
    writeDockAnchor(anchor.current);
    settleTo(clampDockPosition(anchorPoint(anchor.current, vp, c, avoid, ins), vp, c, ins), vel);
  };

  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onReturn?.();
    }
  };

  const ringOn = speaking && voiceLive;

  return (
    <div
      ref={ref}
      className={`mini-call-card${dragging ? " is-dragging" : ""}${pending ? " is-pending" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={t("Return to call")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onKeyDown={onKeyDown}
    >
      <span className={`mcc-avatar${ringOn ? " is-speaking" : ""}`} style={{ "--mcc-level": Math.min(1, level * 2) }}>
        {isDm ? (
          <Avatar name={peer?.username || "?"} size={40} user={peer} animate="always" />
        ) : (
          <span className="mcc-group"><Users size={20} /></span>
        )}
        {screenSharing ? <span className="mcc-share"><Monitor size={10} /></span> : null}
      </span>
      <span className="mcc-text">
        <span className="mcc-title" title={typeof title === "string" ? title : undefined}>{title}</span>
        <span className="mcc-sub">
          {pending ? <span className="mcc-dots" aria-hidden="true"><i /><i /><i /></span> : <Waveform level={level} active={voiceLive} />}
          <span className="mcc-sub-text" title={typeof subtitle === "string" && !(timer && !pending) ? subtitle : undefined}>
            {timer && !pending ? timer : subtitle}
          </span>
        </span>
      </span>
      <span className="mcc-actions">
        <button
          type="button"
          className={`mcc-btn${muted ? " is-off" : ""}`}
          aria-pressed={Boolean(muted)}
          aria-label={muted ? t("Unmute") : t("Mute")}
          title={muted ? t("Unmute") : t("Mute")}
          onClick={onToggleMute}
        >
          {muted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          type="button"
          className={`mcc-btn${deafened ? " is-off" : ""}`}
          aria-pressed={Boolean(deafened)}
          aria-label={deafened ? t("Undeafen") : t("Deafen")}
          title={deafened ? t("Undeafen") : t("Deafen")}
          onClick={onToggleDeafen}
        >
          {deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
        </button>
        <button type="button" className="mcc-btn mcc-end" aria-label={t("End Call")} title={t("End Call")} onClick={onHangUp}>
          <PhoneOff size={16} />
        </button>
      </span>
    </div>
  );
}
