/**
 * Yönetici Paneli › Sistem (section system). Owner pick: Draft A "Kontrol merkezi"
 * (scratchpad system-drafts A1 / A2 / A3), built one to one:
 *   header      version chips (front end, server commit, host uptime), Yedeği indir,
 *               Güvenli yeniden başlat (drain steps, typed confirm, fresh code)
 *   tiles       CPU, RAM (RSS), event loop lag, sockets (+ edge), database, uptime
 *               with sparklines, polled every 5 s
 *   flags       table + editor drawer (platform, percent, team, reason, automatic
 *               rollback, try on my account, history with "Buna dön")
 *   edge        Cloudflare realtime: master, 14-day chart with stage markers, stages,
 *               platforms, team
 *   kill        switches by area (reason when something is cut off), slow mode,
 *               maintenance summary linking to Bakım
 *   bottom      limits, instant broadcast (preview, send, history), backup + the link
 *               to Moderasyon › İçerik filtreleri (the word filter lives there now)
 * Every change: undo toast (POST /system/history/:id/undo), shared settings history,
 * audit, admin room. Server: routes/adminSystem.js.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { apiBase } from "../../../lib/nodeRouting";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { BUILD_VERSION } from "../../../lib/appVersion";
import { adminRawFetch } from "../../../lib/adminStepUp";
import { getToken } from "../../../lib/storage";
import { Download, GitBranch, Layers, Power, RefreshCw, Undo2, X } from "../../ui/Icon.jsx";
import FlagDrawer, { FlagsHistoryDrawer } from "./FlagDrawer.jsx";
import { BackupCard, BroadcastCard, EdgeCard, FlagsCard, HealthTiles, KillCard, LimitsCard, MemoryAlert } from "./SystemCards.jsx";
import { BroadcastDialog, ConfirmDialog, RestartDialog, SwitchConfirm } from "./SystemDialogs.jsx";
import { bytesParts, cuttingKeys, liveForLabel, normalizeRule } from "./systemModel.js";
import "../../../styles/admin-system.css";

const HEALTH_MS = 5000;
const ERR_KEYS = {
  STEP_UP_REQUIRED: "sysx.err.stepUp",
  REASON_REQUIRED: "sysx.err.reason",
  BAD_PERCENT: "sysx.err.percent",
  SERVER_WIDE: "sysx.err.serverWide",
  STALE: "sysx.err.stale",
  ALREADY_REVERTED: "sysx.err.alreadyUndone",
  ADMIN_PERMISSION_DENIED: "sysx.err.permission",
  TEXT_TOO_LONG: "sysx.err.textLong",
};

export default function AdminSystem({ socket, onGoto }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [health, setHealth] = useState(null);
  const [edgeHist, setEdgeHist] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [drawerKey, setDrawerKey] = useState(null);
  const [histOpen, setHistOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [cut, setCut] = useState(null); // { patch, keys }
  const [resetOpen, setResetOpen] = useState(false);
  const [bcText, setBcText] = useState("");
  const [bcDialog, setBcDialog] = useState(null); // "preview" | "send"
  const [bcHistOpen, setBcHistOpen] = useState(false);
  const [bcRows, setBcRows] = useState(null);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const toastTimer = useRef(null);
  const reloadTimer = useRef(null);

  const notify = useCallback((text, { tone = "ok", undoId = null } = {}) => {
    setToast({ text, tone, undoId, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undoId ? 9000 : 4500);
  }, []);
  const fail = useCallback((e) => notify(t(ERR_KEYS[e?.code] || "sysx.err.generic"), { tone: "err" }), [notify, t]);

  const load = useCallback(async () => {
    try {
      const r = await adminFetch("/system/overview");
      setData(r);
      setHealth(r.health);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, []);
  const loadEdge = useCallback(() => {
    adminFetch("/system/edge/history")
      .then(setEdgeHist)
      .catch(() => setEdgeHist({ days: [], markers: [] }));
  }, []);
  const reloadSoon = useCallback(() => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      load();
      loadEdge();
    }, 400);
  }, [load, loadEdge]);

  useEffect(() => {
    load();
    loadEdge();
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(reloadTimer.current);
    };
  }, [load, loadEdge]);

  // Live tiles.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      adminFetch("/system/health")
        .then((h) => setHealth((prev) => ({ ...h, current: { ...h.current, availability: prev?.current?.availability ?? h.current.availability } })))
        .catch(() => {});
      setNow(Date.now());
    }, HEALTH_MS);
    return () => clearInterval(id);
  }, []);

  // Other admins' changes, restart progress, automatic rollbacks.
  useEffect(() => {
    if (!socket) return undefined;
    const on = (p) => {
      if (p?.type === "system_config" || p?.type === "chat_freeze") reloadSoon();
      if (p?.type === "system_restart") window.dispatchEvent(new CustomEvent("descall:system-restart", { detail: p }));
      if (p?.type === "system_flag_rollback") {
        notify(t("sysx.toast.rollback", { name: t(`sysx.flag.${p.key}.name`) }), { tone: "err" });
        reloadSoon();
      }
    };
    socket.on("admin:update", on);
    return () => socket.off("admin:update", on);
  }, [socket, reloadSoon, notify, t]);

  const flags = data?.flags || null;
  const drawerFlag = flags?.find((f) => f.key === drawerKey) || null;
  const flagName = (k) => t(`sysx.flag.${k}.name`);

  /* ---------------- actions ---------------- */

  const afterChange = useCallback(
    (r, text) => {
      if (r?.changed === false) {
        notify(t("sysx.toast.noChange"));
        return;
      }
      notify(text, { undoId: r?.entry?.id || null });
      reloadSoon();
    },
    [notify, reloadSoon, t]
  );

  const toggleFlag = async (key, on) => {
    setBusyKey(key);
    setData((d) => (d ? { ...d, flags: d.flags.map((f) => (f.key === key ? { ...f, on, rule: { ...f.rule, mode: on ? (f.rule.mode === "off" ? "all" : f.rule.mode) : "off" } } : f)) } : d));
    try {
      const r = await adminFetch(`/system/flags/${key}/toggle`, { method: "POST", body: JSON.stringify({ on }) });
      afterChange(r, t(on ? "sysx.toast.flagOn" : "sysx.toast.flagOff", { name: flagName(key) }));
    } catch (e) {
      fail(e);
      load();
    } finally {
      setBusyKey(null);
    }
  };

  const edgeStage = async (stage) => {
    setBusyKey("edge");
    try {
      const r = await adminFetch("/system/edge/stage", { method: "POST", body: JSON.stringify({ stage }) });
      afterChange(r, t("sysx.toast.stage", { stage: t(`sysx.stage.${stage}`) }));
    } catch (e) {
      fail(e);
    } finally {
      setBusyKey(null);
    }
  };

  const edgePlatform = async (p, on) => {
    const flag = flags?.find((f) => f.key === "edgeRealtime");
    if (!flag) return;
    const rule = normalizeRule(flag.rule);
    const cur = rule.platforms.length ? rule.platforms : ["web", "electron", "ios", "android"];
    const next = on ? [...cur, p] : cur.filter((x) => x !== p);
    setBusyKey("edge");
    try {
      const r = await adminFetch("/system/flags/edgeRealtime", { method: "PATCH", body: JSON.stringify({ rule: { ...rule, platforms: next } }) });
      afterChange(r, t("sysx.toast.saved"));
    } catch (e) {
      fail(e);
    } finally {
      setBusyKey(null);
    }
  };

  const sendSwitch = async (patch, reason = "") => {
    const key = Object.keys(patch)[0];
    setBusyKey(key);
    setData((d) => (d ? { ...d, switches: { ...d.switches, ...patch } } : d));
    try {
      const r = await adminFetch("/system/switches", { method: "PATCH", body: JSON.stringify({ patch, reason }) });
      const v = patch[key];
      afterChange(r, key === "slowModeSeconds" ? t("sysx.toast.slow", { n: v }) : t("sysx.toast.switched", { name: t(`sysx.sw.${key}`), state: t(v ? "sysx.state.on" : "sysx.state.off") }));
      setCut(null);
    } catch (e) {
      fail(e);
      load();
    } finally {
      setBusyKey(null);
    }
  };
  const onSwitch = (key, value) => {
    const patch = { [key]: value };
    const keys = cuttingKeys(patch);
    if (keys.length) setCut({ patch, keys });
    else sendSwitch(patch);
  };

  const saveLimits = async (patch, invalid) => {
    if (!patch) {
      notify(t("sysx.lim.invalid", { min: formatNumber(invalid.min, locale), max: formatNumber(invalid.max, locale) }), { tone: "err" });
      return;
    }
    setBusyKey("limits");
    try {
      const r = await adminFetch("/system/limits", { method: "PATCH", body: JSON.stringify({ patch }) });
      afterChange(r, t("sysx.toast.limits"));
    } catch (e) {
      fail(e);
      load();
    } finally {
      setBusyKey(null);
    }
  };
  const resetLimits = async () => {
    setBusyKey("limits");
    try {
      const r = await adminFetch("/system/limits/reset", { method: "POST", body: JSON.stringify({}) });
      setResetOpen(false);
      afterChange(r, t("sysx.toast.limitsReset"));
    } catch (e) {
      fail(e);
    } finally {
      setBusyKey(null);
    }
  };

  const undo = async (id) => {
    setToast(null);
    try {
      await adminFetch(`/system/history/${id}/undo`, { method: "POST", body: JSON.stringify({}) });
      notify(t("sysx.toast.undone"));
      reloadSoon();
    } catch (e) {
      fail(e);
    }
  };

  /** Memory backup as a file. Returns its size (bytes). */
  const downloadBackup = useCallback(
    async ({ reason = "" } = {}) => {
      const res = await adminRawFetch(`${apiBase()}/admin/system/backup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw Object.assign(new Error(b.error || "backup"), { code: b.code });
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "descall-backup.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return Number(res.headers.get("X-Backup-Bytes")) || blob.size;
    },
    []
  );
  const backupNow = async () => {
    setBusyKey("backup");
    try {
      const bytes = await downloadBackup();
      const b = bytesParts(bytes);
      notify(t("sysx.toast.backup", { size: t("sysx.bytes", { n: formatNumber(b.value, locale), unit: b.unit }) }));
      reloadSoon();
    } catch (e) {
      fail(e);
    } finally {
      setBusyKey(null);
    }
  };

  const sendBroadcast = async () => {
    const text = bcText.replace(/\s+/g, " ").trim();
    if (!text) return;
    setBusyKey("broadcast");
    try {
      const r = await adminFetch("/system/broadcast", { method: "POST", body: JSON.stringify({ text }) });
      setBcDialog(null);
      setBcText("");
      setBcRows(null);
      notify(t("sysx.toast.broadcast", { n: formatNumber(r.reach || 0, locale) }));
      setData((d) => (d ? { ...d, broadcast: { count: (d.broadcast?.count || 0) + 1, last: { at: r.at, reach: r.reach, text } } } : d));
    } catch (e) {
      fail(e);
    } finally {
      setBusyKey(null);
    }
  };
  const loadBroadcasts = () => {
    setBcRows(null);
    adminFetch("/system/broadcasts")
      .then((r) => setBcRows(r.entries || []))
      .catch(() => setBcRows([]));
  };

  /* ---------------- render ---------------- */

  const info = data?.info || {};
  // Header chip: this process (the uptime tile counts from the last real outage).
  const live = liveForLabel((info.uptimeSec || 0) + Math.max(0, (now - (Date.parse(data?.serverTime) || now)) / 1000));
  const front = BUILD_VERSION || info.version || "";
  const reach = health?.current?.sockets ?? 0;

  return (
    <div className="asx" data-testid="admin-system">
      <div className="asx-hdr">
        <div>
          <h1>{t("sysx.title")}</h1>
          <div className="asx-crumb">{t("sysx.crumb")}</div>
        </div>
        <div className="asx-rt">
          <div className="asx-ver" data-testid="sys-version">
            <span>
              <Layers size={16} />
              {t("sysx.ver.front", { v: front || "–" })}
            </span>
            <span>
              <GitBranch size={16} />
              {t("sysx.ver.server", { c: info.commit || t("sysx.ver.local") })}
            </span>
            <span>
              <i className={`asx-dot${health ? "" : " is-g"}`} />
              {t(info.host === "render" ? "sysx.ver.host" : "sysx.ver.hostLocal", { t: t(live.key, live.vars) })}
            </span>
          </div>
          <button type="button" className="asx-btn" onClick={backupNow} disabled={busyKey === "backup"} data-testid="sys-backup">
            <Download size={16} />
            {t("sysx.backupBtn")}
          </button>
          <button type="button" className="asx-btn is-danger" onClick={() => setRestartOpen(true)} data-testid="sys-restart">
            <Power size={16} />
            {t("sysx.restartBtn")}
          </button>
        </div>
      </div>

      {loadErr && !data ? (
        <div className="asx-err" role="alert">
          {t("sysx.err.load")}{" "}
          <button type="button" className="asx-link" onClick={load}>
            <RefreshCw size={14} /> {t("sysx.retry")}
          </button>
        </div>
      ) : null}

      <MemoryAlert alert={health?.memoryAlert} />
      <HealthTiles health={health} loading={!health} />

      <div className="asx-g3">
        <FlagsCard flags={flags} loading={!data} selected={drawerKey} busyKey={busyKey} onOpen={setDrawerKey} onToggle={toggleFlag} onHistory={() => setHistOpen(true)} now={now} />
        <EdgeCard
          edge={data?.edge}
          history={edgeHist}
          loading={!data}
          busy={busyKey === "edge" || busyKey === "edgeRealtime"}
          onMaster={(on) => toggleFlag("edgeRealtime", on)}
          onStage={edgeStage}
          onPlatform={edgePlatform}
          onOpen={() => setDrawerKey("edgeRealtime")}
        />
        <KillCard data={data} loading={!data} busyKey={busyKey} onSwitch={onSwitch} onSlow={(v) => sendSwitch({ slowModeSeconds: v })} onMaintenance={() => onGoto?.("maintenance")} now={now} />
      </div>

      <div className="asx-g3 is-bottom">
        <LimitsCard limits={data?.limits} loading={!data} busy={busyKey === "limits"} onSave={saveLimits} onReset={() => setResetOpen(true)} now={now} />
        <BroadcastCard
          data={data}
          text={bcText}
          setText={setBcText}
          busy={busyKey === "broadcast"}
          onPreview={() => setBcDialog("preview")}
          onSend={() => setBcDialog("send")}
          onHistory={loadBroadcasts}
          historyOpen={bcHistOpen}
          setHistoryOpen={setBcHistOpen}
          historyRows={bcRows}
          onGoto={(tab) => onGoto?.(tab)}
        />
        <BackupCard data={data} busy={busyKey === "backup"} onBackup={backupNow} onFilters={() => onGoto?.("moderation", { sub: "filters" })} />
      </div>

      {drawerFlag ? (
        <FlagDrawer
          flag={drawerFlag}
          totalUsers={data?.totalUsers}
          names={data?.names}
          onClose={() => setDrawerKey(null)}
          onError={fail}
          onSaved={(r, { key, kind }) => afterChange(r, t(kind === "restore" ? "sysx.toast.restored" : "sysx.toast.flagSaved", { name: flagName(key) }))}
        />
      ) : null}
      <FlagsHistoryDrawer
        open={histOpen}
        onClose={() => setHistOpen(false)}
        onOpenFlag={(k) => {
          setHistOpen(false);
          setDrawerKey(k);
        }}
      />
      <RestartDialog open={restartOpen} onClose={() => setRestartOpen(false)} onBackup={downloadBackup} onDone={reloadSoon} />
      <SwitchConfirm open={Boolean(cut)} keys={cut?.keys} busy={Boolean(busyKey)} onClose={() => setCut(null)} onConfirm={(reason) => sendSwitch(cut.patch, reason)} />
      <ConfirmDialog open={resetOpen} title={t("sysx.lim.resetTitle")} body={t("sysx.lim.resetBody")} confirmLabel={t("sysx.lim.reset")} busy={busyKey === "limits"} onClose={() => setResetOpen(false)} onConfirm={resetLimits} />
      <BroadcastDialog open={Boolean(bcDialog)} mode={bcDialog} text={bcText.trim()} reach={reach} busy={busyKey === "broadcast"} onClose={() => setBcDialog(null)} onSend={sendBroadcast} />

      {toast ? (
        <div className={`asx-toast is-${toast.tone}`} role="status" aria-live="polite" key={toast.id} data-testid="sys-toast">
          <span>{toast.text}</span>
          {toast.undoId ? (
            <button type="button" className="asx-link" onClick={() => undo(toast.undoId)} data-testid="sys-undo">
              <Undo2 size={14} />
              {t("sysx.toast.undo")}
            </button>
          ) : null}
          <button type="button" className="asx-xbtn is-sm" onClick={() => setToast(null)} aria-label={t("sysx.close")}>
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
