import { motion, AnimatePresence } from "framer-motion";

// The reaction burst the chat plays when one of MY reactions lands
// (MessageReactions) and the shop's live preview of it (ReactionBurstPreview)
// render this same component, so the store shows exactly what the chat does.

export const BURST_PARTICLES = [
  { x: -22, y: -28, r: -18, d: 0 },
  { x: 18, y: -30, r: 14, d: 0.04 },
  { x: -28, y: 6, r: -28, d: 0.08 },
  { x: 26, y: 4, r: 22, d: 0.06 },
  { x: 4, y: -36, r: 6, d: 0.02 },
];

/** How long one burst stays mounted (particles 0.48 s + the longest delay). */
export const BURST_LIFETIME_MS = 520;

/** CSS class the reacted chip wears while its burst plays. */
export function burstChipClass(effectKey) {
  return effectKey ? `burst-chip-${effectKey}` : "";
}

/**
 * `burst` = { id, emoji } while a burst plays, null otherwise.
 * `still` = one static frame (reduced motion): particles parked at their peak.
 */
export default function ReactionBurstPop({ burst, still = false }) {
  if (still) {
    if (!burst) return null;
    return (
      <div className="reaction-burst-pop is-still" aria-hidden>
        {BURST_PARTICLES.map((p, i) => (
          <span
            key={i}
            className="reaction-burst-pop-emoji"
            style={{
              opacity: 0.55,
              transform: `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg) scale(0.7)`,
            }}
          >
            {burst.emoji}
          </span>
        ))}
      </div>
    );
  }
  return (
    <AnimatePresence>
      {burst && (
        <motion.div
          key={burst.id}
          className="reaction-burst-pop"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden
        >
          {BURST_PARTICLES.map((p, i) => (
            <motion.span
              key={i}
              className="reaction-burst-pop-emoji"
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.4, rotate: 0 }}
              animate={{
                opacity: [0, 1, 0],
                x: p.x,
                y: p.y,
                scale: [0.4, 1.15, 0.7],
                rotate: p.r,
              }}
              transition={{ duration: 0.48, delay: p.d, ease: [0.16, 1, 0.3, 1] }}
            >
              {burst.emoji}
            </motion.span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
