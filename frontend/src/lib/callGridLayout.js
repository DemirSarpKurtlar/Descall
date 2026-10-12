/**
 * Participant stage layout. One centered tile, a balanced pair, or a wrapped
 * grid whose last row stays centered. A 1:1 that is still ringing keeps a
 * remote placeholder so the stage is never a single corner tile.
 */

export function planCallGrid({ isDm = false, remoteSlot = false, remoteCount = 0, ringing = false } = {}) {
  const waiting = Boolean(isDm && ringing && !remoteSlot);
  const others = isDm
    ? (remoteSlot || waiting ? 1 : 0)
    : Math.max(0, Number(remoteCount) || 0);
  const count = 1 + others;
  const bucket = count <= 1 ? "is-n1"
    : count === 2 ? "is-n2"
    : count <= 4 ? "is-n4"
    : count <= 6 ? "is-n6"
    : "is-n9";
  return { count, bucket, ringing: waiting };
}

/** Short status on the ringing placeholder. Offline / unlock wait vs still dialing. */
export function dmRingingLabelKey({ connectionQuality, calleeAnswering } = {}) {
  if (connectionQuality === "failed" || calleeAnswering) return "Waiting…";
  return "Calling...";
}
