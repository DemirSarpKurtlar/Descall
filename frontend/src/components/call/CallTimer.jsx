import { useCallTimer } from "../../hooks/useCallTimer";

/**
 * Self-ticking call timer text. Renders nothing before the first second,
 * otherwise `${prefix}m:ss${suffix}` (inside a span when className is given).
 * Only this element re-renders each second, not the call screen around it.
 */
export default function CallTimer({ startedAt, stoppedAt = null, prefix = "", suffix = "", className }) {
  const text = useCallTimer(startedAt, stoppedAt);
  if (!text) return null;
  const value = `${prefix}${text}${suffix}`;
  return className ? <span className={className}>{value}</span> : value;
}
