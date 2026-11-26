/**
 * Yönetici Paneli › Performans (section "perf"). Owner pick: Draft A "Konsol"
 * (scratchpad drafts/perf.html#A), İşlem kaydı Konsol language, built one to one:
 *   1  Gerçek kullanıcılar: query bar (platform, sürüm, sayfa, cihaz, bağlantı, ülke,
 *      kullanıcı kimliği), saved + shareable views, red release-regression banner,
 *      8 metric tiles (p75, iyi / geliştirilmeli / kötü), p75 chart with release and
 *      flag markers, release comparison, slowest pages (any dimension)
 *   2  row -> right panel: breakdown heat map, LCP / INP attribution, slowest users by
 *      user id with the session timeline, Lighthouse for that page
 *   3  Lighthouse CI tab (same console language)
 *   4  alert rule dialog with the "last 90 days" preview and the admin-room preview
 * Plus: Uyarılar tab (open / hidden alerts, undo), live sessions, CSV export, deep links,
 * live admin-room system message when a regression is found.
 * Server: backend/routes/adminPerf.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { copyText } from "../../../lib/copyText.js";
import { useAdminPerms } from "../dossier/adminPerms.js";
import { AuditMenu } from "../audit/AuditUi.jsx";
import { Activity, AlertTriangle, Bell, Bookmark, Bug, ChevronRight, Download, Eye, Layers, Lightbulb, Link, MoreHorizontal, Plus, Rocket, SlidersHorizontal, SortAsc, Trash2, Users } from "../../ui/Icon.jsx";
import PerfQueryBar from "./PerfQueryBar.jsx";
import PerfChart, { Dist, Mix, Spark } from "./PerfChart.jsx";
import PerfDrawer from "./PerfDrawer.jsx";
import PerfLighthouse from "./PerfLighthouse.jsx";
import { PerfAlertsTab, PerfFiltersDialog, PerfRuleDialog, PerfSaveViewDialog, SystemNote } from "./PerfDialogs.jsx";
import {
  BUILTIN_VIEWS,
  CHART_METRICS,
  DEFAULT_TOKENS,
  GROUPS,
  KPI_ORDER,
  PLATFORMS,
  PLATFORM_COLOR,
  addToken,
  deltaChip,
  fmtInt,
  fmtPct,
  fmtValue,
  parseViewLink,
  queryToTokens,
  rating,
  sameQuery,
  shortUser,
  toggleToken,
  tokensToQuery,
  viewLink,
} from "./perfAdminModel.js";
import "../../../styles/admin-audit.css";
import "../../../styles/admin-perf.css";

const SPARK_COLOR = { g: "#6fe0a3", n: "#ffc773", p: "#ff9a9c", x: "#8da2ff" };

function download(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function usePerfLabels(t, locale) {
  return useMemo(() => {
    const platform = (p) => t(`perfAdmin.platform.${p}`);
    const device = (d) => t(`perfAdmin.device.${d}`);
    const connection = (c) => t(`perfAdmin.conn.${c}`);
    const range = (r) => t(`perfAdmin.range.${r}`);
    const country = (c) => {
      try {
        return new Intl.DisplayNames([locale], { type: "region" }).of(c) || c;
      } catch {
        return c;
      }
    };
    const metric = (m) => t(`perfAdmin.metric.${m}`);
    const metricSub = (m) => t(`perfAdmin.metricSub.${m}`);
    const routeName = (r) => {
      const k = `perfAdmin.route.${String(r).replace(/[^a-z0-9]/gi, "_")}`;
      const s = t(k);
      return s === k ? "" : s;
    };
    return { platform, device, connection, range, country, metric, metricSub, routeName };
  }, [t, locale]);
}

export default function AdminPerf({ socket, onGoto, onLiveCount }) {
  const { t, locale } = useLocale();
  const { can, navigate } = useAdminPerms();
  const L = usePerfLabels(t, locale);
  const fromLink = useMemo(() => (typeof window !== "undefined" ? parseViewLink(window.location.hash) : null), []);
  const [tab, setTab] = useState(fromLink?.tab || "rum");
  const [tokens, setTokens] = useState(() => (fromLink ? queryToTokens(fromLink.query) : [...DEFAULT_TOKENS]));
  const [chartMetric, setChartMetric] = useState("inp");
  const [group, setGroup] = useState("route");
  const [sort, setSort] = useState("inp");
  const [summary, setSummary] = useState({ loading: true, data: null, err: "" });
  const [table, setTable] = useState({ loading: true, data: null, err: "" });
  const [views, setViews] = useState({ list: [], ready: true });
  const [drawer, setDrawer] = useState(null); // { dim, value }
  const [dialog, setDialog] = useState(null); // rule | saveView | filters
  const [toast, setToast] = useState(null);
  const [note, setNote] = useState(null); // live admin-room system message
  const [sortMenu, setSortMenu] = useState(false);
  const [rowMenu, setRowMenu] = useState(null);
  const [viewMenu, setViewMenu] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState("");
  const toastTimer = useRef(null);
  const inputRef = useRef(null);
  const sortRef = useRef(null);
  const viewAnchor = useRef(null);
  const chartRef = useRef(null);
  const seq = useRef(0);
  const tseq = useRef(0);

  const query = useMemo(() => tokensToQuery(tokens), [tokens]);
  const qkey = JSON.stringify(query);

  const notify = useCallback((text, tone = "ok", action = null) => {
    setToast({ text, tone, action });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), action ? 8000 : 4500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);

  /* ---------------- data ---------------- */

  const loadSummary = useCallback(async () => {
    const s = ++seq.current;
    setSummary((x) => ({ ...x, loading: !x.data, err: "" }));
    try {
      const d = await adminFetch(`/perf/summary?q=${encodeURIComponent(qkey)}&chart=${chartMetric}`);
      if (s !== seq.current) return;
      setSummary({ loading: false, data: d, err: "" });
    } catch (e) {
      if (s !== seq.current) return;
      setSummary((x) => ({ loading: false, data: x.data, err: e?.message || t("perfAdmin.err.load") }));
    }
  }, [qkey, chartMetric, t]);

  const loadTable = useCallback(async () => {
    const s = ++tseq.current;
    setTable((x) => ({ ...x, loading: !x.data || x.data.group !== group, err: "" }));
    try {
      const d = await adminFetch(`/perf/table?q=${encodeURIComponent(qkey)}&group=${group}&sort=${sort}`);
      if (s !== tseq.current) return;
      setTable({ loading: false, data: d, err: "" });
    } catch (e) {
      if (s !== tseq.current) return;
      setTable((x) => ({ loading: false, data: x.data, err: e?.message || t("perfAdmin.err.load") }));
    }
  }, [qkey, group, sort, t]);

  const loadViews = useCallback(async () => {
    try {
      const d = await adminFetch("/perf/views");
      setViews({ list: d.views || [], ready: d.ready !== false });
    } catch {
      setViews((v) => ({ ...v, ready: false }));
    }
  }, []);

  useEffect(() => {
    if (tab === "rum" || tab === "alerts") loadSummary();
  }, [loadSummary, tab]);
  useEffect(() => {
    if (tab === "rum") loadTable();
  }, [loadTable, tab]);
  useEffect(() => {
    loadViews();
  }, [loadViews]);
  // Data is "40 sn önce": refresh every minute while open.
  useEffect(() => {
    if (tab !== "rum") return undefined;
    const id = setInterval(() => {
      loadSummary();
    }, 60000);
    return () => clearInterval(id);
  }, [tab, loadSummary]);

  useEffect(() => {
    if (!socket) return undefined;
    const onAlert = (p) => {
      setNote({ ...p, at: p?.at || new Date().toISOString() });
      loadSummary();
    };
    const onUpdate = (p) => {
      if (p?.type === "perf_alert") loadSummary();
    };
    socket.on("admin:perf-alert", onAlert);
    socket.on("admin:update", onUpdate);
    return () => {
      socket.off("admin:perf-alert", onAlert);
      socket.off("admin:update", onUpdate);
    };
  }, [socket, loadSummary]);

  // "/" and Ctrl K focus the query bar.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(input|textarea|select)$/i.test(e.target?.tagName || "") || e.target?.isContentEditable;
      if (((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sum = summary.data;
  const ready = sum ? sum.ready !== false : true;
  const alerts = sum?.alerts || [];
  useEffect(() => {
    onLiveCount?.(alerts.length);
  }, [alerts.length, onLiveCount]);

  /* ---------------- actions ---------------- */

  const tokenText = (tok) => {
    const vals = Array.isArray(tok.value) ? tok.value : [tok.value];
    const name = (v) => {
      if (tok.kind === "platform") return L.platform(v);
      if (tok.kind === "device") return L.device(v);
      if (tok.kind === "connection") return L.connection(v);
      if (tok.kind === "range") return L.range(v);
      if (tok.kind === "user") return shortUser(v);
      return v;
    };
    return { k: t(`perfAdmin.tok.${tok.kind}`), v: vals.map(name).join(", ") };
  };

  const pickToken = (kind, value) => {
    setTokens((cur) => addToken(cur, kind, value));
  };

  const allViews = useMemo(() => [...BUILTIN_VIEWS.map((v) => ({ ...v, builtin: true })), ...views.list], [views.list]);
  const activeView = allViews.find((v) => sameQuery(v.query, query))?.id || null;

  const pickView = (v) => {
    setTokens(queryToTokens(v.query));
    if (v.chart) setChartMetric(v.chart);
  };

  const copyLink = async () => {
    const ok = await copyText(viewLink(window.location.origin, query, tab === "lh" ? "lh" : "rum"));
    notify(ok ? t("perfAdmin.views.linkCopied") : t("perfAdmin.err.generic"), ok ? "ok" : "error");
  };

  const review = (a) => {
    // "İncele": the two releases side by side, this platform, this metric.
    setTokens([{ kind: "range", value: query.range }, { kind: "platform", value: [a.platform] }, { kind: "version", value: [a.prevVersion, a.version].filter(Boolean) }]);
    if (CHART_METRICS.includes(a.metric)) setChartMetric(a.metric);
    setSort(a.metric === "appstart" || a.metric === "voicejoin" || a.metric === "msglist" ? "inp" : a.metric);
    setTimeout(() => chartRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 60);
  };

  const openErrorLog = async (a) => {
    setBusy(`err-${a.id}`);
    try {
      const r = await adminFetch(`/perf/alerts/${encodeURIComponent(a.id)}/error-log`, { method: "POST", body: "{}" });
      notify(r.existed ? t("perfAdmin.alert.errorExists") : t("perfAdmin.alert.errorOpened"), "ok", can("errors") ? { label: t("perfAdmin.alert.gotoErrors"), run: () => onGoto?.("errors") } : null);
      loadSummary();
    } catch (e) {
      notify(e?.message || t("perfAdmin.err.generic"), "error");
    } finally {
      setBusy("");
    }
  };

  const setHidden = async (a, hide) => {
    setBusy(`hide-${a.id}`);
    try {
      await adminFetch(`/perf/alerts/${encodeURIComponent(a.id)}/${hide ? "hide" : "unhide"}`, { method: "POST", body: "{}" });
      if (hide) notify(t("perfAdmin.alert.hidden"), "ok", { label: t("perfAdmin.undo"), run: () => setHidden(a, false) });
      else notify(t("perfAdmin.alert.shown"));
      loadSummary();
    } catch (e) {
      notify(e?.message || t("perfAdmin.err.generic"), "error");
    } finally {
      setBusy("");
    }
  };

  const runExport = async () => {
    try {
      const r = await adminFetch(`/perf/export?q=${encodeURIComponent(qkey)}&group=${group}&sort=${sort}`);
      download(r.filename, r.mime, r.content);
      notify(t("perfAdmin.export.done", { n: r.rows || 0 }));
    } catch (e) {
      notify(e?.message || t("perfAdmin.export.failed"), "error");
    }
  };

  const deleteView = async (v) => {
    try {
      await adminFetch(`/perf/views/${encodeURIComponent(v.id)}`, { method: "DELETE" });
      notify(t("perfAdmin.views.deleted", { name: v.name }));
      loadViews();
    } catch (e) {
      notify(e?.message || t("perfAdmin.err.generic"), "error");
    }
  };

  const crumb = useMemo(() => {
    const parts = [t("perfAdmin.crumb")];
    if (sum?.sampleRate != null) parts.push(t("perfAdmin.sampling", { pct: fmtPct(sum.sampleRate * 100, locale) }));
    if (sum?.lastEventAt) {
      const sec = Math.max(0, Math.round((now - Date.parse(sum.lastEventAt)) / 1000));
      parts.push(sec < 90 ? t("perfAdmin.dataAgoSec", { n: sec }) : t("perfAdmin.dataAgoMin", { n: Math.round(sec / 60) }));
    }
    return parts.join(" · ");
  }, [t, sum, now, locale]);

  const selectedPlatforms = query.platform;
  const banner = alerts[0] || null;

  /* ---------------- render ---------------- */

  return (
    <div className="alg apf" data-testid="perf-console">
      <div className="alg-top">
        <div>
          <h1>{t("perfAdmin.title")}</h1>
          <p className="alg-crumb">{crumb}</p>
        </div>
        <div className="alg-topr">
          <div className="apf-seg" role="tablist" aria-label={t("perfAdmin.title")}>
            <button type="button" role="tab" aria-selected={tab === "rum"} className={tab === "rum" ? "is-on" : ""} onClick={() => setTab("rum")} data-testid="perf-tab-rum">
              <Users size={15} />
              <span className="apf-seg-long">{t("perfAdmin.tab.rum")}</span>
              <span className="apf-seg-short">{t("perfAdmin.tab.rumShort")}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "lh"} className={tab === "lh" ? "is-on" : ""} onClick={() => setTab("lh")} data-testid="perf-tab-lh">
              <Lightbulb size={15} />
              <span className="apf-seg-long">{t("perfAdmin.tab.lh")}</span>
              <span className="apf-seg-short">{t("perfAdmin.tab.lhShort")}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "alerts"} className={`apf-seg-alerts${tab === "alerts" ? " is-on" : ""}`} onClick={() => setTab("alerts")} data-testid="perf-tab-alerts">
              <Bell size={15} />
              <span>{t("perfAdmin.tab.alerts")}</span>
              {alerts.length ? <em className="tnum">{alerts.length}</em> : null}
            </button>
          </div>
          <span className="alg-live is-on apf-live" title={t("perfAdmin.live.title")} data-testid="perf-live">
            <span className="alg-pulse" aria-hidden="true" />
            <span className="tnum apf-live-long">{sum?.live != null ? t("perfAdmin.live.long", { n: fmtInt(sum.live, locale) }) : t("perfAdmin.live.waiting")}</span>
            <span className="tnum apf-live-short">{sum?.live != null ? t("perfAdmin.live.short", { n: fmtInt(sum.live, locale) }) : "…"}</span>
          </span>
          <button type="button" className="alg-btn apf-hide-phone" onClick={runExport} disabled={tab !== "rum"} data-testid="perf-export">
            <Download size={18} />
            {t("perfAdmin.export.button")}
          </button>
          <button type="button" className="alg-btn apf-hide-phone" onClick={() => setDialog("rule")} data-testid="perf-rules-btn">
            <Bell size={18} />
            {t("perfAdmin.rules.button")}
          </button>
        </div>
      </div>

      {!ready ? <p className="alg-info is-amber">{t("perfAdmin.notReady")}</p> : null}

      {tab === "lh" ? <PerfLighthouse t={t} locale={locale} notify={notify} onSaveView={() => setDialog("saveViewLh")} /> : null}

      {tab === "alerts" ? (
        <PerfAlertsTab
          t={t}
          locale={locale}
          L={L}
          open={alerts}
          hidden={sum?.hiddenAlerts || []}
          busy={busy}
          onReview={(a) => {
            setTab("rum");
            review(a);
          }}
          onErrorLog={openErrorLog}
          onHide={(a) => setHidden(a, true)}
          onShow={(a) => setHidden(a, false)}
          onRules={() => setDialog("rule")}
        />
      ) : null}

      {tab === "rum" ? (
        <>
          <div className="alg-qrow">
            <PerfQueryBar
              tokens={tokens}
              onChange={(next) => setTokens(next.length ? next : [...DEFAULT_TOKENS])}
              onPick={pickToken}
              facets={sum?.facets || {}}
              labels={L}
              tokenText={tokenText}
              t={t}
              inputRef={inputRef}
              placeholder={t("perfAdmin.query.placeholder")}
            />
            <button type="button" className="alg-btn alg-filters-btn" onClick={() => setDialog("filters")} data-testid="perf-filters-btn">
              <SlidersHorizontal size={18} />
              <span className="apf-hide-phone">{t("perfAdmin.query.filters")}</span>
            </button>
          </div>

          <div className="alg-views apf-views" role="toolbar" aria-label={t("perfAdmin.views.label")}>
            {allViews.map((v) => {
              const label = v.builtin ? t(`perfAdmin.views.${v.id}`) : v.name;
                            return (
                <button
                  key={v.id}
                  type="button"
                  className={`alg-vw${activeView === v.id ? " is-on" : ""}`}
                  aria-pressed={activeView === v.id}
                  onClick={() => pickView(v)}
                  onContextMenu={
                    v.builtin
                      ? undefined
                      : (e) => {
                          e.preventDefault();
                          viewAnchor.current = e.currentTarget;
                          setViewMenu(v);
                        }
                  }
                  data-testid={`perf-view-${v.id}`}
                >
                  {v.id === "all" ? <Bookmark size={15} /> : null}
                  <span>{label}</span>
                  {v.id === "all" ? <em>{L.range(query.range)}</em> : null}
                </button>
              );
            })}
            {alerts.slice(0, 1).map((a) => {
              const q = { range: query.range, platform: [a.platform], version: [a.version] };
              const on = sameQuery(q, query);
              return (
                <button key={`al-${a.id}`} type="button" className={`alg-vw${on ? " is-on" : ""}`} onClick={() => setTokens(queryToTokens(q))} data-testid="perf-view-regression">
                  <span>{t("perfAdmin.views.release", { platform: L.platform(a.platform), version: a.version })}</span>
                  <em className="is-r">{t("perfAdmin.views.regression")}</em>
                </button>
              );
            })}
            <button type="button" className="alg-vw is-add" onClick={() => setDialog("saveView")} disabled={!views.ready} title={views.ready ? undefined : t("perfAdmin.views.notReady")} data-testid="perf-view-save">
              <Plus size={15} />
              <span>{t("perfAdmin.views.save")}</span>
            </button>
            <button type="button" className="apf-vw-r" onClick={copyLink} data-testid="perf-copy-link">
              <Link size={14} />
              {t("perfAdmin.views.copyLink")}
            </button>
          </div>

          {banner ? (
            <div className="alg-anom apf-anom" role="alert" data-testid="perf-regression">
              <span className="alg-anom-ic" aria-hidden="true">
                <AlertTriangle size={18} />
              </span>
              <p>
                <b>
                  {t("perfAdmin.alert.lead", {
                    version: banner.version,
                    platform: L.platform(banner.platform),
                    metric: L.metric(banner.metric),
                    from: fmtValue(banner.metric, banner.prevP75, locale, t),
                    to: fmtValue(banner.metric, banner.curP75, locale, t),
                    pct: fmtPct(banner.deltaPct, locale),
                  })}
                </b>{" "}
                <span className="apf-anom-more">
                  {t("perfAdmin.alert.sessions", { n: fmtInt(banner.sessions, locale) })}
                  {banner.topRoutes?.length ? <> {t("perfAdmin.alert.mostOn")} {banner.topRoutes.map((r, i) => <span key={r}>{i ? ` ${t("perfAdmin.and")} ` : ""}<span className="apf-mono">{r}</span></span>)}.</> : null}
                  {alerts.length > 1 ? <> {t("perfAdmin.alert.also", { n: alerts.length - 1 })}</> : null}{" "}
                  {t("perfAdmin.alert.firstSeen", { when: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(banner.firstSeen || banner.at)) })}
                  {banner.sharePct != null ? ` ${t("perfAdmin.alert.share", { pct: fmtPct(banner.sharePct, locale) })}` : ""}
                </span>
              </p>
              <div className="apf-anom-acts">
                <button type="button" className="alg-btn is-red" onClick={() => review(banner)} data-testid="perf-review">
                  <Eye size={18} />
                  {t("perfAdmin.alert.review")}
                </button>
                <button type="button" className="alg-btn is-ghost" onClick={() => openErrorLog(banner)} disabled={busy === `err-${banner.id}`} data-testid="perf-error-log">
                  <Bug size={18} />
                  {t("perfAdmin.alert.errorLog")}
                </button>
                <button type="button" className="alg-btn is-ghost" onClick={() => setHidden(banner, true)} disabled={busy === `hide-${banner.id}`} data-testid="perf-hide">
                  {t("perfAdmin.alert.hide")}
                </button>
              </div>
            </div>
          ) : null}

          {summary.err && !sum ? (
            <div className="alg-err" role="alert">
              {summary.err}{" "}
              <button type="button" className="alg-link" onClick={loadSummary}>
                {t("perfAdmin.retry")}
              </button>
            </div>
          ) : null}

          <KpiTiles kpis={sum?.kpis} loading={summary.loading} t={t} locale={locale} L={L} chartMetric={chartMetric} onPick={(m) => (CHART_METRICS.includes(m) ? setChartMetric(m) : setSort(m))} />

          <div className="alg-bgrid apf-bgrid">
            <section className="alg-card apf-chart-card" ref={chartRef} aria-labelledby="apf-chart-h">
              <h3 id="apf-chart-h">
                <Activity size={18} />
                <span>{t("perfAdmin.chart.title")}</span>
                <small className="apf-h-sub">· {L.range(query.range)}</small>
                <span className="alg-pills apf-pills apf-ml" role="group" aria-label={t("perfAdmin.chart.metric")}>
                  {CHART_METRICS.map((m) => (
                    <button key={m} type="button" className={`alg-pill apf-pill${chartMetric === m ? " is-on" : ""}`} aria-pressed={chartMetric === m} onClick={() => setChartMetric(m)} data-testid={`perf-chart-${m}`}>
                      {m === "appstart" ? t("perfAdmin.chart.app") : L.metric(m)}
                    </button>
                  ))}
                </span>
              </h3>
              <div className="apf-legend-row">
                <div className="apf-legend">
                  {PLATFORMS.filter((p) => sum?.chart?.series?.[p.k]).map((p) => (
                    <button key={p.k} type="button" aria-label={L.platform(p.k)} className={selectedPlatforms.length && !selectedPlatforms.includes(p.k) ? "is-dim" : ""} onClick={() => setTokens((cur) => toggleToken(cur, "platform", p.k))} aria-pressed={selectedPlatforms.includes(p.k)}>
                      <i style={{ background: p.c }} />
                      {L.platform(p.k)}
                    </button>
                  ))}
                </div>
                <span className="apf-hint">{t("perfAdmin.chart.hint")}</span>
              </div>
              {summary.loading && !sum ? (
                <div className="apf-skel-chart">
                  <span className="alg-skel" />
                </div>
              ) : (
                <PerfChart
                  chart={sum?.chart}
                  metric={chartMetric}
                  locale={locale}
                  t={t}
                  platformLabel={L.platform}
                  flagLabel={(m) => t("perfAdmin.chart.flag", { name: t(`sysx.flag.${m.flag}.name`), pct: m.mode === "all" ? fmtPct(100, locale) : m.mode === "off" ? t("perfAdmin.chart.flagOff") : fmtPct(m.percent, locale) })}
                  selected={selectedPlatforms}
                  onTogglePlatform={(p) => setTokens((cur) => toggleToken(cur, "platform", p))}
                />
              )}
            </section>
            <ReleaseCard sum={sum} loading={summary.loading} t={t} locale={locale} L={L} onPick={(v) => setTokens((cur) => toggleToken(cur, "version", v))} />
          </div>

          <section className="alg-tbl apf-tbl" aria-labelledby="apf-tbl-h">
            <div className="apf-tbl-h">
              <h3 id="apf-tbl-h">
                <Layers size={18} />
                {t(`perfAdmin.table.title.${group}`)}
              </h3>
              <div className="alg-pills apf-pills" role="group" aria-label={t("perfAdmin.table.groupBy")}>
                {GROUPS.map((g) => (
                  <button key={g} type="button" className={`alg-pill apf-pill${group === g ? " is-on" : ""}`} aria-pressed={group === g} onClick={() => setGroup(g)} data-testid={`perf-group-${g}`}>
                    {t(`perfAdmin.group.${g}`)} <b className="tnum">{(sum?.facets?.[g] || []).length || ""}</b>
                  </button>
                ))}
              </div>
              <span className="alg-muted apf-ml apf-hide-phone">{t("perfAdmin.table.distOf", { metric: L.metric(sort) })}</span>
              <button ref={sortRef} type="button" className="alg-btn apf-btn-sm" aria-haspopup="menu" aria-expanded={sortMenu} onClick={() => setSortMenu((v) => !v)} data-testid="perf-sort">
                <SortAsc size={14} />
                {t("perfAdmin.table.sortBy", { metric: L.metric(sort) })}
              </button>
            </div>
            <PagesTable
              data={table.data}
              loading={table.loading}
              err={table.err}
              onRetry={loadTable}
              group={group}
              sort={sort}
              t={t}
              locale={locale}
              L={L}
              selected={drawer?.value}
              onOpen={(r) => setDrawer({ dim: group, value: r.key })}
              onMenu={(r, point) => setRowMenu({ r, point })}
            />
          </section>
        </>
      ) : null}

      <AuditMenu
        open={sortMenu}
        onClose={() => setSortMenu(false)}
        anchorRef={sortRef}
        width={240}
        label={t("perfAdmin.table.sortLabel")}
        testId="perf-sort-menu"
        items={["inp", "lcp", "cls", "fcp", "ttfb", "msglist", "voicejoin", "appstart"].map((m) => ({ id: m, label: L.metric(m), sub: L.metricSub(m), active: sort === m, onSelect: () => setSort(m) }))}
      />
      <AuditMenu
        open={Boolean(rowMenu)}
        onClose={() => setRowMenu(null)}
        point={rowMenu?.point || null}
        width={300}
        label={t("perfAdmin.table.rowMenu")}
        testId="perf-row-menu"
        items={
          rowMenu
            ? [
                { id: "open", label: t("perfAdmin.table.open"), icon: ChevronRight, kbd: "Enter", onSelect: () => setDrawer({ dim: group, value: rowMenu.r.key }) },
                { id: "filter", label: t("perfAdmin.table.filterTo", { value: rowMenu.r.key }), icon: SlidersHorizontal, onSelect: () => pickToken(group === "route" ? "route" : group, rowMenu.r.key) },
              ]
            : []
        }
      />
      <AuditMenu
        open={Boolean(viewMenu)}
        onClose={() => setViewMenu(null)}
        anchorRef={viewAnchor}
        align="left"
        width={220}
        label={t("perfAdmin.views.menu")}
        items={viewMenu ? [{ id: "delete", label: t("perfAdmin.views.delete"), icon: Trash2, danger: true, onSelect: () => deleteView(viewMenu) }] : []}
      />

      <PerfDrawer
        target={drawer}
        query={query}
        onClose={() => setDrawer(null)}
        t={t}
        locale={locale}
        L={L}
        can={can}
        onFilter={(kind, value) => {
          setTokens((cur) => addToken(cur, kind, value));
        }}
        onUserSessions={(uid) => {
          setTokens((cur) => addToken(cur, "user", uid));
          setDrawer(null);
        }}
        onDossier={(uid) => {
          setDrawer(null);
          navigate?.("people", { userId: uid });
        }}
        onSaveView={() => setDialog("saveView")}
        onLighthouse={() => {
          setDrawer(null);
          setTab("lh");
        }}
        onErrorLog={banner ? () => openErrorLog(banner) : null}
        notify={notify}
      />

      <PerfRuleDialog open={dialog === "rule"} onClose={() => setDialog(null)} t={t} locale={locale} L={L} notify={notify} onSaved={() => { setDialog(null); loadSummary(); }} />
      <PerfSaveViewDialog
        open={dialog === "saveView" || dialog === "saveViewLh"}
        tokens={tokens}
        tokenText={tokenText}
        query={query}
        tab={dialog === "saveViewLh" ? "lh" : "rum"}
        t={t}
        onClose={() => setDialog(null)}
        onSaved={(v) => {
          setDialog(null);
          notify(t("perfAdmin.views.saved", { name: v.name }));
          loadViews();
        }}
      />
      <PerfFiltersDialog
        open={dialog === "filters"}
        tokens={tokens}
        facets={sum?.facets || {}}
        L={L}
        t={t}
        onClose={() => setDialog(null)}
        onApply={(next) => {
          setTokens(next);
          setDialog(null);
        }}
      />

      {note ? (
        <SystemNote
          note={note}
          t={t}
          locale={locale}
          L={L}
          onOpen={() => {
            setTab("rum");
            setNote(null);
          }}
          onClose={() => setNote(null)}
        />
      ) : null}

      {toast ? (
        <div className={`alg-toast apf-toast${toast.tone === "error" ? " is-error" : ""}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              className="alg-link"
              onClick={() => {
                const run = toast.action.run;
                setToast(null);
                run();
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- KPI tiles ---------------- */

function KpiTiles({ kpis, loading, t, locale, L, chartMetric, onPick }) {
  if (loading && !kpis) {
    return (
      <div className="apf-kpis" aria-busy="true">
        {KPI_ORDER.map((m) => (
          <div key={m} className="apf-kpi is-skel">
            <span className="alg-skel" style={{ width: 120, height: 12 }} />
            <span className="alg-skel" style={{ width: 80, height: 26, marginTop: 10 }} />
            <span className="alg-skel" style={{ width: "100%", height: 6, marginTop: 10 }} />
          </div>
        ))}
      </div>
    );
  }
  const by = Object.fromEntries((kpis || []).map((k) => [k.metric, k]));
  return (
    <div className="apf-kpis">
      {KPI_ORDER.map((m) => {
        const k = by[m] || { metric: m, p75: null, dist: [0, 0, 0], n: 0 };
        const r = rating(m, k.p75);
        const chip = deltaChip(m, k.delta, locale);
        return (
          <button key={m} type="button" className={`apf-kpi${chartMetric === m ? " is-sel" : ""}`} onClick={() => onPick(m)} data-testid={`perf-kpi-${m}`} aria-label={`${L.metric(m)}: ${fmtValue(m, k.p75, locale, t)} p75`}>
            <span className="apf-kpi-l">
              <b>{L.metric(m)}</b>
              <span>{L.metricSub(m)}</span>
            </span>
            {chip ? <span className={`apf-kpi-c is-${chip.tone}`}>{chip.text}</span> : null}
            <span className="apf-kpi-v">
              <strong className={`tnum apf-r-${r}`}>{fmtValue(m, k.p75, locale, t)}</strong>
              <small>p75</small>
              <span className="apf-kpi-sp">
                <Spark values={k.spark} color={SPARK_COLOR[r]} />
              </span>
            </span>
            <Dist dist={k.dist} />
            <span className="apf-dl tnum">
              <span>{t("perfAdmin.dist.good", { pct: fmtPct(k.dist?.[0], locale) })}</span>
              <span>{t("perfAdmin.dist.ni", { pct: fmtPct(k.dist?.[1], locale) })}</span>
              <span>{t("perfAdmin.dist.poor", { pct: fmtPct(k.dist?.[2], locale) })}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- release comparison ---------------- */

function ReleaseCard({ sum, loading, t, locale, L, onPick }) {
  const rows = sum?.releases || [];
  const cell = (m, v, d, hot) => (
    <div className={`apf-c apf-c-${rating(m, v)}${hot ? " is-hot" : ""}`}>
      {fmtValue(m, v, locale, t)}
      {d != null && Math.abs(d) >= 5 && m !== "cls" ? <small className={d > 0 ? "apf-up" : "apf-dn"}>{deltaChip(m, d, locale)?.text}</small> : null}
    </div>
  );
  const mix = sum?.mix || {};
  return (
    <section className="alg-card apf-rel" aria-labelledby="apf-rel-h">
      <h3 id="apf-rel-h">
        <Rocket size={18} />
        <span>{t("perfAdmin.releases.title")}</span>
      </h3>
      {loading && !sum ? (
        <span className="alg-skel" style={{ width: "100%", height: 150 }} />
      ) : !rows.length ? (
        <p className="alg-empty-s">{t("perfAdmin.releases.empty")}</p>
      ) : (
        <div className="apf-hm apf-rel-grid">
          <div className="apf-hh">{t("perfAdmin.releases.version")}</div>
          <div className="apf-hh">{t("perfAdmin.releases.share")}</div>
          <div className="apf-hh is-r">{L.metric("lcp")}</div>
          <div className="apf-hh is-r">{L.metric("inp")}</div>
          <div className="apf-hh is-r">{t("perfAdmin.releases.start")}</div>
          {rows.map((r) => (
            <Rel key={r.version} r={r} cell={cell} locale={locale} onPick={onPick} />
          ))}
        </div>
      )}
      <div className="apf-lab">
        {t("perfAdmin.releases.mix")} <b>{t("perfAdmin.releases.sessions", { n: fmtInt(sum?.sessions || 0, locale) })}</b>
      </div>
      <Mix mix={mix} />
      <div className="apf-legend apf-legend-s">
        {PLATFORMS.map((p) => (
          <span key={p.k}>
            <i style={{ background: PLATFORM_COLOR[p.k] }} />
            {L.platform(p.k)} {fmtPct(mix[p.k] || 0, locale)}
          </span>
        ))}
      </div>
    </section>
  );
}

function Rel({ r, cell, locale, onPick }) {
  return (
    <>
      <button type="button" className="apf-rh apf-rh-btn" onClick={() => onPick(r.version)}>
        <b>{r.version}</b>
      </button>
      <div className="apf-rh tnum">{r.sharePct == null ? "—" : fmtPct(r.sharePct, locale)}</div>
      {cell("lcp", r.lcp, r.lcpDelta, r.lcpHot)}
      {cell("inp", r.inp, r.inpDelta, r.inpHot)}
      {cell("appstart", r.appstart, r.appstartDelta, r.appstartHot)}
    </>
  );
}

/* ---------------- slowest pages ---------------- */

function PagesTable({ data, loading, err, onRetry, group, sort, t, locale, L, selected, onOpen, onMenu }) {
  const rows = data?.rows || [];
  const name = (k) => {
    if (group === "platform") return L.platform(k);
    if (group === "device") return L.device(k);
    if (group === "connection") return L.connection(k);
    if (group === "country") return L.country(k);
    return k;
  };
  const sub = (k) => (group === "route" ? L.routeName(k) : group === "country" ? k : "");
  return (
    <>
      <div className="apf-th" role="row">
        <span />
        <span>{t(`perfAdmin.group.${group}`)}</span>
        <span>{t("perfAdmin.table.platform")}</span>
        <span>{t("perfAdmin.table.sessions")}</span>
        <span>{t("perfAdmin.table.p75", { metric: L.metric("lcp") })}</span>
        <span className={sort === "inp" ? "is-so" : ""}>{t("perfAdmin.table.p75", { metric: L.metric("inp") })}</span>
        <span>{L.metric("cls")}</span>
        <span>{t("perfAdmin.table.dist")}</span>
        <span>{t("perfAdmin.table.trend")}</span>
        <span />
      </div>
      {loading ? (
        Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="apf-tr is-skel">
            <span />
            <span className="alg-skel" style={{ width: 120, height: 12 }} />
            <span className="alg-skel" style={{ width: 80, height: 6 }} />
            <span className="alg-skel" style={{ width: 50, height: 12 }} />
          </div>
        ))
      ) : err ? (
        <div className="alg-tbl-empty">
          <p>
            {err}
            <button type="button" className="alg-link" onClick={onRetry}>
              {t("perfAdmin.retry")}
            </button>
          </p>
        </div>
      ) : !rows.length ? (
        <div className="alg-tbl-empty">
          <p>
            {t("perfAdmin.table.empty")}
            <small>{t("perfAdmin.table.emptySub")}</small>
          </p>
        </div>
      ) : (
        rows.map((r) => (
          <div
            key={r.key}
            className={`apf-tr${selected === r.key ? " is-sel" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(r)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(r);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenu(r, { x: e.clientX, y: e.clientY });
            }}
            data-testid={`perf-row-${r.key}`}
          >
            <span className={`alg-sev${r.sev ? ` is-${r.sev}` : ""}`} aria-hidden="true" />
            <div className="apf-col2">
              <b className={group === "route" ? "apf-route" : ""}>{name(r.key)}</b>
              {sub(r.key) ? <small>{sub(r.key)}</small> : null}
            </div>
            <div className="apf-cell-mix">
              <Mix mix={r.mix} />
            </div>
            <span className="tnum apf-num">{fmtInt(r.sessions, locale)}</span>
            <span className={`tnum apf-val apf-r-${rating("lcp", r.lcp)}`}>{fmtValue("lcp", r.lcp, locale, t)}</span>
            <span className={`tnum apf-val apf-r-${rating("inp", r.inp)}`}>{fmtValue("inp", r.inp, locale, t)}</span>
            <span className={`tnum apf-val apf-r-${rating("cls", r.cls)}`}>{fmtValue("cls", r.cls, locale, t)}</span>
            <div className="apf-cell-dist">
              <Dist dist={r.dist} />
              <span className="apf-dl apf-dl-s tnum">
                <span>{fmtPct(r.dist?.[0], locale)}</span>
                <span>{fmtPct(r.dist?.[1], locale)}</span>
                <span>{fmtPct(r.dist?.[2], locale)}</span>
              </span>
            </div>
            <div className="apf-cell-sp">
              <Spark values={r.spark} color={r.sev === "red" || r.sev === "amber" ? "#ffc773" : "#8da2ff"} width={96} />
            </div>
            <button
              type="button"
              className="alg-mbtn"
              aria-label={t("perfAdmin.table.rowMenu")}
              onClick={(e) => {
                e.stopPropagation();
                const b = e.currentTarget.getBoundingClientRect();
                onMenu(r, { x: b.right - 300, y: b.bottom + 4 });
              }}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        ))
      )}
    </>
  );
}
