/** Descall Ultra screen edge: which edge reveals the sidebar, and after how long. Off by default. */
import { useT } from "../../context/LocaleContext";
import { SegRow } from "../panelUi.jsx";
import { useFeatureSettings } from "../featureSettings.js";

export const key = "screen_edge_actions";
export const defaultEnabled = false;
const DELAYS = [0, 250, 500, 1000];

export function Panel({ settings, update, has }) {
  const t = useT();
  const [sidebar] = useFeatureSettings("desktop_sidebar", {});
  const edge = settings.edge === "left" || settings.edge === "right" ? settings.edge : sidebar.edge === "left" ? "left" : "right";
  const delay = DELAYS.includes(settings.delay) ? settings.delay : 250;
  return (
    <>
      <p className="pp-hint" style={{ margin: 0 }}>{t("premium.panel.edgeLead")}</p>
      {!has("desktop_sidebar") || sidebar.enabled === false ? <p className="pp-warn">{t("premium.panel.needsSidebar")}</p> : null}
      <SegRow label={t("premium.panel.edge")} value={edge} options={[["left", t("premium.panel.edgeLeft")], ["right", t("premium.panel.edgeRight")]]} onChange={(v) => update({ edge: v })} />
      <SegRow label={t("premium.panel.edgeDelay")} value={delay} options={DELAYS.map((ms) => [ms, t("premium.panel.edgeDelayValue", { ms })])} onChange={(v) => update({ delay: v })} />
    </>
  );
}
