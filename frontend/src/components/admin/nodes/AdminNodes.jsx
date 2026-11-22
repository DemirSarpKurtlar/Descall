/**
 * Yönetici Paneli › Sunucu Ağı (owner only). Owner pick: Draft A "Kontrol merkezi"
 * (scratchpad hibrit-sunucu-taslaklar.html#a), built one to one:
 *   header   breadcrumb, "Yalnızca sahip", mode / Key Value / leader / live chips,
 *            Yenile, Düğüm anahtarları
 *   banners  emergency (everyone on Render), Key Value unreachable, single-node mode,
 *            migration not applied
 *   row 1    KPI: Render RAM, PC RAM with its role pill, connections split, capacity estimate
 *   row 2    memory of both nodes and latency / error rate, last hour, live
 *   row 3    PC share (sliders, load rule, Apply, capacity preview), game mode + weekly
 *            plan, quick actions (drain, all to Render, failover drill, node keys)
 *   row 4    events table | phone alerts + saved-cost line
 *   setup    PC never registered / single-node mode: the setup steps
 * Live: the owner room push `admin:nodes` every 5 s while the tab is open (watch /
 * unwatch), polling as the fallback; metrics refetched every 30 s and the newest point
 * added from each push. Every change goes through adminFetch (2FA step-up prompt).
 * Server: /api/admin/nodes (backend/routes/adminNodes.js).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Database, KeyRound, Lock, Network, RefreshCw, Shield, WifiOff, AlertCircle } from "../../ui/Icon.jsx";
import { Skel, Toast } from "../tokens/TokenUi.jsx";
import { ActionsPanel, AlertsCard, Banner, EventsCard, GamePanel, KpiRow, LatencyChart, MemoryChart, SavedCard, SetupCard, SharePanel, useNx } from "./NodeCards.jsx";
import { DrainDialog, DrillDialog, EmergencyDialog, KeysDrawer, RevokeKeyDialog, ScheduleDialog } from "./NodeDialogs.jsx";
import { nodeApi } from "./nodeApi.js";
import { METRICS_POLL_MS, POLL_MS, PUSH_FALLBACK_MS, agoLabel, appendLive, chartSeries, draftOf, errorKey, pickNodes, sharePatch, viewState } from "./nodeModel.js";
import "../../../styles/admin-tokens.css";
import "../../../styles/admin-nodes.css";

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

export default function AdminNodes({ socket, onGoto }) {
  const f = useNx();
  const { t } = f;
  const visible = usePageVisible();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [series, setSeries] = useState({});
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [draft, setDraft] = useState(() => draftOf(null));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [dlg, setDlg] = useState(null); // drain | emergency | drill | plan
  const [keys, setKeys] = useState({ open: false, create: false, refresh: 0 });
  const [revokeFor, setRevokeFor] = useState(null);
  const [lastDrill, setLastDrill] = useState(null);
  const lastPush = useRef(0);
  const setupRef = useRef(null);
  const toastTimer = useRef(null);
  const seq = useRef(0);

  const notify = useCallback((text, tone = "ok") => {
    setToast({ text, tone, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  const fail = useCallback((e) => notify(t(errorKey(e)), "err"), [notify, t]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const accept = useCallback((d) => {
    if (!d || typeof d !== "object") return;
    setData(d);
    setErr(null);
    setSeries((s) => appendLive(s, d, Date.parse(d.at || "") || Date.now()));
  }, []);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const d = await nodeApi.overview();
      if (my === seq.current) accept(d);
    } catch (e) {
      if (my === seq.current) setErr(e);
    }
  }, [accept]);

  const loadMetrics = useCallback(async () => {
    try {
      const d = await nodeApi.metrics(60);
      setSeries((s) => {
        const next = { ...(d?.series || {}) };
        // Keep live points newer than the fetched ones.
        for (const [id, list] of Object.entries(s)) {
          const last = next[id]?.[next[id].length - 1]?.t || 0;
          next[id] = [...(next[id] || []), ...list.filter((x) => x.t > last)];
        }
        return next;
      });
    } catch {
      /* the chart keeps its points; next refresh retries */
    } finally {
      setMetricsLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    loadMetrics();
  }, [load, loadMetrics]);

  // Live: owner room push every 5 s; polling only when no push arrived lately.
  useEffect(() => {
    if (!socket) return undefined;
    const onData = (d) => {
      lastPush.current = Date.now();
      accept(d);
    };
    const onAlert = (a) => {
      notify(t(`anodes.alertToast.${a?.kind === "kvFull" && a?.reason === "down" ? "kvDown" : a?.kind || "pcDown"}`, { pct: f.n(a?.vars?.pct) }), "err");
      load();
    };
    const watch = () => socket.emit("admin:nodes:watch");
    socket.on("admin:nodes", onData);
    socket.on("admin:nodes-alert", onAlert);
    socket.on("connect", watch);
    watch();
    return () => {
      socket.off("admin:nodes", onData);
      socket.off("admin:nodes-alert", onAlert);
      socket.off("connect", watch);
      socket.emit("admin:nodes:unwatch");
    };
  }, [socket, accept, load, notify, t, f]);

  useEffect(() => {
    if (!visible) return undefined;
    const id = setInterval(() => {
      if (Date.now() - lastPush.current > PUSH_FALLBACK_MS) load();
    }, POLL_MS);
    const m = setInterval(loadMetrics, METRICS_POLL_MS);
    return () => {
      clearInterval(id);
      clearInterval(m);
    };
  }, [visible, load, loadMetrics]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  // The sliders follow the saved config until the owner touches them.
  useEffect(() => {
    if (data?.cfg && !touched) setDraft(draftOf(data.cfg));
  }, [data?.cfg, touched]);

  /* ---------------- derived ---------------- */

  const loading = !data && !err;
  const view = viewState(data);
  const chart = useMemo(() => chartSeries(series, data, now), [series, data, now]);
  const patch = data ? sharePatch(data.cfg, draft) : null;
  const hybridOff = view === "single" || view === "kvDown";
  const { pc } = pickNodes(data);

  /* ---------------- actions ---------------- */

  const saveCfg = useCallback(
    async (body, key, doneText) => {
      setBusy(key);
      try {
        const r = await nodeApi.saveCfg(body);
        setData((d) => (d && r?.cfg ? { ...d, cfg: r.cfg } : d));
        notify(doneText || t("anodes.toast.saved"));
        setTimeout(load, 500);
        return r;
      } catch (e) {
        fail(e);
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [notify, fail, load, t]
  );

  const apply = async () => {
    if (!patch) return;
    try {
      await saveCfg(patch, "share", t("anodes.toast.applied", { gb: f.gb1(draft.ramMb), cores: f.n(draft.cores) }));
      setTouched(false);
    } catch {
      /* toast shown */
    }
  };

  const setDraftTouched = (fn) => {
    setTouched(true);
    setDraft(fn);
  };

  const resume = async () => {
    if (!pc) return;
    setBusy("resume");
    try {
      await nodeApi.resume(pc.id);
      notify(t("anodes.toast.resumed"));
      load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const testAlert = async () => {
    setBusy("test");
    try {
      const r = await nodeApi.testAlert();
      notify(t("anodes.toast.testSent", { n: f.n(r?.recipients || 1) }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const openRevokeKey = async () => {
    try {
      const d = await nodeApi.keys();
      const live = (d?.keys || []).filter((k) => k.status === "active");
      if (live.length === 1) setRevokeFor(live[0]);
      else setKeys({ open: true, create: false, refresh: 0 });
    } catch (e) {
      fail(e);
    }
  };

  const gotoSetup = () => setupRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });

  /* ---------------- render ---------------- */

  const kv = data?.kv;
  const header = (
    <header className="atk-head anx-head">
      <div className="atk-head-t">
        <nav className="atk-crumb" aria-label={t("anodes.title")}>
          <span>{t("anodes.crumbRoot")}</span>
          <ChevronRight size={12} aria-hidden="true" />
          <span>{t("anodes.crumbGroup")}</span>
          <ChevronRight size={12} aria-hidden="true" />
          <b>{t("anodes.title")}</b>
        </nav>
        <h1>
          {t("anodes.title")} <span className="atk-tag is-acc">{t("anodes.ownerOnly")}</span>
        </h1>
        <p className="atk-lead">{t("anodes.lead")}</p>
        <div className="atk-badges" data-testid="anx-chips">
          <span className={`atk-bdg${hybridOff ? " is-warn" : ""}`}>
            <Network size={12} aria-hidden="true" />
            {loading ? t("anodes.loading") : t(hybridOff ? "anodes.chip.single" : "anodes.chip.hybrid", { n: f.n(data?.nodes?.length || 1) })}
          </span>
          <span className={`atk-bdg${kv && !kv.ok && kv.configured ? " is-warn" : ""}`}>
            <Database size={12} aria-hidden="true" />
            {!kv ? t("anodes.dash") : kv.ok ? t("anodes.chip.kv", { used: f.d1(kv.usedMb), max: f.n(kv.maxMb) }) : t(kv.configured ? "anodes.chip.kvDown" : "anodes.chip.kvNone")}
          </span>
          <span className="atk-bdg">
            <Shield size={12} aria-hidden="true" />
            {t("anodes.chip.leader", { node: data?.leader || t("anodes.dash") })}
          </span>
          <span className="atk-bdg">
            <Lock size={12} aria-hidden="true" />
            {t("anodes.chip.twofa")}
          </span>
        </div>
      </div>
      <div className="atk-head-a">
        <span className={`atk-live${visible ? "" : " is-muted"}`} title={data?.at ? f.dt(data.at) : undefined}>
          {visible ? t("anodes.chip.updated", { when: f.L(agoLabel(data?.at, now)) }) : t("anodes.chip.paused")}
        </span>
        <button type="button" className="atk-btn" onClick={() => { load(); loadMetrics(); }} data-testid="anx-refresh">
          <RefreshCw size={15} />
          {t("anodes.refresh")}
        </button>
        <button type="button" className="atk-btn is-pri" onClick={() => setKeys({ open: true, create: false, refresh: 0 })} data-testid="anx-keys-btn">
          <KeyRound size={15} />
          {t("anodes.keysBtn")}
        </button>
      </div>
    </header>
  );

  if (err && !data) {
    return (
      <div className="atk anx" data-testid="admin-nodes">
        {header}
        <section className="atk-glass atk-state" data-testid="anx-error">
          <span className="atk-state-ic is-red" aria-hidden="true">
            <AlertCircle size={24} />
          </span>
          <h2>{t("anodes.fail.title")}</h2>
          <p>{t(errorKey(err))}</p>
          <button type="button" className="atk-btn" onClick={() => { setErr(null); load(); }}>
            <RefreshCw size={14} />
            {t("anodes.retry")}
          </button>
        </section>
      </div>
    );
  }

  const banners = (
    <>
      {data?.emergency ? (
        <Banner
          tone="bad"
          icon={AlertTriangle}
          title={t("anodes.banner.emgTitle")}
          testId="anx-emg-banner"
          action={
            <button type="button" className="atk-btn is-sm" onClick={resume} disabled={!pc || busy === "resume"} data-testid="anx-emg-resume">
              {t("anodes.act.resume")}
            </button>
          }
        >
          {t("anodes.banner.emgBody", { by: data.emergency.by || t("anodes.dash"), when: f.dt(data.emergency.at), reason: data.emergency.reason || t("anodes.dash") })}
        </Banner>
      ) : null}
      {view === "kvDown" ? (
        <Banner tone="bad" icon={WifiOff} title={t("anodes.banner.kvTitle")} testId="anx-kv-banner" action={<button type="button" className="atk-btn is-sm" onClick={load}>{t("anodes.retry")}</button>}>
          {t("anodes.banner.kvBody")}
        </Banner>
      ) : null}
      {view === "single" ? (
        <Banner tone="info" icon={Database} title={t("anodes.banner.singleTitle")} testId="anx-single-banner" action={<button type="button" className="atk-btn is-sm" onClick={gotoSetup}>{t("anodes.banner.steps")}</button>}>
          {t("anodes.banner.singleBody")}
        </Banner>
      ) : null}
      {data && data.storage && !data.storage.ok ? (
        <Banner tone="med" icon={Database} title={t("anodes.banner.dbTitle")} testId="anx-db-banner">
          {t("anodes.banner.dbBody")}
        </Banner>
      ) : null}
    </>
  );

  const showSetup = view === "single" || view === "noPc" || view === "pcOff" || view === "kvDown";

  return (
    <div className="atk anx" data-testid="admin-nodes" data-view={view}>
      {header}
      {banners}
      <KpiRow data={data} loading={loading} draft={touched ? draft : null} onSetup={gotoSetup} />
      <div className="anx-g2">
        <MemoryChart chart={chart} data={data} loading={loading || !metricsLoaded} />
        <LatencyChart chart={chart} loading={loading || !metricsLoaded} />
      </div>
      {showSetup && data ? <SetupCard data={data} view={view} cardRef={setupRef} onCreateKey={() => setKeys({ open: true, create: true, refresh: 0 })} /> : null}
      <div className="anx-g3">
        {loading ? (
          [0, 1, 2].map((k) => (
            <section key={k} className="atk-glass anx-card" aria-hidden="true">
              <Skel w="40%" h={16} />
              <Skel h={12} />
              <Skel h={12} />
              <Skel h={32} r={10} />
            </section>
          ))
        ) : (
          <>
            <SharePanel data={data} draft={draft} setDraft={setDraftTouched} dirty={Boolean(patch)} busy={busy === "share"} disabled={false} onApply={apply} onReset={() => { setTouched(false); setDraft(draftOf(data?.cfg)); }} />
            <GamePanel data={data} busyKey={busy} disabled={false} onPatch={(body, key) => saveCfg(body, key).catch(() => {})} onEditPlan={() => setDlg("plan")} />
            <ActionsPanel
              data={data}
              disabled={hybridOff}
              lastDrill={lastDrill}
              onDrain={() => setDlg("drain")}
              onResume={resume}
              onEmergency={() => setDlg("emergency")}
              onDrill={() => setDlg("drill")}
              onKeys={() => setKeys({ open: true, create: false, refresh: 0 })}
              onRevokeKey={openRevokeKey}
            />
          </>
        )}
      </div>
      <div className="anx-g31">
        <EventsCard events={data?.events} loading={loading} onAudit={onGoto ? () => onGoto("audit", { q: "system_node" }) : null} />
        <div className="anx-side">
          <AlertsCard data={data} busyKey={busy} disabled={loading} onToggle={(k, v) => saveCfg({ alerts: { [k]: v } }, `al-${k}`, t(v ? "anodes.toast.alertOn" : "anodes.toast.alertOff")).catch(() => {})} onTest={testAlert} />
          <SavedCard data={data} loading={loading} />
        </div>
      </div>

      <DrainDialog
        open={dlg === "drain"}
        data={data}
        onClose={() => setDlg(null)}
        onDone={(r) => {
          setDlg(null);
          notify(t("anodes.toast.draining", { n: f.n(r?.moving || 0) }));
          load();
        }}
      />
      <EmergencyDialog
        open={dlg === "emergency"}
        data={data}
        onClose={() => setDlg(null)}
        onDone={(r) => {
          setDlg(null);
          notify(t("anodes.toast.emergency", { n: f.n(r?.moving || 0) }));
          load();
        }}
      />
      <DrillDialog
        open={dlg === "drill"}
        data={data}
        onClose={() => setDlg(null)}
        onDone={(r) => {
          setLastDrill(r);
          load();
        }}
      />
      <ScheduleDialog
        open={dlg === "plan"}
        schedule={data?.cfg?.schedule}
        onClose={() => setDlg(null)}
        onSave={async (body) => {
          await saveCfg(body, "plan", t("anodes.toast.planSaved"));
          setDlg(null);
        }}
      />
      <KeysDrawer
        open={keys.open}
        startCreate={keys.create}
        refresh={keys.refresh}
        onClose={() => setKeys((k) => ({ ...k, open: false }))}
        onChanged={load}
        onRevoke={(k) => setRevokeFor(k)}
      />
      <RevokeKeyDialog
        open={Boolean(revokeFor)}
        keyRow={revokeFor}
        onClose={() => setRevokeFor(null)}
        onDone={(r) => {
          setRevokeFor(null);
          setKeys((k) => ({ ...k, refresh: k.refresh + 1 }));
          notify(t("anodes.toast.revoked", { name: r?.key?.name || "" }));
          load();
        }}
      />
      <Toast toast={toast} onUndo={() => {}} onClose={() => setToast(null)} />
    </div>
  );
}
