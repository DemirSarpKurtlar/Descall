/**
 * "Passkey ekle" in the control center's side panel: a fresh re-auth when needed (password,
 * the e-mail code for accounts without a password, the authenticator app, or an existing
 * passkey; a sign-in younger than 10 minutes skips it), then the system window. Web needs a
 * fresh click for the browser sheet (Safari), so the options are fetched first and the
 * second click creates. Electron / old Windows: the browser handoff with the match code.
 *
 * prefer: undefined (this device), "remoteDevice" (a phone over QR), "securityKey".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, QrCode, Usb, X } from "../../ui/Icon.jsx";
import { useT } from "../../../context/LocaleContext";
import { requestEmailReauth } from "../../../api/security";
import { register, prepareRegister, prepareReauth, reauthWithSecret, reauthWithPasskey, normalizePasskeyError, passkeyErrorKey, isSilentPasskeyError } from "../../../lib/passkeys/index.js";
import { signInStyle, statePlatform } from "../../../lib/passkeys/visual.js";
import PasskeyStateCard from "../PasskeyStateCard.jsx";

const REAUTH_REUSE_MS = 4 * 60 * 1000;
const reauthCache = { token: "", at: 0 };

export function clearReauthCache() {
  reauthCache.token = "";
  reauthCache.at = 0;
}

export default function AddPanel({ path, methods = [], fresh = false, prefer, onAdded, onCancel }) {
  const t = useT();
  const cached = reauthCache.token && Date.now() - reauthCache.at < REAUTH_REUSE_MS ? reauthCache.token : "";
  const [token, setToken] = useState(cached);
  const [secret, setSecret] = useState("");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState(null);
  const [reauthPrepared, setReauthPrepared] = useState(null);
  const [card, setCard] = useState(null);
  const ctlRef = useRef(null);
  const needsReauth = !fresh && !token;
  const usesCode = !methods.includes("password") && (methods.includes("email") || methods.includes("totp"));
  const style = signInStyle(path);
  const platform = statePlatform(path);

  useEffect(() => () => ctlRef.current?.abort(), []);

  // Web: the creation options before the click that opens the browser's sheet.
  useEffect(() => {
    if (path !== "web" || needsReauth) return undefined;
    let alive = true;
    prepareRegister(token || null, { prefer })
      .then((p) => alive && setPrepared(p))
      .catch((err) => {
        if (!alive) return;
        const e = normalizePasskeyError(err);
        if (e.serverCode === "REAUTH_REQUIRED") {
          clearReauthCache();
          setToken("");
        } else setError(t(passkeyErrorKey(e) || "passkey.err.server"));
      });
    return () => {
      alive = false;
    };
  }, [path, needsReauth, token, prefer, t]);

  useEffect(() => {
    if (!needsReauth || path !== "web" || !methods.includes("passkey")) return undefined;
    let alive = true;
    prepareReauth().then((p) => alive && setReauthPrepared(p));
    return () => {
      alive = false;
    };
  }, [needsReauth, path, methods]);

  const confirmIdentity = useCallback(
    async ({ withPasskey = false } = {}) => {
      setBusy(true);
      setError("");
      try {
        const tok = withPasskey ? await reauthWithPasskey({ prepared: reauthPrepared }) : await reauthWithSecret(usesCode ? { code: secret.trim() } : { password: secret });
        reauthCache.token = tok;
        reauthCache.at = Date.now();
        setSecret("");
        setToken(tok);
      } catch (err) {
        const e = normalizePasskeyError(err);
        if (!isSilentPasskeyError(e)) setError(t(passkeyErrorKey(e) || "passkey.err.server"));
      } finally {
        setBusy(false);
      }
    },
    [reauthPrepared, usesCode, secret, t]
  );

  const create = useCallback(async () => {
    if (busy) return;
    const ctl = new AbortController();
    ctlRef.current = ctl;
    setBusy(true);
    setError("");
    setCard({ state: "wait" });
    try {
      const res = await register("", {
        reauthToken: token || undefined,
        prepared: prepared && path === "web" ? prepared : undefined,
        prefer,
        signal: ctl.signal,
        onHandoff: (h) => setCard({ state: "handoff", handoff: h }),
      });
      setCard(null);
      onAdded?.(res);
    } catch (err) {
      const e = normalizePasskeyError(err);
      setCard(null);
      setPrepared(null);
      if (e.serverCode === "REAUTH_REQUIRED") {
        clearReauthCache();
        setToken("");
      }
      if (!ctl.signal.aborted && !isSilentPasskeyError(e)) setError(t(passkeyErrorKey(e) || "passkey.err.server"));
      // Web: new options for the next click.
      if (path === "web" && e.serverCode !== "REAUTH_REQUIRED") prepareRegister(token || null, { prefer }).then(setPrepared, () => {});
    } finally {
      if (ctlRef.current === ctl) ctlRef.current = null;
      setBusy(false);
    }
  }, [busy, token, prepared, path, prefer, onAdded, t]);

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

  const Method = prefer === "securityKey" ? Usb : prefer === "remoteDevice" ? QrCode : KeyRound;
  const methodLine = prefer ? t(`passkey.center.add.prefer.${prefer}`) : t(`passkey.center.add.thisDevice.${style}`);

  if (card) {
    return (
      <div className="pkc-add">
        <PasskeyStateCard
          state={card.state}
          platform={prefer ? "web" : platform}
          handoff={card.handoff}
          onCancel={() => {
            ctlRef.current?.abort();
            setCard(null);
          }}
          onReopen={() => card.handoff?.reopen?.()}
          className="flat"
        />
      </div>
    );
  }

  return (
    <div className="pkc-add">
      <div className="pkc-add-head">
        <span className="pkc-tile t-brand" style={{ width: 40, height: 40, borderRadius: 12 }} aria-hidden="true">
          <Method size={20} />
        </span>
        <div className="grow">
          <b>{t("passkey.settings.add")}</b>
          <div className="pkc-small muted">{methodLine}</div>
        </div>
        <button type="button" className="pkc-icon-btn" onClick={onCancel} aria-label={t("passkey.settings.cancel")}>
          <X size={16} />
        </button>
      </div>
      {needsReauth ? (
        <div className="pkc-reauth">
          <b className="pkc-small-title">{t("passkey.reauth.title")}</b>
          <p className="pkc-small muted">{t("passkey.reauth.lead")}</p>
          {usesCode ? (
            <>
              <input
                className="pkc-input tnum"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                aria-label={t("passkey.reauth.code")}
                value={secret}
                onChange={(e) => setSecret(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && secret.length === 6 && confirmIdentity()}
              />
              {methods.includes("totp") ? <p className="pkc-small muted">{t("passkey.reauth.totpHint")}</p> : null}
              {methods.includes("email") ? (
                <div className="pkc-row end">
                  {codeSentTo ? <span className="pkc-small ok-t">{t("passkey.reauth.codeSent", { email: codeSentTo })}</span> : null}
                  <button type="button" className="pkc-link" onClick={sendCode} disabled={busy}>
                    {t("passkey.reauth.sendCode")}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <input
              type="password"
              className="pkc-input"
              autoComplete="current-password"
              placeholder={t("passkey.reauth.password")}
              aria-label={t("passkey.reauth.password")}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && secret && confirmIdentity()}
            />
          )}
          {methods.includes("passkey") && path && path !== "handoff" ? (
            <button type="button" className="pkc-link" onClick={() => confirmIdentity({ withPasskey: true })} disabled={busy}>
              <KeyRound size={14} /> {t("passkey.reauth.withPasskey")}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="pkc-small muted">{t("passkey.center.add.ready")}</p>
      )}
      {error ? (
        <p className="pkc-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="pkc-row">
        <button type="button" className="pkc-btn sm ghost" onClick={onCancel}>
          {t("passkey.settings.cancel")}
        </button>
        {needsReauth ? (
          <button type="button" className="pkc-btn sm pri grow" onClick={() => confirmIdentity()} disabled={busy || !secret || (usesCode && secret.length !== 6)}>
            {busy ? t("passkey.signIn.busy") : t("passkey.reauth.continue")}
          </button>
        ) : (
          <button type="button" className="pkc-btn sm pri grow" onClick={create} disabled={busy || (path === "web" && !prepared)}>
            <Method size={15} /> {path === "web" && !prepared ? t("passkey.desktop.loading") : t("passkey.desktop.registerButton")}
          </button>
        )}
      </div>
    </div>
  );
}
