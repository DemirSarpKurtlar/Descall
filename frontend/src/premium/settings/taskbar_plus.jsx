/** Descall+ taskbar extras: unread badge, thumbnail call buttons (Windows). */
import { useT } from "../../context/LocaleContext";
import { Group, ToggleTiles } from "../story/kit.jsx";

export const key = "taskbar_plus";
const ds = (s) => `${key}.${s}`;

export function Panel({ settings, update }) {
  const t = useT();
  return (
    <Group title={t("premiumStory.g.taskbar")}>
      <ToggleTiles
        items={[
          { id: "badge", label: t("premium.panel.taskbarBadge"), icon: "tag", ds: ds("badge"), checked: settings.badge !== false, onChange: (v) => update({ badge: v }) },
          { id: "buttons", label: t("premium.panel.taskbarButtons"), sub: t("premium.panel.windowsOnly"), icon: "phone", ds: ds("buttons"), checked: settings.buttons !== false, onChange: (v) => update({ buttons: v }) },
        ]}
      />
    </Group>
  );
}
