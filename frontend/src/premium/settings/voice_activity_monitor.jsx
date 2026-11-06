import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { Row, Section, Toggle } from "../ui/PremiumAudioKit.jsx";

export const key = "voice_activity_monitor";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.voice_activity_monitor);
  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.vam.title")} hint={t("premiumAudio.vam.hint")}>
      </Section>
    </div>
  );
}

export default Panel;
