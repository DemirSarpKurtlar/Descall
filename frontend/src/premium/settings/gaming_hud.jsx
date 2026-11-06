import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { isDesktop } from "../gaming/bridge.js";
import { Group, Hint, Note, SetRow, Switch, ToggleTiles } from "../story/kit.jsx";
import HudPlacement from "../story/HudPlacement.jsx";

export const key = "gaming_hud";
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.gaming_hud);
  const row = (k, label, icon) => ({ id: k, label: t(label), icon, ds: ds(k), checked: s[k], onChange: (v) => update({ [k]: v }) });
  return (
    <>
      <Group title={t("premiumGaming.gamingHud.title")}>
        <Note ds={ds("desc")}>{t("premiumGaming.gamingHud.desc")}</Note>
        {!isDesktop() ? <Hint>{t("premiumGaming.common.desktopOnly")}</Hint> : null}
        <SetRow icon="hud" label={t("premiumGaming.gamingHud.show")}>
          <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.gamingHud.show")} disabled={!isDesktop()} testId="pg-gaminghud-on" ds={ds("on")} />
        </SetRow>
      </Group>
      <Group title={t("premiumStory.g.hudRows")}>
        <ToggleTiles
          cols
          items={[
            row("showClock", "premiumGaming.gamingHud.clock", "clock"),
            row("showPing", "premiumGaming.gamingHud.ping", "signal"),
            row("showCall", "premiumGaming.gamingHud.call", "phone"),
            row("showFriends", "premiumGaming.gamingHud.friends", "users"),
          ]}
        />
      </Group>
      <HudPlacement value={s} onChange={update} fkey={key} />
      <Hint ds={ds("help")}>{t("premiumGaming.gamingHud.help")}</Hint>
      <Hint ds={ds("noFps")}>{t("premiumGaming.gamingHud.noFps")}</Hint>
    </>
  );
}

export default Panel;
