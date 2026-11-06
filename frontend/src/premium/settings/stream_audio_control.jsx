import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { DesktopOnly, Note, Row, Section, Slider, Toggle } from "../ui/PremiumAudioKit.jsx";

export const key = "stream_audio_control";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.stream_audio_control);
  return (
    <div className="pa-panel">
      <DesktopOnly>
        <Section title={t("premiumAudio.stream.sendTitle")} hint={t("premiumAudio.stream.sendHint")}>
          <Row title={t("premiumAudio.stream.sendVolume")}>
            <Slider value={s.sendVolume} min={0} max={200} step={5} onChange={(v) => update({ sendVolume: v })} label={t("premiumAudio.stream.sendVolume")} format={(v) => `${v}%`} />
          </Row>
          <Row title={t("premiumAudio.stream.sendMute")} description={t("premiumAudio.stream.sendMuteDesc")}>
            <Toggle value={s.sendMuted} onChange={(v) => update({ sendMuted: v })} label={t("premiumAudio.stream.sendMute")} />
          </Row>
        </Section>
        <Section title={t("premiumAudio.stream.viewTitle")} hint={t("premiumAudio.stream.viewHint")}>
          <Row title={t("premiumAudio.stream.viewVolume")}>
            <Slider value={s.viewVolume} min={0} max={200} step={5} onChange={(v) => update({ viewVolume: v })} label={t("premiumAudio.stream.viewVolume")} format={(v) => `${v}%`} />
          </Row>
          <Row title={t("premiumAudio.stream.viewMute")}>
            <Toggle value={s.viewMuted} onChange={(v) => update({ viewMuted: v })} label={t("premiumAudio.stream.viewMute")} />
          </Row>
        </Section>
        <Note>{t("premiumAudio.stream.note")}</Note>
      </DesktopOnly>
    </div>
  );
}

export default Panel;
