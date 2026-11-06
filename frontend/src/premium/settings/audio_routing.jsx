import { useMemo } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { readAudioPrefs, setOutputSink, writeAudioPref } from "../../lib/callAudioDevices";
import audioManager from "../../lib/audioManager";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { devicesOfKind } from "../audio/devicePreference.js";
import { useAudioDevices } from "../ui/PremiumAudioKit.jsx";
import { Actions, Btn, ChoiceTiles, Group, Hint, Note, SetRow } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "audio_routing";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;
const ds = (s) => `${key}.${s}`;
const HEADSET = /head|kulak|ear|bud|pods|hyperx|arctis|kraken|cloud/i;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.audio_routing);
  const devices = useAudioDevices();
  const outputs = devicesOfKind(devices, "audiooutput");
  const supported = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  const options = [
    { value: "", label: t("premiumAudio.routing.systemDefault"), icon: "monitor" },
    ...outputs.map((d) => ({ value: d.deviceId, label: d.label || t("premiumAudio.common.unnamedDevice"), icon: HEADSET.test(d.label || "") ? "head" : "speaker" })),
  ];
  const labels = useMemo(() => Object.fromEntries(outputs.map((d) => [d.deviceId, d.label])), [outputs]);
  usePublish("audio_routing.labels", labels);
  const callOutput = s.callOutput || readAudioPrefs().output || "";

  const setCall = (id) => {
    // Call output is the same preference the call device menus use, so both stay in sync.
    writeAudioPref("output", id);
    setOutputSink(id).catch(() => {});
    update({ callOutput: id });
  };

  return (
    <>
      <Group title={t("premiumAudio.routing.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.routing.hint")}</Note>
        <SetRow icon="phone" label={t("premiumAudio.routing.call")} desc={t("premiumAudio.routing.callDesc")} />
        <ChoiceTiles value={callOutput} options={options} onChange={setCall} label={t("premiumAudio.routing.call")} ds={ds("callOutput")} />
      </Group>
      <Group title={t("premiumAudio.routing.notifications")}>
        <SetRow icon="bell" label={t("premiumAudio.routing.notifications")} desc={t("premiumAudio.routing.notificationsDesc")} />
        <ChoiceTiles value={s.notificationOutput || ""} options={options} onChange={(v) => update({ notificationOutput: v })} label={t("premiumAudio.routing.notifications")} ds={ds("notificationOutput")} />
        <Actions>
          <Btn icon="play" ds={ds("test")} onClick={() => audioManager.play("notification")} disabled={!s.enabled}>{t("premiumAudio.routing.test")}</Btn>
        </Actions>
      </Group>
      {!supported ? <Hint tone="warn" ds={ds("unsupported")}>{t("premiumAudio.routing.unsupported")}</Hint> : null}
    </>
  );
}

export default Panel;
