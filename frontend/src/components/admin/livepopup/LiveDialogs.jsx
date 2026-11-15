/**
 * Canlı popup dialogs: recall (Draft B frame b4: three counters, what happens
 * on recall, required reason, typed confirmation), "Düzeldi", end tracking and
 * one person's popup history.
 */
import { useEffect, useId, useState } from "react";
import { BellOff, CheckCircle2, History, Square, Undo2 } from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { livePopupIcon } from "../../../lib/livePopupIcons";
import { livePopupApi } from "./livePopupApi.js";
import { Chip, Dialog, FieldLabel, Skeleton } from "./ui.jsx";
import { MIN_NOTE, RECALL_MODES, TONE_COLOR, canRecall, dayTime, fmtNumber, recallPayload, rowStatus, shortAgo } from "./livePopupModel.js";

export function RecallDialog({ open, campaign, stats, onClose, onDone, errText }) {
  const { t, locale } = useLocale();
  const [mode, setMode] = useState("silent");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = { reason: useId(), note: useId(), et: useId(), eb: useId(), typed: useId() };
  useEffect(() => {
    if (open) {
      setMode("silent");
      setReason("");
      setNote("");
      setEditedTitle(campaign?.title || "");
      setEditedBody(campaign?.body || "");
      setTyped("");
      setError("");
    }
  }, [open, campaign]);
  if (!campaign) return null;
  const n = (v) => fmtNumber(v, locale);
  const word = t("livePopup.recall.confirmWord");
  const closable = stats?.closable ?? stats?.open ?? 0;
  const ok = canRecall({ reason, typed, word, mode, note, editedTitle, editedBody }, locale);
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError("");
    try {
      const out = await livePopupApi.recall(campaign.id, recallPayload({ reason, mode, note, editedTitle, editedBody, campaign }));
      onDone(out);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  const confirmParts = t("livePopup.recall.confirmText", { n: n(closable), word: "\u0000" }).split("\u0000");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Undo2}
      tone="red-solid"
      title={t("livePopup.recall.title")}
      subtitle={t("livePopup.recall.sub", { title: campaign.title, ago: campaign.sentAt ? t("livePopup.ago", { time: shortAgo(campaign.sentAt, t) }) : "" })}
      testId="lp-recall-dialog"
    >
      <div className="lp-kpis is-3">
        <div className="lp-kpi"><span className="lp-kpi-l">{t("livePopup.recall.open")}</span><b className="tnum">{n(closable)}</b><em className="lp-muted">{t("livePopup.recall.openSub")}</em></div>
        <div className="lp-kpi"><span className="lp-kpi-l">{t("livePopup.recall.pending")}</span><b className="tnum">{n(stats?.pendingLogin || 0)}</b><em className="lp-muted">{t("livePopup.recall.pendingSub")}</em></div>
        <div className="lp-kpi"><span className="lp-kpi-l">{t("livePopup.recall.seen")}</span><b className="tnum">{n(stats?.seen || 0)}</b><em className="lp-muted">{t("livePopup.recall.seenSub")}</em></div>
      </div>
      <div className="lp-f">
        <FieldLabel>{t("livePopup.recall.what")}</FieldLabel>
        <div className="lp-pills is-violet" role="radiogroup" aria-label={t("livePopup.recall.what")}>
          {RECALL_MODES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)} data-testid={`lp-recall-mode-${m}`}>
              {t(`livePopup.recall.${m}`)}
            </button>
          ))}
        </div>
      </div>
      {mode === "note" ? (
        <div className="lp-f">
          <FieldLabel htmlFor={ids.note} extra={`${note.length}/200`}>{t("livePopup.recall.note")}</FieldLabel>
          <input id={ids.note} className="lp-inp" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("livePopup.recall.notePlaceholder")} />
        </div>
      ) : null}
      {mode === "edited" ? (
        <div className="lp-grid-edit">
          <div className="lp-f">
            <FieldLabel htmlFor={ids.et}>{t("livePopup.recall.editedTitle")}</FieldLabel>
            <input id={ids.et} className="lp-inp" maxLength={80} value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} />
          </div>
          <div className="lp-f">
            <FieldLabel htmlFor={ids.eb}>{t("livePopup.recall.editedBody")}</FieldLabel>
            <textarea id={ids.eb} className="lp-ta" rows={2} maxLength={800} value={editedBody} onChange={(e) => setEditedBody(e.target.value)} />
          </div>
        </div>
      ) : null}
      <div className="lp-f">
        <FieldLabel htmlFor={ids.reason} extra={t("livePopup.recall.reasonHint")}>{t("livePopup.recall.reason")}</FieldLabel>
        <textarea id={ids.reason} className="lp-ta" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("livePopup.recall.reasonPlaceholder")} data-autofocus />
      </div>
      <p className="lp-conf">
        {confirmParts[0]}
        <b>{word}</b>
        {confirmParts[1] || ""}
      </p>
      <input id={ids.typed} className="lp-inp lp-typed" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} aria-label={t("livePopup.recall.confirmText", { n: n(closable), word })} autoComplete="off" spellCheck={false} data-testid="lp-recall-typed" />
      {error ? <p className="lp-conf" role="alert">{error}</p> : null}
      <div className="lp-row">
        <button type="button" className="lp-btn" onClick={onClose} disabled={busy}>{t("livePopup.recall.cancel")}</button>
        <button type="button" className="lp-btn is-dng" onClick={submit} disabled={!ok || busy} data-testid="lp-recall-submit">
          <Undo2 size={16} />
          {t("livePopup.recall.submit")}
        </button>
      </div>
    </Dialog>
  );
}

export function ResolveDialog({ open, campaign, stats, onClose, onDone, errText }) {
  const { t, locale } = useLocale();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = { t: useId(), b: useId(), n: useId() };
  useEffect(() => {
    if (open && campaign) {
      setTitle(t("livePopup.resolve.defaultTitle"));
      setBody(t("livePopup.resolve.defaultBody", { title: campaign.title }));
      setNote("");
      setError("");
    }
  }, [open, campaign, t]);
  if (!campaign) return null;
  const ok = title.trim() && body.trim() && note.trim().length >= MIN_NOTE;
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError("");
    try {
      onDone(await livePopupApi.resolve(campaign.id, { content: { title: title.trim(), body: body.trim() }, note: note.trim() }));
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} busy={busy} icon={CheckCircle2} tone="green" title={t("livePopup.resolve.title")} subtitle={t("livePopup.resolve.sub", { n: fmtNumber(stats?.targeted || 0, locale) })} testId="lp-resolve-dialog">
      <div className="lp-f">
        <FieldLabel htmlFor={ids.t}>{t("livePopup.composer.titleLabel")}</FieldLabel>
        <input id={ids.t} className="lp-inp" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="lp-f">
        <FieldLabel htmlFor={ids.b}>{t("livePopup.composer.body")}</FieldLabel>
        <textarea id={ids.b} className="lp-ta" rows={3} maxLength={800} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="lp-f">
        <FieldLabel htmlFor={ids.n} extra={t("livePopup.review.noteHint")}>{t("livePopup.resolve.note")}</FieldLabel>
        <input id={ids.n} className="lp-inp" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("livePopup.resolve.notePlaceholder")} data-autofocus />
      </div>
      {error ? <p className="lp-conf" role="alert">{error}</p> : null}
      <div className="lp-row">
        <button type="button" className="lp-btn" onClick={onClose} disabled={busy}>{t("livePopup.review.cancel")}</button>
        <button type="button" className="lp-btn is-green" onClick={submit} disabled={!ok || busy}>
          <CheckCircle2 size={16} />
          {t("livePopup.resolve.submit")}
        </button>
      </div>
    </Dialog>
  );
}

export function EndDialog({ open, campaign, onClose, onDone, errText }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) setError("");
  }, [open]);
  if (!campaign) return null;
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await livePopupApi.end(campaign.id);
      onDone();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} busy={busy} icon={Square} tone="gray" title={t("livePopup.end.title")} subtitle={t("livePopup.end.sub")} width={480}>
      {error ? <p className="lp-conf" role="alert">{error}</p> : null}
      <div className="lp-row">
        <button type="button" className="lp-btn" onClick={onClose} disabled={busy} data-autofocus>{t("livePopup.review.cancel")}</button>
        <button type="button" className="lp-btn is-rq" onClick={submit} disabled={busy}>
          <Square size={16} />
          {t("livePopup.end.submit")}
        </button>
      </div>
    </Dialog>
  );
}

export function UserHistoryDialog({ open, row, onClose, onOpen }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || !row) return undefined;
    let alive = true;
    setData(null);
    setError("");
    livePopupApi
      .userHistory(row.userId)
      .then((out) => alive && setData(out))
      .catch((err) => alive && setError(err?.message || "error"));
    return () => {
      alive = false;
    };
  }, [open, row]);
  if (!row) return null;
  return (
    <Dialog open={open} onClose={onClose} icon={History} tone="blue" title={t("livePopup.userHistory.title", { user: row.username })} subtitle={t("livePopup.userHistory.sub")} width={540}>
      {data?.exempt ? (
        <p className="lp-legend"><BellOff size={14} /> {t("livePopup.userHistory.exempt")}</p>
      ) : null}
      <div className="lp-hist is-scroll">
        {!data && !error ? [0, 1, 2].map((i) => <Skeleton key={i} h={46} r={12} />) : null}
        {error ? <p className="lp-empty-line is-bad" role="alert">{error}</p> : null}
        {data && !data.items.length ? <p className="lp-empty-line">{t("livePopup.userHistory.empty")}</p> : null}
        {(data?.items || []).map((it) => {
          const Glyph = livePopupIcon(it);
          const st = rowStatus({ status: it.status, missedReason: null });
          return (
            <button key={it.campaignId} type="button" className="lp-hrow" onClick={() => onOpen(it.campaignId)}>
              <span className="lp-hic" style={{ "--c": TONE_COLOR[it.severity] }} aria-hidden="true"><Glyph size={16} /></span>
              <span className="lp-ht">
                <b>{it.title}</b>
                <small>{dayTime(it.sentAt, locale)}</small>
              </span>
              <Chip tone={st.tone}>{t(st.key, { time: "" }).replace(/\s*·\s*$/, "")}</Chip>
            </button>
          );
        })}
      </div>
      <div className="lp-row">
        <button type="button" className="lp-btn" onClick={onClose} data-autofocus>{t("livePopup.composer.close")}</button>
      </div>
    </Dialog>
  );
}
