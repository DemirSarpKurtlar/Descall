import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion, sharedBurstPreviewLoop } from "../../lib/burstPreviewLoop.js";

/**
 * Shared "live preview" heartbeat for shop cards (auras, call overlays).
 * Same scheduler as the reaction previews: one IntersectionObserver, a tick
 * only while the card is on screen and the app is awake. Reduced motion =
 * no ticks, the card stays on its still frame (tick 0).
 */
export function useLivePreviewTick() {
  const ref = useRef(null);
  const [still] = useState(() => prefersReducedMotion());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (still || !ref.current) return undefined;
    return sharedBurstPreviewLoop().observe(ref.current, () => setTick((n) => n + 1));
  }, [still]);
  return { ref, still, tick };
}
