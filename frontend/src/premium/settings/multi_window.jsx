/** Descall+ pop-out windows: how to open one, how many are open, close all. */
import { useCallback, useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { premiumBridge } from "../panelUi.jsx";

export const key = "multi_window";

export function Panel() {
  const t = useT();
  const [list, setList] = useState([]);
  const load = useCallback(() => {
    premiumBridge()?.invoke("premium:popout:list").then((r) => setList(r?.ok ? r.windows || [] : [])).catch(() => setList([]));
  }, []);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 4000);
    return () => window.clearInterval(id);
  }, [load]);
  return (
    <>
      <p className="pp-hint" style={{ margin: 0 }}>{t("premium.panel.popoutsHow")} {t("premium.win.popOutLimit")}</p>
      {list.length ? (
        <div className="pp-list">
          {list.map((w) => <div key={w.route} className="pp-list-row"><b>{decodeURIComponent(String(w.route).split("/").filter(Boolean).slice(1).join(" / "))}</b></div>)}
        </div>
      ) : null}
      <div className="pp-set-row">
        <span className="pp-hint">{t("premium.panel.popoutsOpen", { n: list.length })}</span>
        <button type="button" className="us-btn ghost sm" disabled={!list.length} onClick={() => premiumBridge()?.invoke("premium:popout:close-all").then(load).catch(() => {})}>{t("premium.panel.closeAll")}</button>
      </div>
    </>
  );
}
