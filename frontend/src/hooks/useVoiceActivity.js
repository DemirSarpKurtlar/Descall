import { useEffect, useRef, useState } from "react";
import { pokeVoiceActivity, subscribeVoiceActivity } from "../lib/voiceActivity";
import { createSpeakingGate, smoothLevel } from "../lib/voiceActivityMath";
import { speakingThreshold } from "../lib/voiceProfile";

/**
 * Speaking boolean + 0–1 mic level for one tile.
 * `observeEl` pauses the analyser while that node is off-screen.
 * `muted` (user mute, or no stream) forces silence, no ring.
 */
export default function useVoiceActivity(
  stream,
  {
    muted = false,
    threshold,
    onThreshold,
    offThreshold,
    attackMs = 90,
    releaseMs = 220,
    observeEl = null,
  } = {}
) {
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [profileThreshold, setProfileThreshold] = useState(() => speakingThreshold());
  const speakingRef = useRef(false);
  const levelRef = useRef(0);
  const visibleRef = useRef(true);

  useEffect(() => {
    const sync = () => setProfileThreshold(speakingThreshold());
    window.addEventListener("descall:voice-profile", sync);
    return () => window.removeEventListener("descall:voice-profile", sync);
  }, []);

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
    const gateOn =
      typeof onThreshold === "number"
        ? onThreshold
        : typeof threshold === "number"
          ? threshold
          : profileThreshold;
    const gate = createSpeakingGate({
      onThreshold: gateOn,
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
  }, [stream, muted, threshold, onThreshold, offThreshold, attackMs, releaseMs, profileThreshold]);

  return { speaking, level };
}
