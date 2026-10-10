import { useEffect, useRef, useState } from "react";
import { pokeVoiceActivity, subscribeVoiceActivity } from "../lib/voiceActivity";
import { createSpeakingGate, smoothLevel } from "../lib/voiceActivityMath";

/**
 * Speaking boolean + 0–1 mic level for one tile.
 * `observeEl` pauses the analyser while that node is off-screen.
 * `muted` (user mute, or no stream) forces silence — no ring.
 */
export default function useVoiceActivity(
  stream,
  {
    muted = false,
    threshold = 0.02,
    onThreshold,
    offThreshold,
    attackMs = 90,
    releaseMs = 220,
    observeEl = null,
  } = {}
) {
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const speakingRef = useRef(false);
  const levelRef = useRef(0);
  const visibleRef = useRef(true);

  useEffect(() => {
    if (!observeEl || observeEl.nodeType !== 1 || typeof IntersectionObserver === "undefined") {
      visibleRef.current = true;
      return undefined;
    }
    const io = new IntersectionObserver(([entry]) => {
      const on = Boolean(entry?.isIntersecting);
      visibleRef.current = on;
      if (on) pokeVoiceActivity();
    });
    io.observe(observeEl);
    return () => io.disconnect();
  }, [observeEl]);

  useEffect(() => {
    if (muted || !stream) {
      speakingRef.current = false;
      levelRef.current = 0;
      setSpeaking(false);
      setLevel(0);
      return undefined;
    }
    const gate = createSpeakingGate({
      onThreshold: typeof onThreshold === "number" ? onThreshold : threshold,
      offThreshold,
      attackMs,
      releaseMs,
    });
    const unsubscribe = subscribeVoiceActivity(stream, {
      hidden: () => !visibleRef.current,
      onRms: (rms, now) => {
        const nextSpeaking = gate.push(rms, now);
        const target = nextSpeaking ? Math.min(1, rms * 4) : 0;
        const nextLevel = smoothLevel(levelRef.current, target);
        if (nextSpeaking !== speakingRef.current) {
          speakingRef.current = nextSpeaking;
          setSpeaking(nextSpeaking);
        }
        if (Math.abs(nextLevel - levelRef.current) >= 0.02 || (nextLevel === 0 && levelRef.current !== 0)) {
          levelRef.current = nextLevel;
          setLevel(nextLevel);
        }
      },
    });
    return () => {
      unsubscribe();
      gate.reset();
    };
  }, [stream, muted, threshold, onThreshold, offThreshold, attackMs, releaseMs]);

  return { speaking, level };
}
