import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { isDesktopApp, usePremiumStatus } from "../ui/PremiumAudioKit.jsx";
import { DesktopOnlyHint, Group, Hint, HotkeyFailureHint, KeyRow, Note, Switch } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "global_mute";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: false, deafen: true });
  const [status] = usePremiumStatus(s.enabled ? "premium:global_mute:status" : null, [s.enabled, s.deafen]);
  const b = status?.hotkeys?.bindings || {};
  usePublish("global_mute.bindings", b);
  if (!isDesktopApp()) return <DesktopOnlyHint t={t} />;
  return (
    <>
      <Group title={t("premiumAudio.globalMute.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.globalMute.hint")}</Note>
        <KeyRow icon="micOff" label={t("premiumAudio.hotkeys.actions.toggle_mute")} accel={b.toggle_mute ?? "CommandOrControl+Alt+M"} ds={ds("mute")} />
        <KeyRow icon="head" label={t("premiumAudio.globalMute.deafen")} accel={b.toggle_deafen ?? "CommandOrControl+Alt+D"}>
          <Switch checked={s.deafen !== false} onChange={(v) => update({ deafen: v })} label={t("premiumAudio.globalMute.deafen")} ds={ds("deafen")} />
        </KeyRow>
      </Group>
      <HotkeyFailureHint failures={status?.hotkeys?.failures} t={t} ds={ds("failures")} />
      <Hint ds={ds("remap")}>{t("premiumAudio.globalMute.remap")}</Hint>
    </>
  );
}

export default Panel;
