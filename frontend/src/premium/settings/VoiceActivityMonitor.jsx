import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { Row, Section, Toggle } from "../ui/PremiumAudioKit.jsx";

export const key = "voice_activity_monitor";

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.voice_activity_monitor);
  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.vam.title")} hint={t("premiumAudio.vam.hint")}>
        <Row title={t("premiumAudio.vam.enable")} description={t("premiumAudio.vam.enableDesc")}>
          <Toggle value={s.enabled !== false} onChange={(v) => update({ enabled: v })} label={t("premiumAudio.vam.enable")} />
        </Row>
      </Section>
    </div>
  );
}

export default Panel;
