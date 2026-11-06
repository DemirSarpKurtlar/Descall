import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, DesktopOnly, PanelShell, Switch } from "../gaming/ui.jsx";
import { isDesktop } from "../gaming/bridge.js";

export const key = "quick_file_drop";

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.quick_file_drop);
  return (
    <PanelShell title={t("premiumGaming.quickDrop.title")} desc={t("premiumGaming.quickDrop.desc")} testId="pg-panel-quick_file_drop">
      {!isDesktop() ? <DesktopOnly /> : null}
      <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.quickDrop.show")} disabled={!isDesktop()} testId="pg-quickdrop-on" />
      <p className="pg-help">{t("premiumGaming.quickDrop.help")}</p>
    </PanelShell>
  );
}

export default Panel;
