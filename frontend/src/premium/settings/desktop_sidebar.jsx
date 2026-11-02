/** Descall Ultra desktop sidebar: edge, auto-hide, show now. */
import { useT } from "../../context/LocaleContext";
import { SegRow, ToggleRow, premiumBridge } from "../panelUi.jsx";

export const key = "desktop_sidebar";

export function Panel({ settings, update }) {
  const t = useT();
  return (
    <>
      <div className="pp-actions">
        <button type="button" className="us-btn" data-testid="premium-open-sidebar" onClick={() => premiumBridge()?.invoke("premium:sidebar:toggle").catch(() => {})}>{t("premium.panel.openSidebar")}</button>
      </div>
      <SegRow label={t("premium.panel.edge")} value={settings.edge === "left" ? "left" : "right"} options={[["left", t("premium.panel.edgeLeft")], ["right", t("premium.panel.edgeRight")]]} onChange={(v) => update({ edge: v })} />
      <ToggleRow label={t("premium.panel.autoHide")} checked={settings.autoHide !== false} onChange={(v) => update({ autoHide: v })} />
    </>
  );
}
