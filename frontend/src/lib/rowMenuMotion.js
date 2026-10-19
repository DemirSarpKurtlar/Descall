// Shared opening animation for the chat-list right-click menus (Groups and DMs).
// Spring materialize from the pointer (transform-origin = click point inside the
// menu), opacity-only fade under prefers-reduced-motion.
import { SPRINGS, framerSpring } from "./fluid/springs";

export function rowMenuMotion(reduceMotion) {
  if (reduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.15 },
    };
  }
  return {
    initial: { opacity: 0, scale: 0.6 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8, transition: { duration: 0.14 } },
    transition: framerSpring(SPRINGS.materialize),
  };
}

// transform-origin for a menu placed at (left, top) that opened from point (x, y).
export function rowMenuOrigin(x, y, left, top, w, h) {
  const ox = Math.max(0, Math.min(w, x - left));
  const oy = Math.max(0, Math.min(h, y - top));
  return `${ox}px ${oy}px`;
}
