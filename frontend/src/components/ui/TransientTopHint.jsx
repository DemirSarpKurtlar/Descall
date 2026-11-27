import { useEffect, useRef, useState } from "react";
import { TOP_ZONE_PX, HINT_VISIBLE_MS, hintShouldWake } from "../../lib/transientTopHint.js";
import "./TransientTopHint.css";

/**
 * A hint over a video ("Click anywhere to exit fullscreen", "Click to expand") that never
 * covers the picture for long: it shows at the TOP for 2.5 s and fades out, and comes
 * back only when the pointer moves into the top strip of the same box. It was pinned to
 * the bottom edge, over the subtitles of a shared video (user report, Nov 2026).
 * `className` keeps the surface's own pill look; position and fade come from here.
 */
export default function TransientTopHint({ children, className = "" }) {
  const [visible, setVisible] = useState(true);
  const ref = useRef(null);
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), HINT_VISIBLE_MS);
    };
    arm();
    const host = ref.current?.parentElement;
    const onMove = (e) => {
      if (!host) return;
      if (hintShouldWake(e.clientY, host.getBoundingClientRect())) {
        setVisible(true);
        arm();
      }
    };
    host?.addEventListener("pointermove", onMove);
    return () => {
      window.clearTimeout(timer);
      host?.removeEventListener("pointermove", onMove);
    };
  }, []);
  return (
    <div
      ref={ref}
      className={`transient-top-hint ${className}${visible ? " is-visible" : ""}`}
      style={{ "--tth-zone": `${TOP_ZONE_PX}px` }}
      aria-hidden={visible ? undefined : "true"}
    >
      {children}
    </div>
  );
}
