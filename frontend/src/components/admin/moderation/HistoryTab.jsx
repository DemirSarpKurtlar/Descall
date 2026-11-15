/**
 * Geçmiş: search, type / category / admin / period filters, the daily stacked
 * chart, export (CSV, JSON, copy as a table; audited on the server) and paging.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { copyText } from "../../../lib/copyText.js";
import { Search, Download, FileText, Code, Copy, ChevronDown, AlertTriangle } from "../../ui/Icon.jsx";
import DossierMenu from "../dossier/DossierMenu.jsx";
import { ModAvatar, Chip, Select, durationShort, categoryText } from "./ModParts.jsx";
import { HISTORY_PERIODS, actionTone, chartBars, historyQuery, statusChip } from "./modDeskModel.js";
import { historyCsv, historyTsv } from "./modDeskExport.js";

const PAGE = 40;
const TYPES = ["", "timeout", "ban", "kick", "unban", "untimeout", "timeout_extend", "ban_extend"];

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function HistoryTab({ meta, epoch, onToast, onOpenPerson }) {
  const { t, locale } = useLocale();
  const [q, setQ] = useState("");
  const [qLive, setQLive] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [actor, setActor] = useState("");
  const [days, setDays] = useState("14");
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    const h = setTimeout(() => setQLive(q), 280);
    return () => clearTimeout(h);
  }, [q]);

  const filters = useMemo(() => ({ q: qLive, type, category, actor, days }), [qLive, type, category, actor, days]);

  const load = useCallback(async () => {
    try {
      const d = await adminFetch(`/moderation/history/search?${historyQuery({ ...filters, offset: 0, limit: PAGE })}`);
      setData(d);
      setRows(d?.rows || []);
      setErr("");
    } catch (e) {
      setErr(e?.message || t("modDesk.loadError"));
      setData((cur) => cur || { rows: [], total: 0, chart: [], actors: [] });
    }
  }, [filters, t]);
  useEffect(() => {
    load();
  }, [load, epoch]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const d = await adminFetch(`/moderation/history/search?${historyQuery({ ...filters, offset: rows.length, limit: PAGE })}`);
      setRows((cur) => [...cur, ...(d?.rows || [])]);
    } catch (e) {
      onToast(e?.message || t("modDesk.loadError"), "red");
    } finally {
      setLoadingMore(false);
    }
  };

  const exportAll = async (kind) => {
    try {
      const qs = historyQuery({ ...filters, offset: 0, limit: 200 });
      const d = await adminFetch(`/moderation/history/export?${qs}&format=json`);
      const list = d?.rows || [];
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "csv") download(`moderation-history-${stamp}.csv`, historyCsv(list), "text/csv;charset=utf-8");
      else if (kind === "json") download(`moderation-history-${stamp}.json`, JSON.stringify(list, null, 2), "application/json");
      else {
        if (await copyText(historyTsv(list))) onToast(t("modDesk.hist.copied", { count: list.length }));
        else onToast(t("Could not copy to clipboard"), "red");
      }
    } catch (e) {
      onToast(e?.message || t("modDesk.actionFailed"), "red");
    }
  };

  const bars = chartBars(data?.chart);
  const total = data?.total ?? 0;
  const cats = meta?.categories || [];
  const actorOptions = [{ id: "", label: t("modDesk.hist.everyone") }, { id: "auto", label: t("modDesk.board.auto") }, ...(data?.actors || []).map((a) => ({ id: a.id, label: `@${a.username}` }))];
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mdk-hist">
      <div className="mdk-hfilters">
        <label className="mdk-inp is-wide">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("modDesk.hist.search")} aria-label={t("modDesk.hist.search")} />
        </label>
        <Select value={type} onChange={setType} label={t("modDesk.hist.type")} prefix={t("modDesk.hist.type")} options={TYPES.map((x) => ({ id: x, label: x ? t(`modDesk.action.${x}`) : t("modDesk.hist.all") }))} />
        <Select value={category} onChange={setCategory} label={t("modDesk.hist.category")} prefix={t("modDesk.hist.category")} width={260} options={[{ id: "", label: t("modDesk.hist.all") }, ...cats.map((c) => ({ id: c.id, label: categoryText(c.id, t, cats) }))]} />
        <Select value={actor} onChange={setActor} label={t("modDesk.hist.actor")} prefix={t("modDesk.hist.actor")} options={actorOptions} />
        <Select value={days} onChange={setDays} label={t("modDesk.hist.period")} options={HISTORY_PERIODS.map((d) => ({ id: d, label: t("modDesk.hist.lastDays", { count: Number(d) }) }))} />
        <button ref={exportRef} type="button" className="mdk-dd is-export" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((v) => !v)}>
          <Download size={16} aria-hidden="true" />
          {t("modDesk.hist.export")}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <DossierMenu
          open={exportOpen}
          anchorRef={exportRef}
          onClose={() => setExportOpen(false)}
          label={t("modDesk.hist.export")}
          width={270}
          items={[
            { id: "csv", icon: FileText, label: t("modDesk.hist.csv"), sub: t("modDesk.hist.csvSub", { count: total }), onSelect: () => exportAll("csv") },
            { id: "json", icon: Code, label: t("modDesk.hist.json"), sub: t("modDesk.hist.jsonSub"), onSelect: () => exportAll("json") },
            { id: "copy", icon: Copy, label: t("modDesk.hist.copy"), sub: t("modDesk.hist.copySub"), onSelect: () => exportAll("copy") },
          ]}
        />
      </div>

      <div className="mdk-card mdk-chart-card">
        <div className="mdk-chart-head">
          <h3>{t("modDesk.hist.chart")}</h3>
          <div className="mdk-legend">
            <span><i style={{ background: "#f2a93b" }} />{t("modDesk.act.timeout")}</span>
            <span><i style={{ background: "#f23f43" }} />{t("modDesk.act.ban")}</span>
            <span><i style={{ background: "#7a7f93" }} />{t("modDesk.act.kick")}</span>
          </div>
        </div>
        <div className="mdk-chart-row">
          <div className="mdk-chart" role="img" aria-label={t("modDesk.hist.chartAria", { count: total })}>
            {bars.map((b) => (
              <div key={b.day} className="mdk-col" title={`${b.day}: ${b.total}`}>
                <i style={{ height: `${b.timeout}%`, background: "#f2a93b" }} />
                <i style={{ height: `${b.ban}%`, background: "#f23f43" }} />
                <i style={{ height: `${b.kick}%`, background: "#7a7f93" }} />
              </div>
            ))}
          </div>
          <div className="mdk-chart-total">
            <b className="tnum">{total}</b>
            <span>{t("modDesk.hist.actions")}</span>
          </div>
        </div>
      </div>

      {err ? (
        <div className="mdk-banner is-red" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{err}</span>
        </div>
      ) : null}

      <div className="mdk-table" role="table" aria-label={t("modDesk.tab.history")}>
        <div className="mdk-th mdk-hrow" role="row">
          {["when", "action", "target", "category", "length", "by", "status"].map((c) => (
            <span key={c} role="columnheader">{t(`modDesk.hist.col.${c}`)}</span>
          ))}
        </div>
        {data == null ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="mdk-trw mdk-hrow is-skel"><i className="mdk-skel is-line" /></div>)
        ) : rows.length === 0 ? (
          <p className="mdk-empty">{t("modDesk.hist.empty")}</p>
        ) : (
          rows.map((r) => {
            const st = statusChip(r.status);
            return (
              <div key={r.id} className="mdk-trw mdk-hrow" role="row">
                <span className="mdk-muted tnum" role="cell">{dayFmt.format(new Date(r.createdAt))}</span>
                <span role="cell"><Chip tone={actionTone(r.action)}>{t(`modDesk.action.${r.action}`)}</Chip></span>
                <span role="cell" className="mdk-cell-user">
                  <button type="button" className="mdk-userlink" aria-label={`${t("modDesk.board.openFile")}: @${r.target?.username || "?"}`} onClick={() => onOpenPerson?.(r.target?.id)}>
                    <ModAvatar user={r.target} size={22} />
                    @{r.target?.username || "?"}
                  </button>
                </span>
                <span role="cell" className="mdk-cell">{r.liftReason ? t(`modDesk.liftReason.${r.liftReason}`) : r.category ? categoryText(r.category, t, cats) : r.message || "—"}</span>
                <span role="cell" className="tnum">{r.action === "timeout" || r.action === "ban" ? durationShort(r.durationSeconds, t) : r.durationSeconds ? `+${durationShort(r.durationSeconds, t)}` : "—"}</span>
                <span role="cell" className="mdk-muted mdk-cell">{r.auto ? t("modDesk.board.auto") : r.actor ? `@${r.actor.username}` : "—"}</span>
                <span role="cell">
                  <Chip tone={st.tone}>
                    {t(`modDesk.status.${st.key}`)}
                    {r.status === "lifted" && r.liftedBy ? ` · @${r.liftedBy.username}` : ""}
                  </Chip>
                </span>
              </div>
            );
          })
        )}
      </div>
      <div className="mdk-hfoot">
        <span>{total ? t("modDesk.hist.showing", { from: 1, to: rows.length, total }) : ""}</span>
        {rows.length < total ? (
          <button type="button" className="mdk-btn is-xs" onClick={more} disabled={loadingMore}>
            {loadingMore ? t("modDesk.loading") : t("modDesk.hist.more")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
