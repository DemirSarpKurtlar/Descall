import { useCallback, useEffect, useState } from "react";
import { X, Minimize2, Undo2, RotateCcw, Loader2, AlertTriangle, Activity } from "../../ui/Icon.jsx";
import { reengageAdmin } from "../../../api/reengage";
import { liveBars } from "./reengageModel.js";

const REASONS = ["content", "audience", "timing", "other"];

/**
 * Growth 3B "Gönderimden sonra: canlı takip penceresi" (Canlı popup B language): live
 * counters, the delivered / opened / app / voice-or-wrote funnel, returners as they come,
 * the 30 s undo and recall of unopened messages with a reason. Closing keeps a small pill
 * in the corner. Polls every 3 s while open.
 */
export default function LiveWaveWindow({ waveId, minimized, onMinimize, onClose, onChanged, t, locale }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    reengageAdmin
      .wave(waveId)
      .then((r) => {
        setD(r);
        setErr("");
      })
      .catch(() => setErr(t("rg3.errors.load")));
  }, [waveId, t]);

  useEffect(() => {
    load();
    const id = window.setInterval(() => {
      load();
      setNow(Date.now());
    }, 3000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [load]);

  const w = d?.wave;
  const c = d?.counters || {};
  const undoLeft = w?.undo_until ? Math.max(0, Math.ceil((Date.parse(w.undo_until) - now) / 1000)) : 0;
  const title = w ? t("rg3.live.title", { name: t(`rg3.campaigns.${w.campaign_id}.name`) }) : t("rg3.live.titleShort");
  const sub = w ? t("rg3.live.sub", { label: w.label || "", count: w.audience }) : "";
  const rel = (iso) => {
    const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
    return mins < 1 ? t("rg3.preview.now") : t("rg3.live.minAgo", { count: mins });
  };

  if (minimized) {
    return (
      <button type="button" className="rg-livepill" onClick={() => onMinimize(false)} aria-label={title}>
        <i className="rg-livedot" aria-hidden="true" />
        {t("rg3.live.pill", { opened: c.opened || 0, back: c.openedApp || 0 })}
      </button>
    );
  }

  const undo = async () => {
    setBusy(true);
    try {
      await reengageAdmin.undo(waveId);
      load();
      onChanged?.();
    } catch {
      setErr(t("rg3.live.undoLate"));
    } finally {
      setBusy(false);
    }
  };
  const recall = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await reengageAdmin.recall(waveId, reason, note.trim());
      setDone(r);
      setReason(null);
      load();
      onChanged?.();
    } catch (e) {
      setErr(e?.code === "note_required" ? t("rg3.live.noteRequired") : t("rg3.errors.save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rg-live-win" role="dialog" aria-label={title}>
      <header>
        <i className={`rg-livedot${w?.status === "running" ? "" : " off"}`} aria-hidden="true" />
        <b>{title}</b>
        <small>{sub}</small>
        <button type="button" className="rg-icon-btn" onClick={() => onMinimize(true)} aria-label={t("rg3.live.minimize")}>
          <Minimize2 size={14} />
        </button>
        <button type="button" className="rg-icon-btn" onClick={onClose} aria-label={t("rg3.common.close")}>
          <X size={14} />
        </button>
      </header>
      {!d && !err ? <Loader2 size={18} className="rg-spin" /> : null}
      {err ? (
        <p className="rg-err" role="alert">
          <AlertTriangle size={13} /> {err}
        </p>
      ) : null}
      {d ? (
        <>
          {d.canUndo && undoLeft > 0 ? (
            <div className="rg-undo" role="status">
              <span>{t("rg3.live.undoIn", { s: undoLeft })}</span>
              <button type="button" className="rg-btn" onClick={undo} disabled={busy}>
                <Undo2 size={14} /> {t("rg3.live.undo")}
              </button>
            </div>
          ) : null}
          {w?.status === "cancelled" ? <p className="rg-note">{t("rg3.live.cancelled")}</p> : null}
          {w?.dry_run ? <p className="rg-note">{t("rg3.live.dry", { count: w.sent })}</p> : null}
          <div className="rg-bigc">
            <div>
              <small>{t("rg3.live.sent")}</small>
              <b>{c.sent || 0}</b>
            </div>
            <div>
              <small>{t("rg3.live.delivered")}</small>
              <b>{c.delivered || 0}</b>
            </div>
            <div>
              <small>{t("rg3.live.opened")}</small>
              <b className="blue">{c.opened || 0}</b>
            </div>
            <div className="ok">
              <small>{t("rg3.live.returned")}</small>
              <b className="green">{c.acted || 0}</b>
            </div>
          </div>
          <div className="rg-funnel">
            {liveBars(c).map((b) => (
              <div key={b.id}>
                <span>{t(`rg3.admin.f_${b.id}`)}</span>
                <i className={b.id === "acted" ? "green" : ""} style={{ width: `${Math.max(6, b.pct)}%` }}>
                  {b.value}
                </i>
              </div>
            ))}
          </div>
          <b className="rg-card-t">{t("rg3.live.returners")}</b>
          <div className="rg-rets">
            {d.returners.length ? (
              d.returners.map((r) => (
                <div key={`${r.userId}${r.at}`} className="rg-ret">
                  <span className="rg-mini-face">{(r.name || "?")[0]}</span>
                  <span className="tx">
                    <b>{r.name}</b> {t(`rg3.live.kind_${r.kind || "opened_app"}`)}
                  </span>
                  <time>{rel(r.at)}</time>
                </div>
              ))
            ) : (
              <p className="rg-empty sm">
                <Activity size={13} /> {t("rg3.live.noneYet")}
              </p>
            )}
          </div>
          {done ? (
            <p className="rg-ok" role="status">
              {t("rg3.live.recalled", { count: done.recalled, opened: done.opened })}
            </p>
          ) : w && w.status !== "recalled" && w.status !== "cancelled" && d.unopened > 0 ? (
            <div className="rg-recall">
              <b>
                <RotateCcw size={14} /> {t("rg3.live.recallTitle", { count: d.unopened })}
              </b>
              <div className="rg-reasons" role="radiogroup" aria-label={t("rg3.admin.reason")}>
                {REASONS.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={reason === r} className={reason === r ? "on" : ""} onClick={() => setReason(r)}>
                    {t(`rg3.admin.reason_${r}`)}
                  </button>
                ))}
              </div>
              {reason ? (
                <>
                  <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t("rg3.live.notePh")} aria-label={t("rg3.live.notePh")} />
                  <div className="rg-pop-actions">
                    <button type="button" className="rg-btn ghost" onClick={() => setReason(null)} disabled={busy}>
                      {t("rg3.common.cancel")}
                    </button>
                    <button type="button" className="rg-btn danger" onClick={recall} disabled={busy || (reason === "other" && !note.trim())}>
                      {busy ? <Loader2 size={14} className="rg-spin" /> : null} {t("rg3.live.recallBtn", { count: d.unopened })}
                    </button>
                  </div>
                </>
              ) : null}
              <small className="rg-foot">{t("rg3.live.openedLocked", { count: d.opened })}</small>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
