/**
 * Kullanıcı dosyası (owner-approved Draft A): every per-user admin action as a
 * dialog, shared by the user file and the Kullanıcılar list row menu.
 * Ban always opens the existing BanDialog. Every write goes through adminFetch
 * (step-up prompt, section check and audit on the server).
 *
 *   <UserActionHost action="timeout" user={{ id, username, ... }} onClose onDone />
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import GlassCheckbox from "../../ui/GlassCheckbox";
import {
  AlertTriangle, Award, Check, Coins, Crown, Gamepad2, Gift, Globe, Lock, LockOpen, LogOut, Megaphone, Monitor,
  ScrollText, Search, ShieldCheck, Smartphone, Timer, UserX, Unlock, X,
} from "../../ui/Icon.jsx";
import { SpecialBadgeIcon } from "../../badges/specialBadgeArt.jsx";
import { useBadgeCopy } from "../../badges/SpecialBadge.jsx";
import BanDialog from "../BanDialog.jsx";
import { loadModerationMeta, categoryLabel } from "../moderationMeta.js";
import { buildApplyPayload, newRequestId, PLANS } from "../premium/premiumModel.js";
import DossierDialog, { DialogActions, DialogError, Field, Pills } from "./DossierDialog.jsx";
import {
  CUSTOM,
  NOTE_MAX,
  REASON_MAX,
  TIMEOUT_PILLS,
  TIMEOUT_REASONS,
  buildTimeoutPayload,
  buildWalletGrant,
  canSubmitTimeout,
  canSubmitWallet,
  countdownParts,
  creditsPreview,
  errorKey,
  minutesValue,
  parseAmount,
  sessionKind,
  timeoutSeconds,
  walletPreview,
} from "./dossierModel.js";
import { agoWhen, num, shortWhen } from "./dossierFormat.js";

const enc = encodeURIComponent;

function useErrorText() {
  const { t } = useLocale();
  return useCallback(
    (err, fallbackKey = "dossier.err_generic") => {
      const key = errorKey(err);
      if (key) return t(key);
      return err?.message || t(fallbackKey);
    },
    [t]
  );
}

function handleOf(user) {
  return user?.username ? `@${user.username}` : user?.displayName || "";
}

/** Fetch one dossier section while a dialog is open. */
function useSection(userId, section, open) {
  const [state, setState] = useState({ data: null, error: null, loading: false });
  const load = useCallback(async () => {
    if (!userId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await adminFetch(`/people/${enc(userId)}/dossier/${section}`);
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
  }, [userId, section]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  return [state, load];
}

/* ---------------------------------------------------------------- Sustur */

function initialTimeout() {
  return { durationId: "1h", customMinutes: "", category: "spam", otherText: "", message: "", notify: true };
}

export function TimeoutDialog({ open, user, onClose, onDone }) {
  const { t } = useLocale();
  const errText = useErrorText();
  const [form, setForm] = useState(initialTimeout);
  const [meta, setMeta] = useState(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setForm(initialTimeout());
    setOtherOpen(false);
    setErr("");
    let alive = true;
    loadModerationMeta()
      .then((m) => alive && setMeta(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, user?.id]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const rest = useMemo(
    () => (meta?.categories || []).filter((c) => !TIMEOUT_REASONS.includes(c.id) && c.id !== "other"),
    [meta]
  );
  const seconds = timeoutSeconds(form.durationId, form.customMinutes);
  const durLabel =
    form.durationId === CUSTOM ? t("dossier.dur_minutes", { n: minutesValue(form.customMinutes) }) : t(`dossier.dur_${form.durationId}`);
  const catText =
    form.category === "other"
      ? form.otherText.trim() || t("dossier.cat_other")
      : TIMEOUT_REASONS.includes(form.category)
        ? t(`dossier.cat_${form.category}`)
        : categoryLabel(form.category, meta?.categories, t);
  const cd = countdownParts(seconds);
  const ok = canSubmitTimeout(form);

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr("");
    try {
      await adminFetch(`/users/${enc(user.id)}/timeout`, { method: "POST", body: JSON.stringify(buildTimeoutPayload(form)) });
      onDone?.(t("dossier.done_timeout", { user: handleOf(user), duration: durLabel }));
      onClose?.();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = (
    <div className="dsr-pv">
      <div className="dsr-pv-bar">
        <Timer size={16} />
        <span>
          {t("dossier.toPreviewBar", { duration: durLabel })}
          {seconds ? <b className="tnum">{" · "}{cd.clock || t("dossier.daysLeft", { n: cd.days })}</b> : null}
        </span>
      </div>
      <div className="dsr-pv-text">
        <p>{t("dossier.toPreviewReason", { reason: catText })}</p>
        {form.message.trim() ? <p className="dsr-pv-note">{form.message.trim()}</p> : null}
      </div>
      <div className="dsr-pv-comp">
        <span>{t("dossier.toPreviewComposer")}</span>
        <Lock size={16} />
      </div>
      <p className="dsr-hint">{form.notify ? t("dossier.toPreviewBell") : t("dossier.toPreviewSilent")}</p>
    </div>
  );

  return (
    <DossierDialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Timer}
      tone="amber"
      title={t("dossier.toTitle", { user: handleOf(user) })}
      subtitle={t("dossier.toSub")}
      aside={preview}
      asideLabel={t("dossier.userSees")}
      testId="dsr-timeout"
    >
      <Field label={t("dossier.duration")}>
        <Pills
          tone="amber"
          label={t("dossier.duration")}
          value={form.durationId}
          onChange={(id) => set({ durationId: id })}
          items={[...TIMEOUT_PILLS.map((p) => ({ id: p.id, label: t(`dossier.dur_${p.id}`) })), { id: CUSTOM, label: t("dossier.custom") }]}
        />
        {form.durationId === CUSTOM ? (
          <label className="dsr-inline">
            <span>{t("dossier.customMinutes")}</span>
            <input
              className="dsr-input is-num"
              type="number"
              min={1}
              inputMode="numeric"
              value={form.customMinutes}
              onChange={(e) => set({ customMinutes: e.target.value })}
              placeholder="90"
              data-autofocus
            />
          </label>
        ) : null}
      </Field>
      <Field label={t("dossier.reason")}>
        <Pills
          tone="amber"
          label={t("dossier.reason")}
          value={TIMEOUT_REASONS.includes(form.category) ? form.category : otherOpen ? "__other" : form.category}
          onChange={(id) => {
            if (id === "__other") {
              setOtherOpen(true);
              if (TIMEOUT_REASONS.includes(form.category)) set({ category: "other" });
            } else {
              setOtherOpen(false);
              set({ category: id });
            }
          }}
          items={[...TIMEOUT_REASONS.map((id) => ({ id, label: t(`dossier.cat_${id}`) })), { id: "__other", label: t("dossier.otherReason") }]}
        />
        {otherOpen ? (
          <div className="dsr-more">
            <Pills
              small
              tone="amber"
              label={t("dossier.otherReason")}
              value={form.category}
              onChange={(id) => set({ category: id })}
              items={[{ id: "other", label: t("dossier.cat_other") }, ...rest.map((c) => ({ id: c.id, label: categoryLabel(c.id, meta?.categories, t) }))]}
            />
            {form.category === "other" ? (
              <input
                className="dsr-input"
                value={form.otherText}
                maxLength={200}
                onChange={(e) => set({ otherText: e.target.value })}
                placeholder={t("dossier.otherReasonPh")}
                aria-label={t("dossier.otherReasonPh")}
              />
            ) : null}
          </div>
        ) : null}
      </Field>
      <Field label={t("dossier.noteToUser")} id="dsr-to-note">
        <textarea
          id="dsr-to-note"
          className="dsr-input dsr-ta"
          rows={3}
          maxLength={NOTE_MAX}
          value={form.message}
          onChange={(e) => set({ message: e.target.value })}
          placeholder={t("dossier.noteToUserPh")}
        />
      </Field>
      <label className="dsr-check">
        <GlassCheckbox checked={form.notify} onChange={(e) => set({ notify: e.target.checked })} />
        <span>{t("dossier.notifyUser")}</span>
      </label>
      <DialogError text={err} />
      <DialogActions
        onCancel={onClose}
        cancelLabel={t("dossier.cancel")}
        busy={busy}
        disabled={!ok}
        onSubmit={submit}
        submitLabel={busy ? t("dossier.working") : t("dossier.toSubmit", { duration: durLabel })}
        icon={Timer}
        tone="amber"
      />
    </DossierDialog>
  );
}

/* -------------------------------------------------------------------- At */

export function KickDialog({ open, user, onClose, onDone }) {
  const { t } = useLocale();
  const errText = useErrorText();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) {
      setReason("");
      setErr("");
    }
  }, [open, user?.id]);
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const text = reason.trim();
      await adminFetch(`/users/${enc(user.id)}/kick`, {
        method: "POST",
        body: JSON.stringify({ category: "other", otherText: text || t("dossier.kickDefaultReason") }),
      });
      onDone?.(t("dossier.done_kick", { user: handleOf(user) }));
      onClose?.();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DossierDialog open={open} onClose={onClose} busy={busy} icon={UserX} tone="gray" title={t("dossier.kickTitle", { user: handleOf(user) })} subtitle={t("dossier.kickSub")} width={480} testId="dsr-kick">
      <Field label={t("dossier.reasonAudited")} id="dsr-kick-reason">
        <textarea
          id="dsr-kick-reason"
          className="dsr-input dsr-ta is-short"
          rows={2}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("dossier.kickReasonPh")}
          data-autofocus
        />
      </Field>
      <DialogError text={err} />
      <DialogActions onCancel={onClose} cancelLabel={t("dossier.cancel")} busy={busy} onSubmit={submit} submitLabel={busy ? t("dossier.working") : t("dossier.kick")} icon={UserX} />
    </DossierDialog>
  );
}

/* ------------------------------------------------------------- Oturumlar */

export function SessionsDialog({ open, user, sessions: given, isAdminTarget = false, onClose, onDone }) {
  const { t, locale } = useLocale();
  const errText = useErrorText();
  const [sessions, setSessions] = useState(given || []);
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setErr("");
    setConfirmAll(false);
    if (given) {
      setSessions(given);
      return undefined;
    }
    let alive = true;
    adminFetch(`/people/${enc(user.id)}/dossier`)
      .then((d) => alive && setSessions(Array.isArray(d?.sessions) ? d.sessions : []))
      .catch((e) => alive && setErr(errText(e)));
    return () => {
      alive = false;
    };
  }, [open, user?.id, given, errText]);

  const endOne = async (s) => {
    setBusyId(s.id);
    setErr("");
    try {
      await adminFetch(`/people/${enc(user.id)}/sessions/${enc(s.id)}/revoke`, { method: "POST", body: "{}" });
      setSessions((list) => list.filter((x) => x.id !== s.id));
      onDone?.(t("dossier.done_sessionEnded", { device: s.device || t("dossier.unknownDevice") }), { keepOpen: true });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusyId("");
    }
  };
  const endAll = async () => {
    if (!confirmAll) {
      setConfirmAll(true);
      return;
    }
    setBusyId("__all");
    setErr("");
    try {
      const r = await adminFetch(`/people/${enc(user.id)}/revoke-sessions`, { method: "POST", body: "{}" });
      onDone?.(t("dossier.done_sessionsAll", { n: r?.revoked ?? sessions.length }));
      onClose?.();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusyId("");
    }
  };
  const live = sessions.filter((s) => s.live).length;

  return (
    <DossierDialog
      open={open}
      onClose={onClose}
      busy={Boolean(busyId)}
      icon={Monitor}
      tone="blue"
      title={t("dossier.sessTitle")}
      subtitle={t("dossier.sessSub", { open: sessions.length, live })}
      width={760}
      testId="dsr-sessions"
    >
      {sessions.length === 0 ? <p className="dsr-empty-line">{t("dossier.sessNone")}</p> : null}
      <div className="dsr-ses-list">
        {sessions.map((s) => {
          const kind = sessionKind(s.device);
          const Icon = kind === "desktop" ? Monitor : kind === "phone" ? Smartphone : Globe;
          return (
            <div key={s.id} className="dsr-ses2">
              <span className="dsr-ses-ic">
                <Icon size={17} />
              </span>
              <div className="dsr-ses-main">
                <b>{s.device || t("dossier.unknownDevice")}</b>
                <small>{[s.ip, t("dossier.sessStarted", { when: shortWhen(s.createdAt, locale) })].filter(Boolean).join(" · ")}</small>
              </div>
              <span className="dsr-muted">{s.lastActiveAt ? agoWhen(s.lastActiveAt, locale) : "—"}</span>
              <span className={`dsr-chip ${s.live ? "c-green" : "c-blue"}`}>{s.live ? t("dossier.live") : t("dossier.sessOpen")}</span>
              <button type="button" className="dsr-btn is-sm" disabled={Boolean(busyId) || isAdminTarget} onClick={() => endOne(s)}>
                {busyId === s.id ? t("dossier.working") : t("dossier.sessEnd")}
              </button>
            </div>
          );
        })}
      </div>
      {isAdminTarget ? <p className="dsr-hint">{t("dossier.sessAdminHint")}</p> : null}
      {confirmAll ? (
        <div className="dsr-warn" role="alert">
          <AlertTriangle size={16} />
          <span>{t("dossier.sessAllConfirm")}</span>
        </div>
      ) : null}
      <DialogError text={err} />
      <DialogActions
        onCancel={onClose}
        cancelLabel={t("dossier.close")}
        busy={Boolean(busyId)}
        disabled={!sessions.length || isAdminTarget}
        onSubmit={endAll}
        submitLabel={confirmAll ? t("dossier.sessAllSure") : t("dossier.sessAll")}
        icon={LogOut}
        tone="danger"
      />
    </DossierDialog>
  );
}

/* ---------------------------------------------------------------- Cüzdan */

export function WalletDialog({ open, user, initialMode = "give", canGrant = true, canFreeze = true, onClose, onDone }) {
  const { t, locale } = useLocale();
  const errText = useErrorText();
  const [{ data, error, loading }, reload] = useSection(user?.id, "wallet", open);
  const [mode, setMode] = useState(initialMode);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(canGrant ? initialMode : "freeze");
    setAmount("");
    setReason("");
    setMessage("");
    setErr("");
  }, [open, user?.id, initialMode, canGrant]);

  const balance = data?.balance ?? 0;
  const frozen = Boolean(data?.frozen);
  const amt = parseAmount(amount);
  const after = walletPreview(balance, mode, amt);
  const ok = mode === "freeze" ? canFreeze && Boolean(data) : canGrant && Boolean(data) && canSubmitWallet({ mode, amount, reason, balance });

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr("");
    try {
      if (mode === "freeze") {
        await adminFetch(`/people/${enc(user.id)}/wallet-freeze`, { method: "POST", body: JSON.stringify({ frozen: !frozen, reason: reason.trim() || undefined }) });
        onDone?.(frozen ? t("dossier.done_unfrozen") : t("dossier.done_frozen"));
      } else {
        await adminFetch("/descoin/grant", { method: "POST", body: JSON.stringify({ userId: user.id, ...buildWalletGrant({ mode, amount, reason, message }) }) });
        onDone?.(mode === "give" ? t("dossier.done_give", { n: num(amt, locale), user: handleOf(user) }) : t("dossier.done_take", { n: num(amt, locale), user: handleOf(user) }));
      }
      onClose?.();
    } catch (e) {
      setErr(errText(e));
      reload();
    } finally {
      setBusy(false);
    }
  };

  const modes = [
    ...(canGrant ? [{ id: "give", label: t("dossier.walletGive") }, { id: "take", label: t("dossier.walletTake") }] : []),
    ...(canFreeze ? [{ id: "freeze", label: frozen ? t("dossier.walletUnfreeze") : t("dossier.walletFreeze") }] : []),
  ];
  const submitLabel =
    mode === "freeze"
      ? frozen
        ? t("dossier.walletUnfreeze")
        : t("dossier.walletFreeze")
      : mode === "give"
        ? t("dossier.walletGiveN", { n: amt ? num(amt, locale) : "" })
        : t("dossier.walletTakeN", { n: amt ? num(amt, locale) : "" });

  return (
    <DossierDialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Coins}
      tone="violet"
      title={t("dossier.walletTitle")}
      subtitle={data ? `${num(balance, locale)} DesCoin · ${frozen ? t("dossier.frozen") : t("dossier.notFrozen")}` : loading ? t("dossier.loading") : ""}
      width={640}
      testId="dsr-wallet"
    >
      {error ? <DialogError text={errText(error)} /> : null}
      <Field label={t("dossier.walletAction")}>
        <Pills tone="violet" label={t("dossier.walletAction")} value={mode} onChange={setMode} items={modes} />
      </Field>
      {mode === "freeze" ? (
        <div className={`dsr-warn${frozen ? " is-ok" : ""}`}>
          {frozen ? <LockOpen size={16} /> : <Lock size={16} />}
          <span>{frozen ? t("dossier.walletUnfreezeInfo") : t("dossier.walletFreezeInfo")}</span>
        </div>
      ) : (
        <div className="dsr-row2">
          <Field label={t("dossier.amount")} id="dsr-w-amount">
            <input
              id="dsr-w-amount"
              className="dsr-input is-strong tnum"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, ""))}
              placeholder="5000"
              data-autofocus
            />
          </Field>
          <Field label={t("dossier.reasonAudited")} id="dsr-w-reason">
            <input
              id="dsr-w-reason"
              className="dsr-input"
              value={reason}
              maxLength={REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("dossier.walletReasonPh")}
            />
          </Field>
        </div>
      )}
      {mode === "freeze" ? (
        <Field label={t("dossier.reasonAuditedOptional")} id="dsr-w-freason">
          <input id="dsr-w-freason" className="dsr-input" value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} placeholder={t("dossier.walletFreezeReasonPh")} />
        </Field>
      ) : null}
      {mode === "give" ? (
        <Field label={t("dossier.walletMessage")} id="dsr-w-msg">
          <input id="dsr-w-msg" className="dsr-input" value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} placeholder={t("dossier.walletMessagePh")} />
        </Field>
      ) : null}
      {mode !== "freeze" ? (
        <div className="dsr-pv dsr-pv-row">
          <span className="dsr-muted">{t("dossier.newBalance")}</span>
          <b className={`dsr-big-n tnum${after == null ? " is-bad" : ""}`}>{after == null ? t("dossier.notEnough") : num(after, locale)}</b>
        </div>
      ) : null}
      {data?.ledger?.length ? (
        <div className="dsr-field">
          <div className="dsr-lab">{t("dossier.recentLedger")}</div>
          <div className="dsr-led">
            {data.ledger.slice(0, 4).map((r) => (
              <div key={r.id}>
                <span>
                  {[r.reason, r.by ? `@${r.by}` : null, shortWhen(r.at, locale)].filter(Boolean).join(" · ")}
                </span>
                <span className={`tnum ${r.amount >= 0 ? "pos" : "neg"}`}>
                  {r.amount >= 0 ? "+" : ""}
                  {num(r.amount, locale)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <DialogError text={err} />
      <DialogActions
        onCancel={onClose}
        cancelLabel={t("dossier.cancel")}
        busy={busy}
        disabled={!ok}
        onSubmit={submit}
        submitLabel={busy ? t("dossier.working") : submitLabel}
        icon={mode === "freeze" ? (frozen ? Unlock : Lock) : Gift}
        tone={mode === "take" || (mode === "freeze" && !frozen) ? "danger" : "primary"}
      />
    </DossierDialog>
  );
}

/* ---------------------------------------------------------------- Rozet */

export function BadgeDialog({ open, user, onClose, onDone }) {
  const { t } = useLocale();
  const { name, tierLabel } = useBadgeCopy();
  const errText = useErrorText();
  const [{ data, error, loading }, reload] = useSection(user?.id, "badges", open);
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) setErr("");
  }, [open]);

  const toggle = async (b) => {
    setBusyId(b.id);
    setErr("");
    try {
      const path = `/special-badges/${enc(b.id)}/${b.held ? "revoke" : "grant"}`;
      await adminFetch(path, { method: "POST", body: JSON.stringify({ userId: user.id }) });
      onDone?.(b.held ? t("dossier.done_badgeRevoked", { badge: name(b.id) }) : t("dossier.done_badgeGranted", { badge: name(b.id) }), { keepOpen: true });
      await reload();
    } catch (e) {
      const code = String(e?.message || "");
      const k = `badges.err_${code}`;
      const v = t(k);
      setErr(v && v !== k ? v : errText(e));
    } finally {
      setBusyId("");
    }
  };

  const badges = data?.badges || [];
  return (
    <DossierDialog open={open} onClose={onClose} busy={Boolean(busyId)} icon={Award} tone="blue" title={t("dossier.badgeTitle")} subtitle={t("dossier.badgeSub", { user: handleOf(user) })} width={620} testId="dsr-badges">
      {error ? <DialogError text={errText(error)} /> : null}
      {loading && !data ? <p className="dsr-empty-line">{t("dossier.loading")}</p> : null}
      {data && !badges.length ? <p className="dsr-empty-line">{t("dossier.badgeNone")}</p> : null}
      <div className="dsr-badge-list">
        {badges.map((b) => (
          <div key={b.id} className={`dsr-badge${b.held ? " is-held" : ""}`}>
            <SpecialBadgeIcon id={b.id} size={36} />
            <div className="dsr-badge-main">
              <b>{name(b.id)}</b>
              <small>
                {[tierLabel(b.tier), b.held ? t("dossier.badgeSerial", { n: b.serial ?? "?" }) : null, b.maxHolders ? t("dossier.badgeHolders", { n: b.holders, max: b.maxHolders }) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </div>
            <button
              type="button"
              className={`dsr-btn is-sm${b.held ? " is-danger-ghost" : " is-primary"}`}
              aria-pressed={b.held}
              disabled={Boolean(busyId) || (!b.held && b.active === false)}
              onClick={() => toggle(b)}
            >
              {busyId === b.id ? t("dossier.working") : b.held ? t("dossier.badgeRevoke") : t("dossier.badgeGrant")}
            </button>
          </div>
        ))}
      </div>
      <DialogError text={err} />
      <div className="dsr-dlg-acts is-single">
        <button type="button" className="dsr-btn" onClick={onClose}>
          {t("dossier.close")}
        </button>
      </div>
    </DossierDialog>
  );
}

/* ------------------------------------------------------- Ürün hediye et */

const HIDDEN_CATEGORIES = new Set(["avatar_frame", "sound_pack", "profile_title", "profile_badge", "profile_background"]);

export function GiftDialog({ open, user, onClose, onDone }) {
  const { t, locale } = useLocale();
  const errText = useErrorText();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setQ("");
    setPick(null);
    setMessage("");
    setErr("");
    let alive = true;
    adminFetch("/shop/items")
      .then((d) => alive && setItems((d?.items || []).filter((i) => i.active !== false && !HIDDEN_CATEGORIES.has(i.category))))
      .catch((e) => {
        if (!alive) return;
        setItems([]);
        setErr(errText(e));
      });
    return () => {
      alive = false;
    };
  }, [open, user?.id, errText]);

  const cat = (id) => {
    const k = `adminx.shop.cat.${id}`;
    const v = t(k);
    return v && v !== k ? v : id;
  };
  const shown = useMemo(() => {
    const term = q.trim().toLocaleLowerCase(locale);
    const list = items || [];
    return (term ? list.filter((i) => `${i.name} ${i.sku || ""} ${cat(i.category)}`.toLocaleLowerCase(locale).includes(term)) : list).slice(0, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, locale]);

  const submit = async () => {
    if (!pick || busy) return;
    setBusy(true);
    setErr("");
    try {
      await adminFetch("/shop/gift", { method: "POST", body: JSON.stringify({ userId: user.id, itemId: pick.id, message: message.trim() || null }) });
      onDone?.(t("dossier.done_gift", { item: pick.name, user: handleOf(user) }));
      onClose?.();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DossierDialog open={open} onClose={onClose} busy={busy} icon={Gift} tone="violet" title={t("dossier.giftTitle", { user: handleOf(user) })} subtitle={t("dossier.giftSub")} width={620} testId="dsr-gift">
      <label className="dsr-search-in">
        <Search size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dossier.giftSearch")} aria-label={t("dossier.giftSearch")} data-autofocus />
      </label>
      <div className="dsr-pick-list" role="listbox" aria-label={t("dossier.giftTitle", { user: handleOf(user) })}>
        {items == null ? <p className="dsr-empty-line">{t("dossier.loading")}</p> : null}
        {items && !shown.length ? <p className="dsr-empty-line">{t("dossier.giftNone")}</p> : null}
        {shown.map((i) => (
          <button key={i.id} type="button" role="option" aria-selected={pick?.id === i.id} className={`dsr-pick${pick?.id === i.id ? " is-on" : ""}`} onClick={() => setPick(i)}>
            <span className="dsr-pick-main">
              <b>{i.name}</b>
              <small>{cat(i.category)}</small>
            </span>
            <span className="dsr-muted tnum">{i.price_descoin != null ? `${num(i.price_descoin, locale)} DesCoin` : ""}</span>
            {pick?.id === i.id ? <Check size={16} /> : null}
          </button>
        ))}
      </div>
      <Field label={t("dossier.giftMessage")} id="dsr-g-msg">
        <input id="dsr-g-msg" className="dsr-input" value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} placeholder={t("dossier.giftMessagePh")} />
      </Field>
      <DialogError text={err} />
      <DialogActions
        onCancel={onClose}
        cancelLabel={t("dossier.cancel")}
        busy={busy}
        disabled={!pick}
        onSubmit={submit}
        submitLabel={busy ? t("dossier.working") : pick ? t("dossier.giftSubmitItem", { item: pick.name }) : t("dossier.giftSubmit")}
        icon={Gift}
      />
    </DossierDialog>
  );
}

/* --------------------------------------------------- Descall+ hediye et */

const PREMIUM_DAYS = [7, 30, 90, 365];

export function PremiumDialog({ open, user, subscription: given, onClose, onDone }) {
  const { t, locale } = useLocale();
  const errText = useErrorText();
  const [{ data }] = useSection(user?.id, "wallet", open && given === undefined);
  const sub = given === undefined ? data?.subscription || null : given;
  const active = Boolean(sub?.active);
  const [plan, setPlan] = useState("plus");
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [requestId, setRequestId] = useState("");

  useEffect(() => {
    if (!open) return;
    setPlan(sub?.plan && PLANS.includes(sub.plan) ? sub.plan : "plus");
    setDays(30);
    setReason("");
    setErr("");
    setRequestId(newRequestId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const submit = async () => {
    const built = buildApplyPayload(
      { op: active ? "extend" : "grant", plan, reason, note: "", isFree: true, duration: { mode: "preset", days } },
      { requestId, current: sub ? { plan_id: sub.plan } : null }
    );
    if (!built.ok) {
      setErr(t(built.error === "reason" ? "dossier.premiumReasonShort" : "dossier.err_generic"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await adminFetch(`/premium/users/${enc(user.id)}/apply`, { method: "POST", body: JSON.stringify(built.body) });
      onDone?.(active ? t("dossier.done_premiumExtend", { n: days, user: handleOf(user) }) : t("dossier.done_premiumGrant", { plan: t(`dossier.plan_${plan}`), n: days, user: handleOf(user) }));
      onClose?.();
    } catch (e) {
      const k = e?.message ? `premiumAdmin.err.${e.message}` : "";
      const v = k ? t(k) : "";
      setErr(v && v !== k ? v : errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DossierDialog open={open} onClose={onClose} busy={busy} icon={Crown} tone="blue" title={t("dossier.premiumTitle", { user: handleOf(user) })} subtitle={active ? t("dossier.premiumActive", { plan: t(`dossier.plan_${sub.plan}`), when: sub.unlimited ? t("dossier.unlimited") : shortWhen(sub.endsAt, locale) }) : t("dossier.premiumNone")} width={560} testId="dsr-premium">
      {!active ? (
        <Field label={t("dossier.plan")}>
          <Pills tone="blue" label={t("dossier.plan")} value={plan} onChange={setPlan} items={PLANS.map((p) => ({ id: p, label: t(`dossier.plan_${p}`) }))} />
        </Field>
      ) : null}
      <Field label={active ? t("dossier.premiumExtendBy") : t("dossier.duration")}>
        <Pills tone="blue" label={t("dossier.duration")} value={days} onChange={setDays} items={PREMIUM_DAYS.map((d) => ({ id: d, label: t("dossier.daysN", { n: d }) }))} />
      </Field>
      <Field label={t("dossier.reasonAudited")} id="dsr-p-reason">
        <input id="dsr-p-reason" className="dsr-input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={t("dossier.premiumReasonPh")} data-autofocus />
      </Field>
      <p className="dsr-hint">{t("dossier.premiumFree")}</p>
      <DialogError text={err} />
      <DialogActions
        onCancel={onClose}
        cancelLabel={t("dossier.cancel")}
        busy={busy}
        disabled={reason.trim().length < 3}
        onSubmit={submit}
        submitLabel={busy ? t("dossier.working") : active ? t("dossier.premiumExtendSubmit", { n: days }) : t("dossier.premiumGrantSubmit")}
        icon={Crown}
      />
    </DossierDialog>
  );
}

/* ---------------------------------------------------- Oyun kredisi ayarla */

export function CreditsDialog({ open, user, onClose, onDone }) {
  const { t, locale } = useLocale();
  const errText = useErrorText();
  const [{ data, error }] = useSection(user?.id, "wallet", open);
  const [op, setOp] = useState("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setOp("add");
    setAmount("");
    setReason("");
    setErr("");
  }, [open, user?.id]);
  const current = data?.gameCredits ?? 0;
  const amt = parseAmount(amount);
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await adminFetch("/credits/update", { method: "POST", body: JSON.stringify({ userId: user.id, amount: amt, operation: op, reason: reason.trim() || undefined }) });
      onDone?.(t("dossier.done_credits", { n: num(r?.newBalance ?? creditsPreview(current, op, amt), locale), user: handleOf(user) }));
      onClose?.();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DossierDialog open={open} onClose={onClose} busy={busy} icon={Gamepad2} tone="violet" title={t("dossier.creditsTitle")} subtitle={data ? t("dossier.creditsNow", { n: num(current, locale) }) : ""} width={520} testId="dsr-credits">
      {error ? <DialogError text={errText(error)} /> : null}
      <Field label={t("dossier.walletAction")}>
        <Pills tone="violet" label={t("dossier.walletAction")} value={op} onChange={setOp} items={[{ id: "add", label: t("dossier.creditsAdd") }, { id: "remove", label: t("dossier.creditsRemove") }]} />
      </Field>
      <div className="dsr-row2">
        <Field label={t("dossier.amount")} id="dsr-c-amount">
          <input id="dsr-c-amount" className="dsr-input is-strong tnum" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" data-autofocus />
        </Field>
        <Field label={t("dossier.reasonAudited")} id="dsr-c-reason">
          <input id="dsr-c-reason" className="dsr-input" value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} placeholder={t("dossier.creditsReasonPh")} />
        </Field>
      </div>
      <div className="dsr-pv dsr-pv-row">
        <span className="dsr-muted">{t("dossier.newBalance")}</span>
        <b className="dsr-big-n tnum">{num(creditsPreview(current, op, amt), locale)}</b>
      </div>
      <DialogError text={err} />
      <DialogActions onCancel={onClose} cancelLabel={t("dossier.cancel")} busy={busy} disabled={!amt || !data} onSubmit={submit} submitLabel={busy ? t("dossier.working") : t("dossier.save")} icon={Gamepad2} />
    </DossierDialog>
  );
}

/* ------------------------------------------------- Kullanıcıya popup gönder */

const SEVERITIES = ["info", "success", "warning", "urgent"];

export function PopupDialog({ open, user, online = null, onClose, onDone }) {
  const { t } = useLocale();
  const errText = useErrorText();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("info");
  const [requireAck, setRequireAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setSeverity("info");
    setRequireAck(false);
    setErr("");
  }, [open, user?.id]);
  const ok = title.trim() && body.trim();
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      await adminFetch("/popup", { method: "POST", body: JSON.stringify({ title: title.trim(), body: body.trim(), severity, requireAck, targetUserId: user.id }) });
      onDone?.(t("dossier.done_popup", { user: handleOf(user) }));
      onClose?.();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DossierDialog open={open} onClose={onClose} busy={busy} icon={Megaphone} tone="blue" title={t("dossier.popupTitle", { user: handleOf(user) })} subtitle={t("dossier.popupSub")} width={560} testId="dsr-popup">
      {online === false ? (
        <div className="dsr-warn">
          <AlertTriangle size={16} />
          <span>{t("dossier.popupOffline")}</span>
        </div>
      ) : null}
      <Field label={t("dossier.popupKind")}>
        <Pills tone="blue" label={t("dossier.popupKind")} value={severity} onChange={setSeverity} items={SEVERITIES.map((s) => ({ id: s, label: t(`dossier.sev_${s}`) }))} />
      </Field>
      <Field label={t("dossier.popupTitleLabel")} id="dsr-pp-title">
        <input id="dsr-pp-title" className="dsr-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} data-autofocus />
      </Field>
      <Field label={t("dossier.popupBody")} id="dsr-pp-body">
        <textarea id="dsr-pp-body" className="dsr-input dsr-ta" rows={3} value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <label className="dsr-check">
        <GlassCheckbox checked={requireAck} onChange={(e) => setRequireAck(e.target.checked)} />
        <span>{t("dossier.popupAck")}</span>
      </label>
      <DialogError text={err} />
      <DialogActions onCancel={onClose} cancelLabel={t("dossier.cancel")} busy={busy} disabled={!ok} onSubmit={submit} submitLabel={busy ? t("dossier.working") : t("dossier.popupSend")} icon={Megaphone} />
    </DossierDialog>
  );
}

/* --------------------------------------------- Erişim yasağı (cihaz / ağ) */

const ACCESS_DURATIONS = ["1d", "7d", "30d", "90d", "permanent"];

export function AccessBanDialog({ open, user, onClose, onDone }) {
  const { t } = useLocale();
  const errText = useErrorText();
  const [duration, setDuration] = useState("30d");
  const [includeNetwork, setIncludeNetwork] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return;
    setDuration("30d");
    setIncludeNetwork(false);
    setReason("");
    setErr("");
  }, [open, user?.id]);
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await adminFetch("/access-bans", { method: "POST", body: JSON.stringify({ mode: "account", userId: user.id, duration, reason: reason.trim(), includeNetwork }) });
      onDone?.(t("dossier.done_accessBan", { n: r?.added?.length || 0, kicked: r?.kicked || 0 }));
      onClose?.();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DossierDialog open={open} onClose={onClose} busy={busy} icon={Lock} tone="red" title={t("dossier.accessTitle", { user: handleOf(user) })} subtitle={t("dossier.accessSub")} width={560} testId="dsr-access">
      <Field label={t("dossier.duration")}>
        <Pills tone="red" label={t("dossier.duration")} value={duration} onChange={setDuration} items={ACCESS_DURATIONS.map((d) => ({ id: d, label: t(`dossier.acc_${d}`) }))} />
      </Field>
      <label className="dsr-check">
        <GlassCheckbox checked={includeNetwork} onChange={(e) => setIncludeNetwork(e.target.checked)} />
        <span>{t("dossier.accessNetwork")}</span>
      </label>
      {includeNetwork ? (
        <div className="dsr-warn">
          <AlertTriangle size={16} />
          <span>{t("dossier.accessNetworkWarn")}</span>
        </div>
      ) : null}
      <Field label={t("dossier.reasonAudited")} id="dsr-a-reason">
        <input id="dsr-a-reason" className="dsr-input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t("dossier.accessReasonPh")} data-autofocus />
      </Field>
      <p className="dsr-hint">{t("dossier.accessHint")}</p>
      <DialogError text={err} />
      <DialogActions onCancel={onClose} cancelLabel={t("dossier.cancel")} busy={busy} onSubmit={submit} submitLabel={busy ? t("dossier.working") : t("dossier.accessSubmit")} icon={Lock} tone="danger" />
    </DossierDialog>
  );
}

/* ------------------------------------------------------ İşlem kaydı */

export function AuditDialog({ open, user, onClose }) {
  const { t, locale } = useLocale();
  const errText = useErrorText();
  const [entries, setEntries] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return undefined;
    setEntries(null);
    setErr("");
    let alive = true;
    adminFetch(`/audit?target=${enc(user.id)}&limit=150`)
      .then((d) => alive && setEntries(Array.isArray(d?.entries) ? d.entries : []))
      .catch((e) => {
        if (!alive) return;
        setEntries([]);
        setErr(errText(e));
      });
    return () => {
      alive = false;
    };
  }, [open, user?.id, errText]);
  return (
    <DossierDialog open={open} onClose={onClose} icon={ScrollText} tone="gray" title={t("dossier.auditTitle")} subtitle={t("dossier.auditSub", { user: handleOf(user) })} width={680} testId="dsr-audit">
      <DialogError text={err} />
      {entries == null ? <p className="dsr-empty-line">{t("dossier.loading")}</p> : null}
      {entries && !entries.length && !err ? <p className="dsr-empty-line">{t("dossier.auditNone")}</p> : null}
      <div className="dsr-audit">
        {(entries || []).map((e) => (
          <div key={e.id} className="dsr-audit-row">
            <b>{e.action}</b>
            <span className="dsr-muted">{e.actorUsername ? `@${e.actorUsername}` : "—"}</span>
            <time className="dsr-muted">{shortWhen(e.at, locale)}</time>
          </div>
        ))}
      </div>
      <div className="dsr-dlg-acts is-single">
        <button type="button" className="dsr-btn" onClick={onClose}>
          {t("dossier.close")}
        </button>
      </div>
    </DossierDialog>
  );
}

/* ------------------------- Yasağı / susturmayı kaldır, yönetici yap */

export function LiftDialog({ open, user, kind, isAdmin = false, onClose, onDone }) {
  const { t } = useLocale();
  const errText = useErrorText();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) {
      setNote("");
      setErr("");
    }
  }, [open, user?.id, kind]);
  const cfg = {
    unban: { icon: ShieldCheck, tone: "green", path: `/users/${enc(user?.id)}/unban`, method: "POST" },
    untimeout: { icon: Timer, tone: "green", path: `/users/${enc(user?.id)}/untimeout`, method: "POST" },
    makeAdmin: { icon: Crown, tone: isAdmin ? "red" : "blue", path: `/${isAdmin ? "remove-admin" : "make-admin"}/${enc(user?.id)}`, method: "PUT" },
  }[kind];
  if (!cfg) return null;
  const key = kind === "makeAdmin" ? (isAdmin ? "removeAdmin" : "makeAdmin") : kind;
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      await adminFetch(cfg.path, { method: cfg.method, body: JSON.stringify(note.trim() ? { note: note.trim() } : {}) });
      onDone?.(t(`dossier.done_${key}`, { user: handleOf(user) }));
      onClose?.();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DossierDialog open={open} onClose={onClose} busy={busy} icon={cfg.icon} tone={cfg.tone} title={t(`dossier.${key}Title`, { user: handleOf(user) })} subtitle={t(`dossier.${key}Sub`)} width={480} testId={`dsr-${kind}`}>
      {kind !== "makeAdmin" ? (
        <Field label={t("dossier.noteAuditedOptional")} id="dsr-l-note">
          <input id="dsr-l-note" className="dsr-input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} data-autofocus />
        </Field>
      ) : null}
      <DialogError text={err} />
      <DialogActions
        onCancel={onClose}
        cancelLabel={t("dossier.cancel")}
        busy={busy}
        onSubmit={submit}
        submitLabel={busy ? t("dossier.working") : t(`dossier.${key}`)}
        icon={kind === "makeAdmin" && isAdmin ? X : cfg.icon}
        tone={kind === "makeAdmin" && isAdmin ? "danger" : "primary"}
      />
    </DossierDialog>
  );
}

/* ----------------------------------------------------------------- Host */

/**
 * Renders the dialog for one action id (see dossierModel ACTION_SECTIONS).
 * @param {object} props
 * @param {string|null} props.action
 * @param {{id: string, username?: string, displayName?: string, avatarUrl?: string, isAdmin?: boolean}} props.user
 * @param {object} [props.context] data the user file already has: sessions, subscription, online, reportCount, deviceCount, defaultCategory, walletMode
 * @param {() => void} props.onClose
 * @param {(message: string, opts?: {keepOpen?: boolean}) => void} [props.onDone]
 */
export function UserActionHost({ action, user, context = {}, can = () => true, onClose, onDone }) {
  if (!user?.id) return null;
  const common = { user, onClose, onDone };
  return (
    <>
      <TimeoutDialog open={action === "timeout"} {...common} />
      <KickDialog open={action === "kick"} {...common} />
      <SessionsDialog open={action === "sessions"} sessions={context.sessions} isAdminTarget={Boolean(user.isAdmin)} {...common} />
      <WalletDialog
        open={action === "wallet" || action === "freeze"}
        initialMode={action === "freeze" ? "freeze" : context.walletMode || "give"}
        canGrant={can("casino")}
        canFreeze={can("people")}
        {...common}
      />
      <BadgeDialog open={action === "badges"} {...common} />
      <GiftDialog open={action === "gift"} {...common} />
      <PremiumDialog open={action === "premium"} subscription={context.subscription} {...common} />
      <CreditsDialog open={action === "credits"} {...common} />
      <PopupDialog open={action === "popup"} online={context.online ?? null} {...common} />
      <AccessBanDialog open={action === "accessBan"} {...common} />
      <AuditDialog open={action === "audit"} user={user} onClose={onClose} />
      <LiftDialog open={["unban", "untimeout", "makeAdmin"].includes(action)} kind={action} isAdmin={Boolean(user.isAdmin)} {...common} />
      <BanDialog
        open={action === "ban"}
        target={user}
        reportCount={context.reportCount}
        deviceCount={context.deviceCount}
        defaultCategory={context.defaultCategory}
        onClose={onClose}
        onBanned={({ message }) => onDone?.(message)}
      />
    </>
  );
}
