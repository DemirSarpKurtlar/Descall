import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { isDesktop } from "../gaming/bridge.js";
import { Group, Hint, Note, SetRow, Switch } from "../story/kit.jsx";
import HudPlacement from "../story/HudPlacement.jsx";

export const key = "voice_hud";
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.voice_hud);
  return (
    <>
      <Group title={t("premiumGaming.voiceHud.title")}>
        <Note ds={ds("desc")}>{t("premiumGaming.voiceHud.desc")}</Note>
        {!isDesktop() ? <Hint>{t("premiumGaming.common.desktopOnly")}</Hint> : null}
        <SetRow icon="hud" label={t("premiumGaming.voiceHud.show")}>
          <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.voiceHud.show")} disabled={!isDesktop()} testId="pg-voicehud-on" ds={ds("on")} />
        </SetRow>
      </Group>
      <HudPlacement value={s} onChange={update} fkey={key} />
      <Hint ds={ds("help")}>{t("premiumGaming.voiceHud.help")}</Hint>
    </>
  );
}

export default Panel;
