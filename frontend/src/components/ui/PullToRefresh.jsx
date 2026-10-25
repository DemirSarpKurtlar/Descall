import { useEffect, useRef, useState } from "react";
import { attachPullToRefresh } from "../../lib/pullToRefresh";
import { hapticImpactMedium } from "../../lib/fluid/haptics";
import { useT } from "../../context/LocaleContext";
import "../../styles/pull-to-refresh.css";

const SPOKES = Array.from({ length: 8 }, (_, i) => i);
// Refreshing tail: spoke 0 is the head, 7 next brightest, 1 dimmest.
const TAIL = SPOKES.map((i) => (1 - ((8 - i) % 8) * 0.105).toFixed(3));

/**
 * Wrap a list's content inside its scroller (the scroller is the parent
 * element). Mobile only: pass `enabled={isMobile}`. `onRefresh` must return
 * a promise that settles when the server data is back.
 */
export default function PullToRefresh({ onRefresh, enabled = true, children, className = "" }) {
  const t = useT();
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const indicatorRef = useRef(null);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const scroller = root?.parentElement;
    if (!enabled || !scroller) return undefined;
    return attachPullToRefresh(scroller, {
      track: trackRef.current,
      indicator: indicatorRef.current,
      onRefresh: () => refreshRef.current?.(),
      // Same feedback as UIRefreshControl when it starts refreshing.
      onHaptic: hapticImpactMedium,
      onState: (s) => setBusy(s === "refreshing"),
    });
  }, [enabled]);

  return (
    <div ref={rootRef} className={`ptr${className ? ` ${className}` : ""}`}>
      {enabled ? (
        <div ref={indicatorRef} className="ptr-indicator" aria-hidden="true" data-spokes="0" data-state="idle">
          <span className="ptr-spinner">
            {SPOKES.map((i) => (
              <span key={i} className="ptr-spoke" style={{ "--i": i, "--o": TAIL[i] }} />
            ))}
          </span>
        </div>
      ) : null}
      <div ref={trackRef} className="ptr-track">
        {children}
      </div>
      {enabled ? (
        <span className="ptr-status" role="status" aria-live="polite">
          {busy ? t("Refreshing…") : ""}
        </span>
      ) : null}
    </div>
  );
}
