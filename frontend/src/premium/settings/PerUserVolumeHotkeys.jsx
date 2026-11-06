import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { DesktopOnly, KeyCaps, Note, Row, Section, Slider, Toggle } from "../ui/PremiumAudioKit.jsx";
import { DEFAULT_BINDINGS } from "../ui/hotkeyCommon.jsx";

export const key = "per_user_volume_hotkeys";

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: false, step: 10 });
  const [custom] = useFeatureSettings("custom_hotkeys", { bindings: {} });
  const b = { ...DEFAULT_BINDINGS, ...(custom?.bindings || {}) };
  return (
    <div className="pa-panel">
      <DesktopOnly>
        <Section title={t("premiumAudio.userVolume.title")} hint={t("premiumAudio.userVolume.hint")}>
          <Row title={t("premiumAudio.userVolume.enable")}>
            <Toggle value={s.enabled} onChange={(v) => update({ enabled: v })} label={t("premiumAudio.userVolume.enable")} />
          </Row>
          <Row title={t("premiumAudio.hotkeys.actions.volume_up")}><KeyCaps accel={b.volume_up} /></Row>
          <Row title={t("premiumAudio.hotkeys.actions.volume_down")}><KeyCaps accel={b.volume_down} /></Row>
          <Row title={t("premiumAudio.userVolume.step")}>
            <Slider value={s.step} min={5} max={50} step={5} onChange={(v) => update({ step: v })} label={t("premiumAudio.userVolume.step")} format={(v) => `${v}%`} />
          </Row>
        </Section>
        <Note>{t("premiumAudio.userVolume.pinNote")}</Note>
      </DesktopOnly>
    </div>
  );
}

export default Panel;
