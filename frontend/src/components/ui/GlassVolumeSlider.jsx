import { useEffect, useRef, useState } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useT } from "../../context/LocaleContext";
import {
  GLASS_VOL_THUMB,
  GLASS_VOL_THUMB_COMPACT,
  nextMuteValue,
  snapVolume,
  volumeFraction,
  volumeFromPointer,
  volumeIconTier,
} from "../../lib/glassVolume";
import { computeVelocity, createSpring } from "../../lib/fluid/physics";
import { hapticSelection } from "../../lib/fluid/haptics";
import { physicsSpring, SPRINGS } from "../../lib/fluid/springs";

const ICONS = { mute: VolumeX, low: Volume1, high: Volume2 };

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

/**
 * iOS-style glass volume slider for every platform.
 * Drag tracks 1:1 and rubber-bands past the ends. The fill meets the thumb.
 * The speaker icon follows the level and toggles mute.
 */
export default function GlassVolumeSlider({
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  compact = false,
  narrow = false,
  block = false,
  surface = false,
  disabled = false,
}) {
  const t = useT();
  const thumb = compact ? GLASS_VOL_THUMB_COMPACT : GLASS_VOL_THUMB;
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const visualRef = useRef(volumeFraction(value, min, max));
  const rememberedRef = useRef(Number(value) > min ? Number(value) : null);
  const springTargetRef = useRef(null);
  const rafRef = useRef(0);
  const reducedRef = useRef(false);
  const [visual, setVisual] = useState(() => volumeFraction(value, min, max));
  const [dragging, setDragging] = useState(false);
  const [live, setLive] = useState(() => Number(value) || 0);

  const shown = dragging ? live : Number(value) || 0;
  const tier = volumeIconTier(shown, min, max);
  const Icon = ICONS[tier];
  // +1px tucks the fill under the thumb so rounding cannot open a notch.
  const fill = `calc(${visual} * (100% - ${thumb}px) + ${thumb}px + 1px)`;
  const thumbPos = `calc(${visual} * (100% - ${thumb}px))`;

  function paint(next) {
    visualRef.current = next;
    setVisual(next);
  }

  function animateTo(to, velocity = 0) {
    cancelAnimationFrame(rafRef.current);
    springTargetRef.current = to;
    if (reducedRef.current || Math.abs(visualRef.current - to) < 0.0008) {
      paint(to);
      return;
    }
    const spring = createSpring({
      from: visualRef.current,
      to,
      velocity,
      ...physicsSpring(SPRINGS.default),
      restDelta: 0.0008,
      restSpeed: 0.00002,
    });
    let last = performance.now();
    const tick = (now) => {
      if (dragRef.current) return;
      const dt = Math.min(40, now - last);
      last = now;
      paint(spring.step(dt));
      if (!spring.done) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (Number(value) > min) rememberedRef.current = Number(value);
    if (dragRef.current) return;
    const to = volumeFraction(value, min, max);
    if (springTargetRef.current === to) return;
    if (Math.abs(visualRef.current - to) < 0.0008) {
      springTargetRef.current = to;
      return;
    }
    animateTo(to, 0);
    // animateTo closes over refs only; value/min/max are the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max]);

  function emit(next) {
    setLive(next);
    if (next !== Number(value)) onChange?.(next);
  }

  function pointFromEvent(event, grabOffset) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return volumeFromPointer({
      pointerX: event.clientX,
      trackLeft: rect.left,
      trackWidth: rect.width,
      thumb,
      min,
      max,
      step,
      grabOffset,
    });
  }

  function onPointerDown(event) {
    if (disabled || (event.button != null && event.button !== 0)) return;
    event.stopPropagation();
    event.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const local = event.clientX - rect.left;
    const travel = Math.max(1, rect.width - thumb);
    const currentLeft = visualRef.current * travel;
    const onThumb = local >= currentLeft - 4 && local <= currentLeft + thumb + 4;
    const grabOffset = onThumb ? local - currentLeft : null;
    const point = pointFromEvent(event, grabOffset);
    if (!point) return;
    cancelAnimationFrame(rafRef.current);
    dragRef.current = {
      id: event.pointerId,
      grabOffset,
      samples: [{ x: event.clientX, t: performance.now() }],
      last: point.value,
    };
    setDragging(true);
    springTargetRef.current = null;
    paint(point.visualFraction);
    emit(point.value);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus?.({ preventScroll: true });
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const point = pointFromEvent(event, drag.grabOffset);
    if (!point) return;
    drag.samples.push({ x: event.clientX, t: performance.now() });
    if (drag.samples.length > 6) drag.samples.shift();
    paint(point.visualFraction);
    if (point.value !== drag.last) {
      const was = drag.last;
      drag.last = point.value;
      if ((point.value <= min && was > min) || (point.value >= max && was < max)) hapticSelection();
      emit(point.value);
    }
  }

  function finish(event) {
    const drag = dragRef.current;
    if (!drag || (event && drag.id !== event.pointerId)) return;
    dragRef.current = null;
    setDragging(false);
    const rect = trackRef.current?.getBoundingClientRect();
    const travel = Math.max(1, (rect?.width || 1) - thumb);
    const velocity = computeVelocity(drag.samples) / travel;
    animateTo(volumeFraction(drag.last, min, max), velocity);
  }

  function toggleMute(event) {
    event.stopPropagation();
    event.preventDefault();
    if (disabled) return;
    const current = dragRef.current ? dragRef.current.last : Number(value) || 0;
    if (current > min) rememberedRef.current = current;
    hapticSelection();
    emit(nextMuteValue(current, min, max, rememberedRef.current, step));
  }

  function onKeyDown(event) {
    if (disabled) return;
    const span = Math.abs(max - min);
    const current = Number(value) || 0;
    let next = null;
    if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown" || event.key === "PageDown") {
      const amount = event.key === "PageDown"
        ? Math.max(step * 10, span / 10)
        : (event.shiftKey ? step : Math.max(step, span / 20));
      next = current - amount;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "PageUp") {
      const amount = event.key === "PageUp"
        ? Math.max(step * 10, span / 10)
        : (event.shiftKey ? step : Math.max(step, span / 20));
      next = current + amount;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    emit(snapVolume(next, min, max, step));
  }

  const pct = `${Math.round(shown)}%`;
  const className = [
    "g-vol",
    compact ? "is-compact" : "",
    narrow ? "is-narrow" : "",
    block ? "is-block" : "",
    surface ? "is-on-surface" : "",
    dragging ? "is-dragging" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className} style={{ "--g-vol-thumb": `${thumb}px` }}>
      <button
        type="button"
        className="g-vol-icon"
        aria-label={tier === "mute" ? t("Unmute") : t("Mute")}
        disabled={disabled}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={toggleMute}
      >
        <Icon size={compact ? 16 : 18} aria-hidden="true" />
      </button>
      <div
        className="g-vol-slider"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={pct}
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onKeyDown={onKeyDown}
      >
        <div className="g-vol-track" ref={trackRef}>
          <div className="g-vol-fill" style={{ width: fill }} />
        </div>
        <div className="g-vol-thumb" style={{ left: thumbPos }} />
      </div>
      <span className="g-vol-pct" aria-hidden="true">{pct}</span>
    </div>
  );
}
