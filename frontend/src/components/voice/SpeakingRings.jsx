/**
 * Speaking indicator around a round call avatar (DM + group call tiles).
 *
 * Always mounted: speaking only flips `.is-active`, which fades the whole
 * layer with an opacity transition and resumes (never restarts) the ring
 * keyframes. Keyframes only scale — no opacity / border dips — and start and
 * end on the same frame, so loops, VAD flapping and re-renders can never
 * paint an empty / black ring frame.
 *
 * Place inside the positioned avatar core (the element exactly the size of
 * the avatar); the rings extend outside it.
 */
export default function SpeakingRings({ speaking = false, level = 0 }) {
  const lvl = speaking ? Math.max(0, Math.min(1, Number(level) || 0)) : 0;
  return (
    <span
      aria-hidden="true"
      className={`speaking-rings${speaking ? " is-active" : ""}`}
      style={{ "--speak-level": lvl.toFixed(3) }}
    >
      <span className="speaking-rings-glow" />
      <span className="speaking-rings-ring ring-a" />
      <span className="speaking-rings-ring ring-b" />
    </span>
  );
}
