/*
 * Bug Avcısı in Admin > Geri Bildirim (owner request 27 Nov 2026). Pieces the workspace mounts:
 *   useBugHunter      workspace data (GET /feedback/bug-hunter), confirm, undo, live refresh
 *   BugBanner         the confirmed state in the detail: severity, credit, bonus, level, fix, undo
 *   ConfirmSheet      right-side panel: severity (with the bonus), visual / UI, duplicate link,
 *                     note, "what happens" and the live desktop + phone preview of the sender's card
 *   UndoDialog        reason required, says what happens to the bonus and the badge
 *   LeaderCard        "Bug Avcıları": totals, top reporters, severity mix, past candidates
 *   CandidatesSheet   read-only list of past items that look like confirmed bugs
 *   AdminBugCard      the bughunt line inside the admin thread
 * Text: bhunt.* (i18n/locales/bhunt.<locale>.js). Rules: backend lib/bugHunter/model.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import { useModalFocusRef } from "../../../hooks/useModalFocus";
import { SpecialBadgeIcon } from "../../badges/specialBadgeArt.jsx";
import BugHuntCard from "../../feedback/BugHuntCard.jsx";
import { relTime, sentAt, titleOf } from "./fbModel.js";
import {
  DEFAULT_RULES, ROMAN, SEVERITIES, SEV_COLOR, SEV_KEY,
  byFeedback, errorKey, mixSegments, outcome, previewEntry, reportedEarlier, rootOptions,
} from "./bhModel.js";
import "../../../styles/bug-hunter.css";

const EMPTY = { installed: true, confirmations: [], leaderboard: [], people: {}, totals: { first: 0, also: 0, critical: 0, paid: 0, fixed: 0, people: 0 }, rules: DEFAULT_RULES };

function Ico({ d, size = 15, stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
const I_BUG = "M9 7.5V6a3 3 0 0 1 6 0v1.5 M7.5 9.5h9v5a4.5 4.5 0 0 1-9 0z M12 9.5V19 M7.5 12.5H4 M20 12.5h-3.5 M5 8l2.6 1.8 M19 8l-2.6 1.8 M5 18l2.8-1.6 M19 18l-2.8-1.6";
const I_UNDO = "M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11";
const I_LINK = "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1";
const I_CHECK = "M5 12.5l4.5 4.5L19 7.5";
const I_X = "M6 6l12 12 M18 6 6 18";
const I_HIST = "M3.5 12a8.5 8.5 0 1 0 2.6-6.1 M3.5 4.5v4h4 M12 8v4.5l3 1.8";

export function SevTag({ severity, small = false }) {
  const { t } = useLocale();
  const c = SEV_COLOR[severity] || SEV_COLOR.medium;
  return (
    <span className={`bh-sev${small ? " is-sm" : ""}`} style={{ "--c": c }}>
      <em />{t(SEV_KEY[severity] || SEV_KEY.medium)}
    </span>
  );
}

/** Workspace data + actions. `onFeedback(f)` merges a reloaded feedback row into the list. */
export function useBugHunter({ socket, onFeedback, flash }) {
  const { t } = useLocale();
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await adminFetch("/feedback/bug-hunter");
      setData({ ...EMPTY, ...(d || {}), rules: d?.rules || DEFAULT_RULES });
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!socket?.on) return undefined;
    const on = () => load();
    socket.on("feedback:bughunt", on);
    return () => socket.off?.("feedback:bughunt", on);
  }, [socket, load]);
  const map = useMemo(() => byFeedback(data.confirmations), [data.confirmations]);

  const confirm = useCallback(async (feedbackId, body) => {
    try {
      const d = await adminFetch(`/feedback/${encodeURIComponent(feedbackId)}/bug-confirm`, { method: "POST", body: JSON.stringify(body) });
      if (d?.feedback) onFeedback?.(d.feedback);
      flash?.(d?.already ? t("bhunt.toastAlready") : t("bhunt.toastConfirmed", { amount: formatNumber(d?.reward?.amount || 0) }));
      await load();
      return { ok: true, data: d };
    } catch (err) {
      return { ok: false, message: t(errorKey(err?.code), { count: err?.count || 0 }) };
    }
  }, [load, onFeedback, flash, t]);

  const undo = useCallback(async (feedbackId, reason) => {
    try {
      const d = await adminFetch(`/feedback/${encodeURIComponent(feedbackId)}/bug-undo`, { method: "POST", body: JSON.stringify({ reason }) });
      if (d?.feedback) onFeedback?.(d.feedback);
      const r = d?.reward || {};
      flash?.(r.state === "reversed" ? `${t("bhunt.undoneToast")} · ${t("bhunt.undoReversed", { amount: formatNumber(r.amount || 0) })}` : r.state === "kept" ? `${t("bhunt.undoneToast")} · ${t("bhunt.undoKept")}` : t("bhunt.undoneToast"));
      await load();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: t(errorKey(err?.code), { count: err?.count || 0 }) };
    }
  }, [load, onFeedback, flash, t]);

  return { data, map, loaded, error, load, confirm, undo };
}

/** Header button: "Gerçek bug olarak doğrula" (or the confirmed tag). */
export function ConfirmButton({ confirmed, onClick, compact = false }) {
  const { t } = useLocale();
  if (confirmed?.live) {
    return <span className="bh-done-tag"><Ico d={I_BUG} size={14} />{t("bhunt.confirmShort")}</span>;
  }
  return (
    <button type="button" className={`bh-btn is-brand${compact ? " is-compact" : ""}`} onClick={onClick} data-bh="confirm-open">
      <Ico d={I_BUG} size={15} />{compact ? t("bhunt.confirmShort") : t("bhunt.confirmAction")}
    </button>
  );
}

/** Confirmed state in the detail (or the undone note). */
export function BugBanner({ f, c, items, onUndo }) {
  const { t, locale } = useLocale();
  if (!c) return null;
  if (!c.live) {
    return (
      <div className="bh-banner is-undone">
        <Ico d={I_UNDO} size={15} />
        <span>{t("bhunt.undoneBanner", { reason: c.undoReason || "—" })}</span>
      </div>
    );
  }
  const root = c.duplicateOf ? items.find((x) => x.id === c.duplicateOf) : null;
  const reward = c.rewardState === "paid" ? t("bhunt.rewardPaid", { amount: formatNumber(c.reward, locale) })
    : c.rewardState === "kept" ? t("bhunt.rewardKept", { amount: formatNumber(c.reward, locale) })
      : c.rewardState === "reversed" ? t("bhunt.rewardReversed", { amount: formatNumber(c.reward, locale) }) : t("bhunt.rewardNone");
  return (
    <div className={`bh-banner${c.severity === "critical" ? " is-critical" : ""}`} data-bh="banner">
      <div className="bh-banner-art"><SpecialBadgeIcon id="bughunter" size={42} level={c.credit === "first" ? c.levelAfter || 1 : 0} label="" /></div>
      <div className="bh-banner-main">
        <div className="bh-banner-h">
          <b>{t("bhunt.confirmShort")}</b>
          <SevTag severity={c.severity} />
          <span className={`bh-credit is-${c.credit}`}>{t(c.credit === "also" ? "bhunt.creditAlso" : "bhunt.creditFirst")}</span>
          {c.visual ? <span className="bh-credit is-visual"><SpecialBadgeIcon id="glitch" size={14} label="" />{t("bhunt.visual")}</span> : null}
          {c.credit === "first" && c.levelAfter ? <span className="bh-lvl">{t("bhunt.lbLevel", { level: ROMAN[c.levelAfter] })}</span> : null}
        </div>
        <div className="bh-banner-s">
          <span>{t("bhunt.confirmedAt", { date: sentAt(c.confirmedAt, locale) })}</span>
          <span className="bh-coin">{reward}</span>
          <span className={c.fixedAt ? "is-ok" : ""}>{c.fixedAt ? t("bhunt.fixedSent") : t("bhunt.fixedPending")}</span>
          {root ? <span>{t("bhunt.dupOf", { title: titleOf(root, t) })}</span> : null}
          {c.note ? <span className="bh-note">“{c.note}”</span> : null}
        </div>
      </div>
      <button type="button" className="bh-btn is-ghost is-danger" onClick={onUndo} data-bh="undo-open"><Ico d={I_UNDO} size={14} />{t("bhunt.undo")}</button>
    </div>
  );
}

/** Desktop + phone preview frames around the sender's card. */
function Preview({ entry }) {
  const { t } = useLocale();
  return (
    <div className="bh-prev" aria-label={t("bhunt.preview")}>
      <div className="bh-prev-k">{t("bhunt.preview")}</div>
      <div className="bh-prev-row">
        <div className="bh-prev-desk">
          <div className="bh-prev-bar"><i /><i /><i /><span>{t("bhunt.previewDesk")}</span></div>
          <div className="bh-prev-body"><BugHuntCard m={entry} t={t} /></div>
        </div>
        <div className="bh-prev-phone">
          <div className="bh-prev-notch" />
          <span className="bh-prev-cap">{t("bhunt.previewPhone")}</span>
          <div className="bh-prev-body"><BugHuntCard m={entry} t={t} /></div>
        </div>
      </div>
    </div>
  );
}

/** Right-side panel: everything the confirm needs, with the outcome and the live preview. */
export function ConfirmSheet({ f, items, data, map, onClose, onConfirm }) {
  const { t, locale } = useLocale();
  const trap = useModalFocusRef();
  const [severity, setSeverity] = useState(null);
  const [visual, setVisual] = useState(false);
  const [dupMode, setDupMode] = useState(false);
  const [dupOf, setDupOf] = useState(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const rules = data.rules || DEFAULT_RULES;
  const roots = useMemo(() => rootOptions(data.confirmations, items, { exclude: f.id, q, titleOf: (x) => titleOf(x, t) }), [data.confirmations, items, f.id, q, t]);
  const allRoots = useMemo(() => rootOptions(data.confirmations, items, { exclude: f.id, titleOf: (x) => titleOf(x, t) }), [data.confirmations, items, f.id, t]);
  const person = data.people?.[f.user.id] || null;
  const previous = map.get(f.id) || null;
  const o = outcome({ severity, duplicateOf: dupMode ? dupOf : null, roots: allRoots, visual, person, holds: Boolean(person && person.level >= 1), previous, rules });
  const root = dupMode && dupOf ? allRoots.find((r) => r.feedbackId === dupOf) : null;
  const ready = !busy && (dupMode ? Boolean(dupOf) : Boolean(severity));
  const entry = previewEntry(o, { fixedNow: f.status === "resolved" });
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setErr("");
    const body = dupMode ? { duplicateOf: dupOf, ...(severity ? { severity } : {}) } : { severity };
    const r = await onConfirm(f.id, { ...body, visual, note: note.trim() || undefined });
    setBusy(false);
    if (r.ok) onClose();
    else setErr(r.message);
  };
  const badgeLine = o.badge === "new" ? t("bhunt.badgeNew", { level: ROMAN[o.to] })
    : o.badge === "up" ? t("bhunt.badgeUp", { from: ROMAN[o.from], to: ROMAN[o.to] })
      : o.badge === "more" ? t("bhunt.badgeMore", { count: o.count }) : t("bhunt.badgeNone");
  const tierTo = o.next ? (o.next.min - o.count) : 0;
  const progress = o.next ? Math.min(1, o.count / o.next.min) : 1;
  return (
    <div className="bh-sheet-wrap">
      <div className="bh-dim" onClick={onClose} />
      <aside ref={trap} className="bh-sheet" role="dialog" aria-modal="true" aria-labelledby="bh-sheet-t" data-bh="sheet">
        <header className="bh-sheet-h">
          <span className="bh-sheet-ico"><Ico d={I_BUG} size={18} /></span>
          <div>
            <h3 id="bh-sheet-t">{t("bhunt.dialogTitle")}</h3>
            <p>{t("bhunt.dialogBody", { name: f.user.username })}</p>
          </div>
          <button type="button" className="bh-x" aria-label={t("bhunt.cancel")} onClick={onClose}><Ico d={I_X} size={15} /></button>
        </header>
        <div className="bh-sheet-b">
          <section className="bh-field">
            <div className="bh-lb">{t("bhunt.duplicate")}</div>
            <div className="bh-seg" role="radiogroup" aria-label={t("bhunt.duplicate")}>
              <button type="button" role="radio" aria-checked={!dupMode} className={!dupMode ? "on" : ""} onClick={() => { setDupMode(false); setDupOf(null); }}>{t("bhunt.duplicateNone")}</button>
              <button type="button" role="radio" aria-checked={dupMode} className={dupMode ? "on" : ""} disabled={!allRoots.length} onClick={() => { setDupMode(true); setVisual(false); }}><Ico d={I_LINK} size={13} />{t("bhunt.duplicatePick")}</button>
            </div>
            {dupMode ? (
              <div className="bh-dup">
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("bhunt.duplicateSearch")} aria-label={t("bhunt.duplicateSearch")} />
                <div className="bh-dup-list" role="listbox" aria-label={t("bhunt.duplicatePick")}>
                  {roots.length ? roots.slice(0, 30).map((r) => (
                    <button key={r.feedbackId} type="button" role="option" aria-selected={dupOf === r.feedbackId} className={dupOf === r.feedbackId ? "on" : ""} onClick={() => setDupOf(r.feedbackId)}>
                      <SevTag severity={r.severity} small />
                      <span className="tt">{r.title}</span>
                      <span className="us">@{r.username || "?"}</span>
                    </button>
                  )) : <div className="bh-empty">{t("bhunt.duplicateEmpty")}</div>}
                </div>
                <p className="bh-hint">{t("bhunt.duplicateHint")}</p>
                {root && reportedEarlier(f, root) ? <p className="bh-warn" role="alert">{t("bhunt.duplicateEarlier")}</p> : null}
              </div>
            ) : null}
          </section>
          <section className="bh-field">
            <div className="bh-lb">{t("bhunt.severity")}</div>
            <div className="bh-sevs" role="radiogroup" aria-label={t("bhunt.severity")}>
              {SEVERITIES.map((s) => {
                const on = (severity || (dupMode ? root?.severity : null)) === s;
                const amount = rules.rewards[dupMode ? "also" : "first"][s];
                return (
                  <button key={s} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} style={{ "--c": SEV_COLOR[s] }} onClick={() => setSeverity(s)} data-sev={s}>
                    <em />
                    <b>{t(SEV_KEY[s])}</b>
                    <small>{t("bhunt.rewardValue", { amount: formatNumber(amount, locale) })}</small>
                  </button>
                );
              })}
            </div>
          </section>
          <button type="button" role="switch" aria-checked={visual} className={`bh-toggle${visual ? " is-on" : ""}`} disabled={dupMode} onClick={() => setVisual((v) => !v)}>
            <span className="bh-switch" aria-hidden="true" />
            <span className="bh-toggle-t"><b>{t("bhunt.visual")}</b><small>{t("bhunt.visualHint")}</small></span>
            <SpecialBadgeIcon id="glitch" size={26} label="" />
          </button>
          <section className="bh-field">
            <div className="bh-lb">{t("bhunt.note")}</div>
            <input className="bh-input" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} placeholder={t("bhunt.notePh")} aria-label={t("bhunt.note")} />
          </section>
          <section className="bh-outcome" aria-live="polite">
            <div className="bh-out-art"><SpecialBadgeIcon id="bughunter" size={52} level={o.badge === "none" ? o.from : o.to} label="" /></div>
            <div className="bh-out-t">
              <b>{badgeLine}</b>
              <span className="bh-coin">{o.carried ? t("bhunt.rewardCarried") : `${t("bhunt.reward")}: ${t("bhunt.rewardValue", { amount: formatNumber(o.reward, locale) })}`}</span>
              <div className="bh-progress" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <small>{o.next ? t("bhunt.nextTier", { count: tierTo, level: ROMAN[o.next.level] }) : t("bhunt.topTier")}</small>
            </div>
          </section>
          <Preview entry={entry} />
          {err ? <p className="bh-err" role="alert">{err}</p> : null}
        </div>
        <footer className="bh-sheet-f">
          <button type="button" className="bh-btn is-ghost" onClick={onClose}>{t("bhunt.cancel")}</button>
          <button type="button" className="bh-btn is-brand" disabled={!ready} onClick={submit} data-bh="confirm-send"><Ico d={I_CHECK} size={15} stroke={2.6} />{t("bhunt.confirm")}</button>
        </footer>
      </aside>
    </div>
  );
}

/** Reason-required undo (like the other destructive admin actions). */
export function UndoDialog({ f, c, onClose, onUndo }) {
  const { t } = useLocale();
  const trap = useModalFocusRef();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = reason.trim().length >= 3 && !busy;
  const go = async () => {
    if (!ok) return;
    setBusy(true);
    const r = await onUndo(f.id, reason.trim());
    setBusy(false);
    if (r.ok) onClose();
    else setErr(r.message);
  };
  return (
    <div className="fb3-alertwrap">
      <div className="fb3-dim" onClick={onClose} />
      <div ref={trap} className="fb3-alert fb3-heavy bh-undo" role="alertdialog" aria-modal="true" aria-labelledby="bh-undo-t" data-bh="undo">
        <div className="bd">
          <h4 id="bh-undo-t">{t("bhunt.undoTitle")}</h4>
          <p>{t("bhunt.undoBody")}</p>
          {c?.reward ? <p className="bh-coin">{t("bhunt.rewardPaid", { amount: formatNumber(c.reward) })}</p> : null}
          <input className="fb3-reason" autoFocus value={reason} maxLength={300} aria-label={t("bhunt.undoReason")} placeholder={t("bhunt.undoReason")}
            onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } if (e.key === "Escape") { e.stopPropagation(); onClose(); } }} />
          {err ? <p className="bh-err" role="alert">{err}</p> : null}
        </div>
        <div className="bt">
          <button type="button" onClick={onClose}>{t("bhunt.cancel")}</button>
          <button type="button" className="red" disabled={!ok} onClick={go} data-bh="undo-send">{t("bhunt.undoConfirm")}</button>
        </div>
      </div>
    </div>
  );
}

function Av({ name, url }) {
  const style = url ? { backgroundImage: `url("${String(url).replace(/"/g, "%22")}")` } : undefined;
  return <span className="bh-av" style={style} aria-hidden="true">{url ? "" : String(name || "?").charAt(0).toLocaleUpperCase()}</span>;
}

/** "Bug Avcıları" card: totals strip, top reporters with the severity mix, past candidates. */
export function LeaderCard({ data, loaded, onCandidates, candidateCount = null, onPickUser }) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(true);
  const tot = data.totals || {};
  const rows = (data.leaderboard || []).slice(0, 5);
  return (
    <section className={`bh-lead${open ? " is-open" : ""}`} aria-label={t("bhunt.lbTitle")} data-bh="leader">
      <button type="button" className="bh-lead-h" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="bh-lead-ico"><SpecialBadgeIcon id="bughunter" size={26} level={3} label="" /></span>
        <span className="bh-lead-tt"><b>{t("bhunt.lbTitle")}</b><small>{t("bhunt.lbSub")}</small></span>
        <span className="bh-lead-kpi">
          <span><b className="tnum">{formatNumber(tot.first || 0, locale)}</b>{t("bhunt.totConfirmed")}</span>
          <span><b className="tnum">{formatNumber(tot.also || 0, locale)}</b>{t("bhunt.totAlso")}</span>
          <span className="is-crit"><b className="tnum">{formatNumber(tot.critical || 0, locale)}</b>{t("bhunt.totCritical")}</span>
          <span><b className="tnum">{formatNumber(tot.paid || 0, locale)}</b>{t("bhunt.totPaid")}</span>
        </span>
      </button>
      {open ? (
        <div className="bh-lead-b">
          {rows.length ? (
            <ol className="bh-rank">
              {rows.map((r, i) => (
                <li key={r.userId}>
                  <button type="button" onClick={() => onPickUser?.(r)}>
                    <span className="bh-rank-n tnum">{i + 1}</span>
                    <Av name={r.username} url={r.avatarUrl} />
                    <span className="bh-rank-nm"><b>{r.username || "?"}</b><small>{t("bhunt.lbBugs", { count: r.bugs })}{r.also ? ` · ${t("bhunt.lbAlso", { count: formatNumber(r.also, locale) })}` : ""}{r.legacy ? ` · ${t("bhunt.lbHistory", { count: formatNumber(r.legacy, locale) })}` : ""}</small></span>
                    <span className="bh-mix" aria-hidden="true">{mixSegments(r.bySeverity).map(([s, w]) => <i key={s} style={{ flexGrow: w, background: SEV_COLOR[s] }} />)}</span>
                    {r.level ? <SpecialBadgeIcon id="bughunter" size={22} level={r.level} label={t("bhunt.lbLevel", { level: ROMAN[r.level] })} /> : <span style={{ width: 22 }} />}
                  </button>
                </li>
              ))}
            </ol>
          ) : <div className="bh-empty">{loaded ? t("bhunt.lbEmpty") : t("bhunt.loading")}</div>}
          <button type="button" className="bh-link" onClick={onCandidates} data-bh="candidates-open"><Ico d={I_HIST} size={14} />{t("bhunt.candOpen", { count: candidateCount == null ? "…" : formatNumber(candidateCount, locale) })}</button>
        </div>
      ) : null}
    </section>
  );
}

const SIG = { fix_link: "bhunt.sigFixLink", resolved: "bhunt.sigResolved", fix_reply: "bhunt.sigFixReply" };
const CONF = { high: "bhunt.confHigh", medium: "bhunt.confMedium", low: "bhunt.confLow" };

/** Past candidates (read-only): who looks like a real bug finder from before this feature. */
export function CandidatesSheet({ list, onClose, onOpen }) {
  const { t, locale } = useLocale();
  const trap = useModalFocusRef();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const items = list?.items || [];
  return (
    <div className="bh-sheet-wrap">
      <div className="bh-dim" onClick={onClose} />
      <aside ref={trap} className="bh-sheet is-narrow" role="dialog" aria-modal="true" aria-labelledby="bh-cand-t" data-bh="candidates">
        <header className="bh-sheet-h">
          <span className="bh-sheet-ico"><Ico d={I_HIST} size={18} /></span>
          <div><h3 id="bh-cand-t">{t("bhunt.candTitle")}</h3><p>{t("bhunt.candHint")}</p></div>
          <button type="button" className="bh-x" aria-label={t("bhunt.cancel")} onClick={onClose}><Ico d={I_X} size={15} /></button>
        </header>
        <div className="bh-sheet-b">
          {!list ? <div className="bh-empty">{t("bhunt.loading")}</div> : items.length ? (
            <ul className="bh-cands">
              {items.map((i) => (
                <li key={i.feedbackId}>
                  <button type="button" onClick={() => onOpen(i)}>
                    <span className={`bh-conf is-${i.confidence}`}>{t(CONF[i.confidence])}</span>
                    <span className="tt"><b>{i.subject || "—"}</b><small>@{i.username || "?"} · {relTime(i.createdAt, locale)} · {i.signals.map((s) => t(SIG[s] || s)).join(", ")}</small></span>
                    {i.holdsBadge ? <span className="bh-holds"><SpecialBadgeIcon id="bughunter" size={16} label="" />{t("bhunt.candHolds")}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : <div className="bh-empty">{t("bhunt.candEmpty")}</div>}
        </div>
      </aside>
    </div>
  );
}

/** The bughunt line inside the admin thread. */
export function AdminBugCard({ r, now }) {
  const { t, locale } = useLocale();
  return (
    <div className={`bh-adm${r.void ? " is-void" : ""}`} data-bh="thread-card">
      <div className="bh-adm-k"><Ico d={I_BUG} size={13} />{r.void ? t("bhunt.adminCardVoid") : t("bhunt.adminCard")}{r.adminUsername ? ` · ${r.adminUsername}` : ""} · {relTime(r.created_at, locale, now)}</div>
      <BugHuntCard m={r} t={t} />
    </div>
  );
}

/** Small mark on list rows. */
export function RowMark({ c }) {
  if (!c?.live) return null;
  return <span className="bh-rowmark" style={{ "--c": SEV_COLOR[c.severity] }} aria-hidden="true"><Ico d={I_BUG} size={12} stroke={2.2} /></span>;
}

/** Loads the past-candidates list once, when first asked. */
export function useCandidates() {
  const [list, setList] = useState(null);
  const [count, setCount] = useState(null);
  const once = useRef(false);
  const load = useCallback(async () => {
    if (once.current) return;
    once.current = true;
    try {
      const d = await adminFetch("/feedback/bug-hunter/candidates");
      setList(d);
      setCount(d?.counts?.items ?? (d?.items || []).length);
    } catch {
      once.current = false;
      setList({ items: [] });
    }
  }, []);
  return { list, count, load };
}
