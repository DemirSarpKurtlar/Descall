// Settings > Voice & video: "Katılma sesleri" (Market 2.0, C4).
// UserPanel passes its own SettingRow / Toggle so the section matches the tab exactly.
import { useEffect, useState } from "react";
import { Volume2, Waveform, Play } from "../ui/Icon.jsx";
import RangeSlider from "../../premium/ui/RangeSlider.jsx";
import { readJoinSoundPrefs, subscribeJoinSoundPrefs, writeJoinSoundPrefs } from "../../lib/joinSoundPrefs.js";
import { previewJoinSound } from "../../lib/joinSounds.js";
import { useVoiceText } from "../../lib/shopVoiceText.js";

const SAMPLE = { effect_key: "js-cam-can", category: "join_sound", sku: "s2-join_sound-cam-can" };

export default function JoinSoundSettings({ SettingRow, Toggle }) {
  const tv = useVoiceText();
  const [prefs, setPrefs] = useState(() => readJoinSoundPrefs());
  useEffect(() => subscribeJoinSoundPrefs(setPrefs), []);
  const pct = Math.round(prefs.volume * 100);

  return (
    <section className="us-section">
      <h4 className="us-section-label">{tv("settingsTitle")}</h4>
      <div className="us-card stack">
        <SettingRow icon={Waveform} title={tv("toggle")} description={tv("toggleDesc")}>
          <Toggle value={prefs.enabled} onChange={(value) => writeJoinSoundPrefs({ enabled: Boolean(value) })} label={tv("toggle")} />
        </SettingRow>
        <label className="us-field us-field-inset">
          <span>
            <Volume2 size={13} /> {tv("volume")}
          </span>
          <span className="js2-settings-volume">
            <RangeSlider
              min={0}
              max={100}
              value={pct}
              onChange={(value) => writeJoinSoundPrefs({ volume: Math.round(value) / 100 })}
              label={tv("volume")}
              valueText={`${pct}%`}
            />
            <button
              type="button"
              className="us-btn ghost"
              disabled={!prefs.enabled || pct === 0}
              onClick={() => {
                void previewJoinSound(SAMPLE);
              }}
            >
              <Play size={14} /> {tv("test")}
            </button>
          </span>
        </label>
        <p className="us-row-desc us-field-inset-hint">{tv("volumeDesc")}</p>
      </div>
    </section>
  );
}
