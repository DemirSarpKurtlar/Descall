/**
 * İşlem kaydı dialogs:
 *  - AnomalyReviewDialog (draft B2): the alert window (minute timeline, affected
 *    accounts, common point) and "Ne yapılsın?": reviewed / undo the selected /
 *    suspend the admin's section (owner applies, others ask the owner).
 *  - UndoDialog: reason required, optional e-mail, linked to the original entry.
 *  - SaveViewDialog, RulesDialog ("Uyarı kuralları"), FiltersDialog ("Filtreler").
 * Every write goes through adminFetch (step-up code prompt on 403 STEP_UP_REQUIRED).
 */
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { AlertTriangle, Bell, Bookmark, Check, Link, SlidersHorizontal, Undo2, UserGear } from "../../ui/Icon.jsx";
import { formatDate } from "../../../i18n/format.js";
import { trGenitive } from "../../../lib/trSuffix.js";
import { AuditDialog, Av } from "./AuditUi.jsx";
import { CATEGORIES, RANGES, SEVERITIES, clock, durationOf, errorKey, handle, secondsOf, targetOf, timelineDots, tokenText, undoFamily } from "./auditModel.js";
import { relText, sentenceText } from "./auditText.js";

function errText(e, t) {
  const k = errorKey(e);
  return k ? t(k) : e?.message || t("auditLog.err.generic");
}

const isTr = (locale) => String(locale || "").toLowerCase().startsWith("tr");

/* ------------------------------------------------------------------ */
/* B2: olağan dışı etkinlik incelemesi                                 */
/* ------------------------------------------------------------------ */

export function AnomalyReviewDialog({ anomaly, onClose, onDone, t, locale, catLabel, owner, ownerName, can, onGotoStaff }) {
  const open = Boolean(anomaly);
  const a = anomaly || {};
  const undoable = useMemo(() => (a.targets || []).filter((x) => x.undo === "open"), [a.targets]);
  const [choice, setChoice] = useState("undo");
  const [picked, setPicked] = useState(() => new Set());
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const canUndoSection = a.action === "ban" || a.action === "timeout" ? can("moderation") : true;
  const undoOffered = undoable.length > 0 && canUndoSection && ["ban", "timeout", "wallet_freeze", "access_ban", "premium_grant", "special_badge_grant"].includes(a.action);
  const suspendOffered = Boolean(a.section && a.actor && !a.actor.owner && a.actorId);

  useEffect(() => {
    if (!open) return;
    setChoice(undoOffered ? "undo" : "reviewed");
    setPicked(new Set(undoable.map((x) => x.entryId)));
    setReason("");
    setNotify(true);
    setErr("");
    setBusy(false);
  }, [open, a.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const actor = handle(a.actorUsername || "?");
  const secs = Math.max(1, Math.round((Date.parse(a.to) - Date.parse(a.from)) / 1000) || a.windowSec);
  const isBan = a.action === "ban";
  const dots = timelineDots(a.from, a.to, (a.targets || []).map((x) => x.at));
  const ruleText = t(`auditLog.rules.${a.rule}Desc`, { limit: a.limit, window: a.windowSec });
  const sectionLabel = a.section ? t(`auditLog.sec.${a.section}`) : "";
  const actorSecs = (a.actor?.sections || []).slice(0, 4).map((s) => t(`auditLog.sec.${s}`)).join(", ");
  const nPicked = picked.size;
  const shown = (a.targets || []).slice(0, 8);
  const rest = (a.targets || []).length - shown.length;

  const submit = async () => {
    if (reason.trim().length < 5) {
      setErr(t("auditLog.err.REASON_REQUIRED"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const body = { key: a.key, decision: choice, reason: reason.trim(), notify: choice === "undo" && isBan ? notify : false };
      if (choice === "undo") body.entryIds = [...picked];
      const r = await adminFetch("/audit/anomalies/review", { method: "POST", body: JSON.stringify(body) });
      let msg;
      if (choice === "reviewed") msg = t("auditLog.review.doneReviewed");
      else if (choice === "undo") {
        const failed = (r.results || []).filter((x) => !x.ok).length;
        msg = failed ? t("auditLog.review.doneUndoPartial", { ok: r.undone || 0, failed }) : t("auditLog.review.doneUndo", { n: r.undone || 0 });
      } else msg = r.applied ? t("auditLog.review.doneSuspend", { actor, section: sectionLabel }) : t("auditLog.review.doneRequest");
      onDone(msg);
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const actorForms = isTr(locale) ? trGenitive(actor) : actor;
  const mainLabel =
    choice === "reviewed"
      ? t("auditLog.review.submitReviewed")
      : choice === "undo"
        ? isBan
          ? t("auditLog.review.submitUndoBan", { n: nPicked })
          : t("auditLog.review.submitUndo", { n: nPicked })
        : owner
          ? t("auditLog.review.submitSuspend")
          : t("auditLog.review.submitRequest");

  const side = (
    <div className="alg-side-col">
      <div className="alg-lab">{t("auditLog.review.what")}</div>
      <div className="alg-radios" role="radiogroup" aria-label={t("auditLog.review.what")}>
        <Radio on={choice === "reviewed"} onPick={() => setChoice("reviewed")} title={t("auditLog.review.reviewed")} sub={t("auditLog.review.reviewedSub")} />
        {undoOffered ? (
          <Radio
            on={choice === "undo"}
            danger
            onPick={() => setChoice("undo")}
            title={isBan ? t("auditLog.review.undoBan", { n: nPicked }) : t("auditLog.review.undo", { n: nPicked })}
            sub={t("auditLog.review.undoSub")}
            testId="audit-review-undo"
          />
        ) : null}
        {suspendOffered ? (
          <Radio
            on={choice === "suspend"}
            onPick={() => setChoice("suspend")}
            title={t("auditLog.review.suspend", { actor: actorForms, section: sectionLabel })}
            sub={owner ? t("auditLog.review.suspendOwner") : t("auditLog.review.suspendRequest", { owner: handle(ownerName || "admin") })}
          />
        ) : null}
      </div>
      {!suspendOffered && a.section && owner ? (
        <button type="button" className="alg-link alg-staff-link" onClick={onGotoStaff}>
          <UserGear size={16} />
          {t("auditLog.review.staffLink")}
        </button>
      ) : null}
      <label className="alg-field">
        <span className="alg-lab">
          {t("auditLog.review.reason")} <span className="alg-req">*</span>
        </span>
        <textarea className="alg-inp alg-ta" rows={3} maxLength={500} value={reason} placeholder={t("auditLog.review.reasonPh")} onChange={(e) => setReason(e.target.value)} data-autofocus data-testid="audit-review-reason" />
      </label>
      {choice === "undo" && isBan ? (
        <label className="alg-check">
          <GlassCheckbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>{t("auditLog.review.notify")}</span>
        </label>
      ) : null}
      {err ? (
        <p className="alg-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="alg-row alg-row-end">
        <button type="button" className="alg-btn is-ghost" onClick={onClose} disabled={busy}>
          {t("auditLog.cancel")}
        </button>
        <button type="button" className={`alg-btn ${choice === "reviewed" ? "is-brand" : "is-red"}`} onClick={submit} disabled={busy || (choice === "undo" && !nPicked)} data-testid="audit-review-submit">
          {choice === "undo" ? <Undo2 size={18} /> : choice === "reviewed" ? <Check size={18} /> : <UserGear size={18} />}
          {busy ? t("auditLog.saving") : mainLabel}
        </button>
      </div>
    </div>
  );

  return (
    <AuditDialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={AlertTriangle}
      tone="red"
      title={t(`auditLog.review.title.${a.rule}`)}
      subtitle={t("auditLog.review.rule", { rule: lowerFirst(ruleText, locale), from: clock(a.from, locale), to: clock(a.to, locale) })}
      side={side}
      width={600}
      sideWidth={380}
      testId="audit-review"
    >
      <div className="alg-tgt is-compact">
        <Av user={a.actor?.user} name={a.actorUsername} size="m" />
        <div>
          <b>{actor}</b>
          <small>{a.actor?.owner ? t("auditLog.review.ownerSub", { n: a.actor?.week || 0 }) : t("auditLog.review.actorSub", { sections: actorSecs || "—", n: a.actor?.week || 0 })}</small>
        </div>
        <span className="alg-chip is-red alg-ml">{isBan ? t("auditLog.review.chipBan", { secs, n: a.count }) : t("auditLog.review.chip", { secs, n: a.count })}</span>
      </div>
      <div>
        <div className="alg-lab">{secs <= 90 ? t("auditLog.review.minute") : t("auditLog.review.window")}</div>
        <div className="alg-mtl" aria-hidden="true">
          {dots.map((p, i) => (
            <i key={i} style={{ left: `${p}%` }} />
          ))}
        </div>
        <div className="alg-mtl-ax">
          <span className="tnum">{clock(a.from, locale)}</span>
          <span className="tnum">{clock(a.to, locale)}</span>
        </div>
      </div>
      <div>
        <div className="alg-lab">{t("auditLog.review.accounts", { n: (a.targets || []).length })}</div>
        <div className="alg-bl">
          {shown.map((x) => {
            const open2 = x.undo === "open";
            const on = picked.has(x.entryId);
            const d = durationOf(x.permanent ? 0 : secondsOf({ at: x.at, meta: { expiresAt: x.expiresAt } }));
            return (
              <button
                key={x.entryId}
                type="button"
                className={`alg-bl-r${choice === "undo" && open2 ? (on ? " is-on" : " is-off") : ""}`}
                aria-pressed={choice === "undo" && open2 ? on : undefined}
                disabled={choice !== "undo" || !open2}
                onClick={() =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (n.has(x.entryId)) n.delete(x.entryId);
                    else n.add(x.entryId);
                    return n;
                  })
                }
              >
                <Av user={x.user} name={x.user?.username || x.target} />
                <b>{x.user ? handle(x.user.username) : String(x.target || "?").slice(0, 12)}</b>
                <em>
                  {open2
                    ? [x.permanent ? t("auditLog.review.permanent") : t(d.key, { n: d.n }), x.category ? catLabel(x.category) : null].filter(Boolean).join(" · ")
                    : t(`auditLog.review.state.${["ALREADY_REVERSED", "ALREADY_UNDONE", "SUPERSEDED", "NO_PERMISSION"].includes(x.undo) ? x.undo : "closed"}`)}
                </em>
              </button>
            );
          })}
        </div>
        {rest > 0 || a.common ? (
          <p className="alg-muted alg-small alg-bl-more">
            {[rest > 0 ? t("auditLog.review.moreAccounts", { n: rest }) : null, a.common ? t("auditLog.review.common", { n: a.common.members, server: a.common.name || "?" }) : null].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
    </AuditDialog>
  );
}

function lowerFirst(s, locale) {
  const str = String(s || "");
  return str ? str.charAt(0).toLocaleLowerCase(locale || "tr") + str.slice(1) : str;
}

function Radio({ on, onPick, title, sub, danger = false, testId }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`alg-radio${on ? " is-on" : ""}${danger ? " is-danger" : ""}`} onClick={onPick} data-testid={testId}>
      <span className="alg-rb" aria-hidden="true" />
      <span>
        <b>{title}</b>
        <small>{sub}</small>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Geri al                                                             */
/* ------------------------------------------------------------------ */

export function UndoDialog({ entry, users, servers, onClose, onDone, t, locale, catLabel, now }) {
  const open = Boolean(entry);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setReason("");
    setNotify(true);
    setErr("");
    setBusy(false);
  }, [open, entry?.id]);
  if (!open) return null;
  const fam = undoFamily(entry.action) || "ban";
  const tgt = targetOf(entry, users, servers);
  const tUser = tgt.userId ? users?.[tgt.userId] : null;
  const d = durationOf(secondsOf(entry));
  const facts = [handle(entry.actorUsername || "?"), entry.action === "ban" || entry.action === "timeout" ? t(d.key, { n: d.n }) : null, entry.meta?.category ? catLabel(entry.meta.category) : null, clock(entry.at, locale).slice(0, 5)].filter(Boolean).join(" · ");

  const submit = async () => {
    if (reason.trim().length < 5) {
      setErr(t("auditLog.err.REASON_REQUIRED"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await adminFetch(`/audit/entry/${encodeURIComponent(entry.id)}/undo`, { method: "POST", body: JSON.stringify({ reason: reason.trim(), notify: fam === "ban" ? notify : false }) });
      onDone(r.emailed ? t("auditLog.undo.doneEmailed") : t("auditLog.undo.done", { sentence: sentenceText(entry, users, servers, t, locale) }));
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const side = (
    <div className="alg-side-col">
      <div className="alg-lab">{t("auditLog.undo.can")}</div>
      <div className="alg-led">
        {["ban", "timeout", "access", "wallet", "premium", "badge", "directory"].map((k) => (
          <div key={k} className={k === fam ? "is-on" : ""}>
            <span className="alg-muted">{t(`auditLog.undo.list.${k}`)}</span>
            <b>{t(`auditLog.undo.buttons.${k}`)}</b>
          </div>
        ))}
      </div>
      <div className="alg-sep" />
      <div className="alg-lab">{t("auditLog.undo.cannot")}</div>
      <p className="alg-muted alg-small">{t("auditLog.undo.cannotText")}</p>
      <div className="alg-sep" />
      <div className="alg-lab">{t("auditLog.undo.rebanTitle")}</div>
      <p className="alg-muted alg-small">{t("auditLog.undo.rebanText")}</p>
    </div>
  );

  return (
    <AuditDialog open={open} onClose={onClose} busy={busy} icon={Undo2} tone="amber" title={t(`auditLog.undo.titles.${fam}`)} subtitle={t("auditLog.undo.lead", { target: tgt.label || "—" })} side={side} width={560} sideWidth={320} testId="audit-undo">
      <div className="alg-tgt is-compact">
        <Av user={tUser} name={tgt.label} size="m" />
        <div>
          <b>{tgt.label || "—"}</b>
          <small>{t("auditLog.undo.original", { actor: facts, when: relText(entry.at, now, t) })}</small>
        </div>
      </div>
      <label className="alg-field">
        <span className="alg-lab">
          {t("auditLog.undo.reason")} <span className="alg-req">*</span>
        </span>
        <textarea className="alg-inp alg-ta" rows={3} maxLength={500} value={reason} placeholder={t("auditLog.undo.reasonPh")} onChange={(e) => setReason(e.target.value)} data-autofocus data-testid="audit-undo-reason" />
      </label>
      {fam === "ban" ? (
        <label className="alg-check">
          <GlassCheckbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>{t("auditLog.undo.notify")}</span>
        </label>
      ) : null}
      <div className="alg-info">
        <Link size={18} />
        <span>{t("auditLog.undo.link")}</span>
      </div>
      {err ? (
        <p className="alg-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="alg-row">
        <button type="button" className="alg-btn is-ghost" onClick={onClose} disabled={busy}>
          {t("auditLog.cancel")}
        </button>
        <button type="button" className="alg-btn is-amber" onClick={submit} disabled={busy} data-testid="audit-undo-submit">
          <Undo2 size={18} />
          {busy ? t("auditLog.saving") : t(`auditLog.undo.buttons.${fam}`)}
        </button>
      </div>
    </AuditDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Görünümü kaydet                                                     */
/* ------------------------------------------------------------------ */

export function SaveViewDialog({ open, tokens, query, onClose, onSaved, t }) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setName("");
    setShared(false);
    setErr("");
    setBusy(false);
  }, [open]);
  if (!open) return null;
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = await adminFetch("/audit/views", { method: "POST", body: JSON.stringify({ name: name.trim(), query, shared }) });
      onSaved(r.view);
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuditDialog open={open} onClose={onClose} busy={busy} icon={Bookmark} tone="blue" title={t("auditLog.saveView.title")} subtitle={t("auditLog.saveView.subtitle")} width={480} testId="audit-save-view">
      <label className="alg-field">
        <span className="alg-lab">{t("auditLog.saveView.name")}</span>
        <input
          className="alg-inp"
          value={name}
          maxLength={60}
          placeholder={t("auditLog.saveView.namePh")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          data-autofocus
          data-testid="audit-save-view-name"
        />
      </label>
      <div>
        <div className="alg-lab">{t("auditLog.saveView.contains")}</div>
        <div className="alg-tokrow">
          {tokens.length ? (
            tokens.map((tok, i) => {
              const tx = tokenText(tok, t);
              return (
                <span key={i} className="alg-tok is-static">
                  <b>{tx.kindLabel}</b>
                  <span className="alg-tok-v">{tx.valueLabel}</span>
                </span>
              );
            })
          ) : (
            <span className="alg-muted alg-small">{t("auditLog.saveView.empty")}</span>
          )}
        </div>
      </div>
      <label className="alg-check">
        <GlassCheckbox checked={shared} onChange={(e) => setShared(e.target.checked)} />
        <span>
          {t("auditLog.saveView.share")}
          <small>{t("auditLog.saveView.shareSub")}</small>
        </span>
      </label>
      {err ? (
        <p className="alg-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="alg-row">
        <button type="button" className="alg-btn is-ghost" onClick={onClose} disabled={busy}>
          {t("auditLog.cancel")}
        </button>
        <button type="button" className="alg-btn is-brand" onClick={submit} disabled={busy || !name.trim()} data-testid="audit-save-view-submit">
          <Bookmark size={18} />
          {busy ? t("auditLog.saving") : t("auditLog.save")}
        </button>
      </div>
    </AuditDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Uyarı kuralları                                                     */
/* ------------------------------------------------------------------ */

export function RulesDialog({ open, onClose, onSaved, t, locale }) {
  const [state, setState] = useState({ loading: true, ready: true, rules: [], updatedBy: null, updatedAt: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setErr("");
    setBusy(false);
    setState((s) => ({ ...s, loading: true }));
    adminFetch("/audit/rules")
      .then((d) => setState({ loading: false, ready: d.ready !== false, rules: d.rules || [], updatedBy: d.updatedBy, updatedAt: d.updatedAt }))
      .catch((e) => {
        setState((s) => ({ ...s, loading: false }));
        setErr(errText(e, t));
      });
  }, [open, t]);
  if (!open) return null;
  const set = (key, patch) => setState((s) => ({ ...s, rules: s.rules.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      await adminFetch("/audit/rules", { method: "PUT", body: JSON.stringify({ rules: state.rules.map((r) => ({ key: r.key, enabled: r.enabled, limit: Number(r.limit), windowSec: Number(r.windowSec) })) }) });
      onSaved(t("auditLog.rules.saved"));
    } catch (e) {
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuditDialog open={open} onClose={onClose} busy={busy} icon={Bell} tone="blue" title={t("auditLog.rules.title")} subtitle={t("auditLog.rules.subtitle")} width={640} testId="audit-rules">
      {!state.ready ? <p className="alg-info is-amber">{t("auditLog.rules.notReady")}</p> : null}
      <div className="alg-rules">
        {state.rules.map((r) => (
          <div key={r.key} className={`alg-rule${r.enabled ? "" : " is-off"}`}>
            <label className="alg-check">
              <GlassCheckbox checked={r.enabled} onChange={(e) => set(r.key, { enabled: e.target.checked })} aria-label={t("auditLog.rules.enabled")} />
              <span>
                <b>{t(`auditLog.rules.${r.key}`)}</b>
                <small>{t(`auditLog.rules.${r.key}Desc`, { limit: r.limit, window: r.windowSec })}</small>
              </span>
            </label>
            <label className="alg-num">
              <span>{t("auditLog.rules.limit")}</span>
              <input className="alg-inp" type="number" min={1} max={1000} value={r.limit} onChange={(e) => set(r.key, { limit: e.target.value })} />
            </label>
            <label className="alg-num">
              <span>{t("auditLog.rules.window")}</span>
              <input className="alg-inp" type="number" min={10} max={86400} value={r.windowSec} onChange={(e) => set(r.key, { windowSec: e.target.value })} />
            </label>
          </div>
        ))}
      </div>
      {state.updatedBy ? <p className="alg-muted alg-small">{t("auditLog.rules.updated", { user: handle(state.updatedBy), when: formatDate(state.updatedAt, locale, { dateStyle: "medium", timeStyle: "short" }) })}</p> : null}
      {err ? (
        <p className="alg-err" role="alert">
          {err}
        </p>
      ) : null}
      <div className="alg-row">
        <button type="button" className="alg-btn is-ghost" onClick={onClose} disabled={busy}>
          {t("auditLog.cancel")}
        </button>
        <button type="button" className="alg-btn is-brand" onClick={submit} disabled={busy || state.loading || !state.ready}>
          <Check size={18} />
          {busy ? t("auditLog.saving") : t("auditLog.save")}
        </button>
      </div>
    </AuditDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Filtreler                                                           */
/* ------------------------------------------------------------------ */

function vals(tokens, kind) {
  const tok = tokens.find((x) => x.kind === kind);
  if (!tok) return [];
  return Array.isArray(tok.value) ? tok.value : [tok.value];
}

function toLocalInput(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function FiltersDialog({ open, tokens, merge, admins, onClose, onApply, t, locale }) {
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (!open) return;
    const rangeTok = tokens.find((x) => x.kind === "range");
    setDraft({
      actors: vals(tokens, "actor"),
      cats: vals(tokens, "cat"),
      sevs: vals(tokens, "sev"),
      range: rangeTok ? rangeTok.value : "all",
      from: toLocalInput(rangeTok?.from),
      to: toLocalInput(rangeTok?.to),
      source: vals(tokens, "source")[0] || "",
      target: vals(tokens, "target")[0] || "",
      merge,
    });
  }, [open, tokens, merge]);
  if (!open || !draft) return null;
  const toggle = (k, v) => setDraft((d) => ({ ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] }));
  const apply = () => {
    const keep = tokens.filter((x) => ["text", "action"].includes(x.kind));
    const next = [...keep];
    if (draft.actors.length) next.push({ kind: "actor", value: draft.actors });
    if (draft.cats.length) next.push({ kind: "cat", value: draft.cats });
    if (draft.target.trim()) next.push({ kind: "target", value: draft.target.trim().replace(/^@/, "") });
    if (draft.range === "custom") {
      const from = draft.from ? new Date(draft.from).toISOString() : null;
      const to = draft.to ? new Date(draft.to).toISOString() : null;
      if (from || to) next.push({ kind: "range", value: "custom", from, to });
    } else if (draft.range !== "all") next.push({ kind: "range", value: draft.range });
    if (draft.sevs.length) next.push({ kind: "sev", value: draft.sevs });
    if (draft.source) next.push({ kind: "source", value: draft.source });
    onApply(next, draft.merge);
  };
  const pill = (on, label, onClick, key) => (
    <button key={key} type="button" className={`alg-pill${on ? " is-on" : ""}`} aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <AuditDialog open={open} onClose={onClose} icon={SlidersHorizontal} tone="blue" title={t("auditLog.filters.title")} width={620} testId="audit-filters">
      <div>
        <div className="alg-lab">{t("auditLog.filters.actor")}</div>
        <div className="alg-pills">
          {pill(draft.actors.includes("agent"), t("auditLog.agent"), () => toggle("actors", "agent"), "agent")}
          {(admins || []).slice(0, 24).map((a) => pill(draft.actors.includes(a.username), handle(a.username), () => toggle("actors", a.username), a.id))}
        </div>
      </div>
      <div>
        <div className="alg-lab">{t("auditLog.filters.cat")}</div>
        <div className="alg-pills">{CATEGORIES.map((c) => pill(draft.cats.includes(c), t(`auditLog.cat.${c}`), () => toggle("cats", c), c))}</div>
      </div>
      <div>
        <div className="alg-lab">{t("auditLog.filters.sev")}</div>
        <div className="alg-pills">{SEVERITIES.map((s) => pill(draft.sevs.includes(s), t(`auditLog.sev.${s}`), () => toggle("sevs", s), s))}</div>
      </div>
      <div>
        <div className="alg-lab">{t("auditLog.filters.range")}</div>
        <div className="alg-pills">
          {RANGES.map((r) => pill(draft.range === r, t(`auditLog.range.${r}`), () => setDraft((d) => ({ ...d, range: r })), r))}
          {pill(draft.range === "custom", t("auditLog.range.custom"), () => setDraft((d) => ({ ...d, range: "custom" })), "custom")}
        </div>
        {draft.range === "custom" ? (
          <div className="alg-row alg-dates">
            <label className="alg-num">
              <span>{t("auditLog.filters.from")}</span>
              <input className="alg-inp" type="datetime-local" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
            </label>
            <label className="alg-num">
              <span>{t("auditLog.filters.to")}</span>
              <input className="alg-inp" type="datetime-local" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
            </label>
          </div>
        ) : null}
      </div>
      <div className="alg-row alg-row-2">
        <label className="alg-num">
          <span>{t("auditLog.filters.target")}</span>
          <input className="alg-inp" value={draft.target} placeholder={t("auditLog.filters.targetPh")} onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))} />
        </label>
        <div>
          <div className="alg-lab">{t("auditLog.filters.source")}</div>
          <div className="alg-pills">
            {pill(!draft.source, t("auditLog.filters.anySource"), () => setDraft((d) => ({ ...d, source: "" })), "any")}
            {["panel", "agent"].map((s) => pill(draft.source === s, t(`auditLog.source.${s}`), () => setDraft((d) => ({ ...d, source: s })), s))}
          </div>
        </div>
      </div>
      <label className="alg-check">
        <GlassCheckbox checked={draft.merge} onChange={(e) => setDraft((d) => ({ ...d, merge: e.target.checked }))} />
        <span>
          {t("auditLog.filters.merge")}
          <small>{t("auditLog.filters.mergeSub")}</small>
        </span>
      </label>
      <div className="alg-row">
        <button type="button" className="alg-btn is-ghost" onClick={() => onApply([], true)}>
          {t("auditLog.filters.reset")}
        </button>
        <button type="button" className="alg-btn is-brand" onClick={apply} data-testid="audit-filters-apply">
          <Check size={18} />
          {t("auditLog.filters.apply")}
        </button>
      </div>
    </AuditDialog>
  );
}

