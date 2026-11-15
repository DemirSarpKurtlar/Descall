/* Ajan > Kuyruk sekmesi (Taslak B3): live progress, per-row results and the undo window. */
import { useState } from "react";
import { ActionChip, AgoAvatar, Ic } from "./agentUi.jsx";
import { canUndoAny, countdown, planCode, queueBar, queueItems, rowState } from "./agentOpsModel.js";

function clock(iso, locale) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function hm(iso, locale) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}
function when(iso, locale) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function resultText(t, item) {
  const code = item.result?.code;
  switch (item.status) {
    case "done": {
      const base = item.action === "live_popup" ? t("agentOps.res.live_popup", { count: item.result?.delivered || 0 }) : t(`agentOps.res.${item.action}`);
      return item.verdict?.verdict === "warn" ? `${base} · ${t("agentOps.res.warnSuffix")}` : base;
    }
    case "skipped":
    case "failed": return code ? t(`agentOps.code.${code}`) : t("agentOps.code.failed");
    case "running": return t("agentOps.queue.running_");
    case "queued": return t("agentOps.queue.queued");
    case "cancelled": return t("agentOps.queue.cancelledRow");
    case "undone": return item.result?.undoneBy ? t("agentOps.queue.undone", { name: item.result.undoneBy }) : t("agentOps.queue.undoneShort");
    case "undo_failed": return t("agentOps.queue.undoFailed");
    default: return "";
  }
}

const STATE_ICON = { ok: "check", fail: "x", q: "clock", undo: "undo", cancel: "x" };

export default function AgentQueue({ t, locale, view, others, loading, busy, now, catText, onOp, onUndo, onOpenPlan }) {
  const [why, setWhy] = useState(null);
  if (loading && !view) {
    return <div className="ago-tabbody" aria-busy="true">{[0, 1, 2, 3].map((k) => <div key={k} className="ago-skel" style={{ height: k === 1 ? 70 : 40 }} />)}</div>;
  }
  if (!view) {
    return (
      <div className="ago-empty">
        <span className="ago-empty-ic"><Ic name="clock" size={22} /></span>
        <b>{t("agentOps.queue.emptyTitle")}</b>
        <p>{t("agentOps.queue.emptyBody")}</p>
      </div>
    );
  }
  const { plan } = view;
  const items = queueItems(view.items);
  const c = plan.counts || {};
  const bar = queueBar(c);
  const left = countdown(plan.undoUntil, now);
  const undoAny = canUndoAny(plan, view.items, now);
  const code = planCode(plan.code);
  const name = plan.approvedByUsername || "";
  const titleKey = { running: "running", paused: "paused", done: "done", failed: "failed", cancelled: "cancelled", scheduled: "scheduled" }[plan.status] || "done";

  return (
    <div className="ago-queue">
      <div className="ago-qhead">
        <span className={`ago-qstate is-${plan.status}`} aria-hidden="true">
          {plan.status === "running" ? <span className="ago-spin" /> : <Ic name={plan.status === "paused" ? "pause" : plan.status === "scheduled" ? "cal" : plan.status === "done" ? "check" : "x"} size={16} />}
        </span>
        <div className="ago-col">
          <span className="ago-h2">{t(`agentOps.queue.${titleKey}`, { code, v: plan.version })}</span>
          <span className="ago-sub ago-ellip">
            {plan.status === "scheduled"
              ? t("agentOps.queue.metaScheduled", { name, when: when(plan.scheduledFor, locale) })
              : t("agentOps.queue.meta", { name, time: hm(plan.approvedAt, locale) })}
          </span>
        </div>
        <span className="ago-sp" />
        {plan.status === "running" ? (
          <button type="button" className="ago-btn is-ghost is-s" disabled={busy} onClick={() => onOp("pause")}><Ic name="pause" size={15} />{t("agentOps.queue.pause")}</button>
        ) : null}
        {plan.status === "paused" ? (
          <button type="button" className="ago-btn is-ghost is-s" disabled={busy} onClick={() => onOp("resume")}><Ic name="play" size={15} />{t("agentOps.queue.resume")}</button>
        ) : null}
        {["running", "paused", "scheduled"].includes(plan.status) ? (
          <button type="button" className="ago-btn is-rq is-s" disabled={busy} onClick={() => onOp("cancel")}><Ic name="stop" size={14} />{t("agentOps.queue.stop")}</button>
        ) : null}
        {undoAny ? (
          <button type="button" className="ago-btn is-a is-s" disabled={busy} onClick={() => onUndo(null)}><Ic name="undo" size={15} />{t("agentOps.queue.undoAll")}</button>
        ) : null}
      </div>

      {plan.status === "paused" ? <p className="ago-note is-warn" role="alert">{t("agentOps.queue.pausedNote")}</p> : null}

      <div className="ago-kpis">
        <div className="ago-kpi"><b className="is-ok tnum">{(c.done || 0) + (c.undone || 0)}</b><span>{t("agentOps.queue.kDone")}</span></div>
        <div className="ago-kpi"><b className="is-fail tnum">{(c.skipped || 0) + (c.failed || 0)}</b><span>{t("agentOps.queue.kSkipped")}</span></div>
        <div className="ago-kpi"><b className="is-run tnum">{c.running || 0}</b><span>{t("agentOps.queue.kRunning")}</span></div>
        <div className="ago-kpi"><b className="tnum">{c.queued || 0}</b><span>{t("agentOps.queue.kQueued")}</span></div>
        <div className="ago-kpi is-wide"><b className="tnum">{left || "00:00"}</b><span>{left ? t("agentOps.queue.kUndo") : t("agentOps.queue.kUndoClosed")}</span></div>
      </div>
      <div className="ago-pbar is-q" role="progressbar" aria-label={t("agentOps.queue.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar.g + bar.r)}>
        <i className="is-g" style={{ width: `${bar.g}%` }} />
        <i className="is-r" style={{ width: `${bar.r}%` }} />
        <i className="is-b" style={{ width: `${bar.b}%` }} />
      </div>
      {left && undoAny ? <p className="ago-sub ago-undo-line"><Ic name="undo" size={13} /> {t("agentOps.queue.undoBanner", { left })}</p> : null}

      <div className="ago-qtable" role="table" aria-label={t(`agentOps.queue.${titleKey}`, { code, v: plan.version })}>
        <div className="ago-tr ago-qrow is-head" role="row">
          <span />
          <span className="ago-th" role="columnheader">{t("agentOps.queue.thAccount")}</span>
          <span className="ago-th" role="columnheader">{t("agentOps.queue.thAction")}</span>
          <span className="ago-th" role="columnheader">{t("agentOps.queue.thTime")}</span>
          <span className="ago-th" role="columnheader">{t("agentOps.queue.thResult")}</span>
          <span />
        </div>
        <div className="ago-qscroll">
          {items.map((item) => {
            const st = rowState(item);
            const label = item.username || t("agentOps.plan.everyone");
            return (
              <div key={item.id}>
                <div className={`ago-tr ago-qrow is-${st}`} role="row">
                  <span className={`ago-st is-${st}`}>{st === "run" ? <span className="ago-spin" /> : <Ic name={STATE_ICON[st] || "clock"} size={16} />}</span>
                  <div className="ago-ucell">
                    <AgoAvatar name={label} url={item.target?.avatarUrl} seed={item.userId || label} />
                    <b className="ago-ellip">{item.userId ? `@${label}` : label}</b>
                  </div>
                  <div><ActionChip action={item.action} params={item.params} t={t} catText={catText} /></div>
                  <span className="ago-muted tnum">{item.executedAt ? clock(item.executedAt, locale) : "—"}</span>
                  <span className={`ago-ellip${st === "fail" ? " is-fail" : st === "q" || st === "cancel" ? " is-q" : ""}`}>{resultText(t, item)}</span>
                  {item.canUndo ? (
                    <button type="button" className="ago-lnk ago-end" disabled={busy} onClick={() => onUndo([item.id])}><Ic name="undo" size={12} /> {t("agentOps.queue.undo")}</button>
                  ) : st === "fail" ? (
                    <button type="button" className="ago-lnk ago-end" aria-expanded={why === item.id} onClick={() => setWhy((w) => (w === item.id ? null : item.id))}>{t("agentOps.queue.why")}</button>
                  ) : <span />}
                </div>
                {why === item.id ? (
                  <div className="ago-why">
                    <b>{resultText(t, item)}</b>
                    {item.error ? <span className="ago-muted"> · {item.error}</span> : null}
                    {item.evidence?.reason ? <p>{item.evidence.reason}</p> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {others?.length ? (
        <div className="ago-others">
          <span className="ago-lab">{t("agentOps.queue.others")}</span>
          {others.map((p) => (
            <button key={p.id} type="button" className="ago-fp" onClick={() => onOpenPlan(p.id)}>
              {t("agentOps.planRef", { code: planCode(p.code), v: p.version })} · {t(`agentOps.status.${p.status}`)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
