import { useEffect, useMemo, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { readVoiceProfile } from "../../lib/voiceProfile";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { BUILTIN_PRESETS, matchPreset, presetFromCurrent, removeById, upsertPreset } from "../audio/audioProfiles.js";
import { applyMicPreset } from "../usePremiumAudioBridge.js";
import { Badge, Btn, Group, Hint, Ico, Note, SetRow, Slider, TextField } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "mic_presets";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;
const ds = (s) => `${key}.${s}`;

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
  const current = useMemo(
    () => ({ gain: s.gain, noiseMode: vp.noiseMode, echoCancellation: vp.echoCancellation, autoGainControl: vp.autoGainControl }),
    [s.gain, vp.noiseMode, vp.echoCancellation, vp.autoGainControl],
  );
  const activeId = matchPreset(all, current);
  usePublish("mic_presets.current", current);
  usePublish("mic_presets.activeName", all.find((p) => p.id === activeId)?.name || "");

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
  const flags = (p) => [
    ["gate", p.noiseMode !== "off", t(`premiumAudio.presets.noise.${p.noiseMode}`)],
    ["ear", p.echoCancellation, p.echoCancellation ? t("premiumAudio.presets.echoOn") : t("premiumAudio.presets.echoOff")],
    ["sliders", p.autoGainControl, p.autoGainControl ? t("premiumAudio.presets.agcOn") : t("premiumAudio.presets.agcOff")],
  ];

  return (
    <>
      <Group title={t("premiumAudio.presets.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.presets.hint")}</Note>
        <SetRow icon="mic" label={t("premiumAudio.presets.gain")} desc={t("premiumAudio.presets.gainDesc")} stack>
          <Slider value={s.gain} min={0} max={200} step={5} ds={ds("gain")} onChange={(v) => update({ gain: v })} label={t("premiumAudio.presets.gain")} format={(v) => t("premium.panel.opacityValue", { value: v })} />
        </SetRow>
        <SetRow label={t("premiumAudio.presets.current")} desc={describe({ ...current, gain: s.gain })} ds={ds("current")} />
      </Group>
      <Group title={t("premiumAudio.presets.list")}>
        <ul className="ps-cardsg" data-s={ds("list")} aria-label={t("premiumAudio.presets.list")}>
          {all.map((p) => (
            <li key={p.id} className={`ps-pcard${p.id === activeId ? " is-on" : ""}`}>
              <span className="ps-flags">
                {flags(p).map(([n, on, label]) => <span key={n} className={on ? "y" : ""} title={label} aria-hidden="true"><Ico n={n} size={11} /></span>)}
              </span>
              <b>{p.name}</b>
              <small>{describe(p)}</small>
              <span className="ps-pa">
                {p.id === activeId ? <Badge tone="ok">{t("premiumAudio.common.active")}</Badge> : (
                  <Btn ds={ds("apply")} onClick={() => applyMicPreset(p)}>{t("premiumAudio.common.apply")}</Btn>
                )}
                {!p.builtin ? (
                  <Btn className="is-danger" ds={ds("delete")} aria-label={t("premiumAudio.common.deleteNamed", { name: p.name })} onClick={() => update({ presets: removeById(saved, p.id) })}>{t("premiumAudio.common.delete")}</Btn>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="ps-form">
          <TextField value={name} maxLength={40} placeholder={t("premiumAudio.presets.namePlaceholder")} onChange={setName} ds={ds("name")} />
          <Btn kind="primary" icon="plus" ds={ds("save")} onClick={save} disabled={!name.trim()}>{t("premiumAudio.presets.saveCurrent")}</Btn>
        </div>
      </Group>
      {error ? <Hint tone="warn" live>{error}</Hint> : null}
    </>
  );
}

export default Panel;
