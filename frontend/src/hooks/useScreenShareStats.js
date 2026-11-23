import { useEffect, useRef, useState } from "react";
import { sampleScreenRtp } from "../lib/screenShareEncoder";

const POLL_MS = 2500;
const EMPTY = { out: null, in: null };

/**
 * Screen share stream info for the connection card (codec, resolution, frame rate), read
 * from getStats() of the screen sender (what this device sends) and of the receiver of the
 * remote screen track (what it receives). Polls only while a share is active and the page
 * is visible. `getTargets()` -> { sender, receiver } (either may be null).
 */
export default function useScreenShareStats({ active = false, getTargets, intervalMs = POLL_MS } = {}) {
  const [stats, setStats] = useState(EMPTY);
  const prevRef = useRef({ out: null, in: null });
  const getRef = useRef(getTargets);
  getRef.current = getTargets;

  useEffect(() => {
    if (!active) {
      setStats(EMPTY);
      prevRef.current = { out: null, in: null };
      return undefined;
    }
    let alive = true;
    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      let targets = null;
      try {
        targets = getRef.current?.() || null;
      } catch {
        targets = null;
      }
      const [out, inbound] = await Promise.all([
        targets?.sender ? sampleScreenRtp(targets.sender, { direction: "out", prev: prevRef.current.out }) : null,
        targets?.receiver ? sampleScreenRtp(targets.receiver, { direction: "in", prev: prevRef.current.in }) : null,
      ]);
      if (!alive) return;
      prevRef.current = { out, in: inbound };
      setStats((prev) => (sameStats(prev.out, out) && sameStats(prev.in, inbound) ? prev : { out, in: inbound }));
    };
    void poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [active, intervalMs]);

  return stats;
}

function sameStats(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.codec === b.codec && a.width === b.width && a.height === b.height && a.fps === b.fps;
}
