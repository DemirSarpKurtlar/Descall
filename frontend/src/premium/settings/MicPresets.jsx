import { useEffect, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { readVoiceProfile } from "../../lib/voiceProfile";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { BUILTIN_PRESETS, matchPreset, presetFromCurrent, removeById, upsertPreset } from "../audio/audioProfiles.js";
import { applyMicPreset } from "../usePremiumAudioBridge.js";
import { Button, Note, Row, Section, Slider } from "../ui/PremiumAudioKit.jsx";

export const key = "mic_presets";

function useVoiceProfile() {
  const [vp, setVp] = useState(() => readVoiceProfile());
  useEffect(() => {
    const on = (e) => setVp(e?.detail || readVoiceProfile());
    window.addEventListener("descall:voice-profile", on);
    return () => window.removeEventListener("descall:voice-profile", on);
  }, []);
  return vp;
}

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.mic_presets);
  const vp = useVoiceProfile();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const saved = Array.isArray(s.presets) ? s.presets : [];
  const all = [...BUILTIN_PRESETS.map((p) => ({ ...p, name: t(p.nameKey) })), ...saved];
  const current = { gain: s.gain, noiseMode: vp.noiseMode, echoCancellation: vp.echoCancellation, autoGainControl: vp.autoGainControl };
  const activeId = matchPreset(all, current);

  const save = () => {
    const r = upsertPreset(saved, presetFromCurrent({ voiceProfile: vp, gain: s.gain }, name));
    if (!r.ok) { setError(t(`premiumAudio.presets.error.${r.error}`)); return; }
    setError("");
    setName("");
    update({ presets: r.list, activePresetId: r.preset.id });
  };

  const describe = (p) => [
    t(`premiumAudio.presets.noise.${p.noiseMode}`),
    p.echoCancellation ? t("premiumAudio.presets.echoOn") : t("premiumAudio.presets.echoOff"),
    p.autoGainControl ? t("premiumAudio.presets.agcOn") : t("premiumAudio.presets.agcOff"),
    `${p.gain}%`,
  ].join(" · ");

  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.presets.title")} hint={t("premiumAudio.presets.hint")}>
        <Row title={t("premiumAudio.presets.gain")} description={t("premiumAudio.presets.gainDesc")}>
          <Slider value={s.gain} min={0} max={200} step={5} onChange={(v) => update({ gain: v })} label={t("premiumAudio.presets.gain")} format={(v) => `${v}%`} />
        </Row>
        <Row title={t("premiumAudio.presets.current")} description={describe({ ...current, gain: s.gain })} />
      </Section>
      <Section title={t("premiumAudio.presets.list")}>
        <ul className="pa-list">
          {all.map((p) => (
            <li key={p.id} className="pa-list-item">
              <div className="pa-list-main">
                <span className="pa-list-title">{p.name}</span>
                <span className="pa-list-sub">{describe(p)}</span>
              </div>
              {p.id === activeId ? <span className="pa-badge pa-badge-ok">{t("premiumAudio.common.active")}</span> : (
                <Button onClick={() => applyMicPreset(p)}>{t("premiumAudio.common.apply")}</Button>
              )}
              {!p.builtin ? (
                <Button kind="danger" label={t("premiumAudio.common.deleteNamed", { name: p.name })} onClick={() => update({ presets: removeById(saved, p.id) })}>{t("premiumAudio.common.delete")}</Button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="pa-inline">
          <input className="pa-input" value={name} maxLength={40} placeholder={t("premiumAudio.presets.namePlaceholder")} aria-label={t("premiumAudio.presets.namePlaceholder")} onChange={(e) => setName(e.target.value)} />
          <Button kind="primary" onClick={save} disabled={!name.trim()}>{t("premiumAudio.presets.saveCurrent")}</Button>
        </div>
      </Section>
      {error ? <Note tone="warn">{error}</Note> : null}
    </div>
  );
}

export default Panel;
