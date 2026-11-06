/** Descall+ taskbar extras: unread badge, thumbnail call buttons (Windows). */
import { useT } from "../../context/LocaleContext";
import { ToggleRow } from "../panelUi.jsx";

export const key = "taskbar_plus";

export function Panel({ settings, update }) {
  const t = useT();
  return (
    <>
      <ToggleRow label={t("premium.panel.taskbarBadge")} checked={settings.badge !== false} onChange={(v) => update({ badge: v })} />
      <ToggleRow label={`${t("premium.panel.taskbarButtons")} · ${t("premium.panel.windowsOnly")}`} checked={settings.buttons !== false} onChange={(v) => update({ buttons: v })} />
    </>
  );
}
