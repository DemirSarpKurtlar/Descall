import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { DesktopOnly, KeyCaps, Note, Row, Section, Toggle, usePremiumStatus } from "../ui/PremiumAudioKit.jsx";
import { HotkeyFailures } from "../ui/hotkeyCommon.jsx";

export const key = "global_mute";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: false, deafen: true });
  const [status] = usePremiumStatus(s.enabled ? "premium:global_mute:status" : null, [s.enabled, s.deafen]);
  const b = status?.hotkeys?.bindings || {};
  return (
    <div className="pa-panel">
      <DesktopOnly>
        <Section title={t("premiumAudio.globalMute.title")} hint={t("premiumAudio.globalMute.hint")}>
          <Row title={t("premiumAudio.hotkeys.actions.toggle_mute")}>
            <KeyCaps accel={b.toggle_mute ?? "CommandOrControl+Alt+M"} />
          </Row>
          <Row title={t("premiumAudio.globalMute.deafen")}>
            <KeyCaps accel={b.toggle_deafen ?? "CommandOrControl+Alt+D"} />
            <Toggle value={s.deafen !== false} onChange={(v) => update({ deafen: v })} label={t("premiumAudio.globalMute.deafen")} />
          </Row>
        </Section>
        <HotkeyFailures failures={status?.hotkeys?.failures} />
        <Note>{t("premiumAudio.globalMute.remap")}</Note>
      </DesktopOnly>
    </div>
  );
}

export default Panel;
