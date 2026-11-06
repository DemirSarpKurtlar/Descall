import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { isDesktopApp } from "../ui/PremiumAudioKit.jsx";
import { Group, Hint, Note, SetRow, Slider, Switch } from "../story/kit.jsx";

export const key = "stream_audio_control";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.stream_audio_control);
  if (!isDesktopApp()) return <Group><Hint>{t("premiumAudio.common.desktopOnly")}</Hint></Group>;
  const pct = (v) => t("premium.panel.opacityValue", { value: v });
  return (
    <>
      <Group title={t("premiumAudio.stream.sendTitle")}>
        <Note ds={ds("sendHint")}>{t("premiumAudio.stream.sendHint")}</Note>
        <SetRow icon="vol" label={t("premiumAudio.stream.sendVolume")} stack>
          <Slider value={s.sendVolume} min={0} max={200} step={5} ds={ds("sendVolume")} onChange={(v) => update({ sendVolume: v })} label={t("premiumAudio.stream.sendVolume")} format={pct} />
        </SetRow>
        <SetRow icon="volOff" label={t("premiumAudio.stream.sendMute")} desc={t("premiumAudio.stream.sendMuteDesc")}>
          <Switch checked={s.sendMuted} onChange={(v) => update({ sendMuted: v })} label={t("premiumAudio.stream.sendMute")} ds={ds("sendMuted")} />
        </SetRow>
      </Group>
      <Group title={t("premiumAudio.stream.viewTitle")}>
        <Note ds={ds("viewHint")}>{t("premiumAudio.stream.viewHint")}</Note>
        <SetRow icon="vol" label={t("premiumAudio.stream.viewVolume")} stack>
          <Slider value={s.viewVolume} min={0} max={200} step={5} ds={ds("viewVolume")} onChange={(v) => update({ viewVolume: v })} label={t("premiumAudio.stream.viewVolume")} format={pct} />
        </SetRow>
        <SetRow icon="volOff" label={t("premiumAudio.stream.viewMute")}>
          <Switch checked={s.viewMuted} onChange={(v) => update({ viewMuted: v })} label={t("premiumAudio.stream.viewMute")} ds={ds("viewMuted")} />
        </SetRow>
      </Group>
      <Hint ds={ds("note")}>{t("premiumAudio.stream.note")}</Hint>
    </>
  );
}

export default Panel;
