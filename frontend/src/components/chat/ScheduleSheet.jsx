import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AlertCircle, Clock, Loader2, Pencil, Trash2 } from "../ui/Icon.jsx";
import GroupSheet from "../groups/GroupSheet";
import { useLocale } from "../../context/LocaleContext";
import { formatDate } from "../../i18n/format";
import { displayText } from "../../lib/profanity";
import { hapticSelection, hapticSuccess, hapticError } from "../../lib/fluid/haptics";
import {
  applyScheduled, fromLocalInput, getScheduledSnapshot, pendingFor, schedulePresets, subscribeScheduled,
  toLocalInput, validSendAt, SCHEDULE_SENT_EVENT,
} from "../../lib/scheduledMessages";
import "../../styles/messaging-sheets.css";

const api = (path, opts) => import("../../api/authedHttp").then((m) => m.authedRequest(path, opts));

const ERRORS = {
  too_soon: "msg4.schedule.errSoon",
  too_far: "msg4.schedule.errFar",
  not_allowed: "msg4.schedule.errNotAllowed",
  too_many: "msg4.schedule.errTooMany",
  already_sent: "msg4.schedule.errSent",
  not_ready: "msg4.schedule.errNotReady",
  no_commands: "msg4.schedule.errCommand",
};

/**
 * Scheduled sending (messaging phase 4). "new": write (or take the
 * composer's text), pick a time (presets or a date), Zamanla. "list": this
 * chat's pending messages with edit and cancel. The server sends them, also
 * when Descall is closed.
 */
export default function ScheduleSheet({ open, detail, onClose }) {
  const { t, locale } = useLocale();
  const [mode, setMode] = useState(detail?.mode || "new");
  const [editing, setEditing] = useState(null);
  const [text, setText] = useState(detail?.text || "");
  const [when, setWhen] = useState(() => schedulePresets()[0].at);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const all = useSyncExternalStore(subscribeScheduled, getScheduledSnapshot, getScheduledSnapshot);
  const target = detail?.target;
  const pending = useMemo(() => (target ? pendingFor(all, target.convType, target.convId) : []), [all, target]);
  const presets = useMemo(() => schedulePresets(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setMode(detail?.mode || "new");
    setEditing(null);
    setText(detail?.text || "");
    setWhen(schedulePresets()[0].at);
    setError("");
    setBusy(false);
  }, [open, detail]);

  const fmt = (d) => formatDate(d, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const failText = (err) => t(ERRORS[err?.message] || "msg4.schedule.errFailed");

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    if (!validSendAt(when)) { setError(t("msg4.schedule.errSoon")); return; }
    setBusy(true);
    setError("");
    try {
      const res = editing
        ? await api(`/api/scheduled-messages/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: { content: body, sendAt: when.toISOString() } })
        : await api("/api/scheduled-messages", { method: "POST", body: { convType: target.convType, convId: target.convId, content: body, sendAt: when.toISOString() } });
      if (res?.item) applyScheduled(res.item);
      hapticSuccess();
      if (!editing && detail?.fromComposer) window.dispatchEvent(new CustomEvent(SCHEDULE_SENT_EVENT, { detail: { draftKey: detail.draftKey } }));
      setEditing(null);
      setMode("list");
    } catch (err) {
      hapticError();
      setError(failText(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelItem = async (item) => {
    setError("");
    try {
      const res = await api(`/api/scheduled-messages/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      applyScheduled(res?.item || { ...item, status: "cancelled" });
      hapticSelection();
    } catch (err) {
      setError(failText(err));
    }
  };

  const startEdit = (item) => {
    setEditing(item);
    setText(item.content);
    setWhen(new Date(item.sendAt));
    setMode("new");
  };

  const editor = (
    <>
      <div className="gs-group">
        <label className="gs-field ms-sched-text">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("msg4.schedule.placeholder")}
            aria-label={t("msg4.schedule.placeholder")}
            rows={3}
            maxLength={2000}
            data-testid="schedule-text"
          />
        </label>
      </div>
      <section className="gs-section">
        <h3 className="gs-section-title"><span>{t("msg4.schedule.when")}</span></h3>
        <div className="ms-chips" role="radiogroup" aria-label={t("msg4.schedule.when")}>
          {presets.map((p) => {
            const on = Math.abs(p.at.getTime() - when.getTime()) < 60000;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`gs-pill ms-chip${on ? " is-on" : ""}`}
                data-testid={`schedule-preset-${p.id}`}
                onClick={() => { hapticSelection(); setWhen(p.at); }}
              >
                <span>{t(p.label)}</span>
                <small>{formatDate(p.at, locale, { weekday: p.id === "1h" ? undefined : "short", hour: "2-digit", minute: "2-digit" })}</small>
              </button>
            );
          })}
        </div>
        <div className="gs-group">
          <label className="ms-datetime-row">
            <Clock size={17} aria-hidden="true" />
            <input
              type="datetime-local"
              className="ms-datetime"
              value={toLocalInput(when)}
              min={toLocalInput(new Date(Date.now() + 60000))}
              onChange={(e) => { const d = fromLocalInput(e.target.value); if (d) setWhen(d); }}
              aria-label={t("msg4.schedule.custom")}
              data-testid="schedule-datetime"
            />
          </label>
        </div>
        <p className="gs-footnote"><span>{t("msg4.schedule.foot", { time: fmt(when) })}</span></p>
      </section>
      <div className="ms-sheet-foot">
        <button type="button" className="gs-primary" disabled={!text.trim() || busy} onClick={submit} data-testid="schedule-submit">
          {busy ? <Loader2 size={18} className="gs-spin" /> : <Clock size={18} />}
          {editing ? t("msg4.schedule.save") : t("msg4.schedule.submit")}
        </button>
      </div>
    </>
  );

  const listView = (
    <>
      {pending.length === 0 ? (
        <div className="gs-empty">{t("msg4.schedule.empty")}</div>
      ) : (
        <div className="gs-group">
          {pending.map((item) => (
            <div key={item.id} className="gs-row ms-sched-item" data-testid="schedule-item">
              <span className="gs-row-text">
                <span className="gs-row-title">{fmt(new Date(item.sendAt))}</span>
                <span className="gs-row-sub">{displayText(item.content)}</span>
              </span>
              <span className="ms-sched-actions">
                <button type="button" className="gs-pill" onClick={() => startEdit(item)} aria-label={t("msg4.schedule.edit")} title={t("msg4.schedule.edit")} data-testid="schedule-edit">
                  <Pencil size={15} />
                </button>
                <button type="button" className="gs-pill is-danger" onClick={() => cancelItem(item)} aria-label={t("msg4.schedule.cancel")} title={t("msg4.schedule.cancel")} data-testid="schedule-cancel">
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="gs-footnote"><span>{t("msg4.schedule.listFoot")}</span></p>
      <div className="ms-sheet-foot">
        <button type="button" className="gs-primary" onClick={() => { setEditing(null); setText(""); setMode("new"); }} data-testid="schedule-new">
          <Clock size={18} />
          {t("msg4.schedule.new")}
        </button>
      </div>
    </>
  );

  return (
    <GroupSheet
      open={open}
      onClose={onClose}
      title={mode === "list" ? t("msg4.schedule.listTitle") : editing ? t("msg4.schedule.editTitle") : t("msg4.schedule.title")}
      subtitle={target?.name || ""}
      testId="schedule-sheet"
      closeLabel={t("Close")}
      className="ms-sheet"
    >
      {error ? (
        <div className="gs-banner is-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : null}
      {mode === "list" ? listView : editor}
    </GroupSheet>
  );
}
