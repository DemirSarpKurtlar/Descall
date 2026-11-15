/** "Kategoriler": items, active, sales and revenue per category; switch a whole category on / off. */
import { useMemo, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { Layers } from "../../ui/Icon.jsx";
import { Power } from "./shopDeskIcons.js";
import { CATEGORIES, num } from "./shopDeskModel.js";
import { ItemThumb, Pill, errMsg } from "./ui.jsx";
import OpsStrip from "./OpsStrip.jsx";

const KNOWN = new Set([...CATEGORIES, "avatar_frame", "profile_title", "profile_badge", "profile_background"]);

export default function CategoriesTab({ data, items, kpis, mismatchCount, goTab, afterWrite, showToast, onShowCategory }) {
  const { t, locale } = useLocale();
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null);
  const rows = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const r = map.get(it.category) || { category: it.category, total: 0, active: 0, sales7: 0, revenue7: 0, priceSum: 0, retired: it.retired, sample: null, ids: [] };
      r.total += 1;
      if (it.active) r.active += 1;
      r.sales7 += Number(it.sales?.n7) || 0;
      r.revenue7 += Number(it.sales?.revenue7) || 0;
      r.priceSum += Number(it.price_descoin) || 0;
      if (!r.sample || (it.active && !r.sample.active)) r.sample = it;
      r.ids.push(it.id);
      map.set(it.category, r);
    }
    const order = (c) => (CATEGORIES.indexOf(c) < 0 ? 99 : CATEGORIES.indexOf(c));
    return [...map.values()].sort((a, b) => Number(a.retired) - Number(b.retired) || order(a.category) - order(b.category));
  }, [items]);

  const bulk = async (r, active) => {
    const key = `${r.category}:${active}`;
    if (confirm !== key) {
      setConfirm(key);
      return;
    }
    setBusy(key);
    try {
      const res = await adminFetch("/shop/desk/bulk", { method: "POST", body: JSON.stringify({ action: active ? "activate" : "deactivate", itemIds: r.ids, reason: "category" }) });
      afterWrite(t("shopDesk.toastBulk", { n: res.changed }));
    } catch (e) {
      showToast(errMsg(t, e), null, "bad");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  return (
    <div className="sdk-ops">
      <OpsStrip kpis={kpis} mismatchCount={mismatchCount} reconcileAt={data?.reconcile?.started_at} onReconcile={() => goTab("reconcile")} />
      <section className="sdk-card">
        <div className="sdk-card-head">
          <h2 className="sdk-card-title">
            <Layers size={20} />
            {t("shopDesk.categoriesTitle")}
          </h2>
          <span className="sdk-muted">{t("shopDesk.categoriesSub")}</span>
        </div>
        <div className="sdk-table-wrap">
          <table className="sdk-table">
            <thead>
              <tr>
                <th>{t("shopDesk.col.category")}</th>
                <th>{t("shopDesk.col.items")}</th>
                <th>{t("shopDesk.col.activeN")}</th>
                <th>{t("shopDesk.col.sales7")}</th>
                <th>{t("shopDesk.col.revenue7")}</th>
                <th>{t("shopDesk.col.avgPrice")}</th>
                <th aria-label={t("shopDesk.col.actions")} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category} className={`sdk-row${r.retired ? " is-dim" : ""}`} onClick={() => !r.retired && onShowCategory(r.category)}>
                  <td>
                    <div className="sdk-item">
                      <ItemThumb item={r.sample} size={40} />
                      <div>
                        <b>{t(`shopDesk.cat.${KNOWN.has(r.category) ? r.category : "other"}`)}</b>
                        {r.retired ? <Pill tone="gray">{t("shopDesk.status.retired")}</Pill> : null}
                      </div>
                    </div>
                  </td>
                  <td className="tnum">{num(r.total, locale)}</td>
                  <td className="tnum">
                    {num(r.active, locale)}
                    <span className="sdk-meter is-violet sdk-meter-inline">
                      <i style={{ width: `${r.total ? Math.round((r.active / r.total) * 100) : 0}%` }} />
                    </span>
                  </td>
                  <td className="tnum">{num(r.sales7, locale)}</td>
                  <td className="tnum">{num(r.revenue7, locale)} DC</td>
                  <td className="tnum sdk-muted">{r.total ? num(Math.round(r.priceSum / r.total), locale) : "-"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {r.retired ? null : (
                      <span className="sdk-rowacts">
                        {r.active < r.total ? (
                          <button type="button" className={`sdk-btn is-sm${confirm === `${r.category}:true` ? " is-primary" : ""}`} disabled={busy != null} onClick={() => bulk(r, true)}>
                            <Power size={15} />
                            {confirm === `${r.category}:true` ? t("shopDesk.confirmAll", { n: r.total - r.active }) : t("shopDesk.activateAll")}
                          </button>
                        ) : null}
                        {r.active > 0 ? (
                          <button type="button" className={`sdk-btn is-sm${confirm === `${r.category}:false` ? " is-danger" : ""}`} disabled={busy != null} onClick={() => bulk(r, false)}>
                            <Power size={15} />
                            {confirm === `${r.category}:false` ? t("shopDesk.confirmAll", { n: r.active }) : t("shopDesk.deactivateAll")}
                          </button>
                        ) : null}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
