/** Descall+ window opacity: 30-100 % per small window kind. */
import { useT } from "../../context/LocaleContext";
import { SliderRow } from "../panelUi.jsx";

export const key = "window_opacity";
const ROWS = [["mini", "premium.panel.topMini"], ["call", "premium.panel.topCall"], ["sidebar", "premium.win.sidebar"], ["popout", "premium.panel.topPopouts"]];

export function Panel({ settings, update }) {
  const t = useT();
  return (
    <>
      <p className="pp-hint" style={{ margin: 0 }}>{t("premium.panel.opacityLead")}</p>
      {ROWS.map(([k, label]) => {
        const pct = Math.round((typeof settings[k] === "number" ? settings[k] : 1) * 100);
        return <SliderRow key={k} label={t(label)} value={pct} onChange={(v) => update({ [k]: v / 100 })} display={t("premium.panel.opacityValue", { value: pct })} />;
      })}
    </>
  );
}
