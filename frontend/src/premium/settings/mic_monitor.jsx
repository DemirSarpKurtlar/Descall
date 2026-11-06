import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { Group, Hint, Note, SetRow, Slider } from "../story/kit.jsx";

export const key = "mic_monitor";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.mic_monitor);
  return (
    <Group title={t("premiumAudio.monitor.title")}>
      <Note ds={ds("hint")}>{t("premiumAudio.monitor.hint")}</Note>
      <SetRow icon="head" label={t("premiumAudio.monitor.volume")} stack>
        <Slider value={s.volume} min={0} max={100} step={5} ds={ds("volume")} onChange={(v) => update({ volume: v })} label={t("premiumAudio.monitor.volume")} format={(v) => t("premium.panel.opacityValue", { value: v })} />
      </SetRow>
      <Hint tone="warn" ds={ds("headphones")}>{t("premiumAudio.monitor.headphones")}</Hint>
    </Group>
  );
}

export default Panel;
