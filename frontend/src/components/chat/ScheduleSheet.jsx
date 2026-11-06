import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, Clock, FileText, Loader2, Paperclip, Pencil, Trash2, X } from "../ui/Icon.jsx";
import GroupSheet from "../groups/GroupSheet";
import { useLocale } from "../../context/LocaleContext";
import { formatDate } from "../../i18n/format";
import { displayText } from "../../lib/profanity";
import { hapticSelection, hapticSuccess, hapticError } from "../../lib/fluid/haptics";
import {
  applyScheduled, fromLocalInput, getScheduledSnapshot, pendingFor, schedulePresets, subscribeScheduled,
  toLocalInput, validSendAt, SCHEDULE_SENT_EVENT,
} from "../../lib/scheduledMessages";
import { decodeRoleMentions, encodeRoleMentions, roleTokensToText } from "../../lib/roleMentions";
import { ATTACH_ACCEPT, attachmentKind, attachmentProblem, formatBytes } from "../../lib/scheduledAttachment";
import { getToken } from "../../lib/storage";
import { API_BASE_URL } from "../../config/api";
import "../../styles/messaging-sheets.css";

const api = (path, opts) => import("../../api/authedHttp").then((m) => m.authedRequest(path, opts));

/** Same upload as the composer (private chat attachment, /api/media/upload limits). */
async function uploadAttachment(file) {
  const form = new FormData();
  form.append("purpose", "message");
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) throw Object.assign(new Error("upload_failed"), { upload: true });
  return data;
}

const ERRORS = {
  too_soon: "msg4.schedule.errSoon",
  too_far: "msg4.schedule.errFar",
  not_allowed: "msg4.schedule.errNotAllowed",
  too_many: "msg4.schedule.errTooMany",
  already_sent: "msg4.schedule.errSent",
  not_ready: "msg4.schedule.errNotReady",
  no_commands: "msg4.schedule.errCommand",
  bad_attachment: "msg5.schedule.errAttachment",
  attachment_too_large: "msg5.schedule.errTooLarge",
  attach_not_ready: "msg5.schedule.errAttachNotReady",
  upload_failed: "msg5.schedule.errUpload",
};

/**
 * Scheduled sending (messaging phase 4). "new": write (or take the
 * composer's text), pick a time (presets or a date), Zamanla. "list": this
 * chat's pending messages with edit and cancel. The server sends them, also
 * when Descall is closed.
 *
 * Messaging phase 5: one attachment (image or file). It is uploaded when you
 * tap Zamanla (or was already uploaded in the composer) and the server sends
 * it with the message; cancelling deletes it. Role mentions picked in the
 * composer go out as role mentions.
 */
export default function ScheduleSheet({ open, detail, onClose }) {
  const { t, locale } = useLocale();
  const [mode, setMode] = useState(detail?.mode || "new");
  const [editing, setEditing] = useState(null);
  const [text, setText] = useState(detail?.text || "");
  const [when, setWhen] = useState(() => schedulePresets()[0].at);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // { url?, file?, name, size, mediaType, previewUrl? } (url = already uploaded)
  const [attachment, setAttachment] = useState(null);
  const fileRef = useRef(null);
  const picksRef = useRef(new Map());
  const all = useSyncExternalStore(subscribeScheduled, getScheduledSnapshot, getScheduledSnapshot);
  const target = detail?.target;
  const pending = useMemo(() => (target ? pendingFor(all, target.convType, target.convId) : []), [all, target]);
  const presets = useMemo(() => schedulePresets(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setMode(detail?.mode || "new");
    setEditing(null);
    setText(detail?.text || "");
    setAttachment(detail?.attachment || null);
    picksRef.current = new Map(Array.isArray(detail?.rolePicks) ? detail.rolePicks : []);
    setWhen(schedulePresets()[0].at);
    setError("");
    setBusy(false);
  }, [open, detail]);

  const fmt = (d) => formatDate(d, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const failText = (err) => {
    // 503 reaches here as a "slow connection" error: with a file it means attachments are not on yet.
    if (attachment && Number(err?.status) === 503) return t("msg5.schedule.errAttachNotReady");
    return t(ERRORS[err?.message] || "msg4.schedule.errFailed");
  };

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = attachmentProblem(file);
    if (problem) { setError(t(ERRORS[problem])); hapticError(); return; }
    setError("");
    hapticSelection();
    setAttachment({
      file,
      name: file.name,
      size: file.size,
      mediaType: attachmentKind(file),
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    });
  };
  const dropAttachment = () => {
    if (attachment?.file && attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  };

  const submit = async () => {
    const typed = text.trim();
    const hasFile = Boolean(attachment) && !editing;
    if ((!typed && !hasFile && !editing?.attachment) || busy) return;
    if (!validSendAt(when)) { setError(t("msg4.schedule.errSoon")); return; }
    // Roles picked in the composer (or kept while editing) go out as role mentions.
    const body = target?.convType === "channel" ? encodeRoleMentions(typed, picksRef.current) : typed;
    setBusy(true);
    setError("");
    try {
      let attach = null;
      if (hasFile) {
        const uploaded = attachment.url ? { url: attachment.url } : await uploadAttachment(attachment.file);
        // A retry after a refused schedule reuses this upload instead of sending the file again.
        if (!attachment.url) setAttachment((cur) => (cur ? { ...cur, url: uploaded.url } : cur));
        attach = { url: uploaded.url };
      }
      const res = editing
        ? await api(`/api/scheduled-messages/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: { content: body, sendAt: when.toISOString() } })
        : await api("/api/scheduled-messages", { method: "POST", body: { convType: target.convType, convId: target.convId, content: body, sendAt: when.toISOString(), ...(attach ? { attachment: attach } : {}) } });
      if (res?.item) applyScheduled(res.item);
      hapticSuccess();
      if (!editing && detail?.fromComposer) window.dispatchEvent(new CustomEvent(SCHEDULE_SENT_EVENT, { detail: { draftKey: detail.draftKey, attachment: Boolean(attach && detail?.attachment) } }));
      if (hasFile && attachment.file && attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      setAttachment(null);
      setEditing(null);
      setMode("list");
    } catch (err) {
      hapticError();
      setError(err?.upload ? t("msg5.schedule.errUpload") : failText(err));
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
    const decoded = decodeRoleMentions(item.content);
    for (const [name, id] of decoded.picked) picksRef.current.set(name, id);
    setText(decoded.text);
    setAttachment(null);
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
      {editing?.attachment ? (
        <div className="gs-group">
          <div className="gs-row ms-attach-row" data-testid="schedule-attachment">
            <span className="ms-attach-ico" aria-hidden="true">{editing.attachment.mediaType === "image" ? <Paperclip size={17} /> : <FileText size={17} />}</span>
            <span className="gs-row-text">
              <span className="gs-row-title">{editing.attachment.originalName || t("msg5.schedule.attachment")}</span>
              <span className="gs-row-sub">{t("msg5.schedule.attachmentKept")}</span>
            </span>
          </div>
        </div>
      ) : attachment ? (
        <div className="gs-group">
          <div className="gs-row ms-attach-row" data-testid="schedule-attachment">
            {attachment.previewUrl ? (
              <img className="ms-attach-thumb" src={attachment.previewUrl} alt="" />
            ) : (
              <span className="ms-attach-ico" aria-hidden="true"><FileText size={17} /></span>
            )}
            <span className="gs-row-text">
              <span className="gs-row-title">{attachment.name}</span>
              <span className="gs-row-sub">{formatBytes(attachment.size, locale)}</span>
            </span>
            <button type="button" className="gs-pill" onClick={dropAttachment} aria-label={t("msg5.schedule.removeAttachment")} title={t("msg5.schedule.removeAttachment")} data-testid="schedule-attachment-remove">
              <X size={15} />
            </button>
          </div>
        </div>
      ) : !editing ? (
        <div className="ms-attach-add">
          <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} hidden onChange={pickFile} data-testid="schedule-file" />
          <button type="button" className="gs-pill ms-chip" onClick={() => fileRef.current?.click()} data-testid="schedule-attach">
            <span className="ms-attach-add-label"><Paperclip size={15} aria-hidden="true" />{t("msg5.schedule.addAttachment")}</span>
          </button>
          <small>{t("msg5.schedule.attachmentHint")}</small>
        </div>
      ) : null}
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
        <button type="button" className="gs-primary" disabled={(!text.trim() && !(attachment && !editing) && !editing?.attachment) || busy} onClick={submit} data-testid="schedule-submit">
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
                {item.content ? <span className="gs-row-sub">{displayText(roleTokensToText(item.content))}</span> : null}
                {item.attachment ? (
                  <span className="gs-row-sub ms-sched-file"><Paperclip size={13} aria-hidden="true" />{item.attachment.originalName || t("msg5.schedule.attachment")}</span>
                ) : null}
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
        <button type="button" className="gs-primary" onClick={() => { setEditing(null); setText(""); setAttachment(null); setMode("new"); }} data-testid="schedule-new">
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
