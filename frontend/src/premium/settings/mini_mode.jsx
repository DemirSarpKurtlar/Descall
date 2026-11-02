/** Descall+ mini mode: open it, and optionally open it when Descall is minimised in a call. */
import { useT } from "../../context/LocaleContext";
import { ToggleRow } from "../panelUi.jsx";
import { requestAux } from "../desktop/desktopBus.js";

export const key = "mini_mode";

export function Panel({ settings, update }) {
  const t = useT();
  return (
    <>
      <div className="pp-actions">
        <button type="button" className="us-btn" data-testid="premium-open-mini" onClick={() => requestAux("mini", true)}>{t("premium.panel.openMini")}</button>
      </div>
      <ToggleRow label={t("premium.panel.miniAuto")} checked={settings.autoOnMinimize === true} onChange={(v) => update({ autoOnMinimize: v })} />
    </>
  );
}
