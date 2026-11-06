/** Descall+ window opacity: 30-100 % per small window kind. */
import { useT } from "../../context/LocaleContext";
import { Group, Note, SetRow, Slider } from "../story/kit.jsx";

export const key = "window_opacity";
const ds = (s) => `${key}.${s}`;
const ROWS = [["call", "premium.panel.topCall", "pip"], ["sidebar", "premium.win.sidebar", "sidebar"], ["popout", "premium.panel.topPopouts", "wins"]];

export function Panel({ settings, update }) {
  const t = useT();
  return (
    <Group title={t("premiumStory.g.opacity")}>
      <Note ds={ds("lead")}>{t("premium.panel.opacityLead")}</Note>
      {ROWS.map(([k, label, icon]) => {
        const pct = Math.round((typeof settings[k] === "number" ? settings[k] : 1) * 100);
        return (
          <SetRow key={k} icon={icon} label={t(label)} stack>
            <Slider value={pct} min={30} max={100} step={5} ds={ds(k)} label={t(label)} onChange={(v) => update({ [k]: v / 100 })} format={(v) => t("premium.panel.opacityValue", { value: v })} />
          </SetRow>
        );
      })}
    </Group>
  );
}
