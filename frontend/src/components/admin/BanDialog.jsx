/**
 * Admin ban dialog (ban experience, owner-approved draft 5-admin, 2026-11-14).
 * One dialog for every ban entry point: Ban & Timeout Control, the user file
 * (dossier) and the report queue. Left: reason, duration, note to the user,
 * session / email / device options; right: a live preview of the screen the
 * user will see. Body mapping lives in banDialogModel.js (selftested).
 * Contract: docs/design/ban-experience/CONTRACT.md, section 7.
 *
 * Bulk mode (admin agent, Taslak B "Plan paneli"): pass `targets` (2+ accounts) and
 * `onSaveBulk`; the same form then edits the settings of a whole plan group instead of
 * banning one person. Nothing is sent from here: `onSaveBulk(body, form)` gets the same
 * body buildBanPayload makes, and the preview pages through the accounts. Without
 * `targets` the dialog is exactly the single-target dialog.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../api/adminHttp";
import { useLocale } from "../../context/LocaleContext";
import { Avatar } from "../ui/Avatar";
import GlassCheckbox from "../ui/GlassCheckbox";
import { AlertTriangle, Ban, Check, ChevronLeft, ChevronRight, Eye, Link, X } from "../ui/Icon.jsx";
import BanPreview from "./BanPreview.jsx";
import { categoryLabel, loadModerationMeta } from "./moderationMeta.js";
import {
  CUSTOM_DURATION,
  DEFAULT_CATEGORY,
  DEFAULT_DURATION,
  DEFAULT_FLAGS,
  FEATURED_CATEGORIES,
  MESSAGE_MAX,
  OTHER_CATEGORY,
  OTHER_TEXT_MAX,
  banButtonDisabled,
  banButtonLabel,
  banFormError,
  buildBanPayload,
  canSubmitBan,
  customMinutesValue,
  durationPills,
  headerFacts,
  isProtectedError,
  isProtectedTarget,
  previewBanState,
} from "./banDialogModel.js";
import "../../styles/admin-ban.css";
import "../../styles/admin-ban-bulk.css";

function initialForm(defaultCategory, defaultMessage, preset) {
  if (preset) return { ...preset, flags: { ...DEFAULT_FLAGS, ...(preset.flags || {}) } };
  return {
    category: defaultCategory && defaultCategory !== OTHER_CATEGORY ? defaultCategory : DEFAULT_CATEGORY,
    otherText: "",
    message: defaultMessage || "",
    durationId: DEFAULT_DURATION,
    customMinutes: "",
    flags: { ...DEFAULT_FLAGS },
  };
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {{id: string, username?: string, displayName?: string, display_name?: string, avatarUrl?: string, avatar_url?: string, isAdmin?: boolean, is_admin?: boolean, isOwner?: boolean}} props.target
 * @param {() => void} props.onClose
 * @param {(info: {target: object, body: object, result: object, message: string}) => void} [props.onBanned]
 * @param {string} [props.endpoint] admin path to POST to; defaults to /users/:id/ban
 * @param {object} [props.meta] /moderation/meta answer when the caller already has it
 * @param {number} [props.reportCount]
 * @param {number} [props.deviceCount]
 * @param {string} [props.defaultCategory]
 * @param {object[]} [props.targets] bulk mode: every account the settings apply to
 * @param {{code: string, version: number}} [props.bulk] bulk mode: the plan the group belongs to
 * @param {object} [props.initialForm] bulk mode: the group's current settings (banDialogModel form)
 * @param {(body: object, form: object) => Promise<void>|void} [props.onSaveBulk]
 * @param {string} [props.contextNote] İşlem kaydı "Yeniden yasakla": where the dialog was opened from (info line)
 * @param {object} [props.extraBody] fields merged into the POST body (e.g. { auditLink } for the audit entry)
 */
export default function BanDialog({
  open,
  target,
  onClose,
  onBanned,
  endpoint,
  meta: metaProp,
  reportCount,
  deviceCount,
  defaultCategory,
  defaultMessage,
  targets,
  bulk,
  initialForm: presetForm,
  onSaveBulk,
  contextNote,
  extraBody,
}) {
  const { t } = useLocale();
  const bulkMode = Array.isArray(targets) && targets.length > 0 && typeof onSaveBulk === "function";
  const [previewIndex, setPreviewIndex] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const titleId = useId();
  const dialogRef = useRef(null);
  const [meta, setMeta] = useState(metaProp || null);
  const [facts, setFacts] = useState({});
  const [form, setForm] = useState(() => initialForm(defaultCategory, defaultMessage));
  const [otherOpen, setOtherOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [protectedHit, setProtectedHit] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const subjectTarget = bulkMode ? targets[Math.min(previewIndex, targets.length - 1)] : target;
  const targetId = bulkMode ? `bulk:${targets.length}` : target?.id || null;

  // Fresh form each time the dialog opens for a user.
  useEffect(() => {
    if (!open) return;
    const f = initialForm(defaultCategory, defaultMessage, bulkMode ? presetForm : null);
    setPreviewIndex(0);
    setListOpen(false);
    setForm(f);
    setOtherOpen(!FEATURED_CATEGORIES.includes(f.category));
    setErr("");
    setBusy(false);
    setProtectedHit(false);
    setNow(Date.now());
    setFacts({});
  }, [open, targetId, defaultCategory, defaultMessage]);

  useEffect(() => {
    if (metaProp?.categories?.length) setMeta(metaProp);
  }, [metaProp]);

  useEffect(() => {
    if (!open || meta?.categories?.length) return undefined;
    let alive = true;
    loadModerationMeta()
      .then((m) => alive && setMeta(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, meta]);

  // Report / device counts and the admin flag come from the user file when the caller did not pass them.
  useEffect(() => {
    if (!open || !targetId || bulkMode) return undefined;
    if (Number.isFinite(reportCount) && Number.isFinite(deviceCount)) return undefined;
    let alive = true;
    adminFetch(`/people/${encodeURIComponent(targetId)}/dossier`)
      .then((d) => {
        if (!alive || !d) return;
        setFacts({
          reportCount: Array.isArray(d.reports?.against) ? d.reports.against.length : undefined,
          deviceCount: Array.isArray(d.sessions) ? d.sessions.length : undefined,
          isAdmin: Boolean(d.identity?.isAdmin),
          isOwner: Boolean(d.identity?.isOwner),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, targetId, reportCount, deviceCount, bulkMode]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus?.({ preventScroll: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const categories = meta?.categories || [];
  const banPresets = meta?.banPresets || [];
  const featured = useMemo(() => {
    if (!categories.length) return [...FEATURED_CATEGORIES];
    const ids = new Set(categories.map((c) => c.id));
    return FEATURED_CATEGORIES.filter((id) => ids.has(id));
  }, [categories]);
  const restCategories = useMemo(
    () => categories.filter((c) => !featured.includes(c.id) && c.id !== OTHER_CATEGORY),
    [categories, featured]
  );
  const pills = useMemo(() => durationPills(banPresets), [banPresets]);

  // A default from a report reason the server does not list falls back to the first pill.
  useEffect(() => {
    if (!categories.length) return;
    setForm((f) => (categories.some((c) => c.id === f.category) ? f : { ...f, category: DEFAULT_CATEGORY }));
  }, [categories]);

  const subject = useMemo(
    () => ({
      ...(subjectTarget || {}),
      isAdmin: Boolean(subjectTarget?.isAdmin || subjectTarget?.is_admin || facts.isAdmin),
      isOwner: Boolean(subjectTarget?.isOwner || facts.isOwner),
    }),
    [subjectTarget, facts.isAdmin, facts.isOwner]
  );
  const blocked = protectedHit || isProtectedTarget(subject);
  const canSubmit = canSubmitBan({ form, target: subject, busy, protectedHit });
  const buttonDisabled = banButtonDisabled({ target: subject, busy, protectedHit });

  const set = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);
  const setFlag = useCallback((key, value) => setForm((f) => ({ ...f, flags: { ...f.flags, [key]: value } })), []);

  const durationText = (id) =>
    id === CUSTOM_DURATION
      ? t("banAdmin.dur.minutes", { n: customMinutesValue(form.customMinutes) })
      : t(`banAdmin.dur.${id}`);
  const btn = banButtonLabel(form.durationId, form.customMinutes);
  const btnText =
    btn.key === "banAdmin.banFor" ? t("banAdmin.banFor", { duration: durationText(form.durationId) }) : t(btn.key, btn.params);

  const previewState = useMemo(
    () => previewBanState({ target: subject, form, categories, banPresets, now }),
    [subject, form, categories, banPresets, now]
  );
  const catText =
    form.category === OTHER_CATEGORY && form.otherText.trim()
      ? form.otherText.trim()
      : categoryLabel(form.category, categories, t);

  const submit = async () => {
    if (!canSubmit) {
      const key = banFormError(form);
      if (key) setErr(t(key));
      return;
    }
    setBusy(true);
    setErr("");
    if (bulkMode) {
      try {
        await onSaveBulk(buildBanPayload(form), form);
        onClose?.();
      } catch (e) {
        setErr(e?.message || t("banAdmin.failed"));
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const body = extraBody ? { ...buildBanPayload(form), ...extraBody } : buildBanPayload(form);
      const path = endpoint || `/users/${encodeURIComponent(targetId)}/ban`;
      const result = await adminFetch(path, { method: "POST", body: JSON.stringify(body) });
      onBanned?.({ target, body, result, message: t("banAdmin.banned", { username: target?.username || "" }) });
      onClose?.();
    } catch (e) {
      if (isProtectedError(e)) {
        setProtectedHit(true);
        setErr("");
      } else {
        setErr(e?.message || t("banAdmin.failed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const otherActive = !featured.includes(form.category);

  function formFields() {
    return (
      <>
        <section className="bad-field">
          <div className="bad-lab" id={`${titleId}-reason`}>{t("banAdmin.reason")}</div>
          <div className="bad-pills" role="group" aria-labelledby={`${titleId}-reason`}>
            {featured.map((id) => (
              <button
                key={id}
                type="button"
                className={`bad-pill${form.category === id ? " is-on" : ""}`}
                aria-pressed={form.category === id}
                onClick={() => {
                  set({ category: id });
                  setOtherOpen(false);
                }}
              >
                {t(`banAdmin.cat.${id}`)}
              </button>
            ))}
            <button
              type="button"
              className={`bad-pill${otherActive ? " is-on" : ""}`}
              aria-pressed={otherActive}
              aria-expanded={otherOpen}
              onClick={() => {
                setOtherOpen(true);
                if (!otherActive) set({ category: OTHER_CATEGORY });
              }}
            >
              {t("banAdmin.other")}
            </button>
          </div>
          {otherOpen ? (
            <div className="bad-more">
              {restCategories.length ? (
                <div className="bad-pills is-small" role="group" aria-label={t("banAdmin.otherCategories")}>
                  {/* Free-text "Other" first, so it is never scrolled out of view. */}
                  <button
                    type="button"
                    className={`bad-pill is-small${form.category === OTHER_CATEGORY ? " is-on" : ""}`}
                    aria-pressed={form.category === OTHER_CATEGORY}
                    onClick={() => set({ category: OTHER_CATEGORY })}
                  >
                    {t("Other")}
                  </button>
                  {restCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`bad-pill is-small${form.category === c.id ? " is-on" : ""}`}
                      aria-pressed={form.category === c.id}
                      onClick={() => set({ category: c.id })}
                    >
                      {t(c.label)}
                    </button>
                  ))}
                </div>
              ) : null}
              {form.category === OTHER_CATEGORY ? (
                <label className="bad-sub">
                  <span>{t("banAdmin.otherTextLabel")}</span>
                  <input
                    className="bad-input"
                    value={form.otherText}
                    onChange={(e) => set({ otherText: e.target.value })}
                    placeholder={t("banAdmin.otherTextPh")}
                    maxLength={OTHER_TEXT_MAX}
                    autoFocus
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="bad-field">
          <div className="bad-lab" id={`${titleId}-dur`}>{t("banAdmin.duration")}</div>
          <div className="bad-pills" role="group" aria-labelledby={`${titleId}-dur`}>
            {pills.map((id) => (
              <button
                key={id}
                type="button"
                className={`bad-pill${form.durationId === id ? " is-on" : ""}`}
                aria-pressed={form.durationId === id}
                onClick={() => set({ durationId: id })}
              >
                {t(`banAdmin.dur.${id}`)}
              </button>
            ))}
            <button
              type="button"
              className={`bad-pill is-small is-quiet${form.durationId === CUSTOM_DURATION ? " is-on" : ""}`}
              aria-pressed={form.durationId === CUSTOM_DURATION}
              onClick={() => set({ durationId: CUSTOM_DURATION })}
            >
              {t("banAdmin.custom")}
            </button>
          </div>
          {form.durationId === CUSTOM_DURATION ? (
            <label className="bad-sub is-inline">
              <span>{t("banAdmin.customMinutes")}</span>
              <input
                className="bad-input is-num"
                type="number"
                min={1}
                inputMode="numeric"
                value={form.customMinutes}
                onChange={(e) => set({ customMinutes: e.target.value })}
                placeholder="60"
                autoFocus
              />
            </label>
          ) : null}
        </section>

        <label className="bad-field">
          <span className="bad-lab">{t("banAdmin.noteLabel")}</span>
          <textarea
            className="bad-input bad-textarea"
            value={form.message}
            onChange={(e) => set({ message: e.target.value })}
            placeholder={t("banAdmin.notePh")}
            maxLength={MESSAGE_MAX}
            rows={3}
          />
        </label>

        <div className="bad-checks">
          <label className="bad-check">
            <GlassCheckbox checked={form.flags.revokeSessions} onChange={(e) => setFlag("revokeSessions", e.target.checked)} />
            <span>{t("banAdmin.revokeSessions")}</span>
          </label>
          <label className="bad-check">
            <GlassCheckbox checked={form.flags.notifyEmail} onChange={(e) => setFlag("notifyEmail", e.target.checked)} />
            <span>{t("banAdmin.notifyEmail")}</span>
          </label>
          <label className="bad-check">
            <GlassCheckbox checked={form.flags.alsoAccessBan} onChange={(e) => setFlag("alsoAccessBan", e.target.checked)} />
            <span>{t("banAdmin.alsoAccessBan")}</span>
          </label>
        </div>
      </>
    );
  }

  function renderBulk() {
    const count = targets.length;
    const who = (u) => u?.username || u?.displayName || u?.display_name || "?";
    const stack = targets.slice(0, 5);
    return createPortal(
      <div
        className="bad-scrim"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onClose?.();
        }}
      >
        <div className="bad is-bulk" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
          <div className="bad-form">
            <header className="bad-head bbk-head">
              <span className="bbk-ic" aria-hidden="true"><Ban size={22} /></span>
              <div className="bad-head-text">
                <h2 id={titleId}>{t("banAdmin.dialogTitle")}</h2>
                <p>{t("agentOps.bulk.subtitle", { count })}</p>
              </div>
              <button type="button" className="bbk-x" onClick={() => onClose?.()} disabled={busy} aria-label={t("agentOps.close")}>
                <X size={18} />
              </button>
            </header>

            <div className="bbk-banner">
              <span className="bbk-stack" aria-hidden="true">
                {stack.map((u, i) => (
                  <Avatar key={u.id || i} name={who(u)} size={26} user={{ username: u.username, displayName: who(u), avatarUrl: u.avatarUrl || u.avatar_url, avatar_url: u.avatar_url || u.avatarUrl }} />
                ))}
              </span>
              <span className="bbk-banner-text">
                <b>{t("agentOps.bulk.banner", { count })}</b>
                {bulk?.code ? ` · ${t("agentOps.bulk.bannerTail", { code: bulk.code, v: bulk.version })}` : ""}
              </span>
              <button type="button" className="bbk-link" aria-expanded={listOpen} onClick={() => setListOpen((v) => !v)}>
                {listOpen ? t("agentOps.bulk.hideList") : t("agentOps.bulk.list")}
              </button>
            </div>
            {listOpen ? (
              <ul className="bbk-list">
                {targets.map((u, i) => (
                  <li key={u.id || i}>
                    <button type="button" className={i === previewIndex ? "is-on" : ""} aria-label={`@${who(u)}`} aria-pressed={i === previewIndex} onClick={() => setPreviewIndex(i)}>@{who(u)}</button>
                  </li>
                ))}
              </ul>
            ) : null}

            {formFields()}

            <div className="bad-warn" role="note">
              <AlertTriangle size={18} />
              <span>{t("agentOps.bulk.warn", { count })}</span>
            </div>

            {err ? (
              <p className="bad-err" role="alert">
                {err}
              </p>
            ) : null}

            <div className="bad-acts">
              <button type="button" className="bad-btn is-ghost" onClick={() => onClose?.()} disabled={busy}>
                {t("banAdmin.cancel")}
              </button>
              <button type="button" className="bad-btn is-danger" disabled={busy} onClick={submit}>
                <Check size={18} />
                {busy ? t("agentOps.bulk.saving") : t("agentOps.bulk.save", { duration: durationText(form.durationId) })}
              </button>
            </div>
          </div>

          <aside className="bad-prev bbk-prev" aria-label={t("banAdmin.previewTitle")}>
            <div className="bad-lab bad-prev-lab">
              <Eye size={16} />
              {t("banAdmin.previewTitle")}
            </div>
            <BanPreview state={previewState} categoryLabel={catText} durationLabel={durationText(form.durationId)} />
            <p className="bbk-note">{t("agentOps.bulk.previewNote")}</p>
            <div className="bbk-pager">
              <span>{t("agentOps.bulk.preview")}</span>
              <span className="bbk-pager-nav">
                <button type="button" onClick={() => setPreviewIndex((i) => (i - 1 + count) % count)} aria-label={t("agentOps.bulk.prev")}>
                  <ChevronLeft size={14} />
                </button>
                <b className="tnum">{previewIndex + 1} / {count}</b>
                <button type="button" onClick={() => setPreviewIndex((i) => (i + 1) % count)} aria-label={t("agentOps.bulk.next")}>
                  <ChevronRight size={14} />
                </button>
              </span>
            </div>
          </aside>
        </div>
      </div>,
      document.body
    );
  }

  if (!open || !subjectTarget || typeof document === "undefined") return null;
  if (bulkMode) return renderBulk();

  const name = target.displayName || target.display_name || target.username || "?";
  const factList = headerFacts({
    username: target.username,
    reportCount: Number.isFinite(reportCount) ? reportCount : facts.reportCount,
    deviceCount: Number.isFinite(deviceCount) ? deviceCount : facts.deviceCount,
  });

  return createPortal(
    <div
      className="bad-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div className="bad" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <div className="bad-form">
          <header className="bad-head">
            <Avatar
              name={name}
              size={44}
              user={{
                username: target.username,
                displayName: name,
                avatarUrl: target.avatarUrl || target.avatar_url,
                avatar_url: target.avatar_url || target.avatarUrl,
              }}
            />
            <div className="bad-head-text">
              <h2 id={titleId}>{name}</h2>
              <p>
                {factList.map((f, i) => (
                  <span key={f.kind}>
                    {i ? " · " : ""}
                    {f.kind === "username"
                      ? f.value
                      : f.kind === "reports"
                        ? t("banAdmin.reportsCount", { count: f.value })
                        : t("banAdmin.devicesCount", { count: f.value })}
                  </span>
                ))}
              </p>
            </div>
          </header>

          {formFields()}

          {contextNote && !blocked ? (
            <div className="bad-warn is-link" role="note">
              <Link size={18} />
              <span>{contextNote}</span>
            </div>
          ) : null}

          <div className={`bad-warn${blocked ? " is-blocked" : ""}${contextNote && !blocked ? " is-hidden" : ""}`} role={blocked ? "alert" : undefined}>
            <AlertTriangle size={18} />
            <span>{blocked ? t("banAdmin.protected") : t("banAdmin.infoNotAdmin")}</span>
          </div>

          {err ? (
            <p className="bad-err" role="alert">
              {err}
            </p>
          ) : null}

          <div className="bad-acts">
            <button type="button" className="bad-btn is-ghost" onClick={() => onClose?.()} disabled={busy}>
              {t("banAdmin.cancel")}
            </button>
            <button type="button" className="bad-btn is-danger" disabled={buttonDisabled} onClick={submit}>
              <Ban size={18} />
              {busy ? t("banAdmin.banning") : btnText}
            </button>
          </div>
        </div>

        <aside className="bad-prev" aria-label={t("banAdmin.previewTitle")}>
          <div className="bad-lab bad-prev-lab">
            <Eye size={16} />
            {t("banAdmin.previewTitle")}
          </div>
          <BanPreview state={previewState} categoryLabel={catText} durationLabel={durationText(form.durationId)} />
        </aside>
      </div>
    </div>,
    document.body
  );
}
