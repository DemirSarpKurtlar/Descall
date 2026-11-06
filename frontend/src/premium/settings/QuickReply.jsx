import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { DesktopOnly, Note, Row, Section, Toggle, usePremiumStatus } from "../ui/PremiumAudioKit.jsx";

export const key = "quick_reply";

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: true });
  const [status] = usePremiumStatus(s.enabled !== false ? "premium:quick_reply:status" : null, [s.enabled]);
  return (
    <div className="pa-panel">
      <DesktopOnly>
        <Section title={t("premiumAudio.quickReply.title")} hint={t("premiumAudio.quickReply.hint")}>
          <Row title={t("premiumAudio.quickReply.enable")} description={t("premiumAudio.quickReply.enableDesc")}>
            <Toggle value={s.enabled !== false} onChange={(v) => update({ enabled: v })} label={t("premiumAudio.quickReply.enable")} />
          </Row>
        </Section>
        {status?.mode === "native" ? <Note tone="ok">{t("premiumAudio.quickReply.native")}</Note> : null}
        {status?.mode === "unavailable" ? <Note tone="warn">{t(`premiumAudio.quickReply.unavailable.${status.reason || "platform"}`)}</Note> : null}
      </DesktopOnly>
    </div>
  );
}

export default Panel;
