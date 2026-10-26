import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Shield, ShieldCheck, Eye, Unlock, Wallet, Timer, Ban, Search, Bell, History,
  Smartphone, Globe, X, Pencil, Plus, ChevronLeft, RefreshCw, Lock, Users,
} from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { useLocale } from "../../context/LocaleContext";
import { antibotApi } from "../../api/adminAntibot";
import { confirmAction, promptAction } from "../../lib/glassConfirm";
import {
  tone, statusFor, signalTone, sortReasons, rawScore, fmtNumber, maskHash, phasesFrom,
  shortDate, shortDateTime, accountAge, dayOfMonth, chartMax, layoutGraph, canWrite,
  DEFAULT_WEIGHTS, RULE_KINDS, RULE_NEEDS_THRESHOLD, BLOCK_REASONS,
  nodeBadge,
  nodeLabels,
} from "../../lib/antibotTab";
import "../../styles/maintenance.css";
import "../../styles/suspicious.css";

const KPI_COLORS = { review: "#ff9f0a", held: "#ff453a", clusters: "#bf5af2", watch: "#0a84ff" };
const FILTERS = ["", "stopped", "half", "trusted"];
const MOBILE_Q = "(max-width: 760px)";

function useIsMobile() {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(MOBILE_Q).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(MOBILE_Q);
    const on = () => setM(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return m;
}

function nameOf(u) {
  return u?.displayName || u?.username || "?";
}

function Risk({ s, big }) {
  const v = Math.max(0, Math.min(100, Number(s) || 0));
  return (
    <span className={`sx-risk ${tone(v)}${big ? " big" : ""}`}>
      <span className="sx-risk-bar" aria-hidden><i style={{ width: `${v}%` }} /></span>
      <b className="tnum">{v}</b>
    </span>
  );
}

function SigPill({ k, weights, t }) {
  return <span className={`sx-pill ${signalTone(weights[k])}`}>{t(`sx.sig.${k}`)}</span>;
}

function Status({ status, t }) {
  if (status === "trusted") return <span className="mt-badge sx-b-ok"><ShieldCheck size={12} /> {t("sx.status.trusted")}</span>;
  if (status === "stopped") return <span className="mt-badge mt-b-urg">{t("sx.status.stopped")}</span>;
  if (status === "half") return <span className="mt-badge mt-b-act">{t("sx.status.half")}</span>;
  return <span className="mt-badge mt-b-cancel">{t("sx.status.normal")}</span>;
}

function ageText(createdAt, t) {
  const a = accountAge(createdAt);
  if (!a) return "";
  return t(`sx.age.${a.unit}`, { n: a.n });
}

function Who({ user, t, size = 28, watched }) {
  const age = ageText(user.createdAt, t);
  return (
    <span className="sx-who">
      <Avatar name={nameOf(user)} size={size} user={user} animate="none" />
      <span>
        <b>{nameOf(user)}</b>
        <span className="mt-muted">@{user.username || "?"}{age ? ` · ${age}` : ""}</span>
      </span>
      {watched && <Eye size={13} className="sx-watch-ic" aria-label={t("sx.watched")} />}
    </span>
  );
}

function Kpis({ overview, t }) {
  const k = overview?.kpis;
  const items = [
    { id: "review", label: t("sx.kpiReview"), value: t("sx.nAccounts", { n: fmtNumber(k?.review) }) },
    { id: "held", label: t("sx.kpiHeld"), value: t("sx.dc", { n: fmtNumber(k?.held7d) }) },
    { id: "clusters", label: t("sx.kpiClusters"), value: t("sx.nClusters", { n: fmtNumber(k?.clusters?.count), m: fmtNumber(k?.clusters?.accounts) }) },
    { id: "watch", label: t("sx.kpiWatch"), value: t("sx.nAccounts", { n: fmtNumber(k?.watch) }) },
  ];
  return (
    <div className="mt-kpis n4 sx-kpis">
      {items.map((x) => (
        <div className="mt-card mt-kpi" key={x.id}>
          <div className="mt-kpi-label">{x.label}</div>
          <div className="mt-kpi-value tnum">
            <span className="mt-dot" style={{ background: KPI_COLORS[x.id], boxShadow: `0 0 10px ${KPI_COLORS[x.id]}` }} />
            {k ? x.value : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

function Phases({ flags, t }) {
  return (
    <div className="sx-phases" aria-label={t("sx.protection")}>
      <span className="sx-phases-title"><Shield size={14} /> {t("sx.protection")}</span>
      {phasesFrom(flags).map((p) => (
        <span key={p.id} className={`sx-phase${p.on ? " on" : ""}`}>
          <i aria-hidden />Faz {p.id} · {t(`sx.phase.${p.key}`)}<em>{p.on ? t("sx.phaseOn") : t("sx.phaseOff")}</em>
        </span>
      ))}
    </div>
  );
}

function Toolbar({ view, setView, filter, setFilter, q, setQ, counts, total, isAdmin, t }) {
  const views = [
    ["list", t("sx.viewAccounts"), total.accounts],
    ["watch", t("sx.viewWatch"), total.watch],
    ["clusters", t("sx.viewClusters"), total.clusters],
  ];
  return (
    <div className="sx-tabs">
      <div className="mt-seg sx-views" role="tablist" aria-label={t("sx.views")}>
        {views.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "on" : ""} onClick={() => setView(id)}>
            {label} {n != null && <span className="tnum sb-n">{n}</span>}
          </button>
        ))}
      </div>
      {view === "list" && (
        <>
          <div className="mt-seg sx-filter" role="radiogroup" aria-label={t("sx.filterLabel")}>
            {FILTERS.map((f) => (
              <button key={f || "all"} type="button" role="radio" aria-checked={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f ? t(`sx.status.${f}`) : t("sx.filterAll")}
                {f && counts?.[f] != null && <span className="tnum sb-n">{counts[f]}</span>}
              </button>
            ))}
          </div>
          <label className="mt-in sx-search">
            <Search size={14} className="mt-i" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isAdmin ? t("sx.searchPh") : t("sx.searchPhMod")}
              aria-label={t("sx.search")}
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
        </>
      )}
    </div>
  );
}

function Empty({ children }) {
  return <p className="sx-empty mt-muted">{children}</p>;
}

function ListView({ data, sel, onOpen, weights, monitor, q, t }) {
  const items = data?.items || [];
  return (
    <div className="mt-card sx-list">
      {items.length === 0 ? (
        <Empty>{q ? t("sx.emptySearch") : t("sx.empty")}</Empty>
      ) : (
        <>
          <table className="mt-h sx-table">
            <thead>
              <tr>
                <th>{t("sx.colAccount")}</th><th>{t("sx.colRisk")}</th><th>{t("sx.colSignals")}</th>
                <th className="r">{t("sx.colLinks")}</th><th className="r">{t("sx.colEarned")}</th><th className="r">{t("sx.colHeld")}</th><th>{t("sx.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const reasons = sortReasons(r.reasons, weights);
                return (
                  <tr key={r.user.id} className={sel === r.user.id ? "is-sel" : ""} tabIndex={0} onClick={() => onOpen(r.user.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r.user.id); } }} aria-label={t("sx.detailOf", { name: r.user.username || "?" })}>
                    <td><Who user={r.user} watched={r.watched} t={t} /></td>
                    <td><Risk s={r.score} /></td>
                    <td><span className="sx-pills">{reasons.slice(0, 2).map((k) => <SigPill k={k} key={k} weights={weights} t={t} />)}{reasons.length > 2 && <span className="sx-more tnum">+{reasons.length - 2}</span>}</span></td>
                    <td className="r tnum">{r.linkedCount || <span className="mt-muted">—</span>}</td>
                    <td className="r tnum">{fmtNumber(r.earned7d)}</td>
                    <td className="r tnum">{r.held7d ? <b className="sx-held">{fmtNumber(r.held7d)}</b> : <span className="mt-muted">0</span>}</td>
                    <td><Status status={r.status} t={t} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><td colSpan={4} className="mt-muted">{t("sx.total")}</td><td className="r tnum">{fmtNumber(data?.totals?.earned7d)}</td><td className="r tnum"><b className="sx-held">{fmtNumber(data?.totals?.held7d)}</b></td><td /></tr>
            </tfoot>
          </table>
          {/* Phones: the table turns into a card list. */}
          <ul className="sx-cards">
            {items.map((r) => {
              const reasons = sortReasons(r.reasons, weights);
              return (
                <li key={r.user.id}>
                  <button type="button" className={`sx-rowcard${sel === r.user.id ? " is-sel" : ""}`} onClick={() => onOpen(r.user.id)}>
                    <span className="sx-rc-top"><Who user={r.user} watched={r.watched} t={t} size={32} /><Status status={r.status} t={t} /></span>
                    <span className="sx-rc-mid"><Risk s={r.score} /><span className="sx-pills">{reasons.slice(0, 2).map((k) => <SigPill k={k} key={k} weights={weights} t={t} />)}{reasons.length > 2 && <span className="sx-more tnum">+{reasons.length - 2}</span>}</span></span>
                    <span className="sx-rc-nums tnum">
                      <span><em>{t("sx.colLinks")}</em>{r.linkedCount || "—"}</span>
                      <span><em>{t("sx.colEarned")}</em>{fmtNumber(r.earned7d)}</span>
                      <span><em>{t("sx.colHeld")}</em>{r.held7d ? <b className="sx-held">{fmtNumber(r.held7d)}</b> : "0"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="sx-rc-total tnum"><span>{t("sx.total")}</span><span>{fmtNumber(data?.totals?.earned7d)} · <b className="sx-held">{fmtNumber(data?.totals?.held7d)}</b></span></li>
          </ul>
        </>
      )}
      <p className="sx-foot mt-muted">{t("sx.foot")}{monitor ? ` ${t("sx.footMonitor")}` : ""}</p>
    </div>
  );
}

function Earnings({ earnings, t }) {
  const days = earnings?.days || [];
  const avg = Number(earnings?.averagePerDay) || 0;
  const max = chartMax(days, avg);
  const H = 92;
  return (
    <div className="sx-chart" role="img" aria-label={t("sx.chartAria", { n: fmtNumber(earnings?.total) })}>
      <div className="sx-chart-plot">
        <span className="sx-avg" style={{ bottom: `${(avg / max) * H}px` }} />
        {days.map((d) => (
          <div className="sx-col" key={d.day}>
            <span className="sx-col-v tnum">{fmtNumber(d.amount)}</span>
            <i style={{ height: `${Math.max(d.amount ? 2 : 0, (d.amount / max) * H)}px` }} />
            <span className="sx-col-d tnum">{`${dayOfMonth(d.day)} ${shortDate(`${d.day}T12:00:00Z`).split(" ")[1] || ""}`}</span>
          </div>
        ))}
      </div>
      <div className="sx-legend"><i aria-hidden /> {t("sx.avgUser", { n: fmtNumber(avg) })}</div>
    </div>
  );
}

function Graph({ graph, centerId, t }) {
  const { nodes, lines } = useMemo(() => layoutGraph(graph, centerId), [graph, centerId]);
  if (nodes.length < 2) return <Empty>{t("sx.noLinks")}</Empty>;
  const labels = nodeLabels(nodes.map((n) => n.username));
  return (
    <svg className="sx-graph" viewBox="0 0 312 172" role="img" aria-label={t("sx.graphAria", { n: nodes.length - 1 })}>
      {lines.map((l, i) => {
        const mx = (l.a.x + l.b.x) / 2;
        const my = (l.a.y + l.b.y) / 2;
        return (
          <g key={i}>
            <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} />
            {l.kind && <text x={mx} y={my - 5} textAnchor="middle" className="sx-g-el">{t(`sx.link.${l.kind}`)}</text>}
          </g>
        );
      })}
      {nodes.map((n, i) => (
        <g key={n.id} className={`sx-g-n${n.main ? " main" : ""}${n.banned ? " banned" : ""}`}>
          <title>{n.username || "?"}</title>
          <circle cx={n.x} cy={n.y} r={n.main ? 20 : 15} />
          <text x={n.x} y={n.y + 4} textAnchor="middle">{nodeBadge(n.username)}</text>
          <text x={n.x} y={n.y + (n.main ? 34 : 29)} textAnchor="middle" className="sx-g-l">{`${labels[i]}${n.banned ? ` · ${t("sx.banned")}` : ""}`}</text>
        </g>
      ))}
    </svg>
  );
}

function timelineText(e, t) {
  const k = e.kind;
  if (k === "signup") return [t("sx.tl.signup"), null];
  if (k === "link") return [t("sx.tl.link", { kind: e.linkKind ? t(`sx.link.${e.linkKind}`) : "", name: e.user || "?" }), e.weight ? `+${e.weight}` : null];
  if (k === "alert") return [t("sx.tl.alert", { score: e.score }), null];
  if (k === "watch_risk_above") return [t("sx.tl.watch_risk_above", { score: e.body?.score ?? "" }), null];
  if (k === "watch_held_above") return [t("sx.tl.watch_held_above", { n: fmtNumber(e.body?.held) }), null];
  if (k.startsWith("watch_")) return [t(`sx.tl.${k}`), null];
  if (k.startsWith("audit_")) return [t(`sx.tl.${k}`, { by: e.by || t("sx.someone") }), null];
  return [k, null];
}

function Drawer({ id, row, role, flags, mobile, onClose, onChanged, onOpenTool, toast, t, locale }) {
  const [base, setBase] = useState(null);
  const [extra, setExtra] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(null);
  const isAdmin = canWrite(role);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [b, x] = await Promise.all([antibotApi.user(id), antibotApi.extra(id)]);
      setBase(b);
      setExtra(x);
    } catch {
      setErr(t("sx.loadError"));
    }
  }, [id, t]);

  useEffect(() => {
    setBase(null);
    setExtra(null);
    load();
  }, [load]);

  // Desktop: the drawer sticks to the visible part of the scrolling admin body,
  // so its actions are on screen wherever the list was scrolled to.
  const overlayRef = useRef(null);
  const [pinH, setPinH] = useState(0);
  useLayoutEffect(() => {
    if (mobile) return undefined;
    const sc = scrollParentOf(overlayRef.current);
    const measure = () => {
      const view = sc ? sc.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const top = Math.max(view.top, overlayRef.current?.getBoundingClientRect().top ?? view.top);
      setPinH(Math.max(320, Math.floor(view.bottom - top - 8)));
    };
    measure();
    sc?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      sc?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [mobile]);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const user = extra?.user || row?.user || { id };
  const weights = extra?.weights || DEFAULT_WEIGHTS;
  const reasons = sortReasons(base?.risk?.reasons || row?.reasons || [], weights);
  const score = base?.risk?.score ?? row?.score ?? 0;
  const trusted = Boolean(base?.risk?.trusted ?? row?.trusted);
  const mult = trusted ? 1 : score >= 70 ? 0 : score >= 40 ? 0.5 : 1;
  const held = extra?.held7d ?? row?.held7d ?? 0;
  const raw = extra?.rawScore ?? rawScore(reasons, weights);
  const watched = Boolean(extra?.watch);
  const uncounted = extra?.uncounted || {};
  const uncountedTotal = Object.values(uncounted).reduce((n, v) => n + (Number(v) || 0), 0);
  const fails = [...BLOCK_REASONS, ...Object.keys(uncounted).filter((k) => !BLOCK_REASONS.includes(k))]
    .filter((k) => uncounted[k])
    .sort((a, b) => uncounted[b] - uncounted[a])
    .slice(0, 5);
  const monitor = !flags?.withhold;
  const handle = user.username || "?";

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      toast(okMsg);
      await load();
      onChanged?.();
    } catch (e) {
      toast(e?.status === 403 ? t("sx.forbidden") : e?.status === 409 ? t("sx.releaseMonitor") : t("sx.writeError"), true);
    } finally {
      setBusy(false);
    }
  };

  const onTrust = async () => {
    if (!isAdmin) return;
    if (trusted) {
      const ok = await confirmAction({ title: t("sx.untrustTitle", { name: handle }), message: t("sx.untrustBody"), confirmLabel: t("sx.confirm"), cancelLabel: t("sx.cancel"), danger: false });
      if (ok) run(() => antibotApi.trust(id, false), t("sx.untrusted"));
      return;
    }
    const note = await promptAction({ title: t("sx.trustTitle", { name: handle }), message: t("sx.trustBody"), placeholder: t("sx.trustPh"), confirmLabel: t("sx.actTrust"), cancelLabel: t("sx.cancel") });
    if (note == null) return;
    run(() => antibotApi.trust(id, true, note.slice(0, 1000)), t("sx.trusted"));
  };

  const onRelease = async () => {
    if (!isAdmin || monitor) return;
    const ok = await confirmAction({ title: t("sx.releaseTitle", { name: handle, n: fmtNumber(held) }), message: t("sx.releaseBody"), confirmLabel: t("sx.actRelease"), cancelLabel: t("sx.cancel"), danger: false });
    if (ok) run(() => antibotApi.release(id), t("sx.released"));
  };

  const onWatch = async () => {
    if (!isAdmin) return;
    if (watched) {
      const ok = await confirmAction({ title: t("sx.watchRemoveTitle", { name: handle }), message: t("sx.watchRemoveBody"), confirmLabel: t("sx.remove"), cancelLabel: t("sx.cancel") });
      if (ok) run(() => antibotApi.removeWatch(id), t("sx.saved"));
      return;
    }
    const note = await promptAction({ title: t("sx.watchAddTitle", { name: handle }), message: t("sx.watchAddBody"), placeholder: t("sx.watchNotePh"), confirmLabel: t("sx.actWatch"), cancelLabel: t("sx.cancel") });
    if (note == null) return;
    run(() => antibotApi.saveWatch(id, { note: note.slice(0, 500), rules: [{ kind: "risk_above", threshold: 70 }] }), t("sx.saved"));
  };

  const emailLine = user.emailVerified ? t("sx.emailVerified") : t("sx.emailUnverified");
  const age = ageText(user.createdAt, t);
  const body = (
    <aside className={`sx-drawer${mobile ? " is-sheet" : ""}`} role="dialog" aria-modal="true" aria-label={t("sx.detailOf", { name: handle })}>
      <div className="sx-d-head">
        {mobile && (
          <button type="button" ref={closeRef} className="pc-ibtn sx-close sx-back" aria-label={t("sx.back")} onClick={onClose}><ChevronLeft size={18} /></button>
        )}
        <Avatar name={nameOf(user)} size={44} user={user} animate="none" />
        <div className="sx-d-id">
          <b>@{handle}</b>
          <span className="mt-muted">{[user.createdAt ? t("sx.joined", { when: shortDateTime(user.createdAt, locale) }) : null, age, emailLine].filter(Boolean).join(" · ")}</span>
        </div>
        {!mobile && <button type="button" ref={closeRef} className="ui-close-btn sx-close" aria-label={t("sx.close")} title={t("sx.close")} onClick={onClose}><X size={16} weight="bold" /></button>}
      </div>
      {err && <div className="mt-err sx-err">{err} <button type="button" className="mt-btn sm" onClick={load}>{t("sx.retry")}</button></div>}
      <div className="sx-d-body">
        <div className="sx-d-score">
          <div><span className="sx-d-k">{t("sx.dRisk")}</span><span className={`sx-d-big tnum ${tone(score)}`}>{score}<em>/100</em></span></div>
          <div><span className="sx-d-k">{t("sx.dEarn")}</span><span className={`sx-d-big tnum ${mult === 0 ? "hi" : mult === 0.5 ? "mid" : "ok"}`}>×{String(mult).replace(".", ",")}</span></div>
          <div><span className="sx-d-k">{t("sx.dHeld")}</span><span className={`sx-d-big tnum ${held ? "hi" : "lo"}`}>{fmtNumber(held)}<em> DC</em></span></div>
        </div>
        <div className="sx-sec">
          <h4>{t("sx.signals")}<span className="mt-muted tnum">{raw > 100 ? t("sx.signalsSum", { n: raw }) : t("sx.signalsSumPlain", { n: raw })}</span></h4>
          {reasons.length ? (
            <ul className="sx-sigs">
              {reasons.map((k) => (
                <li key={k}><span>{t(`sx.sig.${k}`)}</span><span className="sx-sig-bar" aria-hidden><i style={{ width: `${((weights[k] || 0) / 35) * 100}%` }} /></span><b className="tnum">+{weights[k] || 0}</b></li>
              ))}
            </ul>
          ) : <Empty>{t("sx.noSignals")}</Empty>}
        </div>
        <div className="sx-sec sx-two">
          <div>
            <h4>{t("sx.earnings7d")}<span className="mt-muted tnum">{t("sx.dc", { n: fmtNumber(extra?.earnings?.total) })}</span></h4>
            {extra ? <Earnings earnings={extra.earnings} t={t} /> : <div className="sx-skel" />}
          </div>
          <div>
            <h4>{t("sx.linked")}<span className="mt-muted tnum">{Math.max(0, (extra?.graph?.nodes?.length || 1) - 1)}</span></h4>
            {extra ? <Graph graph={extra.graph} centerId={id} t={t} /> : <div className="sx-skel" />}
          </div>
        </div>
        <div className="sx-sec sx-two">
          <div>
            <h4>{t("sx.timeline")}</h4>
            {extra?.timeline?.length ? (
              <ol className="sx-tl">
                {extra.timeline.map((e, i) => {
                  const [text, w] = timelineText(e, t);
                  return <li key={i}><time className="tnum">{shortDateTime(e.at, locale)}</time><span>{text}</span>{w && <b className="tnum">{w}</b>}</li>;
                })}
              </ol>
            ) : <Empty>{extra ? t("sx.noTimeline") : t("sx.loading")}</Empty>}
          </div>
          <div>
            <h4>{t("sx.uncounted")}<span className="mt-muted tnum">{fmtNumber(uncountedTotal)}</span></h4>
            {fails.length ? (
              <ul className="sx-fails">{fails.map((k) => <li key={k}><span>{t(`sx.block.${k}`) || k}</span><b className="tnum">{fmtNumber(uncounted[k])}</b></li>)}</ul>
            ) : <Empty>{t("sx.noUncounted")}</Empty>}
            <h4 className="sx-h-gap">{t("sx.prints")}<span className="mt-muted">{t("sx.printsRetention")}</span></h4>
            {isAdmin ? (
              extra?.hashes && (extra.hashes.fp || extra.hashes.subnet) ? (
                <ul className="sx-hash">
                  {extra.hashes.fp && <li><Smartphone size={13} /><span>{t("sx.printDevice")}</span><code>{maskHash(extra.hashes.fp)}</code></li>}
                  {extra.hashes.subnet && <li><Globe size={13} /><span>{t("sx.printNet")}</span><code>{maskHash(extra.hashes.subnet)}</code></li>}
                </ul>
              ) : <Empty>{t("sx.printsNone")}</Empty>
            ) : <Empty><Lock size={12} /> {t("sx.printsAdminOnly")}</Empty>}
          </div>
        </div>
      </div>
      <div className="sx-actions">
        <button type="button" className={`mt-btn sm${watched ? " on" : ""}`} disabled={busy || !isAdmin} onClick={onWatch} title={isAdmin ? undefined : t("sx.adminOnly")}>
          <Eye size={14} /> {watched ? t("sx.actWatching") : t("sx.actWatch")}
        </button>
        <button type="button" className="mt-btn sm" disabled={busy || !isAdmin} onClick={onTrust} title={isAdmin ? undefined : t("sx.adminOnly")}>
          <ShieldCheck size={14} /> {trusted ? t("sx.actUntrust") : t("sx.actTrust")}
        </button>
        <button type="button" className="mt-btn sm" disabled={busy || !isAdmin || monitor || !held} onClick={onRelease} title={!isAdmin ? t("sx.adminOnly") : monitor ? t("sx.releaseMonitor") : undefined}>
          <Unlock size={14} /> {t("sx.actRelease")}
        </button>
        {!isAdmin && <span className="sx-admin-only mt-muted"><Lock size={12} /> {t("sx.adminOnly")}</span>}
        {isAdmin && (
          <>
            <span className="sx-act-sep" aria-hidden />
            <button type="button" className="mt-btn sm ghost" onClick={() => onOpenTool?.(id, "freeze")}><Wallet size={14} /> {t("sx.actFreeze")}</button>
            <button type="button" className="mt-btn sm ghost" onClick={() => onOpenTool?.(id, "timeout")}><Timer size={14} /> {t("sx.actTimeout")}</button>
            <button type="button" className="mt-btn sm danger" onClick={() => onOpenTool?.(id, "ban")}><Ban size={14} /> {t("sx.actBan")}</button>
          </>
        )}
      </div>
    </aside>
  );
  if (mobile && typeof document !== "undefined") {
    return createPortal(<div className="sx-sheet-host">{body}</div>, document.body);
  }
  return (
    <div className="sx-overlay" ref={overlayRef}>
      <div className="sx-scrim" aria-hidden onClick={onClose} />
      <div className="sx-drawer-pin" style={pinH ? { height: pinH } : undefined}>{body}</div>
    </div>
  );
}

/** Nearest scrolling ancestor (the admin panel body). */
function scrollParentOf(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

function RuleAdder({ rules, onAdd, t }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(null);
  const [n, setN] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const full = rules.length >= 6;
  const usedFlag = new Set(rules.filter((r) => !RULE_NEEDS_THRESHOLD.has(r.kind)).map((r) => r.kind));
  const choices = RULE_KINDS.filter((k) => RULE_NEEDS_THRESHOLD.has(k) || !usedFlag.has(k));
  const submit = (k, th) => {
    onAdd(RULE_NEEDS_THRESHOLD.has(k) ? { kind: k, threshold: th } : { kind: k });
    setOpen(false);
    setKind(null);
    setN("");
  };
  return (
    <span className="sx-adder" ref={ref}>
      <button type="button" className="sx-add" disabled={full} title={full ? t("sx.ruleMax") : undefined} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Plus size={12} /> {t("sx.addRule")}
      </button>
      {open && (
        <div className="sx-pop" role="menu">
          {!kind && choices.map((k) => (
            <button key={k} type="button" role="menuitem" className="sx-pop-item" onClick={() => (RULE_NEEDS_THRESHOLD.has(k) ? (setKind(k), setN(k === "risk_above" ? "70" : "2000")) : submit(k))}>
              {t(`sx.rule.${k}`, { n: "…" })}
            </button>
          ))}
          {kind && (
            <form className="sx-pop-form" onSubmit={(e) => { e.preventDefault(); const v = Number(n); if (Number.isInteger(v) && v >= 1 && v <= (kind === "risk_above" ? 100 : 10_000_000)) submit(kind, v); }}>
              <span className="mt-muted">{t(`sx.rule.${kind}`, { n: n || "…" })}</span>
              <label className="mt-in"><span className="sr-only">{t("sx.ruleThreshold")}</span>
                <input type="number" inputMode="numeric" min={1} max={kind === "risk_above" ? 100 : 10_000_000} value={n} onChange={(e) => setN(e.target.value)} autoFocus aria-label={t("sx.ruleThreshold")} />
              </label>
              <button type="submit" className="mt-btn sm primary">{t("sx.ruleAdd")}</button>
            </form>
          )}
        </div>
      )}
    </span>
  );
}

function ruleLabel(r, t) {
  return t(`sx.rule.${r.kind}`, { n: r.threshold != null ? fmtNumber(r.threshold) : "" });
}

function feedText(a, t) {
  const b = a.body || {};
  const names = (Array.isArray(b.added) ? b.added : Array.isArray(b.joined) ? b.joined : [])
    .map((x) => (a.kind === "new_signal" ? t(`sx.sig.${x}`) : x || "?"))
    .join(", ");
  const v = { user: a.user || "?", score: b.score ?? "", threshold: fmtNumber(b.threshold), n: fmtNumber(b.held), names, by: b.by || t("sx.someone") };
  const key = `sx.feed.${a.kind}`;
  const text = t(key, v);
  const parts = text === key ? [a.kind] : text.split(a.user || "\u0000");
  return parts.length === 2 ? <>{parts[0]}<b>{a.user}</b>{parts[1]}</> : text;
}

function WatchView({ role, onOpen, toast, t, locale }) {
  const [list, setList] = useState(null);
  const [feed, setFeed] = useState(null);
  const [err, setErr] = useState("");
  const isAdmin = canWrite(role);
  const load = useCallback(async () => {
    setErr("");
    try {
      const [w, f] = await Promise.all([antibotApi.watchlist(), antibotApi.feed().catch(() => ({ alerts: [], audit: [] }))]);
      setList((w.items || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0)));
      setFeed(f);
    } catch (e) {
      setErr(e?.status === 503 ? t("sx.watchNotMigrated") : t("sx.loadError"));
      setList([]);
    }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const save = async (item, patch) => {
    try {
      await antibotApi.saveWatch(item.user.id, { note: patch.note ?? item.note, rules: (patch.rules ?? item.rules).map((r) => ({ kind: r.kind, threshold: r.threshold ?? undefined })) });
      toast(t("sx.saved"));
      load();
    } catch (e) {
      toast(e?.status === 403 ? t("sx.forbidden") : t("sx.writeError"), true);
    }
  };
  const editNote = async (item) => {
    const note = await promptAction({ title: t("sx.editNote"), defaultValue: item.note, placeholder: t("sx.watchNotePh"), confirmLabel: t("sx.save"), cancelLabel: t("sx.cancel") });
    if (note != null) save(item, { note: note.slice(0, 500) });
  };

  return (
    <div className="mt-grid sx-watch">
      <div className="mt-col">
        {err && <div className="mt-err">{err}</div>}
        {list == null && <div className="mt-card"><Empty>{t("sx.loading")}</Empty></div>}
        {list && list.length === 0 && !err && <div className="mt-card"><Empty>{t("sx.watchEmpty")}</Empty></div>}
        {(list || []).map((w) => (
          <div className="mt-card sx-wcard" key={w.user.id}>
            <div className="sx-w-head">
              <button type="button" className="sx-w-who" onClick={() => onOpen(w.user.id)} aria-label={t("sx.detailOf", { name: w.user.username || "?" })}>
                <Avatar name={nameOf(w.user)} size={36} user={w.user} animate="none" />
                <span className="sx-d-id"><b>@{w.user.username || "?"}</b><span className="mt-muted">{w.addedBy ? t("sx.addedBy", { by: w.addedBy, when: shortDate(w.createdAt, locale) }) : t("sx.addedAt", { when: shortDate(w.createdAt, locale) })}</span></span>
              </button>
              <span className="sx-w-score"><Risk s={w.score} /><Status status={w.status || statusFor(w.score, w.trusted)} t={t} /></span>
            </div>
            <div className="sx-note">
              <Pencil size={13} className="mt-i" />
              <p>{w.note || <span className="mt-muted">{t("sx.noNote")}</span>}</p>
              {isAdmin && <button type="button" className="sx-note-edit" onClick={() => editNote(w)} aria-label={t("sx.editNote")}><Pencil size={12} /></button>}
            </div>
            <div className="sx-w-foot">
              <Bell size={13} className="mt-i" aria-label={t("sx.rulesLabel")} />
              {w.rules.map((r) => (
                <span className="sx-alert-chip" key={r.id || `${r.kind}:${r.threshold}`}>
                  {ruleLabel(r, t)}
                  {isAdmin && <button type="button" className="sx-chip-x" aria-label={t("sx.removeRule", { rule: ruleLabel(r, t) })} onClick={() => save(w, { rules: w.rules.filter((x) => x !== r) })}><X size={10} /></button>}
                </span>
              ))}
              {isAdmin && <RuleAdder rules={w.rules} t={t} onAdd={(r) => save(w, { rules: [...w.rules, r] })} />}
              <span className="sx-w-held tnum">{w.held7d ? <>{t("sx.colHeld")} <b>{fmtNumber(w.held7d)}</b> DC</> : t("sx.heldNone")}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-card sx-feed">
        <h3><Bell size={16} /> {t("sx.feedTitle")}<span className="sub">{t("sx.feedSub")}</span></h3>
        {feed?.alerts?.length ? (
          <ul>{feed.alerts.map((a, i) => <li key={i}><i className={`sx-dot ${a.severity || "lo"}`} aria-hidden /><span>{feedText(a, t)}</span><time className="tnum">{shortDateTime(a.at, locale)}</time></li>)}</ul>
        ) : <Empty>{feed ? t("sx.feedEmpty") : t("sx.loading")}</Empty>}
        <div className="mt-audit">
          <h4><History size={13} style={{ verticalAlign: -2 }} /> {t("sx.auditTitle")}</h4>
          {feed?.audit?.length ? (
            <ul>
              {feed.audit.map((a, i) => (
                <li key={i}><b>{a.by || t("sx.someone")}</b><span>{t(`sx.audit.${a.action}`, { target: a.target || "?" })}</span>{a.note && <span className="mt-muted">· {a.note}</span>}<time>{shortDateTime(a.at, locale)}</time></li>
              ))}
            </ul>
          ) : <Empty>{t("sx.auditEmpty")}</Empty>}
        </div>
      </div>
    </div>
  );
}

function ClustersView({ data, onOpen, t }) {
  const items = data?.items || [];
  if (!data) return <div className="mt-card"><Empty>{t("sx.loading")}</Empty></div>;
  if (!items.length) return <div className="mt-card"><Empty>{t("sx.clustersEmpty")}</Empty></div>;
  return (
    <div className="sx-clusters">
      {items.map((c, i) => (
        <div className="mt-card sx-ccard" key={i}>
          <h3><Users size={15} /> {t("sx.clusterTitle", { n: i + 1 })}<span className="sub tnum">{t("sx.clusterMeta", { n: c.members.length, score: c.topScore })}</span></h3>
          <div className="sx-c-kinds">{Object.entries(c.kinds || {}).map(([k, n]) => <span className="sx-pill lo" key={k}>{t(`sx.link.${k}`)} · {n}</span>)}</div>
          <ul className="sx-c-members">
            {c.members.map((m) => (
              <li key={m.user.id}>
                <button type="button" aria-label={t("sx.openDetail", { user: m.user.username || "?" })} onClick={() => onOpen(m.user.id)}>
                  <Who user={m.user} t={t} size={26} />
                  <Risk s={m.score} />
                  <Status status={m.status} t={t} />
                </button>
              </li>
            ))}
          </ul>
          <p className="sx-c-held mt-muted tnum">{t("sx.clusterHeld", { n: fmtNumber(c.held7d) })}</p>
        </div>
      ))}
    </div>
  );
}

export default function SuspiciousTab({ role = "admin", onOpenTool }) {
  const { t, locale } = useLocale();
  const mobile = useIsMobile();
  const isAdmin = canWrite(role);
  const [view, setView] = useState("list");
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [debQ, setDebQ] = useState("");
  const [status, setStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [clusters, setClusters] = useState(null);
  const [sel, setSel] = useState(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState(null);
  const noteTimer = useRef(null);

  const toast = useCallback((text, bad = false) => {
    setNote({ text, bad });
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(noteTimer.current), []);

  useEffect(() => {
    const h = setTimeout(() => setDebQ(q.trim()), 250);
    return () => clearTimeout(h);
  }, [q]);

  const loadTop = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([antibotApi.status().catch(() => null), antibotApi.overview()]);
      setStatus(s);
      setOverview(o);
      setErr("");
    } catch (e) {
      setErr(e?.status === 503 ? t("sx.notMigrated") : t("sx.loadError"));
    }
  }, [t]);

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await antibotApi.accounts({ status: filter, q: debQ }));
    } catch (e) {
      setErr(e?.status === 503 ? t("sx.notMigrated") : t("sx.loadError"));
      setAccounts({ items: [], totals: {} });
    }
  }, [filter, debQ, t]);

  const loadClusters = useCallback(async () => {
    try {
      setClusters(await antibotApi.clusters());
    } catch {
      setClusters({ items: [] });
    }
  }, []);

  useEffect(() => { loadTop(); }, [loadTop]);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { if (view === "clusters" || clusters == null) loadClusters(); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = useCallback(() => {
    loadTop();
    loadAccounts();
    if (view === "clusters") loadClusters();
  }, [loadTop, loadAccounts, loadClusters, view]);

  const weights = DEFAULT_WEIGHTS;
  const flags = status?.flags || { monitor: true };
  const row = accounts?.items?.find((r) => r.user.id === sel) || null;
  const total = {
    accounts: accounts?.items?.length,
    watch: overview?.kpis?.watch,
    clusters: overview?.kpis?.clusters?.count,
  };

  return (
    <section className={`admin-section mt-root pc-root sx-root${sel && !mobile ? " has-drawer" : ""}`} aria-label={t("sx.tab")}>
      {!isAdmin && <div className="sx-mod-banner"><Lock size={13} /> {t("sx.modBanner")}</div>}
      <Kpis overview={overview} t={t} />
      <div className="sx-phase-row">
        <Phases flags={flags} t={t} />
        <button type="button" className="pc-ibtn sx-refresh" onClick={refreshAll} aria-label={t("sx.refresh")} title={t("sx.refresh")}><RefreshCw size={15} /></button>
      </div>
      <Toolbar view={view} setView={(v) => { setView(v); }} filter={filter} setFilter={setFilter} q={q} setQ={setQ} counts={overview?.counts} total={total} isAdmin={isAdmin} t={t} />
      {err && <div className="mt-err sx-err">{err} <button type="button" className="mt-btn sm" onClick={refreshAll}>{t("sx.retry")}</button></div>}
      {view === "list" && (accounts ? <ListView data={accounts} sel={sel} onOpen={setSel} weights={weights} monitor={!flags.withhold} q={debQ || filter} t={t} /> : <div className="mt-card"><Empty>{t("sx.loading")}</Empty></div>)}
      {view === "watch" && <WatchView role={role} onOpen={setSel} toast={toast} t={t} locale={locale} />}
      {view === "clusters" && <ClustersView data={clusters} onOpen={setSel} t={t} />}
      {sel && (
        <Drawer
          key={sel}
          id={sel}
          row={row}
          role={role}
          flags={flags}
          mobile={mobile}
          onClose={() => setSel(null)}
          onChanged={refreshAll}
          onOpenTool={onOpenTool}
          toast={toast}
          t={t}
          locale={locale}
        />
      )}
      {note && <div className={`sx-toast${note.bad ? " bad" : ""}`} role="status">{note.text}</div>}
    </section>
  );
}
