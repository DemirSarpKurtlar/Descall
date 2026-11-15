/**
 * Yönetici Paneli › Güvenlik Merkezi (remake, owner-approved Draft A "Komuta merkezi",
 * Nov 2026).
 *
 * A1: header (threat level, Ayar geçmişi, Uyarılar, Acil kilit), Güvenlik puanı with
 *     the checklist (apply a recommendation, 2FA reminder, how it is computed), Tehdit
 *     özeti (live KPIs, 24 h chart with the brute-force marker), Acil kilit modları +
 *     Kalıcı erişim ayarları, Canlı tehdit akışı (filters, pause, CSV, İncele / IP
 *     engelle / Yasakla), En çok deneme yapan kaynaklar (Engelle).
 * A2: Acil kilit başlat (LockDialog.jsx). A3: Ayar değişikliği geçmişi (HistoryDrawer.jsx).
 * Live: `admin:security` pushes on the admin socket (room joined with
 * `security:subscribe`), plus a 30 s poll. Bans of an account always open BanDialog;
 * source bans go through the access-ban endpoint. Addresses are masked everywhere.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, History, Lock, X } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { useAdminPerms } from "../dossier/adminPerms.js";
import BanDialog from "../BanDialog.jsx";
import { securityApi } from "./securityApi.js";
import { FeedCard, LockCard, ScoreCard, SourcesCard, ThreatCard } from "./SecurityCards.jsx";
import LockDialog from "./LockDialog.jsx";
import HistoryDrawer from "./HistoryDrawer.jsx";
import { AlertsPopover, EventDrawer, ExplainPopover, FixPopover, LockDetailPopover, ReasonPopover, SourceBanDialog } from "./SecurityDialogs.jsx";
import { Toast } from "./ui.jsx";
import { THREAT_TONE, errorKey, feedCsv, mergeEvents, patchNeedsReason } from "./securityModel.js";
import "../../../styles/admin-security.css";

const POLL_MS = 30 * 1000;
const DESKTOP_KEY = "descall:security-desktop-alerts";

function readDesktopPref() {
  try {
    return localStorage.getItem(DESKTOP_KEY) === "1";
  } catch {
    return false;
  }
}

export default function SecurityCenter({ socket = null, onNavigate, onOpenUser }) {
  const { t, locale } = useLocale();
  const perms = useAdminPerms();
  const canAccessBans = perms.can("accessBans");
  const canModerate = perms.can("moderation");

  const [ov, setOv] = useState(null);
  const [ovErr, setOvErr] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState(false);

  const [filter, setFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState(null); // { sourceRef, ipMasked }
  const [feed, setFeed] = useState({ events: [], loading: true, error: "", nextBefore: null });
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pending, setPending] = useState([]);
  const [moreBusy, setMoreBusy] = useState(false);

  const [lockDlg, setLockDlg] = useState(null); // { preselect }
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [eventId, setEventId] = useState(null);
  const [srcBan, setSrcBan] = useState(null); // { source, kind }
  const [banTarget, setBanTarget] = useState(null);
  const [pop, setPop] = useState(null); // { type, ...data }
  const popAnchor = useRef(null);
  const alertsRef = useRef(null);
  const [busyKey, setBusyKey] = useState(null);
  const [toast, setToast] = useState(null);
  const [desktopOn, setDesktopOn] = useState(readDesktopPref);

  const say = useCallback((text, tone = "ok") => setToast({ text, tone, at: Date.now() }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);
  const errText = useCallback((err) => {
    const key = errorKey(err);
    return key ? t(key) : err?.message || t("secCenter.err.generic");
  }, [t]);

  /* ---- data ---- */

  const loadOverview = useCallback(async () => {
    try {
      const d = await securityApi.overview();
      setOv(d);
      setOvErr("");
      setNow(Date.now());
    } catch (err) {
      setOvErr(err?.message || t("secCenter.err.load"));
    }
  }, [t]);

  const feedQuery = useMemo(() => ({ filter, sourceRef: sourceFilter?.sourceRef || null }), [filter, sourceFilter]);
  const loadFeed = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setFeed((f) => ({ ...f, loading: true, error: "" }));
    try {
      const d = await securityApi.events({ filter: feedQuery.filter, sourceRef: feedQuery.sourceRef, limit: 40 });
      setFeed({ events: d.events || [], loading: false, error: "", nextBefore: d.nextBefore || null });
      setPending([]);
    } catch (err) {
      setFeed((f) => ({ ...f, loading: false, error: err?.message || t("secCenter.err.load") }));
    }
  }, [feedQuery, t]);

  useEffect(() => {
    loadOverview();
    const id = window.setInterval(() => {
      loadOverview();
    }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 15000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [loadOverview]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Without a live socket the feed follows the poll.
  useEffect(() => {
    if (live || paused) return undefined;
    const id = window.setInterval(() => loadFeed({ quiet: true }), POLL_MS);
    return () => window.clearInterval(id);
  }, [live, paused, loadFeed]);

  /* ---- live ---- */

  const reloadSoon = useRef(null);
  const scheduleOverview = useCallback(() => {
    if (reloadSoon.current) return;
    reloadSoon.current = window.setTimeout(() => {
      reloadSoon.current = null;
      loadOverview();
    }, 2500);
  }, [loadOverview]);
  useEffect(() => () => reloadSoon.current && window.clearTimeout(reloadSoon.current), []);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const queryRef = useRef(feedQuery);
  queryRef.current = feedQuery;
  const desktopRef = useRef(desktopOn);
  desktopRef.current = desktopOn;

  useEffect(() => {
    if (!socket || typeof socket.on !== "function") return undefined;
    const subscribe = () => {
      try {
        socket.emit?.("security:subscribe");
      } catch {
        /* offline */
      }
      setLive(Boolean(socket.connected !== false));
    };
    const onPush = (p) => {
      if (!p || typeof p !== "object") return;
      setLive(true);
      if (p.type === "events" && Array.isArray(p.events)) {
        const q = queryRef.current;
        const fresh = p.events.filter((e) => !q.sourceRef || e.sourceRef === q.sourceRef);
        if (pausedRef.current) setPending((cur) => mergeEvents(cur, fresh, q.filter));
        else setFeed((f) => ({ ...f, events: mergeEvents(f.events, fresh, q.filter) }));
        const burst = p.events.find((e) => e.type === "brute_force");
        if (burst && desktopRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification(t("secCenter.alerts.notifyTitle"), { body: t("secCenter.alerts.notifyBody", { ip: burst.ipMasked || "" }), tag: `sec-${burst.id}` });
          } catch {
            /* notifications blocked */
          }
        }
        scheduleOverview();
      } else if (p.type === "settings") {
        scheduleOverview();
        setHistoryTick((n) => n + 1);
      }
    };
    const onDisconnect = () => setLive(false);
    subscribe();
    socket.on("admin:security", onPush);
    socket.on("connect", subscribe);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off?.("admin:security", onPush);
      socket.off?.("connect", subscribe);
      socket.off?.("disconnect", onDisconnect);
      try {
        socket.emit?.("security:unsubscribe");
      } catch {
        /* offline */
      }
    };
  }, [socket, scheduleOverview, t]);

  /* ---- actions ---- */

  const openPop = (type, el, data = {}) => {
    popAnchor.current = el;
    setPop({ type, ...data });
  };
  const closePop = () => setPop(null);

  const afterSettings = async (message) => {
    closePop();
    say(message);
    await loadOverview();
    setHistoryTick((n) => n + 1);
  };

  const applyPatch = async (patch, { reason, recommended, message }) => {
    await securityApi.patchSettings(patch, { reason, recommended });
    await afterSettings(message || t("secCenter.toast.saved"));
  };

  const onCheck = (check, kind, el) => {
    if (kind === "apply") openPop("fix", el, { check });
    else if (kind === "locks") document.querySelector('[data-testid="sc-lock-registration"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    else openPop("explain", el, { check });
  };

  const remind = async () => {
    try {
      const r = await securityApi.remind2fa();
      closePop();
      say(t("secCenter.toast.reminded", { n: r.missing, online: r.reached }));
    } catch (err) {
      say(errText(err), "err");
    }
  };

  const onToggleLock = (mode, on, el) => {
    if (on) setLockDlg({ preselect: mode });
    else openPop("lift", el, { modes: [mode] });
  };

  const onToggleSetting = async (key, on, el) => {
    const patch = { [key]: on };
    if (patchNeedsReason(patch)) {
      openPop("settingOff", el, { key });
      return;
    }
    setBusyKey(key);
    try {
      await applyPatch(patch, { message: t("secCenter.toast.saved") });
    } catch (err) {
      say(errText(err), "err");
    } finally {
      setBusyKey(null);
    }
  };

  const extendLock = async (mode, minutes) => {
    await securityApi.extendLock(mode, minutes);
    await afterSettings(t("secCenter.toast.extended"));
  };

  const onFeedAction = (action, e, el) => {
    if (action === "banIp") setSrcBan({ source: { sourceRef: e.sourceRef, ipMasked: e.ipMasked, netLabel: e.netLabel }, kind: "ip" });
    else if (action === "banUser") setBanTarget({ id: e.userId, username: e.username || "", displayName: e.username || "" });
    else if (action === "viewBan") onNavigate?.("accessBans");
    else setEventId(e.id);
  };

  const exportCsv = () => {
    const csv = feedCsv(feed.events, t, locale);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `descall-security-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const loadMore = async () => {
    if (!feed.nextBefore || moreBusy) return;
    setMoreBusy(true);
    try {
      const d = await securityApi.events({ filter: feedQuery.filter, sourceRef: feedQuery.sourceRef, before: feed.nextBefore, limit: 40 });
      setFeed((f) => ({ ...f, events: mergeEvents(f.events, d.events || [], feedQuery.filter, 1000), nextBefore: d.nextBefore || null }));
    } catch (err) {
      say(errText(err), "err");
    } finally {
      setMoreBusy(false);
    }
  };

  const setDesktop = async (on) => {
    if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
    const ok = on && typeof Notification !== "undefined" && Notification.permission === "granted";
    setDesktopOn(ok);
    try {
      localStorage.setItem(DESKTOP_KEY, ok ? "1" : "0");
    } catch {
      /* private mode */
    }
    if (on && !ok) say(t("secCenter.alerts.desktopBlocked"), "err");
  };

  const pickAlert = (a) => {
    closePop();
    if (a.kind === "burst" && a.eventId) setEventId(a.eventId);
    else if (a.kind === "lock" || a.kind === "lockOpen") document.querySelector(`[data-testid="sc-lock-${a.vars.mode}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (a.kind === "admin2fa") {
      const check = ov?.score?.checks.find((c) => c.id === "admin2fa");
      const el = document.querySelector('[data-testid="sc-check-admin2fa"]');
      if (check && el) openPop("explain", el, { check });
    } else if (a.kind === "failedSpike" || a.kind === "lockedSpike") setFilter("failedLogin");
  };

  /* ---- render ---- */

  const loading = !ov && !ovErr;
  const threat = ov?.threat || "normal";
  const settings = ov?.settings || null;
  const activeLocks = settings?.locks || {};
  const bannedRefs = useMemo(() => new Set((ov?.stats?.sources || []).filter((s) => s.banned).map((s) => s.sourceRef)), [ov]);
  const alerts = ov?.alerts || [];
  const fixes = (ov?.score?.checks || []).filter((c) => !c.ok && c.fix);
  const allFixes = Object.assign({}, ...fixes.map((c) => c.fix));
  const visibleEvents = feed.events;
  const counts = sourceFilter ? null : ov?.stats?.counts;

  return (
    <div className="sc" data-testid="security-center">
      <header className="sc-top">
        <div>
          <h1>{t("secCenter.title")}</h1>
          <div className="sc-crumb">{t("secCenter.subtitle")}</div>
        </div>
        <div className="sc-tr">
          <span className={`sc-lvl is-${THREAT_TONE[threat]}`} role="status" data-testid="sc-threat">
            <span className="sc-pulse" aria-hidden="true" />
            {t("secCenter.threatLevel", { level: t(`secCenter.level.${threat}`) })}
          </span>
          <button type="button" className="sc-btn" onClick={() => setHistoryOpen(true)} data-testid="sc-open-history">
            <History size={16} aria-hidden="true" />
            {t("secCenter.history")}
          </button>
          <button type="button" className="sc-btn" ref={alertsRef} onClick={() => (pop?.type === "alerts" ? closePop() : openPop("alerts", alertsRef.current))} aria-haspopup="dialog" aria-expanded={pop?.type === "alerts"} data-testid="sc-open-alerts">
            <Bell size={16} aria-hidden="true" />
            {t("secCenter.alertsBtn")}
            {alerts.length ? <em className="sc-badge tnum">{alerts.length}</em> : null}
          </button>
          <button type="button" className="sc-btn is-r" onClick={() => setLockDlg({ preselect: null })} data-testid="sc-open-lock">
            <Lock size={16} aria-hidden="true" />
            {t("secCenter.emergencyLock")}
          </button>
        </div>
      </header>

      {ovErr ? (
        <p className="sc-err is-banner" role="alert">
          {ovErr}{" "}
          <button type="button" className="sc-x-link" onClick={loadOverview}>
            {t("secCenter.retry")}
          </button>
        </p>
      ) : null}
      {ov && (!ov.persistent?.events || !ov.persistent?.history) ? <p className="sc-warnline">{t("secCenter.memoryOnly")}</p> : null}

      <div className="sc-g3">
        <ScoreCard t={t} locale={locale} score={ov?.score} loading={loading} onExplain={(ref) => openPop("explain", ref.current, { check: null })} onCheck={onCheck} />
        <ThreatCard t={t} locale={locale} stats={ov?.stats} now={now} live={live} loading={loading} onSpike={(id) => setEventId(id)} />
        <LockCard
          t={t}
          settings={settings}
          now={now}
          loading={loading}
          busyKey={busyKey}
          onToggleLock={onToggleLock}
          onLockDetail={(mode, el) => openPop("lockDetail", el, { mode })}
          onLiftAll={(el) => openPop("lift", el, { modes: Object.keys(activeLocks) })}
          onToggleSetting={onToggleSetting}
        />
        <div className="sc-feed-wrap">
          {sourceFilter ? (
            <div className="sc-srcfilter">
              {t("secCenter.feed.sourceFilter", { ip: sourceFilter.ipMasked || "" })}
              <button type="button" className="sc-ib" onClick={() => setSourceFilter(null)} aria-label={t("secCenter.feed.clearSource")}>
                <X size={13} />
              </button>
            </div>
          ) : null}
          <FeedCard
            t={t}
            locale={locale}
            now={now}
            counts={counts || { all: visibleEvents.length }}
            filter={filter}
            onFilter={(f) => setFilter(f)}
            events={visibleEvents}
            loading={feed.loading}
            error={feed.error}
            expanded={expanded}
            onToggleExpanded={() => setExpanded((v) => !v)}
            paused={paused}
            onTogglePaused={() => {
              if (paused && pending.length) setFeed((f) => ({ ...f, events: mergeEvents(f.events, pending, filter) }));
              if (paused) setPending([]);
              setPaused((v) => !v);
            }}
            newCount={paused ? pending.length : 0}
            onShowNew={() => {
              setFeed((f) => ({ ...f, events: mergeEvents(f.events, pending, filter) }));
              setPending([]);
            }}
            onAction={onFeedAction}
            onExport={exportCsv}
            onLoadMore={loadMore}
            canLoadMore={Boolean(feed.nextBefore)}
            loadingMore={moreBusy}
            actionCtx={{ bannedRefs, canAccessBans, canModerate }}
          />
        </div>
        <SourcesCard
          t={t}
          locale={locale}
          sources={ov?.stats?.sources}
          loading={loading}
          canBan={canAccessBans}
          onBan={(s) => setSrcBan({ source: s, kind: "ip" })}
          onOpen={(s) => {
            setSourceFilter({ sourceRef: s.sourceRef, ipMasked: s.ipMasked });
            setFilter("all");
            setExpanded(true);
          }}
        />
      </div>

      <LockDialog
        open={Boolean(lockDlg)}
        onClose={() => setLockDlg(null)}
        t={t}
        locale={locale}
        now={now}
        preselect={lockDlg?.preselect}
        activeLocks={activeLocks}
        needCode={ov?.totpEnforced !== false}
        onStarted={async (res) => {
          setLockDlg(null);
          say(t("secCenter.toast.locked", { n: res.started?.length || 0 }), "warn");
          await loadOverview();
          setHistoryTick((n) => n + 1);
        }}
      />

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        t={t}
        locale={locale}
        now={now}
        liveModes={Object.keys(activeLocks)}
        refreshKey={historyTick}
        onReverted={async () => {
          say(t("secCenter.toast.reverted"));
          await loadOverview();
        }}
      />

      <EventDrawer
        open={Boolean(eventId)}
        eventId={eventId}
        onClose={() => setEventId(null)}
        t={t}
        locale={locale}
        now={now}
        suspended={Boolean(srcBan || banTarget)}
        canAccessBans={canAccessBans}
        canModerate={canModerate}
        onBanSource={(source, kind) => setSrcBan({ source, kind })}
        onBanUser={(u) => setBanTarget({ id: u.id, username: u.username || "", displayName: u.username || "" })}
        onOpenUser={(id) => {
          setEventId(null);
          onOpenUser?.(id);
        }}
        onOpenAccessBans={() => {
          setEventId(null);
          onNavigate?.("accessBans");
        }}
        onFilterSource={(e) => {
          setEventId(null);
          setSourceFilter({ sourceRef: e.sourceRef, ipMasked: e.ipMasked });
          setFilter("all");
          setExpanded(true);
        }}
      />

      <SourceBanDialog
        open={Boolean(srcBan)}
        source={srcBan?.source}
        initialKind={srcBan?.kind || "ip"}
        t={t}
        onClose={() => setSrcBan(null)}
        onDone={async (res, kind) => {
          setSrcBan(null);
          say(t(kind === "network" ? "secCenter.toast.bannedNet" : "secCenter.toast.bannedIp", { kicked: res?.kicked || 0 }), "warn");
          await loadOverview();
        }}
      />

      <BanDialog
        open={Boolean(banTarget)}
        target={banTarget}
        defaultMessage={undefined}
        onClose={() => setBanTarget(null)}
        onBanned={({ message }) => {
          setBanTarget(null);
          say(message || t("secCenter.toast.userBanned"), "warn");
        }}
      />

      <FixPopover
        open={pop?.type === "fix"}
        anchorRef={popAnchor}
        onClose={closePop}
        t={t}
        locale={locale}
        check={pop?.check}
        score={ov?.score?.score || 0}
        allCount={fixes.length}
        onApply={() => applyPatch(pop.check.fix, { recommended: true, message: t("secCenter.toast.applied") })}
        onApplyAll={() => applyPatch(allFixes, { recommended: true, message: t("secCenter.toast.appliedAll", { n: fixes.length }) })}
      />
      <ExplainPopover open={pop?.type === "explain"} anchorRef={popAnchor} onClose={closePop} t={t} score={ov?.score} check={pop?.check} onRemind={remind} onLocks={() => { closePop(); document.querySelector('[data-testid="sc-lock-registration"]')?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
      <ReasonPopover
        open={pop?.type === "lift"}
        anchorRef={popAnchor}
        onClose={closePop}
        t={t}
        testId="sc-lift-pop"
        title={pop?.modes?.length > 1 ? t("secCenter.lift.titleAll", { n: pop.modes.length }) : t("secCenter.lift.title", { name: pop?.modes?.[0] ? t(`secCenter.lockMode.${pop.modes[0]}.name`) : "" })}
        text={t("secCenter.lift.body")}
        confirmLabel={t("secCenter.lift.go")}
        tone="p"
        onConfirm={async (reason) => {
          await securityApi.liftLocks(pop.modes, reason);
          await afterSettings(t("secCenter.toast.lifted"));
        }}
      />
      <ReasonPopover
        open={pop?.type === "settingOff"}
        anchorRef={popAnchor}
        onClose={closePop}
        t={t}
        testId="sc-off-pop"
        title={pop?.key ? t(`secCenter.perm.${pop.key === "dmEnabled" ? "dm" : "groups"}.offTitle`) : ""}
        text={pop?.key ? t(`secCenter.perm.${pop.key === "dmEnabled" ? "dm" : "groups"}.offBody`) : ""}
        confirmLabel={t("secCenter.perm.offGo")}
        onConfirm={async (reason) => {
          setBusyKey(pop.key);
          try {
            await applyPatch({ [pop.key]: false }, { reason, message: t("secCenter.toast.saved") });
          } finally {
            setBusyKey(null);
          }
        }}
      />
      <LockDetailPopover
        open={pop?.type === "lockDetail"}
        anchorRef={popAnchor}
        onClose={closePop}
        t={t}
        locale={locale}
        now={now}
        mode={pop?.mode}
        lock={pop?.mode ? activeLocks[pop.mode] : null}
        onExtend={extendLock}
        onLift={(mode) => setPop({ type: "lift", modes: [mode] })}
      />
      <AlertsPopover open={pop?.type === "alerts"} anchorRef={popAnchor} onClose={closePop} t={t} locale={locale} now={now} alerts={alerts} desktopOn={desktopOn} onDesktop={setDesktop} onPick={pickAlert} />
      <Toast toast={toast} />
    </div>
  );
}
