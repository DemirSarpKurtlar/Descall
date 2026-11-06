import { useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { readAudioPrefs } from "../../lib/callAudioDevices";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { BUILTIN_PRESETS, removeById, upsertProfile } from "../audio/audioProfiles.js";
import { devicesOfKind } from "../audio/devicePreference.js";
import { applyDeviceProfile } from "../usePremiumAudioBridge.js";
import { useAudioDevices } from "../ui/PremiumAudioKit.jsx";
import { Actions, Badge, Btn, ChoiceTiles, Group, Hint, Item, List, Note, TextField } from "../story/kit.jsx";

export const key = "audio_device_profiles";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;
const ds = (s) => `${key}.${s}`;

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
  const deviceOptions = (list, icon) => [
    { value: "", label: t("premiumAudio.profiles.keep"), icon: "restore" },
    ...list.map((d) => ({ value: d.deviceId, label: d.label || t("premiumAudio.common.unnamedDevice"), icon })),
  ];
  // A device picked before it was unplugged stays picked (it is still saved as such).
  const withCurrent = (opts, id, icon) => (id && !opts.some((o) => o.value === id) ? [...opts, { value: id, label: t("premiumAudio.common.unnamedDevice"), icon }] : opts);

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
    <>
      <Group title={t("premiumAudio.profiles.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.profiles.hint")}</Note>
        <List ds={ds("list")} empty={profiles.length === 0 ? t("premiumAudio.profiles.empty") : null}>
          {profiles.map((p) => (
            <Item
              key={p.id}
              icon="head"
              active={p.id === s.activeId}
              title={p.name}
              sub={[p.input?.label, p.output?.label, presets.find((x) => x.id === p.presetId)?.name].filter(Boolean).join(" · ") || t("premiumAudio.profiles.keep")}
            >
              {p.id === s.activeId ? <Badge tone="ok">{t("premiumAudio.common.active")}</Badge> : null}
              <Btn ds={ds("apply")} onClick={() => apply(p)}>{t("premiumAudio.common.apply")}</Btn>
              <Btn className="is-danger" ds={ds("delete")} aria-label={t("premiumAudio.common.deleteNamed", { name: p.name })} onClick={() => update({ profiles: removeById(profiles, p.id), activeId: s.activeId === p.id ? null : s.activeId })}>{t("premiumAudio.common.delete")}</Btn>
            </Item>
          ))}
        </List>
      </Group>
      <Group title={t("premiumAudio.profiles.new")}>
        <TextField value={name} maxLength={40} placeholder={t("premiumAudio.profiles.namePlaceholder")} onChange={setName} ds={ds("name")} />
        <div className="ps-field">
          <small>{t("premiumAudio.profiles.part.input")}</small>
          <ChoiceTiles mini value={input} onChange={setInput} label={t("premiumAudio.profiles.part.input")} ds={ds("input")} options={withCurrent(deviceOptions(inputs, "mic"), input, "mic")} />
        </div>
        <div className="ps-field">
          <small>{t("premiumAudio.profiles.part.output")}</small>
          <ChoiceTiles mini value={output} onChange={setOutput} label={t("premiumAudio.profiles.part.output")} ds={ds("output")} options={withCurrent(deviceOptions(outputs, "head"), output, "head")} />
        </div>
        <div className="ps-field">
          <small>{t("premiumAudio.profiles.part.preset")}</small>
          <ChoiceTiles
            mini
            value={presetId}
            onChange={setPresetId}
            label={t("premiumAudio.profiles.part.preset")}
            ds={ds("preset")}
            options={[{ value: "", label: t("premiumAudio.profiles.noPreset"), icon: "x" }, ...presets.map((p) => ({ value: p.id, label: p.name, icon: "sliders" }))]}
          />
        </div>
        <Actions>
          <Btn kind="primary" icon="plus" ds={ds("create")} onClick={create} disabled={!name.trim()}>{t("premiumAudio.profiles.create")}</Btn>
        </Actions>
      </Group>
      {message ? <Hint tone={message.tone} live>{message.text}</Hint> : null}
      <Hint ds={ds("trayNote")}>{t("premiumAudio.profiles.trayNote")}</Hint>
    </>
  );
}

export default Panel;
