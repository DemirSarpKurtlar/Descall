import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS } from "../gaming/ui.jsx";
import { isDesktop } from "../gaming/bridge.js";
import { Group, Hint, Note, SetRow, Switch } from "../story/kit.jsx";

export const key = "quick_file_drop";
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.quick_file_drop);
  return (
    <>
      <Group title={t("premiumGaming.quickDrop.title")}>
        <Note ds={ds("desc")}>{t("premiumGaming.quickDrop.desc")}</Note>
        {!isDesktop() ? <Hint>{t("premiumGaming.common.desktopOnly")}</Hint> : null}
        <SetRow icon="file" label={t("premiumGaming.quickDrop.show")}>
          <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.quickDrop.show")} disabled={!isDesktop()} testId="pg-quickdrop-on" ds={ds("on")} />
        </SetRow>
      </Group>
      <Hint ds={ds("help")}>{t("premiumGaming.quickDrop.help")}</Hint>
    </>
  );
}

export default Panel;
