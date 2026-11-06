import { useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { readAudioPrefs } from "../../lib/callAudioDevices";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { BUILTIN_PRESETS, removeById, upsertProfile } from "../audio/audioProfiles.js";
import { devicesOfKind } from "../audio/devicePreference.js";
import { applyDeviceProfile } from "../usePremiumAudioBridge.js";
import { Button, Note, Section, Select, useAudioDevices } from "../ui/PremiumAudioKit.jsx";

export const key = "audio_device_profiles";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.audio_device_profiles);
  const [presetSettings] = useFeatureSettings("mic_presets", AUDIO_DEFAULTS.mic_presets);
  const devices = useAudioDevices();
  const prefs = readAudioPrefs();
  const [name, setName] = useState("");
  const [input, setInput] = useState(prefs.input || "");
  const [output, setOutput] = useState(prefs.output || "");
  const [presetId, setPresetId] = useState("");
  const [message, setMessage] = useState(null);
  const profiles = Array.isArray(s.profiles) ? s.profiles : [];
  const inputs = devicesOfKind(devices, "audioinput");
  const outputs = devicesOfKind(devices, "audiooutput");
  const presets = [...BUILTIN_PRESETS.map((p) => ({ id: p.id, name: t(p.nameKey) })), ...((presetSettings.presets) || [])];
  const label = (list, id) => list.find((d) => d.deviceId === id)?.label || "";
  const deviceOptions = (list) => [{ value: "", label: t("premiumAudio.profiles.keep") }, ...list.map((d) => ({ value: d.deviceId, label: d.label || t("premiumAudio.common.unnamedDevice") }))];

  const create = () => {
    const r = upsertProfile(profiles, {
      name,
      input: input ? { deviceId: input, label: label(inputs, input) } : null,
      output: output ? { deviceId: output, label: label(outputs, output) } : null,
      presetId: presetId || null,
    });
    if (!r.ok) { setMessage({ tone: "warn", text: t(`premiumAudio.presets.error.${r.error}`) }); return; }
    setMessage(null);
    setName("");
    update({ profiles: r.list });
  };

  const apply = async (p) => {
    const missing = await applyDeviceProfile(p);
    setMessage(missing.length
      ? { tone: "warn", text: t("premiumAudio.profiles.missing", { items: missing.map((m) => t(`premiumAudio.profiles.part.${m}`)).join(", ") }) }
      : { tone: "ok", text: t("premiumAudio.profiles.applied", { name: p.name }) });
  };

  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.profiles.title")} hint={t("premiumAudio.profiles.hint")}>
        <ul className="pa-list">
          {profiles.length === 0 ? <li className="pa-empty">{t("premiumAudio.profiles.empty")}</li> : null}
          {profiles.map((p) => (
            <li key={p.id} className="pa-list-item">
              <div className="pa-list-main">
                <span className="pa-list-title">{p.name}</span>
                <span className="pa-list-sub">
                  {[p.input?.label, p.output?.label, presets.find((x) => x.id === p.presetId)?.name].filter(Boolean).join(" · ") || t("premiumAudio.profiles.keep")}
                </span>
              </div>
              {p.id === s.activeId ? <span className="pa-badge pa-badge-ok">{t("premiumAudio.common.active")}</span> : null}
              <Button onClick={() => apply(p)}>{t("premiumAudio.common.apply")}</Button>
              <Button kind="danger" label={t("premiumAudio.common.deleteNamed", { name: p.name })} onClick={() => update({ profiles: removeById(profiles, p.id), activeId: s.activeId === p.id ? null : s.activeId })}>{t("premiumAudio.common.delete")}</Button>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t("premiumAudio.profiles.new")}>
        <div className="pa-inline">
          <input className="pa-input" value={name} maxLength={40} placeholder={t("premiumAudio.profiles.namePlaceholder")} aria-label={t("premiumAudio.profiles.namePlaceholder")} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="pa-inline">
          <Select value={input} options={deviceOptions(inputs)} onChange={setInput} label={t("premiumAudio.profiles.part.input")} />
          <Select value={output} options={deviceOptions(outputs)} onChange={setOutput} label={t("premiumAudio.profiles.part.output")} />
          <Select value={presetId} options={[{ value: "", label: t("premiumAudio.profiles.noPreset") }, ...presets.map((p) => ({ value: p.id, label: p.name }))]} onChange={setPresetId} label={t("premiumAudio.profiles.part.preset")} />
          <Button kind="primary" onClick={create} disabled={!name.trim()}>{t("premiumAudio.profiles.create")}</Button>
        </div>
      </Section>
      {message ? <Note tone={message.tone}>{message.text}</Note> : null}
      <Note>{t("premiumAudio.profiles.trayNote")}</Note>
    </div>
  );
}

export default Panel;
