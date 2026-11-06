import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { isDesktop } from "../gaming/bridge.js";
import { Actions, Btn, Group, Hint, HotkeyField, Note, SetRow } from "../story/kit.jsx";

export const key = "command_center";
const ds = (s) => `${key}.${s}`;

export function openCommandCenter() {
  try { window.dispatchEvent(new CustomEvent("descall:premium:command-center", { detail: { open: true } })); } catch { /* ignore */ }
}

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.command_center);
  return (
    <>
      <Group title={t("premiumGaming.commandCenter.title")}>
        <Note ds={ds("desc")}>{t("premiumGaming.commandCenter.desc")}</Note>
        <Actions>
          <Btn kind="primary" icon="command" ds={ds("open")} onClick={openCommandCenter} data-testid="pg-cc-open">{t("premiumGaming.commandCenter.open")}</Btn>
        </Actions>
        {isDesktop() ? (
          <SetRow icon="keyboard" label={t("premiumGaming.common.hotkey")}>
            <HotkeyField value={s.hotkey} onChange={(hotkey) => update({ hotkey })} label={t("premiumGaming.common.hotkey")} ds={ds("hotkey")} none={t("premiumGaming.common.none")} pressKey={t("premiumAudio.hotkeys.pressKey")} />
          </SetRow>
        ) : null}
      </Group>
      <Hint ds={ds("help")}>{t("premiumGaming.commandCenter.help")}</Hint>
    </>
  );
}

export default Panel;
