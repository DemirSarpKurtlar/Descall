import { useEffect, useRef, useState } from "react";
import { createValueAnimator } from "../lib/fluid/animator";
import { SPRINGS } from "../lib/fluid/springs";

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Glass surfaces materialize instead of just fading (apple-design.md §12):
 * blur radius, scale and opacity animate together from one spring progress
 * value (0 → 1), written as `--g-mat` on the element; CSS maps it to
 * opacity / scale / backdrop blur. Exit runs the same path backwards. Re-opening
 * mid-exit continues from the live value (interruptible).
 * Reduced motion: 200 ms opacity fade only (CSS reads `data-reduced-motion`).
 *
 *   const { ref, mounted } = useMaterialize(open);
 *   {mounted && <div ref={ref} className="g-materialize">…</div>}
 */
export function useMaterialize(open, { preset = SPRINGS.materialize, appear = true } = {}) {
  const ref = useRef(null);
  const [mounted, setMounted] = useState(open);
  const progressRef = useRef(open && !appear ? 1 : 0);
  const animRef = useRef(null);

  if (!animRef.current) {
    animRef.current = createValueAnimator(
      progressRef.current,
      (v) => {
        progressRef.current = v;
        ref.current?.style.setProperty("--g-mat", v.toFixed(4));
      },
      { scale: 0.001 }
    );
  }

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    const anim = animRef.current;
    const el = ref.current;
    if (!mounted) return undefined;
    const reduced = prefersReducedMotion();
    if (el) {
      el.toggleAttribute("data-reduced-motion", reduced);
      el.style.setProperty("--g-mat", anim.value.toFixed(4));
    }
    let cancelled = false;
    if (reduced) {
      // Cross-fade handled by CSS transition on opacity.
      anim.set(open ? 1 : 0);
      if (!open) {
        const t = setTimeout(() => !cancelled && setMounted(false), 200);
        return () => {
          cancelled = true;
          clearTimeout(t);
        };
      }
      return undefined;
    }
    anim.to(open ? 1 : 0, { preset }).then((v) => {
      if (!cancelled && !open && v <= 0.001) setMounted(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, mounted, preset]);

  useEffect(() => () => animRef.current?.stop(), []);

  return { ref, mounted, progress: progressRef };
}

export default useMaterialize;
