/** Descall Ultra screen edge: which edge reveals the sidebar, and after how long. Off by default. */
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { EdgePicker, Group, Hint, Note, Seg } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "screen_edge_actions";
export const defaultEnabled = false;
const ds = (s) => `${key}.${s}`;
const DELAYS = [0, 250, 500, 1000];

export function Panel({ settings, update, has }) {
  const t = useT();
  const [sidebar] = useFeatureSettings("desktop_sidebar", {});
  const sidebarEdge = sidebar.edge === "left" ? "left" : "right";
  usePublish("desktop_sidebar.edge", sidebarEdge);
  const edge = settings.edge === "left" || settings.edge === "right" ? settings.edge : sidebarEdge;
  const delay = DELAYS.includes(settings.delay) ? settings.delay : 250;
  return (
    <>
      <Group title={t("premium.panel.edge")}>
        <Note ds={ds("lead")}>{t("premium.panel.edgeLead")}</Note>
        <EdgePicker value={edge} onChange={(v) => update({ edge: v })} left={t("premium.panel.edgeLeft")} right={t("premium.panel.edgeRight")} label={t("premium.panel.edge")} ds={ds("edge")} />
        {!has("desktop_sidebar") || sidebar.enabled === false ? <Hint tone="warn" ds={ds("needsSidebar")}>{t("premium.panel.needsSidebar")}</Hint> : null}
      </Group>
      <Group title={t("premium.panel.edgeDelay")}>
        <Seg value={delay} onChange={(v) => update({ delay: Number(v) })} label={t("premium.panel.edgeDelay")} ds={ds("delay")} options={DELAYS.map((ms) => ({ value: ms, label: t("premium.panel.edgeDelayValue", { ms }) }))} />
        <div className="ps-delay" aria-hidden="true"><i style={{ width: `${(delay / 1000) * 100}%` }} /></div>
      </Group>
    </>
  );
}
