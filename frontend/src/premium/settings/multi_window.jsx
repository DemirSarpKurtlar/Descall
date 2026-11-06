/** Descall+ pop-out windows: how to open one, how many are open, close all. */
import { useCallback, useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { premiumBridge } from "../panelUi.jsx";
import { Btn, Group, Ico, Note, SetRow } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "multi_window";
const ds = (s) => `${key}.${s}`;
const SLOTS = 4;

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
  usePublish("multi_window.count", list.length);
  const title = (w) => decodeURIComponent(String(w.route).split("/").filter(Boolean).slice(1).join(" / "));
  return (
    <>
      <Group title={t("premiumStory.g.howToOpen")}>
        <Note ds={ds("how")}>{t("premium.panel.popoutsHow")} {t("premium.win.popOutLimit")}</Note>
      </Group>
      <Group title={t("premiumStory.g.openWindows")}>
        <ul className="ps-slots" data-s={ds("list")} aria-label={t("premiumStory.g.openWindows")}>
          {Array.from({ length: SLOTS }, (_, i) => {
            const w = list[i];
            return w ? (
              <li key={w.route} className="sl is-on"><Ico n="wins" size={14} /><b>{title(w)}</b></li>
            ) : (
              <li key={`empty-${i}`} className="sl">{t("premiumStory.empty")}</li>
            );
          })}
        </ul>
        <SetRow label={t("premium.panel.popoutsOpen", { n: list.length })} ds={ds("count")}>
          <Btn ds={ds("closeAll")} disabled={!list.length} onClick={() => premiumBridge()?.invoke("premium:popout:close-all").then(load).catch(() => {})}>{t("premium.panel.closeAll")}</Btn>
        </SetRow>
      </Group>
    </>
  );
}
