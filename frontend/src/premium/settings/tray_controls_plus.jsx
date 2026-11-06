/** Descall+ tray controls: nothing to set, the tray menu gains the entries while it is on. */
import { useT } from "../../context/LocaleContext";

export const key = "tray_controls_plus";

export function Panel() {
  const t = useT();
  return <p className="pp-hint" style={{ margin: 0 }}>{t("premium.panel.trayLead")}</p>;
}
