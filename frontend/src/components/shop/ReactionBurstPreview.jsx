import { useEffect, useRef, useState } from "react";
import ReactionBurstPop, { BURST_LIFETIME_MS, burstChipClass } from "../chat/ReactionBurstPop.jsx";
import { prefersReducedMotion, sharedBurstPreviewLoop } from "../../lib/burstPreviewLoop.js";

export const PREVIEW_EMOJI = "🔥";

/**
 * Live preview of a reaction burst on a shop card: a sample reaction chip
 * ("🔥 3", mine) that replays the real chat effect (ReactionBurstPop +
 * burst-chip-<key>) on a loop while the card is on screen. Reduced motion =
 * one still frame. Decorative: the card's name / description carry meaning.
 */
export default function ReactionBurstPreview({ effectKey, emoji = PREVIEW_EMOJI, compact = false }) {
  const ref = useRef(null);
  const [still] = useState(() => prefersReducedMotion());
  const [burst, setBurst] = useState(() => (still ? { id: "still", emoji } : null));

  useEffect(() => {
    if (still || !ref.current) return undefined;
    let clear = null;
    const fire = () => {
      const id = `${Date.now()}`;
      setBurst({ id, emoji });
      if (clear) window.clearTimeout(clear);
      clear = window.setTimeout(() => setBurst((prev) => (prev?.id === id ? null : prev)), BURST_LIFETIME_MS);
    };
    const unobserve = sharedBurstPreviewLoop().observe(ref.current, fire);
    return () => {
      unobserve();
      if (clear) window.clearTimeout(clear);
    };
  }, [still, emoji]);

  const chipFx = burst ? ` ${burstChipClass(effectKey)}` : "";
  return (
    <div
      ref={ref}
      className={`shop-reaction-burst-preview cosmetic-reaction-burst burst-${effectKey}${still ? " is-still" : ""}${compact ? " is-compact" : ""}`}
      data-effect={effectKey}
      aria-hidden="true"
    >
      <div className="srb-stage">
        <ReactionBurstPop burst={burst} still={still} />
        {/* key restarts the chip's CSS keyframes on every burst */}
        <span key={burst?.id || "rest"} className={`reaction-chip reaction-mine srb-chip${chipFx}`}>
          <span className="reaction-emoji">{emoji}</span>
          <span className="reaction-count">3</span>
        </span>
      </div>
    </div>
  );
}
