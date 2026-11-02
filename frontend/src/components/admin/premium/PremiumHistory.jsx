import { useCallback, useEffect, useRef, useState } from "react";
import { Filter, Search } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { premiumEvents } from "./premiumApi.js";
import { EVENT_KINDS, PLANS, localInputToDate } from "./premiumModel.js";
import EventsTable from "./EventsTable.jsx";
import { DateInput, ErrorLine, MoreButton, PageHead, RefreshButton } from "./PremiumUi.jsx";

const EMPTY = { user: "", kind: "", plan: "", actor: "", from: "", to: "" };

/** Query params for GET /admin/premium/events (dates: local day → UTC bounds). */
export function eventQuery(f, cursor) {
  const from = f.from ? localInputToDate(f.from, "00:00") : null;
  const to = f.to ? localInputToDate(f.to, "23:59") : null;
  return {
    user: f.user.trim(),
    kind: f.kind,
    plan: f.plan,
    actor: f.actor.trim(),
    from: from ? from.toISOString() : "",
    to: to ? new Date(to.getTime() + 59999).toISOString() : "",
    cursor: cursor || "",
  };
}

/** Abonelik Geçmişi: every subscription event, newest first, filtered and paged. */
export default function PremiumHistory() {
  const { t, locale } = useLocale();
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async (more = null) => {
    const my = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const d = await premiumEvents(eventQuery(filters, more));
      if (my !== seq.current) return;
      const list = d?.events || d?.items || [];
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
  const apply = (e) => {
    e?.preventDefault?.();
    setFilters(draft);
  };
  const active = Object.values(filters).some(Boolean);

  return (
    <section className="admin-section agr pa-page">
      <PageHead title={t("premiumAdmin.navHistory")} sub={t("premiumAdmin.hist.sub")}>
        <RefreshButton onClick={() => load()} busy={busy} t={t} />
      </PageHead>
      <form className="agr-card pa-filters" onSubmit={apply}>
        <div className="mt-in"><Search size={14} className="mt-i" /><input type="search" value={draft.user} placeholder={t("premiumAdmin.hist.userPh")} aria-label={t("premiumAdmin.f.user")} onChange={(e) => set({ user: e.target.value })} /></div>
        <div className="mt-in sel">
          <select aria-label={t("premiumAdmin.f.kind")} value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="">{t("premiumAdmin.hist.allKinds")}</option>
            {EVENT_KINDS.map((k) => <option key={k} value={k}>{t(`premiumAdmin.kind.${k}`)}</option>)}
          </select>
        </div>
        <div className="mt-in sel">
          <select aria-label={t("premiumAdmin.f.plan")} value={draft.plan} onChange={(e) => set({ plan: e.target.value })}>
            <option value="">{t("premiumAdmin.hist.allPlans")}</option>
            {PLANS.map((p) => <option key={p} value={p}>{t(`premiumAdmin.plan.${p}`)}</option>)}
          </select>
        </div>
        <div className="mt-in"><input type="text" value={draft.actor} placeholder={t("premiumAdmin.hist.actorPh")} aria-label={t("premiumAdmin.f.actor")} onChange={(e) => set({ actor: e.target.value })} /></div>
        <DateInput label={t("premiumAdmin.from")} value={draft.from} onChange={(from) => set({ from })} />
        <DateInput label={t("premiumAdmin.to")} value={draft.to} onChange={(to) => set({ to })} />
        <div className="pa-filter-acts">
          <button type="submit" className="mt-btn sm primary"><Filter size={13} /> {t("premiumAdmin.filter")}</button>
          {active ? <button type="button" className="mt-btn sm ghost" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); }}>{t("premiumAdmin.clearFilters")}</button> : null}
        </div>
      </form>
      <ErrorLine error={error} t={t} onRetry={() => load()} />
      <div className="agr-card">
        {busy && !rows.length ? <p className="pa-empty">{t("premiumAdmin.loading")}</p> : (
          <EventsTable events={rows} locale={locale} t={t} showUser />
        )}
        <MoreButton cursor={cursor} busy={busy} onMore={() => load(cursor)} t={t} />
      </div>
    </section>
  );
}
