import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { isDesktopApp } from "../ui/PremiumAudioKit.jsx";
import { DEFAULT_BINDINGS } from "../ui/hotkeyCommon.jsx";
import { DesktopOnlyHint, Group, Hint, KeyRow, Note, SetRow, Slider } from "../story/kit.jsx";

export const key = "per_user_volume_hotkeys";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, { enabled: false, step: 10 });
  const [custom] = useFeatureSettings("custom_hotkeys", { bindings: {} });
  if (!isDesktopApp()) return <DesktopOnlyHint t={t} />;
  const b = { ...DEFAULT_BINDINGS, ...(custom?.bindings || {}) };
  return (
    <>
      <Group title={t("premiumAudio.userVolume.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.userVolume.hint")}</Note>
        <KeyRow icon="vol" label={t("premiumAudio.hotkeys.actions.volume_up")} accel={b.volume_up} ds={ds("up")} />
        <KeyRow icon="volOff" label={t("premiumAudio.hotkeys.actions.volume_down")} accel={b.volume_down} ds={ds("down")} />
        <SetRow icon="sliders" label={t("premiumAudio.userVolume.step")} stack>
          <Slider value={s.step} min={5} max={50} step={5} ds={ds("step")} onChange={(v) => update({ step: v })} label={t("premiumAudio.userVolume.step")} format={(v) => t("premium.panel.opacityValue", { value: v })} />
        </SetRow>
      </Group>
      <Hint ds={ds("pinNote")}>{t("premiumAudio.userVolume.pinNote")}</Hint>
    </>
  );
}

export default Panel;
