/**
 * İşlem kaydı of Vitrin ve Setler: every change made on this page (sets, recalls,
 * algorithm versions, night market, limits, user storefronts) grouped by day, who did
 * it, the reason, the before / after, and "Geri al" while the undo window is open.
 * Filter chips, a user filter coming from the storefront drawer, CSV export.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { formatAppDateTime } from "../../../lib/datetime";
import { Download, History, Undo2, X } from "../../ui/Icon.jsx";
import { shop2Api } from "./adminShop2Api.js";
import { Pill, Seg, Skel, UserAv } from "./ui.jsx";
import { groupByDay, istDay, mmss, undoLeft } from "./shop2Model.js";

const KINDS = ["all", "set", "rules", "night", "limits", "user"];
const KIND_TONE = { set: "blue", rules: "amber", night: "violet", limits: "gray", user: "green" };

export function kindOf(action) {
  const a = String(action || "").replace(/^shop2_/, "");
  if (a.startsWith("set_") || a.startsWith("ab_")) return "set";
  if (a.startsWith("rules_") || a.startsWith("event_") || a === "queue_cancel") return "rules";
  if (a.startsWith("night_")) return "night";
  if (a.startsWith("limits_") || a.startsWith("gift")) return "limits";
  if (a === "free_refresh" || a.startsWith("storefront_")) return "user";
  return "set";
}

/** Localized title of an audit row (the raw action name when the locale has none). */
export function auditTitle(t, e) {
  const key = `adminShop2.audit.kind.${e.action}`;
  const text = t(key, e.vars || {});
  return text && text !== key ? text : e.action;
}

export function csvOf(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["at", "actor", "action", "summary", "target", "reason", "undone"];
  return [head.join(","), ...rows.map((r) => [r.at, r.actor, r.action, r.summary ?? "", r.target, r.reason, r.undone ? "1" : ""].map(esc).join(","))].join("\n");
}

export default function AuditView({ now, filter, onFilter, notify, fail, onChanged, onOpenSet, onOpenUser }) {
  const { t, locale } = useLocale();
  const [kind, setKind] = useState("all");
  const [rows, setRows] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(
    async (before = null) => {
      try {
        const r = await shop2Api.audit({ before, limit: 60 });
        const list = r?.entries || [];
        setRows((prev) => (before ? [...(prev || []), ...list] : list));
        setCursor(r?.nextCursor || null);
      } catch (e) {
        setRows((prev) => prev || []);
        fail(e);
      }
    },
    [fail]
  );
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const visible = useMemo(() => (rows || []).filter((e) => (kind === "all" || kindOf(e.action) === kind) && (!filter?.userId || e.targetUserId === filter.userId || e.userId === filter.userId)), [rows, kind, filter]);
  const groups = useMemo(() => groupByDay(visible), [visible]);
  const today = istDay(now);
  const yesterday = istDay(now - 86400000);

  const undo = async (e) => {
    setBusyId(e.id);
    try {
      await shop2Api.undoAudit(e);
      notify(t("adminShop2.toast.undone"));
      setRows((list) => (list || []).map((x) => (x.id === e.id ? { ...x, undone: true } : x)));
      onChanged?.();
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const blob = new Blob([csvOf(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vitrin-setler-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="as2-card as2-audit" data-testid="as2-audit">
      <header className="as2-ch">
        <h2>
          <History size={17} />
          {t("adminShop2.audit.title")}
        </h2>
        <Seg size="sm" value={kind} onChange={setKind} label={t("adminShop2.audit.filter")} options={KINDS.map((k) => ({ id: k, label: t(`adminShop2.audit.f.${k}`) }))} />
        {filter?.label ? (
          <span className="as2-chip">
            {filter.label}
            <button type="button" onClick={() => onFilter(null)} aria-label={t("adminShop2.audit.clearFilter")}>
              <X size={12} />
            </button>
          </span>
        ) : null}
        <button type="button" className="as2-btn is-sm as2-ml" onClick={exportCsv} disabled={!visible.length}>
          <Download size={14} />
          {t("adminShop2.audit.csv")}
        </button>
      </header>
      {!rows ? (
        <Skel h={300} r={12} />
      ) : !visible.length ? (
        <p className="as2-empty">{t("adminShop2.audit.empty")}</p>
      ) : (
        <div className="as2-au">
          {groups.map((g) => (
            <div key={g.day} className="as2-au-g">
              <div className="as2-au-day">{g.day === today ? t("adminShop2.audit.today") : g.day === yesterday ? t("adminShop2.audit.yesterday") : formatAppDateTime(new Date(Date.parse(`${g.day}T09:00:00Z`)).toISOString(), locale, { weekday: "long", day: "numeric", month: "long" })}</div>
              {g.rows.map((e) => {
                const left = undoLeft(e.undoUntil, now);
                const k = kindOf(e.action);
                return (
                  <div key={e.id} className={`as2-au-row${e.undone ? " is-undone" : ""}`}>
                    <span className="tnum as2-muted">{formatAppDateTime(e.at, locale, { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="as2-au-who">
                      <UserAv name={e.actor || "sistem"} size={22} />
                      <b>{e.actor || t("adminShop2.audit.system")}</b>
                    </span>
                    <Pill tone={KIND_TONE[k]}>{t(`adminShop2.audit.f.${k}`)}</Pill>
                    <span className="as2-au-t">
                      <b>{auditTitle(t, e)}</b>
                      {e.reason ? <small>{t("adminShop2.audit.reason", { r: e.reason })}</small> : null}
                      {e.before != null || e.after != null ? (
                        <small className="as2-au-diff">
                          <s>{String(e.before ?? "")}</s> <b>{String(e.after ?? "")}</b>
                        </small>
                      ) : null}
                    </span>
                    <span className="as2-au-tgt">
                      {e.setKey ? (
                        <button type="button" className="as2-link" onClick={() => onOpenSet(e.setKey)}>
                          {e.target || e.setKey}
                        </button>
                      ) : e.targetUserId ? (
                        <button type="button" className="as2-link" onClick={() => onOpenUser(e.targetUserId)}>
                          {e.target}
                        </button>
                      ) : (
                        <span className="as2-muted">{e.target || ""}</span>
                      )}
                    </span>
                    <span className="as2-au-act">
                      {e.undone ? (
                        <Pill tone="gray">{t("adminShop2.audit.undone")}</Pill>
                      ) : e.undoable && left > 0 ? (
                        <button type="button" className="as2-btn is-sm" onClick={() => undo(e)} disabled={busyId === e.id}>
                          <Undo2 size={14} />
                          {t("adminShop2.undo")}
                          {left > 0 ? <span className="tnum as2-muted">{mmss(left)}</span> : null}
                        </button>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {cursor ? (
            <button type="button" className="as2-btn as2-more" onClick={() => load(cursor)}>
              {t("adminShop2.audit.more")}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
