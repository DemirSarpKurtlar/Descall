import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { DesktopOnly, Note, Row, Section, Toggle, usePremiumStatus } from "../ui/PremiumAudioKit.jsx";

export const key = "quick_reply";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: true });
  const [status] = usePremiumStatus(s.enabled !== false ? "premium:quick_reply:status" : null, [s.enabled]);
  return (
    <div className="pa-panel">
      <DesktopOnly>
        <Section title={t("premiumAudio.quickReply.title")} hint={t("premiumAudio.quickReply.hint")}>
        </Section>
        {status?.mode === "native" ? <Note tone="ok">{t("premiumAudio.quickReply.native")}</Note> : null}
        {status?.mode === "unavailable" ? <Note tone="warn">{t(`premiumAudio.quickReply.unavailable.${status.reason || "platform"}`)}</Note> : null}
      </DesktopOnly>
    </div>
  );
}

export default Panel;
