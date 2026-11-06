/** Descall Ultra window management options. */
import { useT } from "../../context/LocaleContext";
import { ToggleRow } from "../panelUi.jsx";

export const key = "advanced_window_mgmt";

export function Panel({ settings, update }) {
  const t = useT();
  return (
    <>
      <ToggleRow label={t("premium.panel.snap")} checked={settings.snap !== false} onChange={(v) => update({ snap: v })} />
      <ToggleRow label={t("premium.panel.keepVisible")} checked={settings.keepVisible !== false} onChange={(v) => update({ keepVisible: v })} />
      <ToggleRow label={t("premium.panel.mainMonitor")} checked={settings.mainMonitor !== false} onChange={(v) => update({ mainMonitor: v })} />
    </>
  );
}
