import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { DesktopOnly, Note, Row, Section, Select, Toggle, usePremiumStatus } from "../ui/PremiumAudioKit.jsx";

export const key = "media_keys";

const KEYS = ["playPause", "next", "previous", "stop"];

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: false, playPause: "toggle_mute", next: "toggle_deafen", previous: "none", stop: "none" });
  const [status] = usePremiumStatus(s.enabled ? "premium:media_keys:status" : null, [s.enabled]);
  const options = [
    { value: "toggle_mute", label: t("premiumAudio.hotkeys.actions.toggle_mute") },
    { value: "toggle_deafen", label: t("premiumAudio.hotkeys.actions.toggle_deafen") },
    { value: "none", label: t("premiumAudio.mediaKeys.none") },
  ];
  return (
    <div className="pa-panel">
      <DesktopOnly>
        <Section title={t("premiumAudio.mediaKeys.title")} hint={t("premiumAudio.mediaKeys.hint")}>
          <Row title={t("premiumAudio.mediaKeys.enable")} description={t("premiumAudio.mediaKeys.enableDesc")}>
            <Toggle value={s.enabled} onChange={(v) => update({ enabled: v })} label={t("premiumAudio.mediaKeys.enable")} />
          </Row>
          {KEYS.map((k) => (
            <Row key={k} title={t(`premiumAudio.mediaKeys.keys.${k}`)}>
              <Select value={s[k]} options={options} onChange={(v) => update({ [k]: v })} label={t(`premiumAudio.mediaKeys.keys.${k}`)} />
            </Row>
          ))}
        </Section>
        {status?.failed?.length ? <Note tone="warn">{t("premiumAudio.mediaKeys.taken")}</Note> : null}
      </DesktopOnly>
    </div>
  );
}

export default Panel;
