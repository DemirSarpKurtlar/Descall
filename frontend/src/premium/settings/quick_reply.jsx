import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { isDesktopApp, usePremiumStatus } from "../ui/PremiumAudioKit.jsx";
import { DesktopOnlyHint, Group, Hint, Note } from "../story/kit.jsx";

export const key = "quick_reply";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s] = useFeatureSettings(key, { enabled: true });
  const [status] = usePremiumStatus(s.enabled !== false ? "premium:quick_reply:status" : null, [s.enabled]);
  if (!isDesktopApp()) return <DesktopOnlyHint t={t} />;
  return (
    <Group title={t("premiumAudio.quickReply.title")}>
      <Note ds={ds("hint")}>{t("premiumAudio.quickReply.hint")}</Note>
      {status?.mode === "native" ? <Hint tone="ok" ds={ds("mode")}>{t("premiumAudio.quickReply.native")}</Hint> : null}
      {status?.mode === "unavailable" ? <Hint tone="warn" ds={ds("mode")}>{t(`premiumAudio.quickReply.unavailable.${status.reason || "platform"}`)}</Hint> : null}
      <Note dim>{t("premiumStory.n.noSettings")}</Note>
    </Group>
  );
}

export default Panel;
