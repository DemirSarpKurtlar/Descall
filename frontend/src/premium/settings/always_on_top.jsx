/** Descall+ always on top: one switch per window kind (defaults match windowKit.DEFAULT_ON_TOP). */
import { useT } from "../../context/LocaleContext";
import { ToggleRow } from "../panelUi.jsx";

export const key = "always_on_top";
const DEFAULTS = { main: false, mini: true, call: true, sidebar: true, popout: false };
const ROWS = [["main", "premium.panel.topMain"], ["mini", "premium.panel.topMini"], ["call", "premium.panel.topCall"], ["sidebar", "premium.win.sidebar"], ["popout", "premium.panel.topPopouts"]];

export function Panel({ settings, update }) {
  const t = useT();
  return (
    <>
      <p className="pp-hint" style={{ margin: 0 }}>{t("premium.panel.topLead")}</p>
      {ROWS.map(([k, label]) => (
        <ToggleRow key={k} label={t(label)} checked={typeof settings[k] === "boolean" ? settings[k] : DEFAULTS[k]} onChange={(v) => update({ [k]: v })} />
      ))}
    </>
  );
}
