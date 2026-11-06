/** Descall+ call window (picture-in-picture). */
import { useT } from "../../context/LocaleContext";
import { requestAux } from "../desktop/desktopBus.js";

export const key = "pip_call";

export function Panel() {
  const t = useT();
  return (
    <div className="pp-actions">
      <button type="button" className="us-btn ghost" data-testid="premium-open-call" onClick={() => requestAux("call", true)}>{t("premium.panel.openCall")}</button>
    </div>
  );
}
