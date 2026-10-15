import { useCallback, useEffect, useRef, useState } from "react";
import { computeVelocity, createSpring } from "../lib/fluid/physics";
import {
  CHIP_SLOP_PX,
  classifyChipDrag,
  coastTarget,
  dragOffset,
  overflowEdges,
  pageOffset,
  revealOffset,
  wheelScrollDelta,
} from "../lib/shopChipScroll";

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Drag, flick, wheel, and arrow control for the shop category strip.
 * The track's transform is written from this hook so a grab always starts
 * from the on-screen offset.
 */
export function useShopChipScroll({ activeId, onActivate, ready = true }) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const xRef = useRef(0);
  const maxRef = useRef(0);
  const animRef = useRef(0);
  const reducedRef = useRef(false);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const [edges, setEdges] = useState({ left: false, right: false });

  const publish = useCallback((x) => {
    const max = maxRef.current;
    const next = Number.isFinite(x) ? x : 0;
    xRef.current = next;
    const track = trackRef.current;
    if (track) track.style.transform = `translate3d(${(-next).toFixed(2)}px,0,0)`;
    const edge = overflowEdges(next, max);
    setEdges((prev) => (prev.left === edge.left && prev.right === edge.right ? prev : edge));
  }, []);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return 0;
    const max = Math.max(0, track.scrollWidth - viewport.clientWidth);
    maxRef.current = max;
    if (xRef.current > max) publish(max);
    else publish(xRef.current);
    return max;
  }, [publish]);

  const stop = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = 0;
  }, []);

  const animateTo = useCallback((to, velocity = 0, { dampingRatio = 1 } = {}) => {
    stop();
    const max = maxRef.current;
    const dest = Math.max(0, Math.min(max, to));
    if (reducedRef.current || Math.abs(dest - xRef.current) < 0.5) {
      publish(dest);
      return;
    }
    const spring = createSpring({
      from: xRef.current,
      to: dest,
      velocity,
      response: 340,
      dampingRatio,
      min: Math.min(0, xRef.current, dest),
      max: Math.max(max, xRef.current, dest),
    });
    let last = 0;
    const tick = (now) => {
      const dt = last ? now - last : 16;
      last = now;
      publish(spring.step(dt));
      if (!spring.done) animRef.current = requestAnimationFrame(tick);
      else animRef.current = 0;
    };
    animRef.current = requestAnimationFrame(tick);
  }, [publish, stop]);

  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!ready || !viewport || !track) return undefined;

    let pointerId = null;
    let originX = 0;
    let originY = 0;
    let originOffset = 0;
    let dragging = false;
    let suppressClick = false;
    const samples = [];

    const onDown = (event) => {
      if (event.button > 0 || pointerId != null) return;
      if (event.target?.closest?.(".shop-chip-arrow")) return;
      reducedRef.current = prefersReducedMotion();
      stop();
      measure();
      pointerId = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
      originOffset = xRef.current;
      dragging = false;
      samples.length = 0;
      samples.push({ x: originOffset, t: event.timeStamp });
    };

    const onMove = (event) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - originX;
      const dy = event.clientY - originY;
      if (!dragging) {
        const kind = classifyChipDrag(dx, dy);
        if (kind === "pending") return;
        if (kind === "reject") {
          pointerId = null;
          return;
        }
        dragging = true;
        suppressClick = true;
        const sign = dx < 0 ? -1 : 1;
        originX += sign * CHIP_SLOP_PX;
        viewport.classList.add("is-dragging");
        try { viewport.setPointerCapture?.(event.pointerId); } catch { /* already released */ }
      }
      const delta = originOffset - (event.clientX - originX);
      const next = dragOffset(0, delta, 0, maxRef.current, viewport.clientWidth);
      samples.push({ x: next, t: event.timeStamp });
      publish(next);
      event.preventDefault();
    };

    const finish = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      viewport.classList.remove("is-dragging");
      if (!dragging) return;
      dragging = false;
      const velocity = computeVelocity(samples);
      const offset = xRef.current;
      const max = maxRef.current;
      const outside = offset < 0 || offset > max;
      const dest = outside ? Math.max(0, Math.min(max, offset)) : coastTarget(offset, velocity, 0, max);
      animateTo(dest, reducedRef.current ? 0 : velocity, { dampingRatio: outside ? 1 : 0.8 });
    };

    const onClick = (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const onWheel = (event) => {
      if (maxRef.current <= 1) return;
      const delta = wheelScrollDelta({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        shiftKey: event.shiftKey,
        viewportWidth: viewport.clientWidth,
        viewportHeight: viewport.clientHeight,
      });
      if (!delta) return;
      stop();
      const next = Math.max(0, Math.min(maxRef.current, xRef.current + delta));
      if (next === xRef.current) return;
      publish(next);
      event.preventDefault();
    };

    const onResize = () => {
      measure();
    };

    viewport.addEventListener("pointerdown", onDown);
    viewport.addEventListener("click", onClick, true);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("resize", onResize);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    observer?.observe(viewport);
    observer?.observe(track);
    measure();

    return () => {
      stop();
      viewport.classList.remove("is-dragging");
      viewport.removeEventListener("pointerdown", onDown);
      viewport.removeEventListener("click", onClick, true);
      viewport.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, [animateTo, measure, publish, ready, stop]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!ready || !viewport || !track || activeId == null) return undefined;
    const tab = track.querySelector(`[data-tab-id="${CSS.escape(String(activeId))}"]`);
    if (!tab) return undefined;
    const max = measure();
    const next = revealOffset(
      xRef.current,
      max,
      tab.offsetLeft,
      tab.offsetLeft + tab.offsetWidth,
      viewport.clientWidth,
    );
    if (Math.abs(next - xRef.current) > 1) animateTo(next, 0, { dampingRatio: 1 });
    return undefined;
  }, [activeId, animateTo, measure, ready]);

  const scrollByPage = useCallback((direction) => {
    reducedRef.current = prefersReducedMotion();
    const viewport = viewportRef.current;
    measure();
    const dest = pageOffset(xRef.current, maxRef.current, viewport?.clientWidth || 0, direction);
    animateTo(dest, 0, { dampingRatio: 1 });
  }, [animateTo, measure]);

  const onKeyDown = useCallback((event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const track = trackRef.current;
    if (!track) return;
    const tabs = [...track.querySelectorAll("[data-tab-id]")];
    if (!tabs.length) return;
    const index = tabs.findIndex((el) => el.dataset.tabId === String(activeId));
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[index + step];
    if (!next) return;
    event.preventDefault();
    next.focus();
    onActivateRef.current?.(next.dataset.tabId);
  }, [activeId]);

  return { viewportRef, trackRef, edges, scrollByPage, onKeyDown };
}
