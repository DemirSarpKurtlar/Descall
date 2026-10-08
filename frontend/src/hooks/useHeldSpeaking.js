import { useEffect, useState } from "react";

/**
 * Turns ON immediately, turns OFF only after `holdMs` of continuous silence.
 *
 * Voice-activity detection flaps between words / breaths; every flap used to
 * drop the speaking ring for a frame or two (and restart its animation),
 * which read as a black blink around the avatar. Holding the "off" edge for
 * ~300ms keeps the indicator continuous through natural speech gaps.
 */
export default function useHeldSpeaking(active, holdMs = 320) {
  const on = Boolean(active);
  const [held, setHeld] = useState(on);

  useEffect(() => {
    if (on) {
      setHeld(true);
      return undefined;
    }
    const id = setTimeout(() => setHeld(false), holdMs);
    return () => clearTimeout(id);
  }, [on, holdMs]);

  return on || held;
}
