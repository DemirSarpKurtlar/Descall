/**
 * voice_activity_monitor (Descall+): a thin live level bar under a voice
 * participant. It reuses the level the tile's voice-activity detector already
 * computes (no extra analyser), and renders nothing without the feature.
 */
import { useEffect, useState } from "react";
import { useT } from "../../context/localeContextInstance";
import { featureOn, onAudioSettings } from "../audio/premiumAudioRuntime.js";
import { subscribePremium } from "../premiumStore.js";
import "./premiumAudio.css";

export function useVoiceActivityMonitorOn() {
  const [on, setOn] = useState(() => featureOn("voice_activity_monitor"));
  useEffect(() => {
    const sync = () => setOn(featureOn("voice_activity_monitor"));
    const a = onAudioSettings(sync);
    const b = subscribePremium(sync);
    sync();
    return () => { a(); b(); };
  }, []);
  return on;
}

export default function VoiceActivityMeter({ level = 0, muted = false }) {
  const t = useT();
  const on = useVoiceActivityMonitorOn();
  if (!on) return null;
  const v = muted ? 0 : Math.max(0, Math.min(1, Number(level) || 0));
  // The detector's level is RMS-ish (speech ~0.03-0.15); scale so speech fills most of the bar.
  const shown = Math.min(1, Math.sqrt(v * 6));
  return (
    <span className="pa-vam" role="meter" aria-label={t("premiumAudio.vam.meter")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown * 100)}>
      <i style={{ transform: `scaleX(${shown})` }} />
    </span>
  );
}
