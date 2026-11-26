/**
 * Performans › Lighthouse CI (Draft A screen 3, same console language): main averages as
 * rings with a week change and sparkline, this week's runs, "main geçmişi" chart with the
 * budget band, per-page scores on main, pull requests against main, the amber "over budget"
 * banner. Rows come from public.lighthouse_runs (written by .github/workflows/lighthouse.yml).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { AlertTriangle, Bookmark, Check, ExternalLink, GitBranch, History, Layers, MoreHorizontal, Plus, RefreshCw, X } from "../../ui/Icon.jsx";
import PerfQueryBar from "./PerfQueryBar.jsx";
import { Ring, Score, Spark } from "./PerfChart.jsx";
import { avatarStyle } from "../audit/auditModel.js";
import { fmtInt } from "./perfAdminModel.js";

const CATS = ["perf", "a11y", "best_practices", "seo"];
const CAT_COLOR = { perf: "#7b93ff", a11y: "#34c77b", best_practices: "#b38cff", seo: "#5ac8d8" };
const VIEWS = ["open", "over", "main", "merged"];

function ago(iso, locale, t) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 3600) return t("perfAdmin.lh.minAgo", { n: Math.max(1, Math.round(s / 60)) });
  if (s < 86400) return t("perfAdmin.lh.hourAgo", { n: Math.round(s / 3600) });
  if (s < 2 * 86400) return t("perfAdmin.lh.yesterday");
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));
}

function Delta({ d }) {
  if (d == null) return null;
  if (d === 0) return <span className="apf-dlt is-flat">±0</span>;
  return <span className={`apf-dlt ${d > 0 ? "is-up" : "is-dn"}`}>{d > 0 ? `+${d}` : d}</span>;
}

export default function PerfLighthouse({ t, locale, notify, onSaveView }) {
  const [state, setState] = useState({ loading: true, data: null, err: "" });
  const [view, setView] = useState("open");
  const [tokens, setTokens] = useState([]);
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: !s.data, err: "" }));
    try {
      const d = await adminFetch("/perf/lighthouse");
      setState({ loading: false, data: d, err: "" });
    } catch (e) {
      setState((s) => ({ loading: false, data: s.data, err: e?.message || t("perfAdmin.err.load") }));
    }
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  const d = state.data;
  const repo = d?.repo || "";
  const gh = (path) => (repo ? `https://github.com/${repo}${path}` : null);
  const prs = d?.prs || [];
  const filterText = (tokens.find((x) => x.kind === "text")?.value || text).toLowerCase();
  const rows = useMemo(() => {
    let list = prs;
    if (view === "open") list = list.filter((p) => p.open);
    if (view === "over") list = list.filter((p) => p.status === "over");
    if (view === "merged") list = list.filter((p) => p.merged);
    if (filterText) list = list.filter((p) => `#${p.pr} ${p.title} ${p.branch} ${p.author} ${Object.keys(p.perPage || {}).join(" ")}`.toLowerCase().includes(filterText));
    return list;
  }, [prs, view, filterText]);
  const counts = { open: prs.filter((p) => p.open).length, over: prs.filter((p) => p.status === "over").length };
  const pages = Object.keys(d?.main?.perPage || {});

  if (state.loading && !d) {
    return (
      <div className="apf-kpis apf-lh-kpis" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="apf-kpi is-skel">
            <span className="alg-skel" style={{ width: 52, height: 52, borderRadius: 26 }} />
          </div>
        ))}
      </div>
    );
  }
  if (state.err && !d) {
    return (
      <div className="alg-err" role="alert">
        {state.err}{" "}
        <button type="button" className="alg-link" onClick={load}>
          {t("perfAdmin.retry")}
        </button>
      </div>
    );
  }
  if (d && d.ready === false) return <p className="alg-info is-amber">{t("perfAdmin.notReady")}</p>;

  const open = (url) => {
    if (!url) return;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* blocked */
    }
  };
  const alert = d?.alert;
  const staticTokens = [
    { kind: "compare", value: d?.main ? `main (${String(d.main.sha).slice(0, 7)})` : "main" },
    { kind: "state", value: t(`perfAdmin.lh.view.${view}`) },
  ];

  return (
    <div className="apf-lh" data-testid="perf-lighthouse">
      <div className="alg-qrow">
        <PerfQueryBar
          tokens={[...staticTokens.map((x) => ({ ...x, static: true })), ...tokens]}
          onChange={(next) => setTokens(next.filter((x) => !x.static))}
          onPick={(kind, value) => {
            if (kind === "text") {
              setTokens([{ kind: "text", value }]);
              setText("");
            }
          }}
          facets={{}}
          labels={{}}
          staticTokens
          tokenText={(tok) => ({ k: t(`perfAdmin.lh.tok.${tok.kind}`), v: tok.value })}
          t={t}
          inputRef={inputRef}
          placeholder={t("perfAdmin.lh.placeholder")}
          testId="perf-lh-query"
        />
        <button type="button" className="alg-btn alg-filters-btn" onClick={() => open(gh("/actions/workflows/lighthouse.yml"))} disabled={!repo} title={t("perfAdmin.lh.rerunHint")}>
          <RefreshCw size={18} />
          <span className="apf-hide-phone">{t("perfAdmin.lh.rerun")}</span>
        </button>
      </div>

      <div className="alg-views apf-views" role="toolbar" aria-label={t("perfAdmin.views.label")}>
        {VIEWS.map((v) => (
          <button key={v} type="button" className={`alg-vw${view === v ? " is-on" : ""}`} aria-pressed={view === v} onClick={() => setView(v)} data-testid={`perf-lh-view-${v}`}>
            {v === "open" ? <Bookmark size={15} /> : null}
            <span>{t(`perfAdmin.lh.view.${v}`)}</span>
            {v === "open" ? <em>{counts.open}</em> : null}
            {v === "over" && counts.over ? <em className="is-r">{counts.over}</em> : null}
          </button>
        ))}
        <button type="button" className="alg-vw is-add" onClick={onSaveView}>
          <Plus size={15} />
          <span>{t("perfAdmin.views.save")}</span>
        </button>
        <span className="apf-vw-r apf-vw-note">
          {t("perfAdmin.lh.method", { pages: d?.main?.pages || pages.length || 0 })}
          {d?.main ? ` · ${t("perfAdmin.lh.lastRun", { when: ago(d.prs[0]?.at || d.main.at, locale, t) })}` : ""}
        </span>
      </div>

      {alert ? (
        <div className="alg-anom apf-anom is-amber" role="alert" data-testid="perf-lh-alert">
          <span className="alg-anom-ic is-amber" aria-hidden="true">
            <AlertTriangle size={18} />
          </span>
          <p>
            <b>
              {t("perfAdmin.lh.overLead", { pr: alert.pr })}{" "}
              {alert.over.map((o, i) => (
                <span key={o.page}>
                  {i ? ` ${t("perfAdmin.and")} ` : ""}
                  <span className="apf-mono">{o.page}</span> {o.perf}
                </span>
              ))}{" "}
              {t("perfAdmin.lh.budget", { n: d.budget })}
            </b>{" "}
            {alert.bundleDelta != null ? t("perfAdmin.lh.bundle", { kb: new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: "always" }).format(alert.bundleDelta / 1000) }) : ""}
            {alert.tbtDelta != null ? ` ${t("perfAdmin.lh.tbt", { ms: new Intl.NumberFormat(locale, { signDisplay: "always" }).format(alert.tbtDelta) })}` : ""}
          </p>
          <button type="button" className="alg-btn" onClick={() => open(gh(`/pull/${alert.pr}`))} disabled={!repo}>
            <GitBranch size={18} />
            {t("perfAdmin.lh.openPr")}
          </button>
          <button type="button" className="alg-btn is-ghost" onClick={() => open(alert.runUrl)} disabled={!alert.runUrl}>
            <ExternalLink size={18} />
            {t("perfAdmin.lh.report")}
          </button>
        </div>
      ) : null}

      {!d?.main && !prs.length ? (
        <div className="alg-card apf-empty-card">
          <p className="alg-empty-s">{t("perfAdmin.lh.empty")}</p>
        </div>
      ) : (
        <>
          <div className="apf-kpis apf-lh-kpis">
            {CATS.map((c) => (
              <div key={c} className="apf-kpi apf-lh-kpi">
                <Ring score={d?.main?.scores?.[c]} />
                <div className="apf-lh-kpi-t">
                  <span className="apf-kpi-l">
                    <b>{t(`perfAdmin.lh.cat.${c}`)}</b>
                  </span>
                  <small className={d?.weekDelta?.[c] > 0 ? "apf-dn" : d?.weekDelta?.[c] < 0 ? "apf-up" : "alg-muted"}>
                    {d?.weekDelta?.[c] ? t("perfAdmin.lh.weekDelta", { n: new Intl.NumberFormat(locale, { signDisplay: "always" }).format(d.weekDelta[c]) }) : t("perfAdmin.lh.weekFlat")}
                  </small>
                  <span className="apf-lh-sp">
                    <Spark values={d?.spark?.[c]} color={CAT_COLOR[c]} width={120} height={22} />
                  </span>
                </div>
              </div>
            ))}
            <div className="apf-kpi">
              <span className="apf-kpi-l">
                <b>{t("perfAdmin.lh.thisWeek")}</b>
              </span>
              <span className="apf-kpi-v">
                <strong className="tnum">{fmtInt(d?.week?.runs || 0, locale)}</strong>
                <small>{t("perfAdmin.lh.runs")}</small>
              </span>
              <span className="apf-dl tnum">
                <span>{t("perfAdmin.lh.passed", { n: d?.week?.passed || 0 })}</span>
                <span>{t("perfAdmin.lh.warned", { n: d?.week?.warned || 0 })}</span>
                <span>{t("perfAdmin.lh.over", { n: d?.week?.over || 0 })}</span>
              </span>
            </div>
          </div>

          <div className="alg-bgrid apf-bgrid">
            <section className="alg-card">
              <h3>
                <History size={18} />
                <span>{t("perfAdmin.lh.history")}</span>
                <small className="apf-h-sub">· {t("perfAdmin.lh.historySub", { n: d?.history?.length || 0 })}</small>
                <span className="apf-legend apf-ml">
                  {CATS.map((c) => (
                    <span key={c}>
                      <i style={{ background: CAT_COLOR[c] }} />
                      {t(`perfAdmin.lh.cat.${c}`)}
                    </span>
                  ))}
                </span>
              </h3>
              <LhChart history={d?.history || []} budget={d?.budget || 90} t={t} locale={locale} />
            </section>
            <section className="alg-card">
              <h3>
                <Layers size={18} />
                <span>{t("perfAdmin.lh.perPage")}</span>
              </h3>
              {!pages.length ? (
                <p className="alg-empty-s">{t("perfAdmin.lh.noMain")}</p>
              ) : (
                <div className="apf-hm apf-lh-pages">
                  <div className="apf-hh" />
                  {CATS.map((c) => (
                    <div key={c} className="apf-hh is-c">
                      {t(`perfAdmin.lh.catShort.${c}`)}
                    </div>
                  ))}
                  {pages.map((p) => (
                    <PageRow key={p} page={p} s={d.main.perPage[p]} />
                  ))}
                </div>
              )}
              {pages.some((p) => (Number(d.main.perPage[p]?.seo) < 90 && /^\/(login|app)/.test(p))) ? <p className="alg-small alg-muted apf-mt">{t("perfAdmin.lh.noindexNote")}</p> : null}
            </section>
          </div>

          <section className="alg-tbl apf-tbl">
            <div className="apf-tbl-h">
              <h3>
                <GitBranch size={18} />
                {t("perfAdmin.lh.prs")}
              </h3>
              <span className="alg-muted apf-hide-phone">{t("perfAdmin.lh.prsSub", { pages: pages.length || 0 })}</span>
            </div>
            <div className="apf-th apf-lh-th">
              <span>{t("perfAdmin.lh.pr")}</span>
              <span>{t("perfAdmin.lh.author")}</span>
              {CATS.map((c) => (
                <span key={c}>{t(`perfAdmin.lh.cat.${c}`)}</span>
              ))}
              <span>{t("perfAdmin.lh.state")}</span>
              <span />
            </div>
            {!rows.length ? (
              <div className="alg-tbl-empty">
                <p>{t("perfAdmin.lh.noPrs")}</p>
              </div>
            ) : (
              rows.map((p) => (
                <div key={p.pr} className={`apf-tr apf-lh-tr${p.status === "over" && p.open ? " is-sel" : ""}`} role="button" tabIndex={0} onClick={() => open(p.runUrl || gh(`/pull/${p.pr}`))} onKeyDown={(e) => e.key === "Enter" && open(p.runUrl || gh(`/pull/${p.pr}`))} data-testid={`perf-pr-${p.pr}`}>
                  <div className="apf-col2">
                    <b>
                      #{p.pr} {p.title}
                    </b>
                    <small className="apf-mono">
                      {p.branch} · {String(p.sha).slice(0, 7)} · {ago(p.at, locale, t)}
                    </small>
                  </div>
                  <div className="apf-cell">
                    <span className="alg-av apf-av" style={avatarStyle(p.author || "?")}>
                      {String(p.author || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="apf-t">{p.author}</span>
                  </div>
                  {CATS.map((c) => (
                    <div key={c} className="apf-scd">
                      <Score v={p.scores[c]} />
                      <Delta d={p.delta[c]} />
                    </div>
                  ))}
                  <span className={`alg-lbl is-compact is-${p.status === "over" ? "red" : p.status === "warn" ? "amber" : "green"}`}>
                    {p.status === "over" ? <X size={13} /> : p.status === "warn" ? <AlertTriangle size={13} /> : <Check size={13} />}
                    <span className="alg-lbl-t">{p.merged ? (p.status === "pass" ? t("perfAdmin.lh.st.merged") : t("perfAdmin.lh.st.mergedWarn")) : t(`perfAdmin.lh.st.${p.status}`)}</span>
                  </span>
                  <span className="alg-mbtn" aria-hidden="true">
                    <MoreHorizontal size={18} />
                  </span>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PageRow({ page, s }) {
  return (
    <>
      <div className="apf-rh">
        <span className="apf-route" title={page}>
          {page}
        </span>
      </div>
      {CATS.map((c) => (
        <div key={c} className="apf-c-center">
          <Score v={s?.[c]} />
        </div>
      ))}
    </>
  );
}

function LhChart({ history, budget, t, locale, height = 190 }) {
  const [hov, setHov] = useState(null);
  const ref = useRef(null);
  const n = history.length;
  if (n < 2) return <p className="alg-empty-s">{t("perfAdmin.lh.noHistory")}</p>;
  const vals = history.flatMap((h) => CATS.map((c) => h[c])).filter((v) => v != null);
  const min = Math.max(0, Math.min(budget - 6, ...vals) - 1);
  const max = 101;
  const W = 1000;
  const X = (i) => (i / (n - 1)) * W;
  const Y = (v) => height - ((v - min) / (max - min)) * height;
  const pct = (i) => (i / (n - 1)) * 100;
  const ticks = [min + 1, budget, 95, 100].filter((v, i, a) => v > min && v <= 100 && a.indexOf(v) === i).map(Math.round);
  // Markers: the biggest drop (red) and the latest merge.
  let drop = -1;
  let dropBy = 0;
  history.forEach((h, i) => {
    if (i && h.perf != null && history[i - 1].perf != null && history[i - 1].perf - h.perf > dropBy) {
      dropBy = history[i - 1].perf - h.perf;
      drop = i;
    }
  });
  const marks = [];
  if (drop > 0 && dropBy >= 2) marks.push({ i: drop, bad: true, label: history[drop].mergedPr ? `#${history[drop].mergedPr}` : String(history[drop].sha).slice(0, 7) });
  if (history[n - 1].mergedPr) marks.push({ i: n - 1, label: `#${history[n - 1].mergedPr}` });
  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setHov(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const path = (c) => history.map((h, i) => (h[c] == null ? "" : `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(h[c]).toFixed(1)}`)).join(" ");
  return (
    <div className="apf-chart">
      <div className="apf-ch" style={{ height }}>
        <div className="apf-ch-y" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v} style={{ top: `${(Y(v) / height) * 100}%` }}>
              {v}
            </span>
          ))}
        </div>
        <div className="apf-ch-p" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHov(null)} role="img" aria-label={t("perfAdmin.lh.history")}>
          <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y={Y(budget)} width={W} height={Math.max(0, height - Y(budget))} className="apf-band-n" />
            <line x1="0" x2={W} y1={Y(budget)} y2={Y(budget)} className="apf-budget-line" vectorEffect="non-scaling-stroke" />
            {ticks.map((v) => (
              <line key={v} x1="0" x2={W} y1={Y(v)} y2={Y(v)} className="apf-grid" vectorEffect="non-scaling-stroke" />
            ))}
            {marks.map((m) => (
              <line key={`m${m.i}`} x1={X(m.i)} x2={X(m.i)} y1="14" y2={height} className={`apf-mk-line${m.bad ? " is-bad" : ""}`} vectorEffect="non-scaling-stroke" />
            ))}
            {CATS.map((c) => (
              <path key={c} d={path(c)} fill="none" stroke={CAT_COLOR[c]} strokeWidth={c === "perf" ? 2.6 : 1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
            {hov != null ? <line x1={X(hov)} x2={X(hov)} y1="0" y2={height} className="apf-hov-line" vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          <span className="apf-band-lbl is-amber" style={{ top: `${(Y(budget) / height) * 100}%` }}>
            {t("perfAdmin.lh.budgetLbl", { n: budget })}
          </span>
          {marks.map((m) => (
            <span key={`l${m.i}`} className={`apf-mk${m.bad ? " is-bad" : ""}`} style={{ left: `${pct(m.i)}%`, top: -2, ...(pct(m.i) > 86 ? { transform: "translateX(-100%)", marginLeft: 6 } : {}) }}>
              {m.label}
            </span>
          ))}
          {hov != null ? (
            <div className="apf-tip" style={pct(hov) > 55 ? { right: `${100 - pct(hov) + 1.5}%`, top: "22%" } : { left: `${pct(hov) + 1.5}%`, top: "22%" }} role="tooltip">
              <b>
                {history[hov].mergedPr ? `#${history[hov].mergedPr} · ` : ""}
                {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(history[hov].at))} · {String(history[hov].sha).slice(0, 7)}
              </b>
              {CATS.map((c) => (
                <div key={c}>
                  <i style={{ background: CAT_COLOR[c] }} />
                  {t(`perfAdmin.lh.cat.${c}`)}
                  <span>{history[hov][c] ?? "—"}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="apf-ch-x" aria-hidden="true">
        {[0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1].filter((i, j, a) => a.indexOf(i) === j).map((i) => (
          <span key={i} style={i === 0 ? { left: 0 } : i === n - 1 ? { right: 0 } : { left: `${pct(i)}%`, transform: "translateX(-50%)" }}>
            {history[i].mergedPr ? `#${history[i].mergedPr}` : String(history[i].sha).slice(0, 7)}
          </span>
        ))}
      </div>
    </div>
  );
}
