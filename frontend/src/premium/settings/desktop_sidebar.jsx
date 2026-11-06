/** Descall Ultra desktop sidebar: edge, auto-hide, show now. */
import { useT } from "../../context/LocaleContext";
import { premiumBridge } from "../panelUi.jsx";
import { Actions, Btn, EdgePicker, Group, SetRow, Switch } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "desktop_sidebar";
const ds = (s) => `${key}.${s}`;

export function Panel({ settings, update }) {
  const t = useT();
  const edge = settings.edge === "left" ? "left" : "right";
  usePublish("desktop_sidebar.edge", edge);
  return (
    <>
      <Group title={t("premium.panel.edge")}>
        <EdgePicker value={edge} onChange={(v) => update({ edge: v })} left={t("premium.panel.edgeLeft")} right={t("premium.panel.edgeRight")} label={t("premium.panel.edge")} ds={ds("edge")} />
        <SetRow icon="sidebar" label={t("premium.panel.autoHide")}>
          <Switch checked={settings.autoHide !== false} onChange={(v) => update({ autoHide: v })} label={t("premium.panel.autoHide")} ds={ds("autoHide")} />
        </SetRow>
      </Group>
      <Group title={t("premium.win.sidebar")}>
        <Actions>
          <Btn kind="primary" icon="sidebar" ds={ds("open")} data-testid="premium-open-sidebar" onClick={() => premiumBridge()?.invoke("premium:sidebar:toggle").catch(() => {})}>{t("premium.panel.openSidebar")}</Btn>
        </Actions>
      </Group>
    </>
  );
}
