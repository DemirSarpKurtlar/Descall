import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { readAudioPrefs, setOutputSink, writeAudioPref } from "../../lib/callAudioDevices";
import audioManager from "../../lib/audioManager";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { devicesOfKind } from "../audio/devicePreference.js";
import { Button, Note, Row, Section, Select, Toggle, useAudioDevices } from "../ui/PremiumAudioKit.jsx";

export const key = "audio_routing";

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.audio_routing);
  const devices = useAudioDevices();
  const outputs = devicesOfKind(devices, "audiooutput");
  const supported = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  const options = [{ value: "", label: t("premiumAudio.routing.systemDefault") }, ...outputs.map((d) => ({ value: d.deviceId, label: d.label || t("premiumAudio.common.unnamedDevice") }))];
  const callOutput = s.callOutput || readAudioPrefs().output || "";

  const setCall = (id) => {
    // Call output is the same preference the call device menus use, so both stay in sync.
    writeAudioPref("output", id);
    setOutputSink(id).catch(() => {});
    update({ callOutput: id });
  };

  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.routing.title")} hint={t("premiumAudio.routing.hint")}>
        <Row title={t("premiumAudio.routing.enable")} description={t("premiumAudio.routing.enableDesc")}>
          <Toggle value={s.enabled} onChange={(v) => update({ enabled: v })} label={t("premiumAudio.routing.enable")} />
        </Row>
        <Row title={t("premiumAudio.routing.call")} description={t("premiumAudio.routing.callDesc")}>
          <Select value={callOutput} options={options} onChange={setCall} label={t("premiumAudio.routing.call")} />
        </Row>
        <Row title={t("premiumAudio.routing.notifications")} description={t("premiumAudio.routing.notificationsDesc")}>
          <Select value={s.notificationOutput || ""} options={options} onChange={(v) => update({ notificationOutput: v })} label={t("premiumAudio.routing.notifications")} />
          <Button onClick={() => audioManager.play("notification")} disabled={!s.enabled}>{t("premiumAudio.routing.test")}</Button>
        </Row>
      </Section>
      {!supported ? <Note tone="warn">{t("premiumAudio.routing.unsupported")}</Note> : null}
    </div>
  );
}

export default Panel;
