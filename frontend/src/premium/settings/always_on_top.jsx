/** Descall+ always on top: one switch per window kind (defaults match windowKit.DEFAULT_ON_TOP). */
import { useT } from "../../context/LocaleContext";
import { Group, Note, ToggleTiles } from "../story/kit.jsx";

export const key = "always_on_top";
const ds = (s) => `${key}.${s}`;
const DEFAULTS = { main: false, mini: true, call: true, sidebar: true, popout: false };
const ROWS = [["main", "premium.panel.topMain", "monitor"], ["call", "premium.panel.topCall", "pip"], ["sidebar", "premium.win.sidebar", "sidebar"], ["popout", "premium.panel.topPopouts", "wins"]];

export function Panel({ settings, update }) {
  const t = useT();
  return (
    <Group title={t("premiumStory.g.onTop")}>
      <Note ds={ds("lead")}>{t("premium.panel.topLead")}</Note>
      <ToggleTiles
        cols
        items={ROWS.map(([k, label, icon]) => ({
          id: k,
          label: t(label),
          icon,
          ds: ds(k),
          checked: typeof settings[k] === "boolean" ? settings[k] : DEFAULTS[k],
          onChange: (v) => update({ [k]: v }),
        }))}
      />
    </Group>
  );
}
