import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { isDesktopApp } from "../ui/PremiumAudioKit.jsx";
import { DEFAULT_BINDINGS } from "../ui/hotkeyCommon.jsx";
import { Btn, DesktopOnlyHint, Group, KeyRow, Note, SetRow } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "quick_launcher";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s] = useFeatureSettings(key, { enabled: false });
  const [custom] = useFeatureSettings("custom_hotkeys", { bindings: {} });
  const accel = custom?.bindings?.quick_launcher ?? DEFAULT_BINDINGS.quick_launcher;
  usePublish("quick_launcher.accel", accel);
  if (!isDesktopApp()) return <DesktopOnlyHint t={t} />;
  const open = () => window.descallPremium?.invoke("premium:launcher:open").catch(() => {});
  return (
    <Group title={t("premiumAudio.launcher.title")}>
      <Note ds={ds("hint")}>{t("premiumAudio.launcher.hint")}</Note>
      <KeyRow icon="command" label={t("premiumAudio.hotkeys.actions.quick_launcher")} accel={accel} ds={ds("hotkey")} />
      <SetRow icon="play" label={t("premiumAudio.launcher.tryIt")}>
        <Btn kind="primary" ds={ds("open")} onClick={open} disabled={!s.enabled}>{t("premiumAudio.launcher.openNow")}</Btn>
      </SetRow>
    </Group>
  );
}

export default Panel;
