/** Descall+ session restore options. */
import { useT } from "../../context/LocaleContext";
import { Group, ToggleTiles } from "../story/kit.jsx";

export const key = "session_restore";
const ds = (s) => `${key}.${s}`;

export function Panel({ settings, update }) {
  const t = useT();
  const tile = (k, label, icon) => ({ id: k, label: t(label), icon, ds: ds(k), checked: settings[k] !== false, onChange: (v) => update({ [k]: v }) });
  return (
    <Group title={t("premiumStory.g.restore")}>
      <ToggleTiles
        items={[
          tile("popouts", "premium.panel.restorePopouts", "wins"),
          tile("mini", "premium.panel.restoreMini", "sidebar"),
          tile("bounds", "premium.panel.restoreBounds", "layout"),
        ]}
      />
    </Group>
  );
}
