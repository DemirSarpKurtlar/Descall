/** Descall Ultra window management options. */
import { useT } from "../../context/LocaleContext";
import { Group, ToggleTiles } from "../story/kit.jsx";

export const key = "advanced_window_mgmt";
const ds = (s) => `${key}.${s}`;

export function Panel({ settings, update }) {
  const t = useT();
  const tile = (k, label, icon) => ({ id: k, label: t(label), icon, ds: ds(k), checked: settings[k] !== false, onChange: (v) => update({ [k]: v }) });
  return (
    <Group title={t("premiumStory.g.windowBehavior")}>
      <ToggleTiles
        items={[
          tile("snap", "premium.panel.snap", "magnet"),
          tile("keepVisible", "premium.panel.keepVisible", "restore"),
          tile("mainMonitor", "premium.panel.mainMonitor", "star"),
        ]}
      />
    </Group>
  );
}
