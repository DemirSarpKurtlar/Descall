/**
 * Duyurular dialogs: delete with a reason (archive instead by default), take
 * down from the board (Bitti), extend the end time, version history with
 * restore, second-admin approval / send back, schedule from the board, save as
 * template. Every one says which audit entry it writes.
 */
import { useEffect, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { DELETE_REASONS, END_REASONS, fmtDateTime, fmtNumber, fromLocalInput, toLocalInput } from "./announcementsModel.js";
import GlassCheckbox from "../../ui/GlassCheckbox.jsx";
import "../../../styles/checkbox.css";
import { Dialog, Ic, Label, Pills, Popover } from "./ui.jsx";

function AuditLine({ who }) {
  const { t, locale } = useLocale();
  return (
    <div className="an-audit">
      <Ic name="shield" size={14} />
      {t("annc.dlg.audit", { who: who ? `@${who}` : "—", when: fmtDateTime(new Date().toISOString(), locale) })}
    </div>
  );
}

function Err({ text }) {
  if (!text) return null;
  return (
    <div className="an-err" role="alert">
      <Ic name="alert" size={15} />
      {text}
    </div>
  );
}

/* ---------------- delete (A3) ---------------- */

export function DeleteDialog({ open, item, openSessions = 0, me, onClose, onConfirm, busy, error }) {
  const { t, locale } = useLocale();
  const [reason, setReason] = useState("outdated");
  const [note, setNote] = useState("");
  const [archive, setArchive] = useState(true);
  const [tpl, setTpl] = useState(false);
  useEffect(() => {
    if (open) {
      setReason("outdated");
      setNote("");
      setArchive(true);
      setTpl(false);
    }
  }, [open]);
  if (!item) return null;
  return (
    <Dialog open={open} onClose={onClose} busy={busy} icon="trash" tone="red" title={t("annc.del.title")} subtitle={`"${item.title}"`} width={540} testId="an-del">
      <div className="an-dlg-body">
        <div className="an-warn">
          <Ic name="alert" size={18} />
          <span>
            {item.status === "live" ? t("annc.del.warnLive", { n: fmtNumber(openSessions, locale) }) : t("annc.del.warn")}
          </span>
        </div>
        <div>
          <Label>{t("annc.dlg.reasonAudit")}</Label>
          <Pills items={DELETE_REASONS.map((r) => ({ id: r, label: t(`annc.del.reason.${r}`) }))} value={reason} onChange={setReason} label={t("annc.dlg.reasonAudit")} />
          <textarea className="an-inp is-ta" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={reason === "other" ? t("annc.dlg.noteRequired") : t("annc.dlg.notePh")} aria-label={t("annc.dlg.note")} />
        </div>
        <label className="an-chk">
          <GlassCheckbox checked={archive} onChange={(e) => setArchive(e.target.checked)} />
          {t("annc.del.archiveInstead")}
        </label>
        <label className={`an-chk${archive ? " is-disabled" : ""}`}>
          <GlassCheckbox checked={tpl && !archive} disabled={archive} onChange={(e) => setTpl(e.target.checked)} />
          {t("annc.del.deleteTemplate")}
        </label>
        <AuditLine who={me?.username} />
        <Err text={error} />
        <div className="an-row2">
          <button type="button" className="an-btn is-lg" onClick={onClose} disabled={busy} data-autofocus>
            {t("annc.cancel")}
          </button>
          <button type="button" className="an-btn is-lg is-danger" disabled={busy || (reason === "other" && !note.trim())} onClick={() => onConfirm({ reason, note: note.trim(), archiveInstead: archive, deleteTemplate: !archive && tpl })} data-testid="an-del-confirm">
            <Ic name={archive ? "archive" : "trash"} size={16} />
            {busy ? t("annc.saving") : archive ? t("annc.del.archive") : t("annc.del.delete")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------- take down (C1 board drop on Bitti) ---------------- */

export function EndPopover({ open, anchorRef, item, onClose, onConfirm, busy, error }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("expired");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setReason(item?.endsAt && Date.parse(item.endsAt) <= Date.now() ? "expired" : "expired");
      setNote("");
    }
  }, [open, item]);
  if (!item) return null;
  return (
    <Popover open={open} anchorRef={anchorRef} onClose={onClose} width={380} labelledBy="an-end-t" busy={busy} testId="an-end">
      <h4 id="an-end-t" className="an-pop-h">
        <Ic name="archive" size={18} />
        {t("annc.end.title")}
      </h4>
      <p className="an-pop-p">{t("annc.end.body", { title: item.title })}</p>
      <Label>{t("annc.dlg.reasonAudit")}</Label>
      <Pills items={END_REASONS.map((r) => ({ id: r, label: t(`annc.end.reason.${r}`) }))} value={reason} onChange={setReason} label={t("annc.dlg.reasonAudit")} />
      <textarea className="an-inp is-ta is-sm" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={reason === "other" ? t("annc.dlg.noteRequired") : t("annc.dlg.notePh")} aria-label={t("annc.dlg.note")} data-autofocus />
      <Err text={error} />
      <div className="an-row2">
        <button type="button" className="an-btn" onClick={onClose} disabled={busy}>
          {t("annc.end.undo")}
        </button>
        <button type="button" className="an-btn is-danger" onClick={() => onConfirm({ reason, note: note.trim() })} disabled={busy || (reason === "other" && !note.trim())} data-testid="an-end-confirm">
          {busy ? t("annc.saving") : t("annc.end.confirm")}
        </button>
      </div>
    </Popover>
  );
}

/* ---------------- generic confirm on the board (publish now, reopen, submit) ---------------- */

export function ConfirmPopover({ open, anchorRef, onClose, onConfirm, busy, error, icon = "send", title, body, confirmLabel, tone = "primary", children, disabled = false }) {
  const { t } = useLocale();
  return (
    <Popover open={open} anchorRef={anchorRef} onClose={onClose} width={360} labelledBy="an-cf-t" busy={busy} testId="an-confirm">
      <h4 id="an-cf-t" className="an-pop-h">
        <Ic name={icon} size={18} />
        {title}
      </h4>
      {body ? <p className="an-pop-p">{body}</p> : null}
      {children}
      <Err text={error} />
      <div className="an-row2">
        <button type="button" className="an-btn" onClick={onClose} disabled={busy}>
          {t("annc.end.undo")}
        </button>
        <button type="button" className={`an-btn ${tone === "danger" ? "is-danger" : tone === "gold" ? "is-gold" : "is-primary"}`} onClick={onConfirm} disabled={busy || disabled} data-autofocus data-testid="an-confirm-ok">
          {busy ? t("annc.saving") : confirmLabel}
        </button>
      </div>
    </Popover>
  );
}

/* ---------------- extend ---------------- */

export function ExtendDialog({ open, item, onClose, onConfirm, busy, error, me }) {
  const { t, locale } = useLocale();
  const [v, setV] = useState("");
  useEffect(() => {
    if (open && item) {
      const base = Math.max(Date.now(), item.endsAt ? Date.parse(item.endsAt) : Date.now());
      setV(toLocalInput(new Date(base + 2 * 86400000).toISOString()));
    }
  }, [open, item]);
  if (!item) return null;
  const quick = (days) => {
    const base = Math.max(Date.now(), item.endsAt ? Date.parse(item.endsAt) : Date.now());
    setV(toLocalInput(new Date(base + days * 86400000).toISOString()));
  };
  return (
    <Dialog open={open} onClose={onClose} busy={busy} icon="timer" tone="blue" title={t("annc.extend.title")} subtitle={item.endsAt ? t("annc.extend.current", { when: fmtDateTime(item.endsAt, locale) }) : t("annc.extend.none")} width={460} testId="an-extend">
      <div className="an-dlg-body">
        <div className="an-field">
          <Label htmlFor="an-ext">{t("annc.composer.endsAt")}</Label>
          <div className={`an-dd${v ? "" : " is-empty"}`}>
            <Ic name="timer" size={16} />
            {!v ? <span className="an-dd-ph">{t("annc.composer.forever")}</span> : null}
            <input id="an-ext" type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} data-autofocus />
          </div>
          <div className="an-quick">
            {[1, 3, 7, 30].map((n) => (
              <button key={n} type="button" onClick={() => quick(n)}>
                {t("annc.composer.plusDays", { n })}
              </button>
            ))}
            <button type="button" onClick={() => setV("")}>
              {t("annc.composer.forever")}
            </button>
          </div>
        </div>
        {item.status === "ended" && item.endedReason === "expired" ? <p className="an-muted an-small">{t("annc.extend.revive")}</p> : null}
        <AuditLine who={me?.username} />
        <Err text={error} />
        <div className="an-row2">
          <button type="button" className="an-btn is-lg" onClick={onClose} disabled={busy}>
            {t("annc.cancel")}
          </button>
          <button type="button" className="an-btn is-lg is-primary" onClick={() => onConfirm(v ? fromLocalInput(v) : null)} disabled={busy}>
            {busy ? t("annc.saving") : t("annc.extend.save")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------- history ---------------- */

const CHANGE_KEYS = ["created", "edited", "restored", "translated", "extended"];

export function HistoryDialog({ open, item, versions, loading, onClose, onRestore, busy, error }) {
  const { t, locale } = useLocale();
  const [open2, setOpen2] = useState(null);
  if (!item) return null;
  const list = versions || [];
  return (
    <Dialog open={open} onClose={onClose} busy={busy} icon="history" tone="blue" title={t("annc.hist.title")} subtitle={t("annc.hist.sub", { n: list.length + 1, title: item.title })} width={620} testId="an-history">
      <div className="an-dlg-body an-hist">
        <div className="an-hist-row is-current">
          <span className="an-hist-v">v{item.version}</span>
          <div className="an-hist-txt">
            <b>{t("annc.hist.current")}</b>
            <small>{item.updatedByName ? `@${item.updatedByName}` : item.author ? `@${item.author}` : ""} · {fmtDateTime(item.updatedAt || item.createdAt, locale)}</small>
          </div>
        </div>
        {loading ? <p className="an-muted">{t("annc.loading")}</p> : null}
        {!loading && !list.length ? <p className="an-muted">{t("annc.hist.empty")}</p> : null}
        {list.map((v) => (
          <div key={v.id || v.version} className="an-hist-row">
            <span className="an-hist-v">v{v.version}</span>
            <div className="an-hist-txt">
              <b>{t(`annc.hist.change.${CHANGE_KEYS.includes(v.change) ? v.change : "edited"}`)}</b>
              <small>
                {v.edited_by_name ? `@${v.edited_by_name}` : "—"} · {fmtDateTime(v.created_at, locale)}
              </small>
              {open2 === v.version ? (
                <div className="an-hist-snap">
                  <b>{v.snapshot?.title}</b>
                  <p>{v.snapshot?.content}</p>
                </div>
              ) : null}
            </div>
            <button type="button" className="an-btn is-sm" onClick={() => setOpen2(open2 === v.version ? null : v.version)} aria-expanded={open2 === v.version}>
              {open2 === v.version ? t("annc.hist.hide") : t("annc.hist.show")}
            </button>
            <button type="button" className="an-btn is-sm" onClick={() => onRestore(v.version)} disabled={busy || item.status === "archived"}>
              <Ic name="undo" size={14} />
              {t("annc.hist.restore")}
            </button>
          </div>
        ))}
        <Err text={error} />
      </div>
    </Dialog>
  );
}

/* ---------------- approval ---------------- */

export function ApproveDialog({ open, item, me, onClose, onApprove, onReject, busy, error }) {
  const { t } = useLocale();
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open]);
  if (!item) return null;
  const self = String(item.requestedBy || item.createdBy || "") === String(me?.id || "");
  const ownerOverride = self && me?.owner;
  return (
    <Dialog open={open} onClose={onClose} busy={busy} icon="shield" tone="gold" title={t("annc.appr.title")} subtitle={`"${item.title}"`} width={520} testId="an-approve">
      <div className="an-dlg-body">
        <div className="an-note is-gold">
          <small>{t("annc.appr.ruleTitle")}</small>
          {t("annc.appr.rule")}
        </div>
        {self && !ownerOverride ? <div className="an-warn"><Ic name="alert" size={18} /><span>{t("annc.appr.selfBlocked")}</span></div> : null}
        {ownerOverride ? <p className="an-muted an-small">{t("annc.appr.ownerOverride")}</p> : null}
        <div>
          <Label>{t("annc.appr.noteLabel")}</Label>
          <textarea className="an-inp is-ta" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={ownerOverride ? t("annc.appr.ownerNotePh") : t("annc.appr.notePh")} aria-label={t("annc.appr.noteLabel")} data-autofocus />
        </div>
        <AuditLine who={me?.username} />
        <Err text={error} />
        <div className="an-row2">
          <button type="button" className="an-btn is-lg" onClick={() => onReject(note.trim())} disabled={busy || !note.trim()}>
            <Ic name="undo" size={15} />
            {t("annc.appr.sendBack")}
          </button>
          <button type="button" className="an-btn is-lg is-green" onClick={() => onApprove(note.trim())} disabled={busy || (self && !ownerOverride) || (ownerOverride && !note.trim())} data-testid="an-approve-ok">
            <Ic name="tick" size={16} />
            {busy ? t("annc.saving") : t("annc.appr.approve")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------- schedule (board drop on Zamanlanmış) ---------------- */

export function SchedulePopover({ open, anchorRef, item, onClose, onConfirm, busy, error }) {
  const { t } = useLocale();
  const [v, setV] = useState("");
  useEffect(() => {
    if (open) {
      const base = item?.startsAt && Date.parse(item.startsAt) > Date.now() ? Date.parse(item.startsAt) : Date.now() + 3600000;
      setV(toLocalInput(new Date(base).toISOString()));
    }
  }, [open, item]);
  if (!item) return null;
  const valid = v && Date.parse(v) > Date.now() + 60000;
  return (
    <Popover open={open} anchorRef={anchorRef} onClose={onClose} width={340} labelledBy="an-sch-t" busy={busy} testId="an-schedule">
      <h4 id="an-sch-t" className="an-pop-h">
        <Ic name="clock" size={18} />
        {t("annc.sched.title")}
      </h4>
      <p className="an-pop-p">{t("annc.sched.body", { title: item.title })}</p>
      <div className="an-dd">
        <Ic name="calendar" size={16} />
        <input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} aria-label={t("annc.composer.startsAt")} data-autofocus />
      </div>
      <Err text={error} />
      <div className="an-row2">
        <button type="button" className="an-btn" onClick={onClose} disabled={busy}>
          {t("annc.end.undo")}
        </button>
        <button type="button" className="an-btn is-primary" onClick={() => onConfirm(fromLocalInput(v))} disabled={busy || !valid}>
          {busy ? t("annc.saving") : t("annc.sched.confirm")}
        </button>
      </div>
    </Popover>
  );
}

/* ---------------- save as template ---------------- */

export function SaveTemplateDialog({ open, item, onClose, onConfirm, busy, error }) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) setName(item?.title?.slice(0, 80) || "");
  }, [open, item]);
  if (!item) return null;
  return (
    <Dialog open={open} onClose={onClose} busy={busy} icon="tpl" tone="blue" title={t("annc.saveTpl.title")} subtitle={t("annc.saveTpl.sub")} width={460} testId="an-save-tpl">
      <div className="an-dlg-body">
        <div className="an-field">
          <Label htmlFor="an-tpl-n">{t("annc.composer.templateName")}</Label>
          <input id="an-tpl-n" className="an-inp" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-autofocus />
        </div>
        <Err text={error} />
        <div className="an-row2">
          <button type="button" className="an-btn is-lg" onClick={onClose} disabled={busy}>
            {t("annc.cancel")}
          </button>
          <button type="button" className="an-btn is-lg is-primary" onClick={() => onConfirm(name.trim())} disabled={busy || !name.trim()}>
            {busy ? t("annc.saving") : t("annc.saveTpl.save")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
