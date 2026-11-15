/**
 * Sistem dialogs:
 *  - RestartDialog      (Draft A frame A3) drain steps, options, reason, typed confirm,
 *                       users' strip preview, recent restarts, maintenance warning, then
 *                       live progress until the new process answers
 *  - SwitchConfirm      a kill switch that cuts something off: effect + reason
 *  - BroadcastDialog    preview (desktop + phone) and send with the live reach
 *  - ConfirmDialog      plain yes / no with an optional reason (limits reset)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { formatAppDateTime } from "../../../lib/datetime";
import { AlertTriangle, Check as CheckIcon, Megaphone, Monitor, Power, RefreshCw, Send, Smartphone } from "../../ui/Icon.jsx";
import { Check, Dialog, Skel } from "./SystemUi.jsx";
import { bytesParts, clock, maintenanceSoon, restartReady, restartStepRows } from "./systemModel.js";

function when(at, locale) {
  return formatAppDateTime(at, locale, { day: "numeric", month: "short", year: undefined, hour: "2-digit", minute: "2-digit", second: undefined });
}

/* ---------------- safe restart ---------------- */

const STEP_TIME = { stop: "sysx.rs.time.now", notify: "sysx.sec", drain: "sysx.rs.time.drain", backup: null, exit: "sysx.rs.time.exit" };

export function RestartDialog({ open, onClose, onBackup, onDone }) {
  const { t, locale } = useLocale();
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [backupFirst, setBackupFirst] = useState(true);
  const [notifyTeam, setNotifyTeam] = useState(true);
  const [skipCountdown, setSkipCountdown] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("form"); // form | backup | running | waiting | back | failed
  const [run, setRun] = useState(null);
  const [err, setErr] = useState("");
  const [back, setBack] = useState(null);
  const [tick, setTick] = useState(0);
  const bootRef = useRef(null);
  const exitAtRef = useRef(null);
  const word = t("sysx.rs.confirmWord");

  const load = useCallback(() => {
    setLoadErr(false);
    adminFetch("/system/restart")
      .then((r) => {
        setInfo(r);
        bootRef.current = r.info?.bootId || null;
        if (r.run) {
          setRun(r.run);
          setPhase("running");
        }
      })
      .catch(() => setLoadErr(true));
  }, []);

  useEffect(() => {
    if (!open) return;
    setPhase("form");
    setRun(null);
    setErr("");
    setBack(null);
    setReason("");
    setTyped("");
    setSkipCountdown(false);
    load();
  }, [open, load]);

  // Preview countdown on the right (loops while the form is open).
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Live progress from the admin room while this socket is still connected.
  useEffect(() => {
    if (!open) return undefined;
    const on = (e) => {
      const p = e.detail;
      if (p?.run) {
        setRun(p.run);
        if (p.run.phase === "exit") exitAtRef.current = exitAtRef.current || new Date().toISOString();
      }
    };
    window.addEventListener("descall:system-restart", on);
    return () => window.removeEventListener("descall:system-restart", on);
  }, [open]);

  // After the start: poll the health endpoint until another process answers.
  useEffect(() => {
    if (!open || (phase !== "running" && phase !== "waiting")) return undefined;
    let alive = true;
    const id = setInterval(async () => {
      try {
        const h = await adminFetch("/system/health");
        if (!alive) return;
        if (h.restart) setRun(h.restart);
        if (bootRef.current && h.bootId && h.bootId !== bootRef.current) {
          const backAt = new Date().toISOString();
          const exitAt = exitAtRef.current || backAt;
          setBack({ at: backAt, sec: Math.max(0, Math.round((Date.parse(backAt) - Date.parse(exitAt)) / 1000)) });
          setPhase("back");
          onDone?.();
        }
      } catch {
        if (!alive) return;
        exitAtRef.current = exitAtRef.current || new Date().toISOString();
        setPhase("waiting");
      }
    }, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [open, phase, onDone]);

  const ready = restartReady({ reason, typed, word, busy }) && phase === "form";

  const go = async () => {
    if (!ready) return;
    setBusy(true);
    setErr("");
    try {
      let backupBytes = null;
      if (backupFirst) {
        setPhase("backup");
        backupBytes = await onBackup({ reason });
      }
      const r = await adminFetch("/system/restart", { method: "POST", body: JSON.stringify({ reason, confirm: typed, notifyTeam, skipCountdown, backupBytes }) });
      bootRef.current = r.bootId || bootRef.current;
      setRun(r.run);
      setPhase("running");
    } catch (e) {
      setPhase("form");
      const map = { CONFIRM_MISMATCH: "sysx.err.confirm", REASON_REQUIRED: "sysx.err.reason", RESTART_RUNNING: "sysx.err.running", STEP_UP_REQUIRED: "sysx.err.stepUp" };
      setErr(t(map[e?.code] || "sysx.err.generic"));
    } finally {
      setBusy(false);
    }
  };

  const sockets = info?.sockets ?? 0;
  const edge = info?.edgeSockets ?? 0;
  const countdown = info?.countdownSec ?? 30;
  const rows = restartStepRows(run);
  const previewLeft = countdown - (tick % (countdown + 1));
  const soon = maintenanceSoon(info?.maintenance);
  const running = phase !== "form";

  const stepDesc = (key) => {
    if (key === "stop") return t("sysx.rs.step.stop.d");
    if (key === "notify") return t(skipCountdown ? "sysx.rs.step.notify.dSkip" : "sysx.rs.step.notify.d", { n: countdown });
    if (key === "drain") return t("sysx.rs.step.drain.d", { n: formatNumber(run?.socketsAtStart ?? sockets, locale) });
    if (key === "backup") return t(backupFirst ? "sysx.rs.step.backup.d" : "sysx.rs.step.backup.dSkip");
    return t("sysx.rs.step.exit.d");
  };
  const stepTime = (key) => {
    if (running) {
      const s = rows.find((r) => r.key === key);
      if (key === "drain" && s?.status === "active" && run) return t("sysx.rs.left", { n: formatNumber(run.socketsLeft, locale) });
      if (key === "backup" && run?.backupBytes) {
        const b = bytesParts(run.backupBytes);
        return t("sysx.bytes", { n: formatNumber(b.value, locale), unit: b.unit });
      }
      return s?.status === "done" ? t("sysx.rs.done") : s?.status === "active" ? t("sysx.rs.active") : "";
    }
    if (key === "notify") return skipCountdown ? t("sysx.rs.time.skipped") : t("sysx.sec", { n: countdown });
    if (key === "backup") return backupFirst ? t("sysx.rs.time.download") : t("sysx.rs.time.skipped");
    return t(STEP_TIME[key]);
  };

  const aside = (
    <>
      <div className="asx-lab">{t("sysx.rs.preview")}</div>
      <div className="asx-mock" aria-hidden="true">
        <div className="asx-mock-bar">
          <RefreshCw size={16} />
          {t("sysx.strip.text")}
          <b className="tnum">{clock(previewLeft)}</b>
        </div>
        <div className="asx-ln" style={{ width: "70%" }} />
        <div className="asx-ln" style={{ width: "50%" }} />
        <div className="asx-ln" style={{ width: "82%" }} />
        <div className="asx-ln" style={{ width: "40%", marginBottom: 14 }} />
      </div>
      <div className="asx-lab asx-mt16">{t("sysx.rs.recent")}</div>
      {!info ? (
        <Skel h={44} r={12} />
      ) : info.restarts?.length ? (
        info.restarts.map((r) => (
          <div className="asx-hi" key={r.id}>
            <b>
              {when(r.at, locale)} · {r.cause === "admin" && r.by ? `@${r.by}` : t(`sysx.rs.cause.${r.cause === "deploy" ? "auto" : r.cause}`)}
            </b>
            <small>
              {[r.cause === "deploy" ? t("sysx.rs.deploy", { v: r.version || r.commit || "" }) : r.reason, r.downtimeSec != null ? t(r.cause === "admin" ? "sysx.rs.downtime" : "sysx.sec", { n: r.downtimeSec }) : null]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </div>
        ))
      ) : (
        <p className="asx-empty-s">{info.persistent === false ? t("sysx.rs.noHistoryTable") : t("sysx.rs.noHistory")}</p>
      )}
      {soon ? (
        <div className="asx-warn">
          <AlertTriangle size={16} />
          <span>{t("sysx.rs.maintWarn", { date: when(info.maintenance.startsAt, locale) })}</span>
        </div>
      ) : null}
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy || phase === "backup"}
      icon={Power}
      tone="red"
      width={600}
      asideWidth={340}
      title={t("sysx.rs.title")}
      subtitle={
        info
          ? t(info.info?.service ? "sysx.rs.sub" : "sysx.rs.subNoSvc", {
              n: formatNumber(sockets, locale),
              e: formatNumber(edge, locale),
              svc: info.info?.service || "",
              min: info.estimate?.minSec ?? 40,
              max: info.estimate?.maxSec ?? 60,
            })
          : loadErr
            ? t("sysx.err.generic")
            : t("sysx.loading")
      }
      aside={aside}
      asideLabel={t("sysx.rs.preview")}
      testId="sys-restart-dialog"
    >
      <ol className="asx-steps">
        {rows.map((r) => (
          <li className={`asx-step is-${r.status}`} key={r.key}>
            <span className="n" aria-hidden="true">
              {r.status === "done" ? <CheckIcon size={12} /> : r.n}
            </span>
            <div>
              <b>{t(`sysx.rs.step.${r.key}.t`)}</b>
              <small>{stepDesc(r.key)}</small>
            </div>
            <em>{stepTime(r.key)}</em>
          </li>
        ))}
      </ol>
      {phase === "form" || phase === "backup" ? (
        <>
          <div className="asx-opts">
            <Check checked={backupFirst} onChange={setBackupFirst} disabled={busy}>
              {t("sysx.rs.backupFirst")}
            </Check>
            <Check checked={notifyTeam} onChange={setNotifyTeam} disabled={busy}>
              {t("sysx.rs.notifyTeam")}
            </Check>
            <Check checked={skipCountdown} onChange={setSkipCountdown} disabled={busy}>
              {t("sysx.rs.skipCountdown")}
            </Check>
          </div>
          <label className="asx-fld">
            <span className="asx-lab">{t("sysx.rs.reason")}</span>
            <input className="asx-inp is-text" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={t("sysx.rs.reasonPh")} disabled={busy} data-autofocus data-testid="sys-restart-reason" />
          </label>
          <label className="asx-fld">
            <span className="asx-lab">{t("sysx.rs.typeLabel", { word })}</span>
            <input
              className={`asx-typed${typed && !restartReady({ reason: "xxxxx", typed, word }) ? " is-bad" : ""}`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              aria-invalid={Boolean(typed) && !restartReady({ reason: "xxxxx", typed, word })}
              data-testid="sys-restart-typed"
            />
          </label>
          {err ? (
            <p className="asx-err" role="alert">
              {err}
            </p>
          ) : null}
          <div className="asx-row">
            <button type="button" className="asx-btn" onClick={onClose} disabled={busy}>
              {t("sysx.cancel")}
            </button>
            <button type="button" className="asx-btn is-danger" onClick={go} disabled={!ready} data-testid="sys-restart-go">
              <Power size={16} />
              {phase === "backup" ? t("sysx.rs.downloading") : t("sysx.rs.go")}
            </button>
          </div>
        </>
      ) : (
        <div className="asx-rs-live" aria-live="polite">
          <p className={`asx-hint${phase === "back" ? " is-green" : " is-blue"}`}>
            {phase === "back" ? t("sysx.rs.back", { n: back?.sec ?? 0 }) : phase === "waiting" ? t("sysx.rs.waiting") : t("sysx.rs.running")}
          </p>
          <div className="asx-row">
            <button type="button" className="asx-btn" onClick={onClose}>
              {t("sysx.close")}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ---------------- kill switch confirm ---------------- */

export function SwitchConfirm({ open, keys, onClose, onConfirm, busy }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const first = keys?.[0];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={AlertTriangle}
      tone="amber"
      width={480}
      title={first ? t(`sysx.cut.${first}.title`) : ""}
      subtitle={first ? t(`sysx.cut.${first}.body`) : ""}
      testId="sys-switch-confirm"
    >
      <label className="asx-fld">
        <span className="asx-lab">{t("sysx.rs.reason")}</span>
        <textarea className="asx-ta" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("sysx.cut.reasonPh")} data-autofocus data-testid="sys-switch-reason" />
      </label>
      <div className="asx-row">
        <button type="button" className="asx-btn" onClick={onClose} disabled={busy}>
          {t("sysx.cancel")}
        </button>
        <button type="button" className="asx-btn is-danger" onClick={() => onConfirm(reason)} disabled={busy || reason.trim().length < 3} data-testid="sys-switch-apply">
          {t("sysx.cut.apply")}
        </button>
      </div>
    </Dialog>
  );
}

/* ---------------- broadcast ---------------- */

export function BroadcastDialog({ open, mode, text, onClose, onSend, busy, reach }) {
  const { t, locale } = useLocale();
  const notice = t("sysx.bc.notice", { text });
  const nowLabel = useMemo(() => formatAppDateTime(new Date().toISOString(), locale, { day: undefined, month: undefined, year: undefined, hour: "2-digit", minute: "2-digit", second: undefined }), [locale]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Megaphone}
      tone="blue"
      width={640}
      title={t(mode === "send" ? "sysx.bc.sendTitle" : "sysx.bc.previewTitle")}
      subtitle={t("sysx.bc.reach", { n: formatNumber(reach ?? 0, locale) })}
      testId="sys-bc-dialog"
    >
      <div className="asx-lab">{t("sysx.bc.seen")}</div>
      <div className="asx-bc-pv">
        <div className="asx-pv-desk">
          <div className="asx-pv-cap">
            <Monitor size={14} />
            {t("sysx.bc.desktop")}
          </div>
          <div className="asx-mock is-desk">
            <div className="asx-ln" style={{ width: "60%" }} />
            <div className="asx-ln" style={{ width: "42%" }} />
            <div className="asx-toast-pv">
              <Megaphone size={14} />
              <span>{notice}</span>
            </div>
            <div className="asx-ln" style={{ width: "75%" }} />
          </div>
        </div>
        <div className="asx-pv-phone">
          <div className="asx-pv-cap">
            <Smartphone size={14} />
            {t("sysx.bc.phone")}
          </div>
          <div className="asx-ph">
            <div className="asx-ph-top">
              <span>{nowLabel}</span>
            </div>
            <div className="asx-toast-pv is-ph">
              <Megaphone size={12} />
              <span>{notice}</span>
            </div>
            <div className="asx-ln" style={{ width: "80%" }} />
            <div className="asx-ln" style={{ width: "55%" }} />
          </div>
        </div>
      </div>
      <p className="asx-hint">{t("sysx.bc.seenNote")}</p>
      <div className="asx-row">
        <button type="button" className="asx-btn" onClick={onClose} disabled={busy}>
          {t(mode === "send" ? "sysx.cancel" : "sysx.close")}
        </button>
        <button type="button" className="asx-btn is-p" onClick={onSend} disabled={busy || !text.trim()} data-autofocus data-testid="sys-bc-confirm">
          <Send size={16} />
          {t("sysx.bc.sendN", { n: formatNumber(reach ?? 0, locale) })}
        </button>
      </div>
    </Dialog>
  );
}

/* ---------------- plain confirm ---------------- */

export function ConfirmDialog({ open, title, body, confirmLabel, onClose, onConfirm, busy, tone = "blue", icon = AlertTriangle }) {
  const { t } = useLocale();
  return (
    <Dialog open={open} onClose={onClose} busy={busy} icon={icon} tone={tone} width={460} title={title} subtitle={body} testId="sys-confirm">
      <div className="asx-row">
        <button type="button" className="asx-btn" onClick={onClose} disabled={busy}>
          {t("sysx.cancel")}
        </button>
        <button type="button" className={`asx-btn ${tone === "red" ? "is-danger" : "is-p"}`} onClick={onConfirm} disabled={busy} data-autofocus>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
