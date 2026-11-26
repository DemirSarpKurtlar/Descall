/**
 * Right side panel (Draft A screen 2): a page (or any dimension value) with its tiles,
 * INP p75 by platform x device class (cell click = filter), attribution (slowest INP
 * targets, LCP element), slowest users by user id only with one page load as a
 * waterfall, and the page's Lighthouse results. Tabs: Özet / Kırılımlar / Atıf /
 * Yavaş kullanıcılar / Lighthouse.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../../api/adminHttp";
import { copyText } from "../../../lib/copyText.js";
import { useFocusTrap } from "../audit/AuditUi.jsx";
import { Bookmark, Bug, ChevronDown, ChevronRight, Copy, History, Image, Layers, Lightbulb, User, X } from "../../ui/Icon.jsx";
import { DEVICES, METRICS, fmtInt, fmtPct, fmtValue, rating, shortUser } from "./perfAdminModel.js";
import { Score } from "./PerfChart.jsx";

const TABS = ["summary", "breakdown", "attribution", "users", "lighthouse"];
const WF_COLOR = { g: "#7b93ff", n: "#f2a93b", p: "#f23f43", x: "#7b93ff" };

export default function PerfDrawer({ target, query, onClose, t, locale, L, can, onFilter, onUserSessions, onDossier, onSaveView, onLighthouse, onErrorLog, notify }) {
  const open = Boolean(target);
  const [tab, setTab] = useState("summary");
  const [state, setState] = useState({ loading: false, data: null, err: "" });
  const [openUser, setOpenUser] = useState(null);
  const [timeline, setTimeline] = useState({});
  const ref = useRef(null);
  useFocusTrap(open, ref, onClose, { initial: "[data-autofocus]" });
  const qkey = JSON.stringify(query);

  const load = useCallback(async () => {
    if (!target) return;
    setState((s) => ({ loading: true, data: s.data && s.data.value === target.value ? s.data : null, err: "" }));
    try {
      const d = await adminFetch(`/perf/detail?q=${encodeURIComponent(qkey)}&dim=${encodeURIComponent(target.dim)}&value=${encodeURIComponent(target.value)}`);
      setState({ loading: false, data: d, err: "" });
      const first = d?.slowUsers?.users?.[0];
      setOpenUser(first ? first.userId : null);
    } catch (e) {
      setState({ loading: false, data: null, err: e?.message || t("perfAdmin.err.load") });
    }
  }, [target, qkey, t]);

  useEffect(() => {
    if (!target) return;
    setTab("summary");
    setTimeline({});
    load();
  }, [target, load]);

  const loadTimeline = useCallback(
    async (sid) => {
      if (!sid || timeline[sid]) return;
      setTimeline((x) => ({ ...x, [sid]: { loading: true } }));
      try {
        const d = await adminFetch(`/perf/session/${encodeURIComponent(sid)}`);
        setTimeline((x) => ({ ...x, [sid]: { loading: false, data: d } }));
      } catch (e) {
        setTimeline((x) => ({ ...x, [sid]: { loading: false, err: e?.message || t("perfAdmin.err.load") } }));
      }
    },
    [timeline, t]
  );

  const d = state.data;
  const users = d?.slowUsers?.users || [];
  const openRow = users.find((u) => u.userId === openUser);
  useEffect(() => {
    if (openRow?.sessionId) loadTimeline(openRow.sessionId);
  }, [openRow?.sessionId, loadTimeline]);

  if (!open || typeof document === "undefined") return null;
  const isRoute = target.dim === "route";
  const title = isRoute ? target.value : target.dim === "platform" ? L.platform(target.value) : target.dim === "device" ? L.device(target.value) : target.dim === "connection" ? L.connection(target.value) : target.dim === "country" ? L.country(target.value) : target.value;
  const sub = isRoute ? L.routeName(target.value) : t(`perfAdmin.group.${target.dim}`);
  const filters = [
    ...(query.platform.length ? [query.platform.map(L.platform).join(", ")] : [t("perfAdmin.drawer.allPlatforms")]),
    ...(query.version.length ? [query.version.join(", ")] : []),
  ];
  const worstTile = (d?.kpis || []).reduce((w, k) => Math.max(w, rating(k.metric, k.p75) === "p" ? 2 : rating(k.metric, k.p75) === "n" ? 1 : 0), 0);
  const show = (k) => tab === "summary" || tab === k;

  return createPortal(
    <div className="alg-drawer-wrap apf-drawer-wrap" data-testid="perf-drawer">
      <div className="alg-dim" onMouseDown={onClose} />
      <div ref={ref} className="alg-drawer apf-drawer" role="dialog" aria-modal="true" aria-labelledby="apf-dh" tabIndex={-1}>
        <header className="alg-dh">
          <span className={`alg-dlg-ic apf-dic is-${worstTile === 2 ? "red" : worstTile === 1 ? "amber" : "blue"}`} aria-hidden="true">
            <Layers size={20} />
          </span>
          <div className="alg-dh-t">
            <h2 id="apf-dh">
              <span className={isRoute ? "apf-route apf-route-l" : ""}>{title}</span>
              {sub ? <span className="apf-dh-sub"> · {sub}</span> : null}
            </h2>
            <p>
              {L.range(query.range)} · {t("perfAdmin.drawer.sessions", { n: fmtInt(d?.sessions || 0, locale) })} · {filters.join(" · ")}
            </p>
          </div>
          <button
            type="button"
            className="alg-mbtn"
            aria-label={t("perfAdmin.drawer.copy")}
            onClick={async () => {
              const ok = await copyText(String(target.value));
              notify(ok ? t("perfAdmin.drawer.copied") : t("perfAdmin.err.generic"), ok ? "ok" : "error");
            }}
          >
            <Copy size={17} />
          </button>
          <button type="button" className="alg-mbtn" aria-label={t("perfAdmin.close")} onClick={onClose} data-autofocus>
            <X size={18} />
          </button>
        </header>
        <div className="alg-dtabs" role="tablist">
          {TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`alg-tab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)} data-testid={`perf-dtab-${k}`}>
              {t(`perfAdmin.drawer.tab.${k}`)}
              {k === "users" && d?.slowUsers?.total ? <em className="tnum">{d.slowUsers.total}</em> : null}
            </button>
          ))}
        </div>
        <div className="alg-dbody">
          {state.loading && !d ? (
            <div className="apf-dskel">
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i} className="alg-skel" style={{ height: i ? 90 : 62 }} />
              ))}
            </div>
          ) : state.err ? (
            <p className="alg-err">
              {state.err}{" "}
              <button type="button" className="alg-link" onClick={load}>
                {t("perfAdmin.retry")}
              </button>
            </p>
          ) : d ? (
            <>
              {tab === "summary" ? (
                <div className="apf-dkpis">
                  {(d.kpis || []).map((k) => (
                    <div key={k.metric} className="apf-dkpi">
                      <span>{L.metric(k.metric)}</span>
                      <strong className={`tnum apf-r-${rating(k.metric, k.p75)}`}>{fmtValue(k.metric, k.p75, locale, t)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}

              {show("breakdown") ? (
                <div>
                  <div className="apf-lab">
                    {t("perfAdmin.drawer.heatTitle")} <b>{t("perfAdmin.drawer.heatHint")}</b>
                  </div>
                  {!d.heat?.length ? (
                    <p className="alg-empty-s">{t("perfAdmin.drawer.noData")}</p>
                  ) : (
                    <div className="apf-hm apf-heat">
                      <div className="apf-hh" />
                      {DEVICES.map((dv) => (
                        <div key={dv} className="apf-hh is-r">
                          {L.device(dv)}
                        </div>
                      ))}
                      {d.heat.map((row) => (
                        <HeatRow key={row.platform} row={row} L={L} locale={locale} t={t} onFilter={onFilter} />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {show("attribution") ? (
                <div>
                  <div className="apf-lab">{t("perfAdmin.drawer.attrTitle")}</div>
                  {!d.attribution?.inp?.length && !d.attribution?.lcp ? <p className="alg-empty-s">{t("perfAdmin.drawer.attrEmpty", { days: d.rawDays || 14 })}</p> : null}
                  {(d.attribution?.inp || []).map((a) => (
                    <div key={`${a.target}-${a.type}`} className="apf-chkrow">
                      <span className="apf-mono apf-sel">{a.target}</span>
                      <span className="apf-nm">{t(`perfAdmin.drawer.itype.${a.type || "other"}`)}</span>
                      <small>{t("perfAdmin.drawer.shareOf", { pct: fmtPct(a.sharePct, locale) })}</small>
                      <b className={`tnum apf-r-${rating("inp", a.p75)}`}>{fmtValue("inp", a.p75, locale, t)}</b>
                    </div>
                  ))}
                  {d.attribution?.lcp ? (
                    <div className="apf-chkrow">
                      <span className={`apf-okic is-${rating("lcp", d.attribution.lcp.p75) === "g" ? "g" : "n"}`}>
                        <Image size={12} />
                      </span>
                      <span className="apf-nm">
                        {t("perfAdmin.drawer.lcpEl")} <span className="apf-mono">{d.attribution.lcp.element}</span>
                      </span>
                      <small>{t("perfAdmin.drawer.onPages", { pct: fmtPct(d.attribution.lcp.sharePct, locale) })}</small>
                      <b className={`tnum apf-r-${rating("lcp", d.attribution.lcp.p75)}`}>{fmtValue("lcp", d.attribution.lcp.p75, locale, t)}</b>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {show("users") ? (
                <div>
                  <div className="apf-lab">
                    {t("perfAdmin.drawer.usersTitle")} <b>{t("perfAdmin.drawer.usersHint")}</b>
                  </div>
                  {!users.length ? <p className="alg-empty-s">{t("perfAdmin.drawer.usersEmpty")}</p> : null}
                  {users.map((u) => {
                    const on = openUser === u.userId;
                    const tl = timeline[u.sessionId];
                    return (
                      <div key={u.userId} className={`apf-urow${on ? " is-open" : ""}`}>
                        <button type="button" className="apf-chkrow apf-uhead" aria-label={`${shortUser(u.userId)} · ${fmtValue("inp", u.value, locale, t)}`} aria-expanded={on} onClick={() => setOpenUser(on ? null : u.userId)} data-testid={`perf-user-${u.userId}`}>
                          <b className="apf-mono apf-uid" title={u.userId}>
                            {shortUser(u.userId)}
                          </b>
                          <span className="apf-nm apf-muted">{[L.platform(u.platform), u.device ? L.device(u.device) : "", u.connection ? L.connection(u.connection) : "", u.country].filter(Boolean).join(" · ")}</span>
                          <b className={`tnum apf-r-${rating("inp", u.value)}`}>{fmtValue("inp", u.value, locale, t)}</b>
                          {on ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        {on ? (
                          <div className="apf-ubox">
                            {!tl || tl.loading ? (
                              <span className="alg-skel" style={{ height: 90, width: "100%" }} />
                            ) : tl.err ? (
                              <p className="alg-err">{tl.err}</p>
                            ) : (
                              <Waterfall data={tl.data} t={t} locale={locale} L={L} />
                            )}
                            <div className="apf-ubtns">
                              {can?.("people") ? (
                                <button type="button" className="alg-btn apf-btn-xs" onClick={() => onDossier(u.userId)}>
                                  <User size={13} />
                                  {t("perfAdmin.drawer.dossier")}
                                </button>
                              ) : null}
                              <button type="button" className="alg-btn apf-btn-xs" onClick={() => onUserSessions(u.userId)} data-testid="perf-user-sessions">
                                <History size={13} />
                                {u.sessions != null ? t("perfAdmin.drawer.userSessions", { n: u.sessions }) : t("perfAdmin.drawer.userSessionsAll")}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {tab === "lighthouse" ? (
                <div>
                  <div className="apf-lab">{t("perfAdmin.drawer.lhTitle")}</div>
                  {!d.lighthouse ? (
                    <p className="alg-empty-s">{isRoute && target.value.startsWith("/") ? t("perfAdmin.drawer.lhNone") : t("perfAdmin.drawer.lhApp")}</p>
                  ) : (
                    <div className="apf-chkrow">
                      <span className="apf-nm">{t("perfAdmin.drawer.lhMain", { sha: String(d.lighthouse.main.sha).slice(0, 7) })}</span>
                      {["perf", "a11y", "best_practices", "seo"].map((c) => (
                        <Score key={c} v={d.lighthouse.main.perPage?.[target.value]?.[c] ?? d.lighthouse.main.scores?.[c]} />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <footer className="alg-dfoot">
          <button type="button" className="alg-btn" onClick={onSaveView}>
            <Bookmark size={16} />
            {t("perfAdmin.drawer.saveView")}
          </button>
          <button type="button" className="alg-btn" onClick={onLighthouse}>
            <Lightbulb size={16} />
            {t("perfAdmin.drawer.openLh")}
          </button>
          {onErrorLog ? (
            <button type="button" className="alg-btn is-brand alg-ml" onClick={onErrorLog}>
              <Bug size={16} />
              {t("perfAdmin.alert.errorLog")}
            </button>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body
  );
}

function HeatRow({ row, L, locale, t, onFilter }) {
  return (
    <>
      <div className="apf-rh">{L.platform(row.platform)}</div>
      {row.cells.map((c) =>
        c.p75 == null ? (
          <div key={c.device} className="apf-c apf-c-x">
            {t("perfAdmin.drawer.none")}
          </div>
        ) : (
          <button
            key={c.device}
            type="button"
            className={`apf-c apf-c-${rating("inp", c.p75)}${c.hot ? " is-hot" : ""}`}
            onClick={() => {
              onFilter("platform", row.platform);
              onFilter("device", c.device);
            }}
            title={t("perfAdmin.drawer.samples", { n: fmtInt(c.n, locale) })}
            aria-label={`${L.platform(row.platform)} · ${L.device(c.device)}: ${fmtValue("inp", c.p75, locale, t)} · ${t("perfAdmin.drawer.samples", { n: fmtInt(c.n, locale) })}`}
          >
            {fmtValue("inp", c.p75, locale, t)}
          </button>
        )
      )}
    </>
  );
}

/** One page load: TTFB, FCP, LCP, app start, message list, voice join, INP on one time axis. */
export function Waterfall({ data, t, locale, L }) {
  const rows = data?.rows || [];
  if (!rows.length) return <p className="alg-empty-s">{t("perfAdmin.drawer.noData")}</p>;
  const span = Math.max(1000, Number(data.span) || 1000);
  return (
    <div className="apf-wf" data-testid="perf-waterfall">
      {rows.map((r, i) => {
        const tone = rating(r.metric, r.value);
        const label = r.metric === "inp" && r.target ? `${L.metric("inp")} · ${r.target.split(" > ").pop()}` : L.metric(r.metric);
        return (
          <div key={`${r.metric}-${i}`} className="apf-wf-r">
            <span title={label}>{label}</span>
            <div className="apf-wf-t">
              <i style={{ left: `${(r.start / span) * 100}%`, width: `${Math.max(0.8, ((r.end - r.start) / span) * 100)}%`, background: METRICS[r.metric] ? WF_COLOR[tone] : WF_COLOR.x }} />
            </div>
            <b className="tnum">{fmtValue(r.metric, r.value, locale, t)}</b>
          </div>
        );
      })}
    </div>
  );
}
