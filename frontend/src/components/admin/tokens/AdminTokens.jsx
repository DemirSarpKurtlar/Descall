/**
 * Yönetici Paneli › Admin Token (owner only). Owner pick: Draft B "Liste ve çalışma alanı"
 * (scratchpad report/admin-token-taslaklar.html#B), built one to one:
 *   header     breadcrumb, "Yalnızca sahip", the four facts chips, OpenAPI belgesi,
 *              Panik (revoke every token), Yeni token
 *   strip      active tokens, requests in 24 h against yesterday, destructive actions
 *              by kind, open alerts (jumps to the panel)
 *   left       token list (search, Tümü / Çalışan / Pasif, sparkline, status, last use,
 *              alert dot) and Uyarılar (automatic pause + rules, alert actions, tokens
 *              about to expire)
 *   right      the selected token: identity card + grouped actions, state / alert strips,
 *              Kullanım konsolu, top endpoints + IP allowlist, live calls (GET
 *              /:id/calls?after= every 3 s while the tab is visible), connection snippets
 *              + MCP server, the token's audit list linking into İşlem kaydı
 *   dialogs    create drawer + one-time reveal, rotate, revoke, restore (10 min), panic,
 *              IP editor (TokenDialogs.jsx)
 * Degrades cleanly: { available: false } shows the "migration not applied" state.
 * Server: /api/admin/tokens (routes owned by the backend; contract in tokenApi.js).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ChevronRight, Database, FileText, Gavel, KeyRound, Lock, Plus, RefreshCw, Shield, Activity } from "../../ui/Icon.jsx";
import { AlertsPanel, TokenList } from "./TokenList.jsx";
import { AuditCard, CallsCard, ConnectionCard, EndpointsCard, StateBanner, TokenAlertBanner, TokenHero, UsageCard } from "./TokenWorkspace.jsx";
import { CreateDrawer, IpDialog, PanicDialog, RestoreDialog, RevokeDialog, RotateDialog } from "./TokenDialogs.jsx";
import { Skel, Toast, useFmt } from "./TokenUi.jsx";
import { tokenApi } from "./tokenApi.js";
import {
  CALLS_POLL_MS,
  FRESH_SECRET_MS,
  LIST_POLL_MS,
  alertKinds,
  allowIpMode,
  assignColors,
  defaultSelection,
  deltaPct,
  destructiveParts,
  errorKey,
  expiringSoon,
  isLive,
  mergeCalls,
  newestAt,
  openAlerts,
  restoreLeft,
  sameSettings,
} from "./tokenModel.js";
import "../../../styles/admin-tokens.css";

const EMPTY = { loading: true, available: true, tokens: [], summary: null, alerts: [], autoPause: null, mcp: null, err: null };

function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

export default function AdminTokens({ socket, viewerUsername, onGoto }) {
  const f = useFmt();
  const { t } = f;
  const visible = usePageVisible();
  const rootRef = useRef(null);
  const workRef = useRef(null);
  const alertsRef = useRef(null);
  const callsRef = useRef(null);

  const [data, setData] = useState(EMPTY);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState({ id: null, loading: false, usage: null, audit: [], err: null });
  const [calls, setCalls] = useState([]);
  const [freshIds, setFreshIds] = useState(() => new Set());
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [snipTab, setSnipTab] = useState("claudeCode");
  const [fresh, setFresh] = useState(null); // { id, secret, at }
  const [myIp, setMyIp] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyAlert, setBusyAlert] = useState(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [create, setCreate] = useState({ open: false, preset: null });
  const [rotateFor, setRotateFor] = useState(null);
  const [revokeFor, setRevokeFor] = useState(null);
  const [restoreFor, setRestoreFor] = useState(null);
  const [panicOpen, setPanicOpen] = useState(false);
  const [ipFor, setIpFor] = useState(null); // { token, add }
  const toastTimer = useRef(null);
  const listSeq = useRef(0);

  const notify = useCallback((text, { tone = "ok", undo = null } = {}) => {
    setToast({ text, tone, undo, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 8000 : 4000);
  }, []);
  const fail = useCallback((e) => notify(t(errorKey(e)), { tone: "err" }), [notify, t]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ---------------- data ---------------- */

  const loadList = useCallback(async () => {
    const seq = ++listSeq.current;
    try {
      const d = await tokenApi.list();
      if (seq !== listSeq.current) return;
      if (d && d.available === false) {
        setData({ ...EMPTY, loading: false, available: false });
        return;
      }
      setData({
        loading: false,
        available: true,
        tokens: Array.isArray(d?.tokens) ? d.tokens : [],
        summary: d?.summary || null,
        alerts: Array.isArray(d?.alerts) ? d.alerts : [],
        autoPause: d?.autoPause || null,
        mcp: d?.mcp || null,
        err: null,
      });
    } catch (e) {
      if (seq !== listSeq.current) return;
      if (e?.code === "TOKENS_UNAVAILABLE") {
        setData({ ...EMPTY, loading: false, available: false });
        return;
      }
      setData((p) => ({ ...p, loading: false, err: p.tokens.length ? null : e }));
    }
  }, []);

  useEffect(() => {
    loadList();
    tokenApi.currentIp().then(setMyIp);
  }, [loadList]);

  useEffect(() => {
    if (!visible) return undefined;
    const id = setInterval(loadList, LIST_POLL_MS);
    return () => clearInterval(id);
  }, [visible, loadList]);

  // Live: a new alert (owner's room) or any admin change refreshes the list at once;
  // the 3 s calls polling keeps running for the console.
  const refreshTimer = useRef(null);
  useEffect(() => {
    if (!socket) return undefined;
    const soon = () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(loadList, 400);
    };
    const onAlert = (a) => {
      if (a?.id) setData((p) => ({ ...p, alerts: [a, ...p.alerts.filter((x) => x.id !== a.id)] }));
      soon();
    };
    socket.on("admin:token-alert", onAlert);
    socket.on("admin:update", soon);
    return () => {
      clearTimeout(refreshTimer.current);
      socket.off("admin:token-alert", onAlert);
      socket.off("admin:update", soon);
    };
  }, [socket, loadList]);

  // Keep a valid selection.
  useEffect(() => {
    if (data.loading) return;
    if (!selectedId || !data.tokens.some((x) => x.id === selectedId)) setSelectedId(defaultSelection(data.tokens));
  }, [data.loading, data.tokens, selectedId]);

  const loadDetail = useCallback(async (id, { quiet = false } = {}) => {
    if (!id) return;
    if (!quiet) setDetail({ id, loading: true, usage: null, audit: [], err: null });
    try {
      const d = await tokenApi.detail(id);
      setDetail((p) => (p.id !== id && quiet ? p : { id, loading: false, usage: d?.usage || null, audit: Array.isArray(d?.audit) ? d.audit : [], err: null, loadedAt: Date.now() }));
      if (d?.token) setData((p) => ({ ...p, tokens: p.tokens.map((x) => (x.id === id ? { ...x, ...d.token } : x)) }));
      // The token's own alerts (GET /tokens/:id) refresh the panel's copy of them.
      if (Array.isArray(d?.alerts) && d.alerts.length) {
        setData((p) => {
          const fresh = new Map(d.alerts.map((a) => [a.id, a]));
          const kept = p.alerts.map((a) => (fresh.has(a.id) ? { ...a, ...fresh.get(a.id) } : a));
          const added = d.alerts.filter((a) => !p.alerts.some((x) => x.id === a.id) && a.status === "open");
          return { ...p, alerts: [...added, ...kept] };
        });
      }
      if (!quiet) setCalls(Array.isArray(d?.usage?.recentCalls) ? d.usage.recentCalls.slice(0, 50) : []);
      else if (Array.isArray(d?.usage?.recentCalls)) setCalls((prev) => mergeCalls(prev, d.usage.recentCalls));
    } catch (e) {
      if (e?.code === "TOKEN_NOT_FOUND") loadList();
      setDetail((p) => (p.id === id ? { ...p, loading: false, err: e } : p));
    }
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    setCalls([]);
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!visible || !selectedId) return undefined;
    const id = setInterval(() => loadDetail(selectedId, { quiet: true }), LIST_POLL_MS);
    return () => clearInterval(id);
  }, [visible, selectedId, loadDetail]);

  // Live calls: poll every 3 s while the page is visible.
  const callsRef2 = useRef(calls);
  callsRef2.current = calls;
  useEffect(() => {
    if (!visible || !selectedId || detail.id !== selectedId || detail.loading || detail.err) return undefined;
    let alive = true;
    const tick = async () => {
      const after = newestAt(callsRef2.current) || (detail.loadedAt ? new Date(detail.loadedAt).toISOString() : null);
      try {
        const d = await tokenApi.calls(selectedId, after);
        const rows = Array.isArray(d?.calls) ? d.calls : [];
        if (!alive || !rows.length) return;
        setCalls((prev) => mergeCalls(prev, rows));
        setFreshIds(new Set(rows.map((r) => r.id)));
      } catch {
        /* the next tick retries */
      }
    };
    const id = setInterval(tick, CALLS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [visible, selectedId, detail.id, detail.loading, detail.err, detail.loadedAt]);

  // Clock: every second while a revoke can still be undone, else every 15 s.
  const restoring = data.tokens.some((x) => restoreLeft(x, now) > 0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), restoring ? 1000 : 15000);
    return () => clearInterval(id);
  }, [restoring]);

  // The fresh secret fills the snippets for 10 minutes at most.
  useEffect(() => {
    if (!fresh) return undefined;
    const id = setTimeout(() => setFresh(null), Math.max(0, fresh.at + FRESH_SECRET_MS - Date.now()));
    return () => clearTimeout(id);
  }, [fresh]);

  /* ---------------- derived ---------------- */

  const tokens = useMemo(() => assignColors(data.tokens), [data.tokens]);
  const selected = useMemo(() => tokens.find((x) => x.id === selectedId) || null, [tokens, selectedId]);
  const open = openAlerts(data.alerts);
  const tokenAlert = selected ? open.find((a) => a.tokenId === selected.id) : null;
  const expiring = expiringSoon(data.tokens, now);
  const s = data.summary || {};
  const activeN = s.active ?? data.tokens.filter((x) => x.status === "active").length;
  const totalN = s.total ?? data.tokens.length;
  const delta = deltaPct(s.requests24h, s.requestsPrev24h);
  const destParts = destructiveParts(s.destructive24h);
  const destTotal = s.destructive24h?.total ?? destParts.reduce((a, b) => a + b.n, 0);
  const kinds = alertKinds(data.alerts);
  const alertsN = s.alerts ?? open.length;
  const liveCount = data.tokens.filter(isLive).length;
  const secretFor = fresh && selected && fresh.id === selected.id ? fresh.secret : null;
  const detailFor = detail.id === selectedId ? detail : { loading: true, usage: null, audit: [] };

  /* ---------------- helpers ---------------- */

  const patchToken = useCallback((tok) => {
    if (!tok?.id) return;
    setData((p) => {
      const has = p.tokens.some((x) => x.id === tok.id);
      return { ...p, tokens: has ? p.tokens.map((x) => (x.id === tok.id ? { ...x, ...tok } : x)) : [tok, ...p.tokens] };
    });
  }, []);

  const select = useCallback((id) => {
    setSelectedId(id);
    const w = rootRef.current?.offsetWidth || 9999;
    if (w < 760) requestAnimationFrame(() => workRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  }, []);

  const gotoAudit = useCallback(
    (opts = {}) => {
      if (opts.entry && typeof window !== "undefined") {
        try {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#audit/${encodeURIComponent(opts.entry)}`);
        } catch {
          /* ignore */
        }
      }
      onGoto?.("audit", opts.q ? { q: opts.q } : {});
    },
    [onGoto]
  );

  const openApi = useCallback(async () => {
    notify(t("atok.openapiOpening"));
    try {
      const doc = await tokenApi.openapi();
      const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
      const win = window.open(url, "_blank", "noopener");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = "descall-openapi.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      fail(e);
    }
  }, [notify, fail, t]);

  const setPaused = useCallback(
    async (tok, paused, { undoable = true } = {}) => {
      setBusy(true);
      try {
        const r = await tokenApi.patch(tok.id, { paused });
        patchToken(r?.token || { ...tok, status: paused ? "paused" : "active" });
        notify(t(paused ? "atok.act.paused" : "atok.act.resumed", { name: tok.name }), undoable ? { undo: { kind: paused ? "resume" : "pause", token: tok } } : {});
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [patchToken, notify, fail, t]
  );

  const runUndo = useCallback(
    async (u) => {
      if (!u) return;
      if (u.kind === "resume") return setPaused(u.token, false, { undoable: false });
      if (u.kind === "pause") return setPaused(u.token, true, { undoable: false });
      if (u.kind === "restore") return setRestoreFor(u.token);
      if (u.kind === "ips") {
        try {
          const r = await tokenApi.patch(u.token.id, { ipAllowlist: u.prev });
          patchToken(r?.token);
          notify(t("atok.ipdlg.done"));
        } catch (e) {
          fail(e);
        }
      }
    },
    [setPaused, patchToken, notify, fail, t]
  );

  const alertAction = useCallback(
    async (alert, action) => {
      setBusyAlert(alert.id);
      try {
        const r = await tokenApi.alert(alert.id, action);
        setData((p) => ({ ...p, alerts: p.alerts.map((a) => (a.id === alert.id ? { ...a, ...(r?.alert || { status: action === "dismiss" ? "dismissed" : "resolved" }) } : a)) }));
        if (r?.token) patchToken(r.token);
        const tok = data.tokens.find((x) => x.id === alert.tokenId);
        if (action === "pause") notify(t("atok.alerts.paused", { name: tok?.name || alert.tokenName }), tok ? { undo: { kind: "resume", token: tok } } : {});
        else if (action === "allow_ip") notify(t(tok && allowIpMode(tok) === "add" ? "atok.alerts.allowed" : "atok.alerts.trusted", { ip: alert.ip }));
        else notify(t("atok.alerts.dismissed"));
        loadList();
        if (alert.tokenId === selectedId) loadDetail(selectedId, { quiet: true });
      } catch (e) {
        fail(e);
      } finally {
        setBusyAlert(null);
      }
    },
    [data.tokens, patchToken, notify, fail, t, loadList, loadDetail, selectedId]
  );

  const saveAutoPause = useCallback(
    async (body, what) => {
      setAutoBusy(true);
      const prev = data.autoPause;
      setData((p) => ({ ...p, autoPause: body }));
      try {
        const r = await tokenApi.autoPause(body);
        setData((p) => ({ ...p, autoPause: r?.autoPause || body }));
        notify(what === "switch" ? t(body.enabled ? "atok.alerts.autoOn" : "atok.alerts.autoOff") : t("atok.alerts.rulesSaved"));
      } catch (e) {
        setData((p) => ({ ...p, autoPause: prev }));
        fail(e);
      } finally {
        setAutoBusy(false);
      }
    },
    [data.autoPause, notify, fail, t]
  );

  const inspectCalls = useCallback((id) => {
    setSelectedId(id);
    requestAnimationFrame(() => callsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }));
  }, []);

  /* ---------------- render ---------------- */

  const header = (
    <header className="atk-head">
      <div className="atk-head-t">
        <nav className="atk-crumb" aria-label={t("atok.title")}>
          <span>{t("atok.crumbRoot")}</span>
          <ChevronRight size={12} aria-hidden="true" />
          <span>{t("atok.crumbGroup")}</span>
          <ChevronRight size={12} aria-hidden="true" />
          <b>{t("atok.title")}</b>
        </nav>
        <h1>
          {t("atok.title")} <span className="atk-tag is-acc">{t("atok.ownerOnly")}</span>
        </h1>
        <p className="atk-lead">{t("atok.lead")}</p>
        <div className="atk-badges">
          <span className="atk-bdg">
            <Shield size={12} aria-hidden="true" />
            {viewerUsername ? t("atok.badge.owner", { name: viewerUsername }) : t("atok.badge.ownerAnon")}
          </span>
          <span className="atk-bdg">
            <Lock size={12} aria-hidden="true" />
            {t("atok.badge.twofa")}
          </span>
          <span className="atk-bdg">
            <KeyRound size={12} aria-hidden="true" />
            {t("atok.badge.hash")}
          </span>
          <span className="atk-bdg is-warn">
            <AlertTriangle size={12} aria-hidden="true" />
            {t("atok.badge.full")}
          </span>
        </div>
      </div>
      <div className="atk-head-a">
        <button type="button" className="atk-btn" onClick={openApi} disabled={!data.available} data-testid="atk-openapi">
          <FileText size={15} />
          {t("atok.openapi")}
        </button>
        <button type="button" className="atk-btn is-dan" onClick={() => setPanicOpen(true)} disabled={!data.available || data.loading || !liveCount} data-testid="atk-panic-open">
          <AlertCircle size={15} />
          {t("atok.panicBtn")}
        </button>
        <button type="button" className="atk-btn is-pri" onClick={() => setCreate({ open: true, preset: null })} disabled={!data.available || data.loading} data-testid="atk-create-open">
          <Plus size={15} />
          {t("atok.newToken")}
        </button>
      </div>
    </header>
  );

  let body;
  if (!data.available) {
    body = (
      <section className="atk-glass atk-state" data-testid="atk-setup">
        <span className="atk-state-ic is-amber" aria-hidden="true">
          <Database size={24} />
        </span>
        <h2>{t("atok.setup.title")}</h2>
        <p>{t("atok.setup.body")}</p>
        <p className="atk-sub">{t("atok.setup.step")}</p>
        <button type="button" className="atk-btn" onClick={() => { setData(EMPTY); loadList(); }}>
          <RefreshCw size={14} />
          {t("atok.setup.retry")}
        </button>
      </section>
    );
  } else if (data.err && !data.tokens.length) {
    body = (
      <section className="atk-glass atk-state" data-testid="atk-error">
        <span className="atk-state-ic is-red" aria-hidden="true">
          <AlertCircle size={24} />
        </span>
        <h2>{t("atok.fail.title")}</h2>
        <p>{t(errorKey(data.err))}</p>
        <button type="button" className="atk-btn" onClick={() => { setData(EMPTY); loadList(); }}>
          <RefreshCw size={14} />
          {t("atok.retry")}
        </button>
      </section>
    );
  } else if (!data.loading && !data.tokens.length) {
    body = (
      <section className="atk-glass atk-state is-empty" data-testid="atk-empty">
        <span className="atk-state-ic" aria-hidden="true">
          <KeyRound size={26} />
        </span>
        <h2>{t("atok.empty.title")}</h2>
        <p>{t("atok.empty.body")}</p>
        <ul className="atk-state-list">
          <li>
            <Lock size={13} aria-hidden="true" />
            {t("atok.empty.p1")}
          </li>
          <li>
            <Shield size={13} aria-hidden="true" />
            {t("atok.empty.p2")}
          </li>
          <li>
            <Activity size={13} aria-hidden="true" />
            {t("atok.empty.p3")}
          </li>
        </ul>
        <button type="button" className="atk-btn is-pri" onClick={() => setCreate({ open: true, preset: null })} data-testid="atk-empty-cta">
          <Plus size={15} />
          {t("atok.empty.cta")}
        </button>
      </section>
    );
  } else {
    body = (
      <>
        <section className="atk-glass atk-strip" aria-label={t("atok.title")} data-testid="atk-strip">
          <div>
            <span className="l">
              <KeyRound size={13} aria-hidden="true" />
              {t("atok.stat.active")}
            </span>
            <span className="v tnum">{data.loading ? <Skel w={30} h={20} /> : f.n(activeN)}</span>
            <span className="s">{data.loading ? null : t("atok.stat.activeSub", { total: f.n(totalN), n: f.n(activeN) })}</span>
          </div>
          <div>
            <span className="l">
              <Activity size={13} aria-hidden="true" />
              {t("atok.stat.req")}
            </span>
            <span className="v tnum">{data.loading ? <Skel w={60} h={20} /> : f.n(s.requests24h || 0)}</span>
            <span className={`s${delta > 0 ? " is-up" : ""}`}>
              {data.loading ? null : delta == null ? t("atok.stat.reqNoPrev") : delta > 0 ? t("atok.stat.reqUp", { n: f.n(delta) }) : delta < 0 ? t("atok.stat.reqDown", { n: f.n(-delta) }) : t("atok.stat.reqSame")}
            </span>
          </div>
          <div className="is-dn">
            <span className="l">
              <Gavel size={13} aria-hidden="true" />
              {t("atok.stat.dest")}
            </span>
            <span className="v tnum">{data.loading ? <Skel w={30} h={20} /> : f.n(destTotal || 0)}</span>
            <span className="s">{data.loading ? null : destParts.length ? destParts.map((p) => t(`atok.destKind.${p.kind}`, { n: f.n(p.n) })).join(" · ") : t("atok.stat.destNone")}</span>
          </div>
          <button type="button" className={`is-al${alertsN ? " has-alerts" : ""}`} onClick={() => alertsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" })} data-testid="atk-strip-alerts">
            <span className="l">
              <AlertTriangle size={13} aria-hidden="true" />
              {t("atok.stat.alerts")}
            </span>
            <span className="v tnum">{data.loading ? <Skel w={20} h={20} /> : f.n(alertsN)}</span>
            <span className="s">
              {data.loading
                ? null
                : kinds.length
                  ? kinds.length === 1
                    ? t(`atok.alertKind.${kinds[0]}`)
                    : t("atok.alertKind.join", { a: kinds.slice(0, -1).map((k) => t(`atok.alertKind.${k}`)).join(", "), b: t(`atok.alertKind.${kinds[kinds.length - 1]}`) })
                  : t("atok.stat.alertsNone")}
            </span>
          </button>
        </section>

        <div className="atk-grid">
          <div className="atk-side">
            <TokenList
              tokens={tokens}
              loading={data.loading}
              selectedId={selectedId}
              filter={filter}
              query={query}
              onFilter={setFilter}
              onQuery={setQuery}
              onSelect={select}
              onCreate={() => setCreate({ open: true, preset: null })}
              now={now}
            />
            <AlertsPanel
              panelRef={alertsRef}
              alerts={data.alerts}
              tokens={tokens}
              autoPause={data.autoPause}
              expiring={expiring}
              busyAlert={busyAlert}
              autoBusy={autoBusy}
              onAction={alertAction}
              onInspect={inspectCalls}
              onAutoPause={saveAutoPause}
              onRotate={(tok) => setRotateFor(tok)}
              now={now}
              loading={data.loading}
            />
          </div>
          <div className="atk-work" ref={workRef} data-testid="atk-work">
            {!selected ? (
              <section className="atk-glass atk-hero" aria-hidden="true">
                <div className="atk-hero-top">
                  <Skel w={44} h={44} r={12} />
                  <div className="atk-hero-t">
                    <Skel w="40%" h={18} />
                    <Skel w="30%" h={10} />
                  </div>
                </div>
                <Skel h={60} r={10} />
              </section>
            ) : (
              <>
                <TokenHero
                  token={selected}
                  usage={detailFor.usage}
                  now={now}
                  busy={busy}
                  onPause={() => setPaused(selected, true)}
                  onResume={() => setPaused(selected, false)}
                  onRotate={() => setRotateFor(selected)}
                  onIp={() => setIpFor({ token: selected, add: null })}
                  onAudit={() => gotoAudit({ q: selected.name })}
                  onRevoke={() => setRevokeFor(selected)}
                  onReplay={() => setCreate({ open: true, preset: sameSettings(selected) })}
                  onRestore={() => setRestoreFor(selected)}
                />
                <StateBanner token={selected} now={now} busy={busy} onResume={() => setPaused(selected, false)} onRestore={() => setRestoreFor(selected)} />
                {isLive(selected) ? <TokenAlertBanner alert={tokenAlert} token={selected} busy={busyAlert === tokenAlert?.id} onAction={alertAction} /> : null}
                {detailFor.err ? (
                  <p className="atk-err" role="alert">
                    {t(errorKey(detailFor.err))}
                    <button type="button" className="atk-link" onClick={() => loadDetail(selectedId)}>
                      {t("atok.retry")}
                    </button>
                  </p>
                ) : null}
                <div className="atk-row">
                  <UsageCard token={selected} usage={detailFor.usage} loading={detailFor.loading} />
                  <EndpointsCard token={selected} usage={detailFor.usage} loading={detailFor.loading} onEditIp={() => setIpFor({ token: selected, add: null })} onAddSeen={(ip) => setIpFor({ token: selected, add: ip })} />
                </div>
                <div className="atk-row" ref={callsRef}>
                  <CallsCard calls={calls} loading={detailFor.loading} live={isLive(selected)} hidden={!visible} freshIds={freshIds} onOpenAudit={(id) => gotoAudit({ entry: id })} />
                  <ConnectionCard
                    mcp={data.mcp}
                    usage={detailFor.usage}
                    secret={secretFor}
                    tab={snipTab}
                    onTab={setSnipTab}
                    onCopied={(ok) => notify(ok ? t("atok.copiedToast") : t("atok.copyFailed"), ok ? {} : { tone: "err" })}
                    onOpenapi={openApi}
                    onForget={() => setFresh(null)}
                  />
                </div>
                <AuditCard audit={detailFor.audit} loading={detailFor.loading} now={now} onOpenToken={() => gotoAudit({ q: selected.name })} onOpenEntry={(id) => gotoAudit({ entry: id })} />
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="atk" ref={rootRef} data-testid="admin-tokens">
      {header}
      {body}

      <CreateDrawer
        open={create.open}
        preset={create.preset}
        myIp={myIp}
        mcpUrl={data.mcp?.url}
        onOpenapi={openApi}
        onClose={() => setCreate({ open: false, preset: null })}
        onCreated={(r) => {
          if (!r?.token) return;
          patchToken(r.token);
          setSelectedId(r.token.id);
          if (r.secret) setFresh({ id: r.token.id, secret: r.secret, at: Date.now() });
          notify(t("atok.create.done"));
          setTimeout(loadList, 600);
        }}
      />
      <RotateDialog
        open={Boolean(rotateFor)}
        token={rotateFor}
        mcpUrl={data.mcp?.url}
        onOpenapi={openApi}
        onClose={() => setRotateFor(null)}
        onRotated={(r) => {
          if (r?.token) patchToken(r.token);
          if (r?.secret && r?.token) setFresh({ id: r.token.id, secret: r.secret, at: Date.now() });
          if (r?.token) setSelectedId(r.token.id);
          setTimeout(() => loadDetail(r?.token?.id || selectedId, { quiet: true }), 600);
        }}
      />
      <RevokeDialog
        open={Boolean(revokeFor)}
        token={revokeFor}
        onClose={() => setRevokeFor(null)}
        onRevoked={(r) => {
          const tok = r?.token || { ...revokeFor, status: "revoked" };
          patchToken(tok);
          if (fresh?.id === tok.id) setFresh(null);
          setRevokeFor(null);
          notify(t("atok.revoke.done", { name: tok.name }), { undo: { kind: "restore", token: tok } });
          setTimeout(loadList, 600);
        }}
      />
      <RestoreDialog
        open={Boolean(restoreFor)}
        token={restoreFor ? data.tokens.find((x) => x.id === restoreFor.id) || restoreFor : null}
        now={now}
        onClose={() => setRestoreFor(null)}
        onRestored={(r) => {
          if (r?.token) patchToken(r.token);
          setRestoreFor(null);
          notify(t("atok.restore.done", { name: r?.token?.name || restoreFor?.name || "" }));
          setTimeout(loadList, 600);
        }}
      />
      <PanicDialog
        open={panicOpen}
        tokens={tokens}
        onClose={() => setPanicOpen(false)}
        onDone={(r) => {
          setPanicOpen(false);
          setFresh(null);
          notify(t("atok.panic.done", { n: r?.revoked ?? liveCount }));
          loadList();
          if (selectedId) loadDetail(selectedId, { quiet: true });
        }}
      />
      <IpDialog
        open={Boolean(ipFor)}
        token={ipFor?.token || null}
        initialAdd={ipFor?.add || null}
        seen={detailFor.usage?.ips7d || []}
        myIp={myIp}
        onClose={() => setIpFor(null)}
        onSaved={(r, prev) => {
          const tok = ipFor?.token;
          if (r?.token) patchToken(r.token);
          setIpFor(null);
          notify(t("atok.ipdlg.done"), tok ? { undo: { kind: "ips", token: tok, prev } } : {});
          if (tok) loadDetail(tok.id, { quiet: true });
        }}
      />
      <Toast toast={toast} onUndo={runUndo} onClose={() => setToast(null)} />
    </div>
  );
}
