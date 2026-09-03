import { useEffect, useRef, useState } from "react";

/**
 * Mobile swipe-to-reveal: front + actions as flex siblings (same row height).
 * Shared by group and DM conversation rows.
 */
export default function SwipeRevealRow({
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
