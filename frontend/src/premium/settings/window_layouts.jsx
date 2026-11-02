/** Descall Ultra named window layouts: save, apply, delete. */
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatDate } from "../../i18n/format.js";
import { premiumBridge } from "../panelUi.jsx";

export const key = "window_layouts";

export function Panel() {
  const { t, locale } = useLocale();
  const [name, setName] = useState("");
  const [list, setList] = useState([]);
  const load = useCallback(() => {
    premiumBridge()?.invoke("premium:layouts:list").then((r) => setList(r?.ok ? r.layouts || [] : [])).catch(() => setList([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await premiumBridge()?.invoke("premium:layouts:save", name.trim()).catch(() => null);
    setName("");
    load();
  };
  return (
    <>
      <form className="pp-redeem" onSubmit={save}>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder={t("premium.panel.layoutName")} aria-label={t("premium.panel.layoutName")} style={{ textTransform: "none", letterSpacing: 0 }} />
        <button type="submit" className="us-btn" disabled={!name.trim()}>{t("premium.panel.layoutSave")}</button>
      </form>
      {list.length ? (
        <div className="pp-list">
          {list.map((l) => (
            <div key={l.id} className="pp-list-row">
              <b>{l.name}</b>
              <span className="pp-hint">{t("premium.panel.layoutWindows", { n: l.windows })} · {formatDate(l.createdAt, locale)}</span>
              <button type="button" className="us-btn sm" onClick={() => premiumBridge()?.invoke("premium:layouts:apply", l.id).catch(() => {})}>{t("premium.panel.layoutApply")}</button>
              <button type="button" className="us-btn ghost sm" onClick={() => premiumBridge()?.invoke("premium:layouts:delete", l.id).then(load).catch(() => {})}>{t("premium.panel.layoutDelete")}</button>
            </div>
          ))}
        </div>
      ) : <p className="pp-hint" style={{ margin: 0 }}>{t("premium.panel.layoutEmpty")}</p>}
    </>
  );
}
