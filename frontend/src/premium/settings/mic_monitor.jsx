import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { Note, Row, Section, Slider, Toggle } from "../ui/PremiumAudioKit.jsx";

export const key = "mic_monitor";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.mic_monitor);
  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.monitor.title")} hint={t("premiumAudio.monitor.hint")}>
        <Row title={t("premiumAudio.monitor.volume")}>
          <Slider value={s.volume} min={0} max={100} step={5} onChange={(v) => update({ volume: v })} label={t("premiumAudio.monitor.volume")} format={(v) => `${v}%`} />
        </Row>
      </Section>
      <Note tone="warn">{t("premiumAudio.monitor.headphones")}</Note>
    </div>
  );
}

export default Panel;
