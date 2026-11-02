/** Descall+ session restore options. */
import { useT } from "../../context/LocaleContext";
import { ToggleRow } from "../panelUi.jsx";

export const key = "session_restore";

export function Panel({ settings, update }) {
  const t = useT();
  return (
    <>
      <ToggleRow label={t("premium.panel.restorePopouts")} checked={settings.popouts !== false} onChange={(v) => update({ popouts: v })} />
      <ToggleRow label={t("premium.panel.restoreMini")} checked={settings.mini !== false} onChange={(v) => update({ mini: v })} />
      <ToggleRow label={t("premium.panel.restoreBounds")} checked={settings.bounds !== false} onChange={(v) => update({ bounds: v })} />
    </>
  );
}
