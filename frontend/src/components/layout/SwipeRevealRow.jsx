import { useEffect, useMemo, useRef, useState } from "react";
import useGlassUi from "../../hooks/useGlassUi";
import useDragSpring from "../../hooks/useDragSpring";
import { hapticLight } from "../../lib/haptics";
import { isFullSwipe, revealFor, swipeActionsWidth } from "../../lib/swipeReveal";

export { swipeActionsWidth };

/**
 * Mobile swipe-to-reveal: front + actions as flex siblings (same row height).
 * Shared by group and DM conversation rows.
 * Glass (iPhone): 1:1 tracking + velocity snap via useDragSpring.
 * Everywhere else: the pre-2.9.155 touch handler, unchanged.
 */
export default function SwipeRevealRow(props) {
  const glass = useGlassUi();
  if (glass) return <FluidSwipeRevealRow {...props} />;
  return <LegacySwipeRevealRow {...props} />;
}

/**
 * iPhone glass swipe row. The row content never leaves the screen: instead of
 * translating the whole row, the action strip grows from the right edge and
 * the front shrinks (avatar stays put, the name truncates). The drag clamps at
 * full reveal with UIScrollView rubber-banding past it; dragging far past it
 * (when `onFullSwipe` is given) highlights and fires the destructive action.
 */
function FluidSwipeRevealRow({ open, width, onOpenChange, onCloseOthers, front, actions, onFullSwipe }) {
  const viewportRef = useRef(null);
  const openRef = useRef(open);
  openRef.current = open;
  const lastX = useRef(0);
  const fullRef = useRef(false);
  // Stable snap points: a fresh array each render rebuilt the drag controller,
  // so any re-render mid-swipe (presence, clock) dropped the release and the
  // row stayed stuck over-dragged.
  const snapPoints = useMemo(() => [-width, 0], [width]);
  const drag = useDragSpring({
    axis: "x",
    min: -width,
    max: 0,
    snapPoints,
    dimension: Math.max(width, 1),
    rubberBand: true,
    onFrame: (x) => {
      lastX.current = x;
      const el = viewportRef.current;
      if (!el) return;
      const reveal = revealFor(x);
      el.style.setProperty("--swipe-reveal", `${reveal}px`);
      // While actions show, the time column yields its space to the name.
      el.classList.toggle("is-revealing", reveal > 12);
      const full = Boolean(onFullSwipe) && isFullSwipe(x, width);
      if (full !== fullRef.current) {
        fullRef.current = full;
        el.classList.toggle("is-full-swipe", full);
        if (full) hapticLight();
      }
    },
    onRelease: (r) => {
      if (onFullSwipe && isFullSwipe(lastX.current, width)) {
        fullRef.current = false;
        viewportRef.current?.classList.remove("is-full-swipe");
        onFullSwipe();
        return -width; // stay open behind the destructive confirm
      }
      return r.target;
    },
    onSettle: (x) => {
      const shouldOpen = x < -width * 0.5;
      if (shouldOpen && !openRef.current) hapticLight();
      if (shouldOpen !== openRef.current) onOpenChange?.(shouldOpen);
    },
  });

  useEffect(() => {
    drag.springTo(open ? -width : 0);
    // springTo identity is stable for a given width; re-run when the open flag changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, width]);

  return (
    <div
      ref={viewportRef}
      className="group-swipe-viewport is-fluid-reveal"
      style={{ "--swipe-reveal": "0px", "--swipe-width": `${width}px` }}
      {...drag.bind}
      onPointerDown={(e) => {
        onCloseOthers?.();
        drag.bind.onPointerDown(e);
      }}
    >
      <div className="group-swipe-track">
        {front}
        <div className="group-swipe-actions" aria-hidden={!open}>
          <div className="group-swipe-actions-inner" style={{ width }}>
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}

function LegacySwipeRevealRow({
  open,
  width,
  onOpenChange,
  onCloseOthers,
  front,
  actions,
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const axisLock = useRef(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef(0);

  const setOffset = (value) => {
    dragOffsetRef.current = value;
    setDragOffset(value);
  };

  const closedX = 0;
  const openX = -width;
  const visualOffset = isDragging ? dragOffset : open ? openX : closedX;

  const onTouchStart = (e) => {
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startOffset.current = open ? openX : closedX;
    axisLock.current = null;
    isDraggingRef.current = true;
    setIsDragging(true);
    setOffset(startOffset.current);
    onCloseOthers?.();
  };

  const onTouchMove = (e) => {
    if (!isDraggingRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;
    if (!axisLock.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axisLock.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axisLock.current === "y") {
        isDraggingRef.current = false;
        setIsDragging(false);
        setOffset(open ? openX : closedX);
        return;
      }
    }
    if (axisLock.current !== "x") return;
    if (e.cancelable) e.preventDefault();
    const next = Math.min(closedX, Math.max(openX, startOffset.current + dx));
    setOffset(next);
  };

  const onTouchEnd = () => {
    if (!isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      return;
    }
    const shouldOpen = dragOffsetRef.current < openX * 0.35;
    isDraggingRef.current = false;
    setIsDragging(false);
    onOpenChange?.(shouldOpen);
    setOffset(shouldOpen ? openX : closedX);
  };

  useEffect(() => {
    if (isDraggingRef.current) return;
    setOffset(open ? openX : closedX);
  }, [open, openX, closedX]);

  return (
    <div
      className="group-swipe-viewport"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        className="group-swipe-track"
        style={{
          transform: `translate3d(${visualOffset}px,0,0)`,
          transition: isDragging ? "none" : "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {front}
        <div
          className="group-swipe-actions"
          style={{ flex: `0 0 ${width}px`, width, minWidth: width }}
          aria-hidden={!open}
        >
          {actions}
        </div>
      </div>
    </div>
  );
}
