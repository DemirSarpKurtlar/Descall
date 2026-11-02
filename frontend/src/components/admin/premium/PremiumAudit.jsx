import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Filter, Search } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { premiumAudit } from "./premiumApi.js";
import { localInputToDate } from "./premiumModel.js";
import { DateInput, ErrorLine, MoreButton, PageHead, RefreshButton, When } from "./PremiumUi.jsx";

const EMPTY = { q: "", actor: "", from: "", to: "" };

/** Readable action name: premium.apply.grant → the translated op, else the raw action. */
export function actionKey(action) {
  const m = /^premium[._:-]?(?:admin[._:-])?([a-z_]+)(?:[._:-]([a-z_]+))?$/.exec(String(action || ""));
  if (!m) return null;
  return m[2] || m[1];
}

function MetaList({ meta }) {
  const entries = Object.entries(meta || {}).filter(([, v]) => v != null && v !== "");
  if (!entries.length) return <span className="mt-muted">–</span>;
  return (
    <dl className="pa-dl">
      {entries.map(([k, v]) => (
        <div key={k}><dt className="pa-mono">{k}</dt><dd className="pa-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd></div>
      ))}
    </dl>
  );
}

/** Admin İşlem Geçmişi: GET /admin/premium/audit (the premium slice of admin_audit). */
export default function PremiumAudit() {
  const { t, locale } = useLocale();
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async (more = null) => {
    const my = ++seq.current;
    setBusy(true);
    setError(null);
    const from = filters.from ? localInputToDate(filters.from, "00:00") : null;
    const to = filters.to ? localInputToDate(filters.to, "23:59") : null;
    try {
      const d = await premiumAudit({
        q: filters.q.trim(), actor: filters.actor.trim(),
        from: from ? from.toISOString() : "", to: to ? new Date(to.getTime() + 59999).toISOString() : "", cursor: more || "",
      });
      if (my !== seq.current) return;
      const list = d?.items || d?.entries || d?.audit || [];
      setRows((prev) => (more ? [...prev, ...list] : list));
      setCursor(d?.next_cursor || d?.nextCursor || null);
    } catch (err) {
      if (my === seq.current) setError(err);
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const label = (action) => {
    const k = actionKey(action);
    if (!k) return action;
    const key = `premiumAdmin.audit.act.${k}`;
    const s = t(key);
    return s !== key ? s : action;
  };

  return (
    <section className="admin-section agr pa-page">
      <PageHead title={t("premiumAdmin.navAudit")} sub={t("premiumAdmin.audit.sub")}>
        <RefreshButton onClick={() => load()} busy={busy} t={t} />
      </PageHead>
      <form className="agr-card pa-filters" onSubmit={(e) => { e.preventDefault(); setFilters(draft); }}>
        <div className="mt-in"><Search size={14} className="mt-i" /><input type="search" value={draft.q} placeholder={t("premiumAdmin.audit.searchPh")} aria-label={t("premiumAdmin.audit.searchPh")} onChange={(e) => set({ q: e.target.value })} /></div>
        <div className="mt-in"><input type="text" value={draft.actor} placeholder={t("premiumAdmin.hist.actorPh")} aria-label={t("premiumAdmin.f.actor")} onChange={(e) => set({ actor: e.target.value })} /></div>
        <DateInput label={t("premiumAdmin.from")} value={draft.from} onChange={(from) => set({ from })} />
        <DateInput label={t("premiumAdmin.to")} value={draft.to} onChange={(to) => set({ to })} />
        <div className="pa-filter-acts">
          <button type="submit" className="mt-btn sm primary"><Filter size={13} /> {t("premiumAdmin.filter")}</button>
          {Object.values(filters).some(Boolean) ? <button type="button" className="mt-btn sm ghost" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); }}>{t("premiumAdmin.clearFilters")}</button> : null}
        </div>
      </form>
      <ErrorLine error={error} t={t} onRetry={() => load()} />
      <div className="agr-card">
        {busy && !rows.length ? <p className="pa-empty">{t("premiumAdmin.loading")}</p> : !rows.length ? <p className="pa-empty">{t("premiumAdmin.audit.empty")}</p> : (
          <div className="pa-table-wrap">
            <table className="agr-table pa-table">
              <thead>
                <tr>
                  <th aria-label={t("premiumAdmin.details")} />
                  <th>{t("premiumAdmin.f.date")}</th>
                  <th>{t("premiumAdmin.f.actor")}</th>
                  <th>{t("premiumAdmin.audit.action")}</th>
                  <th>{t("premiumAdmin.audit.target")}</th>
                  <th>{t("premiumAdmin.f.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const id = r.id || `${r.at}-${i}`;
                  const isOpen = open === id;
                  const denied = /denied|unauthori[sz]ed|forbidden/i.test(String(r.action || ""));
                  return (
                    <Fragment key={id}>
                      <tr className={denied ? "is-bad" : ""}>
                        <td className="pa-td-x">
                          <button type="button" className="pa-expand" aria-expanded={isOpen} aria-label={t("premiumAdmin.details")} onClick={() => setOpen(isOpen ? null : id)}>
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td><When value={r.at || r.created_at} locale={locale} /></td>
                        <td>{r.actor_username ? `@${r.actor_username}` : String(r.actor_id || "–").slice(0, 8)}</td>
                        <td><span className={`pa-kind${denied ? " is-denied" : ""}`}>{label(r.action)}</span></td>
                        <td className="pa-reason">{r.target_username ? `@${r.target_username}` : r.target || "–"}</td>
                        <td className="pa-reason" title={r.meta?.reason || ""}>{r.meta?.reason || "–"}</td>
                      </tr>
                      {isOpen ? (
                        <tr className="pa-detail-row"><td colSpan={6}><MetaList meta={{ action: r.action, ...(r.meta || {}) }} /></td></tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <MoreButton cursor={cursor} busy={busy} onMore={() => load(cursor)} t={t} />
      </div>
    </section>
  );
}
