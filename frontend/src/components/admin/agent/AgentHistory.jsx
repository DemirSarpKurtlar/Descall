/* Ajan > Geçmiş sekmesi: every plan the agent proposed and what happened to it. */
import { useMemo, useState } from "react";
import { Ic } from "./agentUi.jsx";
import { planCode } from "./agentOpsModel.js";

const APPLIED = new Set(["running", "paused", "done", "failed", "cancelled", "scheduled"]);

function when(iso, locale) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AgentHistory({ t, locale, plans, loading, error, onRetry, onOpenPlan, onOpenAudit }) {
  const [filter, setFilter] = useState("all");
  const list = useMemo(
    () => (plans || []).filter((p) => (filter === "applied" ? APPLIED.has(p.status) : filter === "open" ? p.status === "proposed" : true)),
    [plans, filter],
  );
  return (
    <div className="ago-history">
      <div className="ago-plan-tools">
        <p className="ago-sub ago-hist-lead">{t("agentOps.history.lead")}</p>
        <span className="ago-sp" />
        {onOpenAudit ? <button type="button" className="ago-lnk" onClick={onOpenAudit}><Ic name="hist" size={13} /> {t("agentOps.history.auditLink")}</button> : null}
      </div>
      <div className="ago-fps" role="radiogroup" aria-label={t("agentOps.tab.history")}>
        {[["all", "filterAll"], ["applied", "filterApplied"], ["open", "filterOpen"]].map(([id, key]) => (
          <button key={id} type="button" role="radio" aria-checked={filter === id} className={`ago-fp${filter === id ? " is-on" : ""}`} onClick={() => setFilter(id)}>
            {t(`agentOps.history.${key}`)}
          </button>
        ))}
      </div>
      <div className="ago-hist-scroll">
        {loading && !plans ? [0, 1, 2, 3].map((k) => <div key={k} className="ago-skel" style={{ height: 58 }} />) : null}
        {error && !plans ? (
          <div className="ago-empty"><p>{error}</p><button type="button" className="ago-btn is-s" onClick={onRetry}>{t("agentOps.retry")}</button></div>
        ) : null}
        {plans && !list.length ? <p className="ago-muted ago-pad">{t("agentOps.history.empty")}</p> : null}
        {list.map((p) => {
          const c = p.counts || {};
          const applied = APPLIED.has(p.status) && p.status !== "scheduled";
          return (
            <button key={p.id} type="button" className="ago-hrow" onClick={() => onOpenPlan(p.id, applied)}>
              <span className={`ago-hrow-ic is-${p.status}`}><Ic name={p.status === "done" ? "check" : p.status === "proposed" ? "shield" : p.status === "scheduled" ? "cal" : ["running", "paused"].includes(p.status) ? "clock" : "x"} size={15} /></span>
              <span className="ago-col ago-hrow-main">
                <span className="ago-hrow-title">
                  <b>{t("agentOps.planRef", { code: planCode(p.code), v: p.version })}</b>
                  <span className="ago-ellip">{p.title}</span>
                </span>
                <span className="ago-sub ago-ellip">
                  {applied
                    ? t("agentOps.history.counts", { done: (c.done || 0) + (c.undone || 0), skipped: c.skipped || 0, failed: c.failed || 0 })
                    : t("agentOps.history.countsProposed", { count: p.selectedCount ?? p.itemCount ?? 0 })}
                  {p.preview?.length ? ` · ${p.preview.map((u) => `@${u}`).join(", ")}` : ""}
                </span>
              </span>
              {p.source === "task" ? <span className="ago-sg is-vi">{t("agentOps.history.fromTask")}</span> : null}
              {p.source === "admin_edit" ? <span className="ago-sg is-bl">{t("agentOps.history.byAdmin")}</span> : null}
              <span className={`ago-sg ago-status is-${p.status}`}>{t(`agentOps.status.${p.status}`)}</span>
              <span className="ago-sub ago-hrow-who">
                {p.approvedByUsername ? t("agentOps.history.approvedBy", { name: p.approvedByUsername }) : ""}
                <small className="tnum">{when(p.approvedAt || p.createdAt, locale)}</small>
              </span>
              <Ic name="cr" size={14} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
