/**
 * Ayarlar > Güvenlik > Passkey'ler. The password always stays; passkeys are an extra way in.
 *
 * List: name, provider (iCloud Keychain, Google Password Manager, Windows Hello, ...), where it
 * was made, synced or single-device, added / last used, a warning when the server turned it off
 * (counter went backwards: possible copy). Rename inline, remove with a confirm, add with a
 * fresh re-auth (password, the e-mail code for accounts without a password, the authenticator
 * app code, or an existing passkey). Lists of other devices refresh live (socket
 * passkeys:changed -> window "descall:passkeys-changed").
 *
 * Simple on purpose: the owner picks the final design later; every class is in
 * styles/passkeys.css (.pk-*), the data and flows stay as they are.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AlertTriangle, Cloud, KeyRound, Monitor, Pencil, Plus, Smartphone, Trash2 } from "../ui/Icon.jsx";
import GlassConfirm from "../ui/GlassConfirm.jsx";
import { useLocale } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../i18n/format";
import { requestEmailReauth } from "../../api/security";
import {
  isAvailable,
  listPasskeys,
  register,
  renamePasskey,
  removePasskey,
  reauthWithSecret,
  reauthWithPasskey,
  normalizePasskeyError,
  passkeyErrorKey,
  isSilentPasskeyError,
} from "../../lib/passkeys/index.js";
import "../../styles/passkeys.css";

const REAUTH_REUSE_MS = 4 * 60 * 1000; // the server's proof lasts 5 minutes

function PlatformIcon({ platform }) {
  if (platform === "ios" || platform === "android") return <Smartphone size={18} />;
  if (platform === "windows" || platform === "electron" || platform === "macos" || platform === "linux") return <Monitor size={18} />;
  return <KeyRound size={18} />;
}

export default function PasskeysCard() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [data, setData] = useState(null); // { passkeys, max, reauthMethods }
  const [loadError, setLoadError] = useState("");
  const [hidden, setHidden] = useState(false);
  const [avail, setAvail] = useState({ available: false, path: null });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState(null);
  const [editing, setEditing] = useState(null); // { id, value }
  const [confirm, setConfirm] = useState(null); // passkey to remove
  const [removing, setRemoving] = useState(false);
  const reauthRef = useRef({ token: "", at: 0 });
  const ctlRef = useRef(null);

  const errText = useCallback((err) => {
    const key = passkeyErrorKey(err);
    return key ? t(key) : "";
  }, [t]);

  const load = useCallback(async () => {
    try {
      const res = await listPasskeys();
      setData(res);
      setLoadError("");
    } catch (err) {
      const e = normalizePasskeyError(err);
      if (e.serverCode === "PASSKEYS_UNAVAILABLE" || e.serverCode === "PASSKEYS_DISABLED") {
        setHidden(true);
        return;
      }
      setLoadError(t("passkey.settings.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    load();
    isAvailable()
      .then((r) => {
        setAvail(r);
        // Server switched off or not set up yet: no section at all.
        if (r.reason === "disabled") setHidden(true);
      })
      .catch(() => setAvail({ available: false, path: null }));
    const onChanged = () => load();
    window.addEventListener("descall:passkeys-changed", onChanged);
    return () => {
      window.removeEventListener("descall:passkeys-changed", onChanged);
      ctlRef.current?.abort();
    };
  }, [load]);

  const methods = data?.reauthMethods || [];
  const freshReauth = () => (reauthRef.current.token && Date.now() - reauthRef.current.at < REAUTH_REUSE_MS ? reauthRef.current.token : "");
  const needsReauth = adding && !freshReauth();
  const usesCode = !methods.includes("password") && (methods.includes("email") || methods.includes("totp"));

  const resetAdd = () => {
    setAdding(false);
    setName("");
    setSecret("");
    setError("");
    setHandoff(null);
    setCodeSentTo("");
  };

  const sendCode = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await requestEmailReauth();
      setCodeSentTo(res?.emailHint || "");
    } catch (err) {
      setError(err?.message || t("passkey.err.server"));
    } finally {
      setBusy(false);
    }
  };

  const obtainReauth = async ({ withPasskey = false } = {}) => {
    const cached = freshReauth();
    if (cached) return cached;
    const token = withPasskey
      ? await reauthWithPasskey()
      : await reauthWithSecret(usesCode ? { code: secret.trim() } : { password: secret });
    reauthRef.current = { token, at: Date.now() };
    return token;
  };

  const add = async ({ withPasskey = false } = {}) => {
    if (busy) return;
    if (!withPasskey && needsReauth && !secret) return;
    setBusy(true);
    setError("");
    const ctl = new AbortController();
    ctlRef.current = ctl;
    try {
      const reauthToken = await obtainReauth({ withPasskey });
      setSecret("");
      const res = await register(name, { reauthToken, signal: ctl.signal, onHandoff: setHandoff });
      toast(t("passkey.settings.added"), "success");
      resetAdd();
      if (res?.passkey) setData((d) => (d ? { ...d, passkeys: [res.passkey, ...(d.passkeys || []).filter((p) => p.id !== res.passkey.id)] } : d));
      load();
    } catch (err) {
      const e = normalizePasskeyError(err);
      if (e.serverCode === "REAUTH_REQUIRED") reauthRef.current = { token: "", at: 0 };
      if (!isSilentPasskeyError(e) && !ctl.signal.aborted) setError(errText(e));
    } finally {
      if (ctlRef.current === ctl) ctlRef.current = null;
      setBusy(false);
      setHandoff(null);
    }
  };

  const saveName = async () => {
    if (!editing) return;
    const value = editing.value.trim();
    if (!value) {
      setError(t("passkey.err.badName"));
      return;
    }
    setBusy(true);
    try {
      const res = await renamePasskey(editing.id, value);
      setData((d) => ({ ...d, passkeys: d.passkeys.map((p) => (p.id === editing.id ? res.passkey : p)) }));
      setEditing(null);
      setError("");
      toast(t("passkey.settings.renamed"), "success");
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async () => {
    if (!confirm) return;
    setRemoving(true);
    try {
      await removePasskey(confirm.id);
      setData((d) => ({ ...d, passkeys: d.passkeys.filter((p) => p.id !== confirm.id) }));
      setConfirm(null);
      toast(t("passkey.settings.removed"), "success");
    } catch (err) {
      setError(errText(err));
      setConfirm(null);
    } finally {
      setRemoving(false);
    }
  };

  const passkeys = useMemo(() => data?.passkeys || [], [data]);
  const atMax = data && passkeys.length >= (data.max || 20);
  const canAdd = avail.available && !atMax;
  const date = (v) => (v ? formatDate(v, locale, { dateStyle: "medium" }) : "");

  if (hidden) return null;

  return (
    <div className="pk-card" data-testid="passkeys-card">
      <div className="pk-head">
        <p className="pk-note">{t("passkey.settings.lead")}</p>
      </div>

      {loadError ? (
        <div className="pk-row end">
          <p className="pk-error">{loadError}</p>
          <button type="button" className="pk-link" onClick={load}>
            {t("passkey.settings.retry")}
          </button>
        </div>
      ) : null}

      {data && passkeys.length === 0 ? <p className="pk-empty">{t("passkey.settings.empty")}</p> : null}

      {passkeys.length ? (
        <ul className="pk-list" aria-label={t("passkey.settings.count", { count: passkeys.length })}>
          {passkeys.map((p) => {
            const isEditing = editing?.id === p.id;
            return (
              <li key={p.id} className={`pk-item${p.suspended ? " is-suspended" : ""}`}>
                <span className="pk-item-icon" aria-hidden="true">
                  <PlatformIcon platform={p.platform} />
                </span>
                <div className="pk-item-main">
                  {isEditing ? (
                    <input
                      className="pk-input"
                      value={editing.value}
                      maxLength={64}
                      autoFocus
                      aria-label={t("passkey.settings.nameLabel")}
                      onChange={(e) => setEditing({ id: p.id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveName();
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                  ) : (
                    <p className="pk-item-name" title={p.name}>{p.name}</p>
                  )}
                  <p className="pk-item-meta">
                    {p.provider && p.provider !== p.name ? <span>{p.provider}</span> : null}
                    {p.platform ? <span>{t(`passkey.settings.platform.${p.platform}`)}</span> : null}
                    <span className="pk-badge">
                      {p.synced ? <Cloud size={12} aria-hidden="true" /> : null}
                      {p.synced ? t("passkey.settings.synced") : t("passkey.settings.thisDevice")}
                    </span>
                    <span>{t("passkey.settings.created", { date: date(p.createdAt) })}</span>
                    <span>{p.lastUsedAt ? t("passkey.settings.lastUsed", { date: date(p.lastUsedAt) }) : t("passkey.settings.neverUsed")}</span>
                  </p>
                  {p.suspended ? (
                    <p className="pk-item-meta">
                      <span className="pk-badge warn">
                        <AlertTriangle size={12} aria-hidden="true" /> {t("passkey.settings.suspended")}
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="pk-item-actions">
                  {isEditing ? (
                    <>
                      <button type="button" className="us-btn primary" onClick={saveName} disabled={busy}>
                        {t("passkey.settings.save")}
                      </button>
                      <button type="button" className="us-link-btn" onClick={() => setEditing(null)}>
                        {t("passkey.settings.cancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="pk-icon-btn"
                        title={t("passkey.settings.rename")}
                        aria-label={`${t("passkey.settings.rename")}: ${p.name}`}
                        onClick={() => {
                          setError("");
                          setEditing({ id: p.id, value: p.name });
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="pk-icon-btn danger"
                        title={t("passkey.settings.remove")}
                        aria-label={`${t("passkey.settings.remove")}: ${p.name}`}
                        onClick={() => setConfirm(p)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {adding ? (
        <div className="pk-add">
          <label className="pk-note" htmlFor="pk-add-name">
            {t("passkey.settings.nameLabel")}
          </label>
          <input
            id="pk-add-name"
            className="pk-input"
            value={name}
            maxLength={64}
            placeholder={t("passkey.settings.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          {needsReauth ? (
            <div className="pk-reauth">
              <p className="pk-item-name">{t("passkey.reauth.title")}</p>
              <p className="pk-note">{t("passkey.reauth.lead")}</p>
              {usesCode ? (
                <>
                  <input
                    className="pk-input tnum"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    aria-label={t("passkey.reauth.code")}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                  />
                  {methods.includes("totp") ? <p className="pk-note">{t("passkey.reauth.totpHint")}</p> : null}
                  {methods.includes("email") ? (
                    <div className="pk-row end">
                      {codeSentTo ? <span className="pk-ok">{t("passkey.reauth.codeSent", { email: codeSentTo })}</span> : null}
                      <button type="button" className="pk-link" onClick={sendCode} disabled={busy}>
                        {t("passkey.reauth.sendCode")}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <input
                    type="password"
                    className="pk-input"
                    autoComplete="current-password"
                    placeholder={t("passkey.reauth.password")}
                    aria-label={t("passkey.reauth.password")}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                  />
                </>
              )}
              {methods.includes("passkey") && avail.path && avail.path !== "handoff" ? (
                <button type="button" className="pk-link" onClick={() => add({ withPasskey: true })} disabled={busy}>
                  <KeyRound size={14} aria-hidden="true" /> {t("passkey.reauth.withPasskey")}
                </button>
              ) : null}
            </div>
          ) : null}
          {handoff ? (
            <div className="pk-handoff" role="status" aria-live="polite">
              <p className="pk-handoff-title">{t("passkey.signIn.handoffTitle")}</p>
              <p className="pk-handoff-lead">{t("passkey.signIn.handoffLead", { code: handoff.matchCode })}</p>
              <div className="pk-handoff-code tnum" aria-hidden="true">{handoff.matchCode}</div>
              <button type="button" className="pk-link" onClick={() => handoff.reopen?.()}>
                {t("passkey.signIn.handoffReopen")}
              </button>
            </div>
          ) : null}
          {error ? <p className="pk-error" role="alert">{error}</p> : null}
          <div className="pk-row end">
            <button
              type="button"
              className="us-link-btn"
              onClick={() => {
                ctlRef.current?.abort();
                resetAdd();
              }}
            >
              {t("passkey.settings.cancel")}
            </button>
            <button type="button" className="us-btn primary" onClick={() => add()} disabled={busy || (needsReauth && !secret) || (needsReauth && usesCode && secret.length !== 6)}>
              {busy ? t("passkey.signIn.busy") : t("passkey.reauth.continue")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {!adding && error ? <p className="pk-error" role="alert">{error}</p> : null}
          <div className="pk-row end">
            {!avail.available && data ? <p className="pk-note">{t("passkey.settings.unavailableHere")}</p> : null}
            {atMax ? <p className="pk-note">{t("passkey.err.limit")}</p> : null}
            <button type="button" className="us-btn primary" onClick={() => { setError(""); setAdding(true); }} disabled={!canAdd || !data}>
              <Plus size={15} aria-hidden="true" /> {t("passkey.settings.add")}
            </button>
          </div>
        </>
      )}

      <AnimatePresence>
        {confirm ? (
          <GlassConfirm
            key="pk-remove"
            title={t("passkey.settings.removeTitle")}
            message={t("passkey.settings.removeLead", { name: confirm.name })}
            confirmLabel={t("passkey.settings.remove")}
            cancelLabel={t("passkey.settings.cancel")}
            danger
            busy={removing}
            onConfirm={doRemove}
            onCancel={() => setConfirm(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
