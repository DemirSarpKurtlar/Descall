/** Same-kind taps inside one frame collapse. Different kinds still fire. */
export function shouldEmitHaptic(previous, kind, now, windowMs = 50) {
  if (previous && previous.kind === kind && now - previous.at < windowMs) {
    return { emit: false, last: previous };
  }
  return { emit: true, last: { kind, at: now } };
}
