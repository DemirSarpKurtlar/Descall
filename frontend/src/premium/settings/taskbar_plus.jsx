/**
 * Descall+ taskbar extras: thumbnail call buttons (Windows). The unread badge on the app icon
 * is free for every user now (Settings > Desktop app, lib/taskbarBadgePref.js).
 */
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
          { id: "buttons", label: t("premium.panel.taskbarButtons"), sub: t("premium.panel.windowsOnly"), icon: "phone", ds: ds("buttons"), checked: settings.buttons !== false, onChange: (v) => update({ buttons: v }) },
        ]}
      />
    </Group>
  );
}
