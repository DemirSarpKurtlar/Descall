import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { Button, DesktopOnly, KeyCaps, Row, Section, Toggle } from "../ui/PremiumAudioKit.jsx";
import { DEFAULT_BINDINGS } from "../ui/hotkeyCommon.jsx";

export const key = "quick_launcher";

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: false });
  const [custom] = useFeatureSettings("custom_hotkeys", { bindings: {} });
  const accel = custom?.bindings?.quick_launcher ?? DEFAULT_BINDINGS.quick_launcher;
  const open = () => window.descallPremium?.invoke("premium:launcher:open").catch(() => {});
  return (
    <div className="pa-panel">
      <DesktopOnly>
        <Section title={t("premiumAudio.launcher.title")} hint={t("premiumAudio.launcher.hint")}>
          <Row title={t("premiumAudio.launcher.enable")} description={t("premiumAudio.launcher.enableDesc")}>
            <Toggle value={s.enabled} onChange={(v) => update({ enabled: v })} label={t("premiumAudio.launcher.enable")} />
          </Row>
          <Row title={t("premiumAudio.hotkeys.actions.quick_launcher")}>
            <KeyCaps accel={accel} />
          </Row>
          <Row title={t("premiumAudio.launcher.tryIt")}>
            <Button onClick={open} disabled={!s.enabled}>{t("premiumAudio.launcher.openNow")}</Button>
          </Row>
        </Section>
      </DesktopOnly>
    </div>
  );
}

export default Panel;
