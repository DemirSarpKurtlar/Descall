/**
 * Rapor iş akışı (3.4.0): the case controls under one reported account in
 * Raporlar. Who works it (assignee menu: Bana ata / another admin with
 * Raporlar / Atamayı kaldır) and the account's timeline of notes, assignment
 * changes and decisions. Server: routes/adminPeople.js /reports/target/:id/*.
 */
import { localizedField } from "../../i18n/serverText.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "../../api/adminHttp";
import GlassActionMenu from "../ui/GlassActionMenu";
import { MessageSquare, UserCheck, UserMinus, Users, ChevronDown, RefreshCw } from "../ui/Icon.jsx";
import { formatAppDateTime } from "../../lib/datetime";

let assigneesCache = null;
async function loadAssignees() {
  if (assigneesCache && Date.now() - assigneesCache.at < 60_000) return assigneesCache.list;
  const d = await adminFetch("/reports/assignees");
  assigneesCache = { at: Date.now(), list: Array.isArray(d?.assignees) ? d.assignees : [] };
  return assigneesCache.list;
}

export function AssigneeButton({ group, t, onChanged }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) loadAssignees().then(setList).catch(() => setList([]));
  }, [open]);

  const assign = async (assigneeId) => {
    setErr("");
    try {
      await adminFetch(`/reports/target/${encodeURIComponent(group.targetId)}/assign`, {
        method: "POST",
        body: JSON.stringify({ assigneeId }),
      });
      onChanged?.();
    } catch (e) {
      setErr(e?.message || t("admin.caseAssignFailed"));
    }
  };

  const others = list.filter((a) => a.id !== group.assigneeId);
  const sections = [
    [{ id: "me", label: t("admin.caseAssignMe"), icon: UserCheck, onSelect: () => assign("me") }],
    others.map((a) => ({ id: a.id, label: a.displayName ? `${a.displayName} (@${a.username})` : `@${a.username}`, icon: Users, onSelect: () => assign(a.id) })),
    group.assigneeId ? [{ id: "none", label: t("admin.caseUnassign"), icon: UserMinus, danger: true, onSelect: () => assign(null) }] : [],
  ].filter((s) => s.length);

  return (
    <span className="rc-assign">
      <button
        ref={ref}
        type="button"
        className={`rc-chip${group.assigneeId ? " is-set" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <UserCheck size={13} />
        {group.assigneeId ? t("admin.caseAssignedTo", { name: group.assigneeUsername || "?" }) : t("admin.caseUnassigned")}
        <ChevronDown size={12} />
      </button>
      <GlassActionMenu open={open} anchorRef={ref} onClose={() => setOpen(false)} sections={sections} ariaLabel={t("admin.caseAssignMenu")} zIndex={100050} align="left" />
      {err ? <span className="rc-err" role="alert">{err}</span> : null}
    </span>
  );
}

const KIND_LABEL = { note: "admin.caseKindNote", assign: "admin.caseKindAssign", unassign: "admin.caseKindAssign", resolve: "admin.caseKindResolve" };

export function CaseTimeline({ targetId, latestReportId, t, locale }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    adminFetch(`/reports/target/${encodeURIComponent(targetId)}/notes`)
      .then((d) => setData({ notes: d?.notes || [], available: d?.available !== false }))
      .catch((e) => setErr(e?.message || t("admin.caseNotesFailed")));
  }, [targetId, t]);

  useEffect(() => {
    if (open && !data) load();
  }, [open, data, load]);

  const add = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setErr("");
    try {
      const d = await adminFetch(`/reports/target/${encodeURIComponent(targetId)}/notes`, {
        method: "POST",
        body: JSON.stringify({ body, reportId: latestReportId || null }),
      });
      setDraft("");
      setData((prev) => ({ available: true, notes: [d.note, ...(prev?.notes || [])] }));
    } catch (e) {
      setErr(e?.message || t("admin.caseNoteFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rc-timeline${open ? " is-open" : ""}`}>
      <button type="button" className="rc-tl-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MessageSquare size={14} />
        {t("admin.caseTimeline")}
        {data?.notes?.length ? <span className="rc-count">{data.notes.length}</span> : null}
        <ChevronDown size={12} className="rc-caret" />
      </button>
      {open ? (
        <div className="rc-tl-body">
          {data && !data.available ? <p className="rc-muted">{t("admin.caseUnavailable")}</p> : null}
          <div className="rc-compose">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("admin.caseNotePlaceholder")}
              aria-label={t("admin.caseNotePlaceholder")}
              maxLength={2000}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add();
              }}
            />
            <div className="rc-compose-row">
              <span className="rc-muted">{t("admin.caseNoteHint")}</span>
              <button type="button" className="rc-btn" onClick={load} aria-label={t("common.refresh")}>
                <RefreshCw size={13} />
              </button>
              <button type="button" className="rc-btn is-primary" disabled={busy || !draft.trim()} onClick={add}>
                {t("admin.caseAddNote")}
              </button>
            </div>
          </div>
          {err ? <p className="rc-err" role="alert">{err}</p> : null}
          {data?.notes?.length ? (
            <ol className="rc-list">
              {data.notes.map((n) => (
                <li key={n.id} className={`rc-item is-${n.kind}`}>
                  <span className="rc-dot" aria-hidden="true" />
                  <div>
                    <div className="rc-item-head">
                      <b>{n.authorUsername ? `@${n.authorUsername}` : t("admin.caseSystem")}</b>
                      <span className="rc-kind">{t(KIND_LABEL[n.kind] || KIND_LABEL.note)}</span>
                      <time>{formatAppDateTime(n.createdAt, locale) || n.createdAt}</time>
                    </div>
                    <p>{localizedField(n, "body")}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : data?.available ? (
            <p className="rc-muted">{t("admin.caseEmpty")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
