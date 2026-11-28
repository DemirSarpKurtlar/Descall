/**
 * Uyarlanan kart (growth draft 1B): one card for sign-in and sign-up. No tabs, no steps to
 * go back through. The person sees the social buttons or one email field; after the email
 * the card shapes itself:
 *   new email         the sign-up fields open in the same card (username ideas from the
 *                     email, live breach check, date of birth, terms)
 *   registered email  the card turns into the sign-in card, the email is not typed again;
 *                     a code can reset the password without leaving the card
 *   a username        sign-in (accounts from before emails were required)
 * A breached password is fixed below the field before the submit (BreachFixPanel). The thin
 * line on the top edge shows how close the card is to done. The server checks everything
 * again (rate limits, human check, breach list, username and email rules).
 *
 * Measurement (Ölçüm, Kayıt İstatistikleri): identifier_routed (server, /auth/identify),
 * breach_warned_inline (here, once per card), breach_fixed (server, with the new account).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useT } from "../../../context/localeContextInstance";
import { ArrowRight, Mail, AtSign, Lock, Eye, EyeOff, Check, Pencil, Info, AlertTriangle, ShieldCheck, User, LogIn, Send, KeyRound, ArrowLeft } from "../../ui/Icon.jsx";
import GoogleSignInButton from "../GoogleSignInButton";
import AppleSignInButton from "../AppleSignInButton";
import BirthDateInput from "../BirthDateInput";
import TermsConsent from "../TermsConsent";
import useSignupFieldChecks from "../useSignupFieldChecks";
import { passwordStrength } from "../PasswordStrength";
import PasskeySignInButton, { usePasskeyAvailability } from "../../passkeys/PasskeySignInButton.jsx";
import { PASSKEY_AUTOCOMPLETE } from "../../../hooks/usePasskeyAutofill";
import { isGoogleSignInOffered } from "../../../lib/googleSignInOffer";
import { isNativeIOS } from "../../../lib/platform";
import { signInStyle } from "../../../lib/passkeys/visual.js";
import { prepareRegister, register as registerPasskey, normalizePasskeyError, passkeyErrorKey, isSilentPasskeyError } from "../../../lib/passkeys/index.js";
import { prewarmHumanCheck } from "../../../lib/humanCheck/turnstileClient.js";
import { requestPasswordReset, confirmPasswordReset } from "../../../api/auth";
import { identifyEmail, identifyUsername, freeUsernameIdeas } from "../../../api/adaptiveSignup.js";
import { serverMessage } from "../../../i18n/serverText.js";
import { DEVICE_SIGNUP_BLOCK_MESSAGE, isEligibleBirthDate, noteUnder13BirthDate, under13SignupBlocked } from "../../../lib/age";
import { domainChips, withDomain, emailTypoFix, identifierKind, loginName, ideasFromEmail, readiness } from "../../../lib/adaptiveSignup/identity.js";
import { trackCardEvent } from "../../../lib/adaptiveSignup/cardEvents.js";
import { suggestPassphrase } from "../../../lib/adaptiveSignup/passphrase.js";
import { loadCardDraft, saveCardDraft, clearCardDraft } from "../../../lib/adaptiveSignup/cardDraft.js";
// Davet Merkezi: the email typed on the invite page (/r/<user>) prefills the card.
import { peekInviteEmail } from "../../../lib/inviteShare.js";
import useBreachCheck from "./useBreachCheck.js";
import BreachFixPanel, { Meter } from "./BreachFixPanel.jsx";
import { fmtNumber } from "./LiveSnippets.jsx";

const METHOD_LABEL = {
  face: "Face ID",
  finger: "Fingerprint",
  hello: "Windows Hello",
  passkey: "Passkey",
};

function errText(err, t, fallback) {
  return serverMessage(err?.body, "error", t) || serverMessage(err?.body, "message", t) || (err?.message ? t(err.message) : t(fallback));
}

function isOfflineError(err) {
  // A network failure (no status). A 502 / 503 from a busy server is not "offline": the
  // caller falls back to the sign-up card.
  return (err?.code === "transient" && !err?.status) || (typeof navigator !== "undefined" && navigator.onLine === false);
}

/** "Very strong · 14 characters" for the meter under the password. */
function strengthText(t, pw) {
  const s = passwordStrength(pw);
  const level = s.tooShort ? 1 : s.score <= 1 ? 1 : s.score === 2 ? 2 : s.score === 3 ? 3 : 4;
  const word = level === 1 ? t("Weak") : level === 2 ? t("Fair") : level === 3 ? t("Good") : pw.length >= 14 ? t("Very strong") : t("Strong");
  return { level, text: t("{strength} · {count} characters", { strength: word, count: pw.length }) };
}

function Field({ id, label, labelRight, icon: Icon, state, children, hint, trailing }) {
  return (
    <div className={`asu-f${state ? ` is-${state}` : ""}`}>
      {label || labelRight ? (
        <div className="asu-fl">
          {label ? <label htmlFor={id}>{label}</label> : <span />}
          {labelRight || null}
        </div>
      ) : null}
      <div className="asu-fi">
        {Icon ? <Icon size={18} aria-hidden="true" /> : null}
        {children}
        {trailing ? <span className="asu-tr">{trailing}</span> : null}
      </div>
      {hint || null}
    </div>
  );
}

function IdRow({ value, pill, onChange, compact }) {
  const t = useT();
  return (
    <div className="asu-idrow">
      <Mail size={17} aria-hidden="true" />
      <span className="asu-v" data-testid="asu-idrow-value">{value}</span>
      {pill}
      <button type="button" className="asu-ed" onClick={onChange} aria-label={t("Change the email")}>
        <Pencil size={13} aria-hidden="true" />
        {compact ? null : <span>{t("Change")}</span>}
      </button>
    </div>
  );
}

function PasswordToggle({ shown, onToggle }) {
  const t = useT();
  return (
    <button type="button" onClick={onToggle} aria-label={shown ? t("Hide password") : t("Show password")} aria-pressed={shown} title={shown ? t("Hide password") : t("Show password")}>
      {shown ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
    </button>
  );
}

export default function AdaptiveAuthCard({
  intent = "login",
  surface = "site",
  compact = false,
  onLogin,
  onRegister,
  onGoogle,
  onApple,
  onPasskeyLogin,
  onPasskeyError,
  onTwoFa,
  loading = false,
  error = "",
  onDismissError,
  inviteRef = "",
  onOpenLegal,
  onStepChange,
  onRegisterIntent,
}) {
  const t = useT();
  const { locale } = useLocale();
  const draft = useMemo(() => loadCardDraft(), []);
  const [step, setStep] = useState("start"); // start | register | login | reset | passkey
  const [identifier, setIdentifier] = useState(() => peekInviteEmail() || draft?.identifier || "");
  const [identifying, setIdentifying] = useState(false);
  const [startError, setStartError] = useState("");
  const [account, setAccount] = useState(null); // { kind: "email" | "username", value, hint, closed? }
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");
  const cardId = useRef(`c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // ---- social providers (first one is the big white button) -------------------------
  const pk = usePasskeyAvailability();
  const [googleGone, setGoogleGone] = useState(false);
  const providers = useMemo(() => {
    const list = [];
    if (isNativeIOS() && onApple) list.push("apple");
    if (isGoogleSignInOffered() && onGoogle && !googleGone) list.push("google");
    if (pk.available && onPasskeyLogin) list.push("passkey");
    return list;
  }, [onApple, onGoogle, onPasskeyLogin, googleGone, pk.available]);
  const style = signInStyle(pk.path);
  const methodName = t(METHOD_LABEL[style] || "Passkey");

  const handlePasskeyBody = useCallback(
    async (body) => {
      if (body?.requires2fa) {
        onTwoFa?.(body);
        return;
      }
      clearCardDraft();
      await onPasskeyLogin?.(body);
    },
    [onPasskeyLogin, onTwoFa]
  );

  const renderProvider = (p, primary) => {
    if (p === "google") {
      return (
        <div key="google" className={primary ? "is-primary" : ""}>
          <GoogleSignInButton
            appearance="glass"
            hideWhenUnavailable
            onUnavailable={() => setGoogleGone(true)}
            disabled={loading}
            label={primary ? t("Continue with Google") : "Google"}
            onCredential={(credential) => onGoogle?.(credential)}
          />
        </div>
      );
    }
    if (p === "apple") {
      return (
        <div key="apple" className={primary ? "is-primary" : ""}>
          <AppleSignInButton disabled={loading} label={primary ? t("Continue with Apple") : "Apple"} onApple={(apple) => onApple?.(apple)} />
        </div>
      );
    }
    return (
      <div key="passkey" className={primary ? "is-primary" : ""}>
        <PasskeySignInButton
          disabled={loading}
          showNote={false}
          label={primary ? "" : t("Passwordless")}
          onSignedIn={handlePasskeyBody}
          onError={(err) => onPasskeyError?.(err)}
          onUsePassword={() => document.getElementById("asu-identifier")?.focus()}
        />
      </div>
    );
  };

  // ---- start ------------------------------------------------------------------------
  const kind = identifierKind(identifier);
  const chips = step === "start" ? domainChips(identifier, locale) : [];
  const typoFix = step === "start" && kind === "email" ? emailTypoFix(identifier) : null;

  useEffect(() => {
    saveCardDraft({ identifier: kind === "email" || kind === "username" ? identifier.trim() : "" });
  }, [identifier, kind]);

  const goRegister = useCallback(
    (email, extra = {}) => {
      setAccount({ kind: "email", value: email, ...extra });
      setStep("register");
      onRegisterIntent?.();
      prewarmHumanCheck("register");
    },
    [onRegisterIntent]
  );

  const submitStart = async (e) => {
    e?.preventDefault?.();
    if (identifying || loading) return;
    setStartError("");
    onDismissError?.();
    const value = identifier.trim();
    const focusField = () => document.getElementById("asu-identifier")?.focus();
    const noAccount = t("No account has this username. To open an account, type your email.");
    if (kind === "invalid") {
      // No account can have this name (a space, one character): sign-up needs an email.
      setStartError(noAccount);
      focusField();
      return;
    }
    if (kind === "username") {
      const name = loginName(value);
      setIdentifying(true);
      try {
        const r = await identifyUsername(name, { surface });
        if (r?.status === "registered") {
          setAccount({ kind: "username", value: name });
          setStep("login");
        } else {
          setStartError(noAccount);
          focusField();
        }
      } catch (err) {
        if (err?.status === 400) {
          setStartError(noAccount);
        } else if (err?.status === 403) {
          setStartError(errText(err, t, "Something went wrong"));
        } else if (isOfflineError(err)) {
          setStartError(t("No connection. Try again when you are back online."));
        } else {
          // The lookup failed or is rate limited: the sign-in card still works (the login
          // answers the same generic error for an unknown name).
          setAccount({ kind: "username", value: name });
          setStep("login");
        }
      } finally {
        setIdentifying(false);
      }
      return;
    }
    if (kind !== "email") {
      setStartError(kind === "empty" ? t("Type your email or username.") : t("Type a valid email address."));
      focusField();
      return;
    }
    const email = value.toLowerCase();
    setIdentifying(true);
    try {
      const r = await identifyEmail(email, { surface });
      if (r?.status === "registered") {
        setAccount({ kind: "email", value: email, hint: r.emailHint || "" });
        setStep("login");
      } else {
        goRegister(email, { closed: Boolean(r?.registrationClosed) });
      }
    } catch (err) {
      if (err?.status === 403 || err?.status === 400) {
        setStartError(errText(err, t, "Something went wrong"));
      } else if (isOfflineError(err)) {
        setStartError(t("No connection. Try again when you are back online."));
      } else {
        // The lookup failed or is rate limited (a shared carrier address): the sign-up card
        // still works, and a taken email turns into sign-in on submit (409 email_taken).
        goRegister(email);
      }
    } finally {
      setIdentifying(false);
    }
  };

  const changeEmail = () => {
    setStep("start");
    setFormError("");
    setInfo("");
    onDismissError?.();
    setTimeout(() => document.getElementById("asu-identifier")?.focus(), 30);
  };

  // ---- register ---------------------------------------------------------------------
  const email = account?.kind === "email" ? account.value : "";
  const [username, setUsername] = useState(draft?.username || "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ideas, setIdeas] = useState([]);
  const [fixTab, setFixTab] = useState("suggested");
  const [passwordlessChosen, setPasswordlessChosen] = useState(false);
  const [suggestionUsed, setSuggestionUsed] = useState("");
  const [serverBreached, setServerBreached] = useState("");
  const [breachWarned, setBreachWarned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const digits = useMemo(() => String(10 + Math.floor(Math.random() * 90)), []);
  const registering = step === "register";

  useEffect(() => {
    if (registering) saveCardDraft({ identifier: email, username: username.trim() });
  }, [registering, email, username]);

  const checks = useSignupFieldChecks({ username, password, email, enabled: registering });
  const breach = useBreachCheck(password, { enabled: registering && !passwordlessChosen });
  const breached = registering && password && ((breach.status === "breached" && breach.value === password) || serverBreached === password);

  useEffect(() => {
    if (!breached || breachWarned) return;
    setBreachWarned(true);
    setFixTab("suggested");
    trackCardEvent("breach_warned_inline", { source: surface }, { once: `warn-${cardId.current}` });
  }, [breached, breachWarned, surface]);

  // Username ideas from the email: the free ones only, never typed in for the person.
  useEffect(() => {
    if (!registering || !email) return undefined;
    const candidates = ideasFromEmail(email, { digits, year: birthDate ? birthDate.slice(0, 4) : null });
    if (!candidates.length) return undefined;
    let alive = true;
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    freeUsernameIdeas(candidates, { signal: ctl?.signal })
      .then((free) => alive && setIdeas(free.slice(0, 4)))
      .catch(() => alive && setIdeas([]));
    return () => {
      alive = false;
      ctl?.abort();
    };
    // birthDate only changes the numbered idea; refetch when the year is known.
  }, [registering, email, digits, birthDate ? birthDate.slice(0, 4) : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  const uField = checks.fields.username;
  const pField = checks.fields.password;
  const uState = !username.trim() ? null : uField?.visible && uField?.message ? "err" : uField?.state === "ok" ? "ok" : null;
  const passwordOk = Boolean(password) && !pField?.code && !breached && breach.status !== "checking";
  const birthOk = isEligibleBirthDate(birthDate);
  const problems = (breached ? 1 : 0) + (uField?.visible && uField?.message ? 1 : 0) + (pField?.visible && pField?.message && pField.code !== "password_breached" ? 1 : 0);

  const passkeySignup = pk.available && Boolean(onRegister);
  const needsForPasswordless = !username.trim() || usernameIssueVisible(uField) || !birthOk || !termsAccepted;

  const useSuggestion = (value) => {
    setPassword(value);
    setSuggestionUsed(value);
    setShowPw(true);
    setServerBreached("");
    setInfo(t("Your password is ready. When you create the account, your browser or password manager offers to save it."));
  };

  const focusOwn = () => {
    setPassword("");
    setSuggestionUsed("");
    setServerBreached("");
    setTimeout(() => document.getElementById("asu-password")?.focus(), 20);
  };

  const fixedVia = () => {
    if (!breachWarned) return null;
    if (passwordlessChosen) return "passkey";
    return suggestionUsed && suggestionUsed === password ? "suggested" : "own";
  };

  // After a passwordless account: the passkey step waits for the person's click.
  const pkWait = useRef(null);
  const [pkState, setPkState] = useState({ busy: false, error: "", prepared: null });

  const runRegister = async ({ passwordless = false } = {}) => {
    if (submitting || loading) return;
    setFormError("");
    setInfo("");
    onDismissError?.();
    checks.touchAll();
    if (!termsAccepted || !birthOk) {
      setFormError(!birthOk ? t("Enter your date of birth.") : t("Accept the Terms of Service and Privacy Policy to continue."));
      return;
    }
    if (under13SignupBlocked() || noteUnder13BirthDate(birthDate)) {
      setFormError(t(DEVICE_SIGNUP_BLOCK_MESSAGE));
      return;
    }
    const nameIssue = uField?.code;
    if (!username.trim() || (nameIssue && nameIssue !== "server")) {
      document.getElementById("asu-username")?.focus();
      return;
    }
    if (!passwordless) {
      if (checks.hasErrors || !password) {
        document.getElementById(checks.fields.username?.code ? "asu-username" : "asu-password")?.focus();
        return;
      }
      if (breached) {
        document.getElementById("asu-fix-tab-suggested")?.focus();
        return;
      }
    }
    setSubmitting(true);
    const via = passwordless ? (breachWarned ? "passkey" : null) : fixedVia();
    const payload = {
      username: username.trim(),
      ...(passwordless ? { passwordless: true } : { password }),
      termsAccepted: true,
      birthDate,
      email,
      ...(inviteRef ? { invitedBy: inviteRef } : {}),
      card: { surface, breachWarned, ...(via ? { fixedVia: via } : {}) },
      beforeCommit: async (reg) => {
        if (passwordless) {
          setStep("passkey");
          setPkState({ busy: false, error: "", prepared: null });
          prepareRegister(undefined)
            .then((prepared) => setPkState((s) => ({ ...s, prepared })))
            .catch(() => {});
          await new Promise((resolve) => {
            pkWait.current = resolve;
          });
          return;
        }
        storeCredential(email, password, reg?.user?.username || username.trim());
      },
    };
    try {
      await onRegister(payload);
      clearCardDraft();
    } catch (err) {
      const code = err?.body?.code || err?.code;
      if (code === "email_taken") {
        // Taken after all (a race, or the lookup failed): the sign-in card, no error.
        setAccount({ kind: "email", value: email, hint: "" });
        setStep("login");
        setInfo(t("This email already has an account, so the card turned into sign-in."));
        onDismissError?.();
      } else if (code === "pwned" || code === "password_breached") {
        setServerBreached(password);
        onDismissError?.();
      } else {
        checks.noteServerError(err);
        setStep((cur) => (cur === "passkey" ? "register" : cur));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const createPasskey = async () => {
    if (pkState.busy) return;
    setPkState((s) => ({ ...s, busy: true, error: "" }));
    try {
      await registerPasskey(undefined, { prepared: pkState.prepared || undefined });
      const done = pkWait.current;
      pkWait.current = null;
      done?.();
    } catch (err) {
      const e = normalizePasskeyError(err);
      const key = isSilentPasskeyError(e) ? null : passkeyErrorKey(e);
      setPkState((s) => ({ ...s, busy: false, error: key ? t(key) : t("The key was not created. Try again, or skip for now.") }));
    }
  };

  const skipPasskey = () => {
    const done = pkWait.current;
    pkWait.current = null;
    done?.();
  };

  useEffect(() => () => {
    // Leaving the card while the passkey step waits: let the sign-up finish.
    pkWait.current?.();
  }, []);

  // ---- login ------------------------------------------------------------------------
  const [loginPw, setLoginPw] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);
  const typingStart = useRef(0);
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    if (step === "login") {
      setLoginPw("");
      setTimeout(() => document.getElementById("asu-login-password")?.focus(), 40);
    }
  }, [step]);

  const submitLogin = async (e) => {
    e?.preventDefault?.();
    if (!loginPw || loginBusy || loading) return;
    setFormError("");
    setInfo("");
    setLoginBusy(true);
    try {
      const signInMs = typingStart.current ? Date.now() - typingStart.current : undefined;
      const result = await onLogin({ username: account.value, password: loginPw, signInMs });
      if (result?.requires2fa) onTwoFa?.(result);
      else clearCardDraft();
    } catch {
      /* the error prop shows the message */
    } finally {
      setLoginBusy(false);
    }
  };

  // ---- reset (code in the same card) --------------------------------------------------
  const [resetBusy, setResetBusy] = useState(false);
  const [code, setCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const resetBreach = useBreachCheck(newPw, { enabled: step === "reset" });

  const sendCode = async () => {
    if (resetBusy) return;
    setResetBusy(true);
    setFormError("");
    setInfo("");
    onDismissError?.();
    try {
      const data = await requestPasswordReset(account.value);
      if (data?.status === "no_email") {
        setFormError(t("This account has no verified email, so the password cannot be reset by code. Write to {email}.", { email: data.supportEmail || "support@descall.com" }));
        return;
      }
      setCode("");
      setNewPw("");
      setStep("reset");
      setInfo(serverMessage(data, "message", t) || t("We sent a 6-digit code to your email."));
    } catch (err) {
      setFormError(errText(err, t, "Could not send reset code."));
    } finally {
      setResetBusy(false);
    }
  };

  const suggestForReset = async () => {
    const s = await suggestPassphrase({ locale }).catch(() => null);
    if (s) {
      setNewPw(s.value);
      setShowNewPw(true);
    }
  };

  const submitReset = async (e) => {
    e?.preventDefault?.();
    if (resetBusy) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setFormError(t("Enter the 6-digit code from the email."));
      return;
    }
    if (resetBreach.status === "breached") {
      setFormError(t("This password has appeared in data breaches. Choose a different password."));
      return;
    }
    setResetBusy(true);
    setFormError("");
    try {
      await confirmPasswordReset({ usernameOrEmail: account.value, code: code.trim(), newPassword: newPw });
      setInfo(t("Password changed. Signing you in…"));
      const result = await onLogin({ username: account.value, password: newPw });
      if (result?.requires2fa) onTwoFa?.(result);
      else clearCardDraft();
    } catch (err) {
      if (err?.body?.code === "pwned") setFormError(t("This password has appeared in data breaches. Choose a different password."));
      else setFormError(errText(err, t, "Could not reset the password. Check the code and try again."));
    } finally {
      setResetBusy(false);
    }
  };

  // ---- readiness line ------------------------------------------------------------------
  const ready = readiness({
    step: step === "passkey" ? "register" : step,
    identifier,
    identifierOk: kind === "email" || kind === "username",
    passwordFilled: step === "login" ? Boolean(loginPw) : Boolean(newPw),
    codeFilled: /^\d{6}$/.test(code.trim()),
    usernameOk: uState === "ok",
    passwordOk: passwordOk || passwordlessChosen,
    passwordTyped: Boolean(password),
    birthOk,
    termsOk: termsAccepted,
  });

  const shownError = formError || error;
  const alert = shownError ? (
    <p className="asu-alert" role="alert" id="asu-error">
      <AlertTriangle size={14} aria-hidden="true" />
      <span>{shownError}</span>
    </p>
  ) : info ? (
    <p className="asu-alert is-info" role="status">
      <Info size={14} aria-hidden="true" />
      <span>{info}</span>
    </p>
  ) : null;

  // ---- render -----------------------------------------------------------------------
  let body = null;
  if (step === "start") {
    const [primary, ...rest] = providers;
    body = (
      <form className="asu-step" onSubmit={submitStart} noValidate key="start">
        <div className="asu-title">
          <h2>{t("Let's get started")}</h2>
          <span>{t("One card, no steps")}</span>
        </div>
        {inviteRef ? (
          <p className="asu-morph">
            <User size={13} aria-hidden="true" />
            <span>{t("Invited by @{username}", { username: inviteRef })}</span>
          </p>
        ) : null}
        {providers.length ? (
          <div className="asu-social">
            {renderProvider(primary, true)}
            {rest.length ? <div className="asu-row2">{rest.map((p) => renderProvider(p, false))}</div> : null}
          </div>
        ) : null}
        {providers.length ? <div className="asu-dv">{t("or with your email or username")}</div> : null}
        <Field
          id="asu-identifier"
          label={t("Email or username")}
          icon={kind === "username" ? User : Mail}
          state={startError ? "err" : null}
          hint={
            <>
              {chips.length ? (
                <div className="asu-chips" aria-label={t("Complete the address")}>
                  {chips.map((d, i) => (
                    <button key={d} type="button" className={`asu-chip${i === 0 ? " is-sel" : ""}`} onClick={() => setIdentifier(withDomain(identifier, d))}>
                      @{d}
                    </button>
                  ))}
                </div>
              ) : null}
              {typoFix ? (
                <div className="asu-chips">
                  <button type="button" className="asu-chip" onClick={() => setIdentifier(typoFix)}>
                    {t("Did you mean {email}?", { email: typoFix })}
                  </button>
                </div>
              ) : null}
              {startError ? (
                <p className="asu-fh is-err" role="alert">
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>{startError}</span>
                </p>
              ) : null}
            </>
          }
        >
          <input
            id="asu-identifier"
            type="text"
            inputMode="email"
            autoComplete={PASSKEY_AUTOCOMPLETE}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={254}
            placeholder={t("name@example.com or username")}
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              if (startError) setStartError("");
            }}
            aria-invalid={startError ? "true" : undefined}
            aria-describedby="asu-start-morph"
          />
        </Field>
        <p className="asu-morph" id="asu-start-morph">
          <Info size={13} aria-hidden="true" />
          <span>
            {compact
              ? t("If you have an account the card turns into sign-in, otherwise we open yours right here.")
              : t("If you have an account the card turns into the sign-in card, otherwise we open your account right here. No separate page. You can also sign in with your username.")}
          </span>
        </p>
        {alert}
        <button type="submit" className="asu-btn is-prim" disabled={identifying || loading} aria-busy={identifying || undefined}>
          {identifying ? <span className="asu-spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
          <span>{identifying ? t("Checking…") : t("Continue")}</span>
        </button>
      </form>
    );
  } else if (step === "register") {
    const showFix = breached || passwordlessChosen;
    const leak =
      passwordlessChosen ? null : breached ? (
        <em className="asu-leak is-bad">
          <AlertTriangle size={11} aria-hidden="true" />
          {breach.count > 0 ? t("Found in {count} breaches", { count: fmtNumber(breach.count, locale) }) : t("Found in breaches")}
        </em>
      ) : breach.status === "checking" ? (
        <em className="asu-leak is-chk">
          <span className="asu-spin" aria-hidden="true" />
          {t("Breach check…")}
        </em>
      ) : breach.status === "clean" && breach.value === password ? (
        <em className="asu-leak">
          <ShieldCheck size={11} aria-hidden="true" />
          {t("Breach check: clean")}
        </em>
      ) : breach.status === "unknown" && password ? (
        <em className="asu-leak is-chk">{t("Breach check unavailable")}</em>
      ) : null;
    const meter = !breached && password && !passwordlessChosen ? strengthText(t, password) : null;
    body = (
      <form className="asu-step" onSubmit={(e) => { e.preventDefault(); runRegister(); }} noValidate key="register">
        <div className="asu-title">
          <h2>{t("Create your account")}</h2>
          {problems ? (
            <span className="asu-pill is-fix">
              <AlertTriangle size={11} aria-hidden="true" />
              {compact ? t("Fix") : problems === 1 ? t("1 thing to fix") : t("{count} things to fix", { count: problems })}
            </span>
          ) : (
            <span className="asu-pill is-new">
              <Check size={11} aria-hidden="true" />
              {t("New email")}
            </span>
          )}
        </div>
        <IdRow
          value={email}
          compact={compact}
          onChange={changeEmail}
          pill={
            <em className="asu-leak">
              <Check size={11} aria-hidden="true" />
              {t("Not taken")}
            </em>
          }
        />
        {account?.closed ? (
          <p className="asu-alert is-info" role="status">
            <Info size={14} aria-hidden="true" />
            <span>{t("New sign-ups are closed right now. If you have an account you can sign in.")}</span>
          </p>
        ) : null}
        <Field
          id="asu-username"
          label={t("Username")}
          labelRight={
            uField?.state === "ok" && username.trim() ? (
              <em className="asu-c-ok">
                <Check size={12} aria-hidden="true" />
                {t("Available")}
              </em>
            ) : uField?.state === "checking" ? (
              <em className="is-muted">{t("Checking…")}</em>
            ) : null
          }
          icon={AtSign}
          state={uState}
          trailing={uState === "ok" ? <Check size={17} className="asu-c-ok" aria-hidden="true" /> : null}
          hint={
            <>
              {uField?.visible && uField?.message ? (
                <p className="asu-fh is-err" role="alert" id="asu-username-msg">
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>{uField.code === "username_taken" && uField.suggestions?.length ? t("This username is taken. Try one of these:") : t(uField.message)}</span>
                </p>
              ) : null}
              {uField?.suggestion ? (
                <div className="asu-chips">
                  <button type="button" className="asu-chip" onClick={() => setUsername(uField.suggestion)}>
                    {t("Use @{name}", { name: uField.suggestion })}
                  </button>
                </div>
              ) : null}
              {uField?.code === "username_taken" && uField.suggestions?.length ? (
                <div className="asu-chips">
                  {uField.suggestions.map((s) => (
                    <button key={s} type="button" className="asu-chip" onClick={() => setUsername(s)}>
                      @{s}
                    </button>
                  ))}
                </div>
              ) : null}
              {ideas.length && !(uField?.code === "username_taken") ? (
                <>
                  <p className="asu-fh">{t("Ideas from your email, all free:")}</p>
                  <div className="asu-chips" data-testid="asu-ideas">
                    {ideas.map((s) => (
                      <button key={s} type="button" className={`asu-chip${username.trim() === s ? " is-sel" : ""}`} onClick={() => setUsername(s)} aria-pressed={username.trim() === s}>
                        @{s}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          }
        >
          <input
            id="asu-username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={24}
            placeholder={t("username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => checks.blur("username")}
            aria-invalid={uState === "err" ? "true" : undefined}
            aria-describedby={uState === "err" ? "asu-username-msg" : undefined}
          />
        </Field>
        {/* The account's email for password managers (saved with the new password). */}
        <input type="email" name="email" className="asu-sr" autoComplete="email" value={email} readOnly aria-hidden="true" tabIndex={-1} />
        {passwordlessChosen ? null : (
          <Field
            id="asu-password"
            label={t("Password")}
            labelRight={leak}
            icon={Lock}
            state={breached ? "warn" : pField?.visible && pField?.message ? "err" : passwordOk && breach.status === "clean" ? "ok" : null}
            trailing={<PasswordToggle shown={showPw} onToggle={() => setShowPw((v) => !v)} />}
            hint={
              <>
                {pField?.visible && pField?.message && pField.code !== "password_breached" ? (
                  <p className="asu-fh is-err" role="alert" id="asu-password-msg">
                    <AlertTriangle size={13} aria-hidden="true" />
                    <span>{t(pField.message)}</span>
                  </p>
                ) : null}
                {meter ? <Meter level={meter.level} text={meter.text} /> : null}
                {!breached && passkeySignup && !password ? (
                  <button type="button" className="asu-lnk" style={{ alignSelf: "flex-start", fontSize: 12 }} onClick={() => { setPasswordlessChosen(true); setFixTab("passwordless"); }}>
                    {t("Use {method} instead of a password", { method: methodName })}
                  </button>
                ) : null}
              </>
            }
          >
            <input
              id="asu-password"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              maxLength={72}
              placeholder={t("At least 8 characters")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (serverBreached) setServerBreached("");
              }}
              onBlur={() => checks.blur("password")}
              aria-invalid={breached || (pField?.visible && pField?.message) ? "true" : undefined}
              aria-describedby={pField?.visible && pField?.message ? "asu-password-msg" : undefined}
            />
          </Field>
        )}
        {showFix ? (
          <BreachFixPanel
            tab={fixTab}
            compact={compact}
            reason={breached ? "breached" : "choice"}
            onTab={(k) => {
              setFixTab(k);
              if (k === "passwordless") setPasswordlessChosen(true);
              else if (passwordlessChosen) setPasswordlessChosen(false);
            }}
            onUseSuggestion={useSuggestion}
            onFocusOwn={() => {
              setPasswordlessChosen(false);
              focusOwn();
            }}
            passkey={{
              available: passkeySignup,
              method: methodName,
              label: t("Create a passwordless account with {method}", { method: methodName }),
              busy: submitting,
              disabledReason: needsForPasswordless ? t("First pick a username, enter your date of birth and accept the terms below.") : "",
              onCreate: () => runRegister({ passwordless: true }),
            }}
            socialFallback={
              providers.filter((p) => p !== "passkey").length ? (
                <div className="asu-social">{providers.filter((p) => p !== "passkey").map((p, i) => renderProvider(p, i === 0))}</div>
              ) : null
            }
          />
        ) : null}
        <div className="asu-f asu-birth">
          <div className="asu-fl">
            <span>{t("Date of birth")}</span>
            <em className="is-muted">{t("Shown to no one")}</em>
          </div>
          <BirthDateInput idPrefix="asu-birth" value={birthDate} onChange={setBirthDate} variant="app" />
        </div>
        <div className="asu-terms">
          <TermsConsent id="asu-terms" checked={termsAccepted} onChange={setTermsAccepted} onOpenLegal={onOpenLegal} />
        </div>
        {alert}
        <div className="asu-sticky">
          {passwordlessChosen ? null : breached ? (
            <button type="submit" className="asu-btn is-dis" aria-disabled="true">
              <Lock size={16} aria-hidden="true" />
              <span>{t("Ready once you pick a password")}</span>
            </button>
          ) : (
            <button type="submit" className="asu-btn is-prim" disabled={submitting || loading} aria-busy={submitting || loading || undefined}>
              {submitting || loading ? <span className="asu-spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
              <span>{submitting || loading ? t("Please wait...") : t("Open my account")}</span>
            </button>
          )}
        </div>
      </form>
    );
  } else if (step === "login") {
    const isEmail = account?.kind === "email";
    const hint = account?.hint || account?.value || "";
    body = (
      <form className="asu-step" onSubmit={submitLogin} noValidate key="login">
        <div className="asu-title">
          <h2>{t("Welcome back")}</h2>
          <span className="asu-pill is-known">
            <User size={11} aria-hidden="true" />
            {compact ? t("Registered") : t("Registered account")}
          </span>
        </div>
        <IdRow value={account?.value} compact={compact} onChange={changeEmail} pill={null} />
        {/* The identifier for password managers and the passkey autofill. */}
        <input type="text" name="username" className="asu-sr" autoComplete="username" value={account?.value || ""} readOnly aria-hidden="true" tabIndex={-1} />
        <p className="asu-morph">
          <Info size={13} aria-hidden="true" />
          <span>
            {!isEmail
              ? t("You are signing in with your username.")
              : compact
                ? t("You already have an account with this email; the card turned into sign-in, no need to type it again.")
                : t("You already have an account with this email, so the card turned into the sign-in card. No need to type the email again.")}
          </span>
        </p>
        {onPasskeyLogin && pk.available ? (
          <div className="asu-pk-white">
            <PasskeySignInButton
              disabled={loading}
              showNote={false}
              onSignedIn={handlePasskeyBody}
              onError={(err) => onPasskeyError?.(err)}
              onUsePassword={() => document.getElementById("asu-login-password")?.focus()}
            />
          </div>
        ) : null}
        <Field
          id="asu-login-password"
          label={t("Password")}
          icon={Lock}
          state={error ? "err" : null}
          trailing={<PasswordToggle shown={showLoginPw} onToggle={() => setShowLoginPw((v) => !v)} />}
          hint={
            caps ? (
              <p className="asu-fh is-warn" role="status">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t("Caps Lock is on")}</span>
              </p>
            ) : null
          }
        >
          <input
            id="asu-login-password"
            type={showLoginPw ? "text" : "password"}
            autoComplete="current-password"
            maxLength={72}
            placeholder={t("Your password")}
            value={loginPw}
            onChange={(e) => {
              if (!typingStart.current) typingStart.current = Date.now();
              setLoginPw(e.target.value);
            }}
            onKeyUp={(e) => setCaps(Boolean(e.getModifierState?.("CapsLock")))}
            onKeyDown={(e) => setCaps(Boolean(e.getModifierState?.("CapsLock")))}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "asu-error" : undefined}
          />
        </Field>
        {alert}
        <button type="submit" className="asu-btn is-prim" disabled={!loginPw || loginBusy || loading} aria-busy={loginBusy || loading || undefined}>
          {loginBusy || loading ? <span className="asu-spin" aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
          <span>{t("Sign in")}</span>
        </button>
        <div className="asu-tp">
          <div className="asu-bp-h">
            <span className="asu-ico">
              <Mail size={16} aria-hidden="true" />
            </span>
            <div>
              <b>{t("Don't remember your password?")}</b>
              <span>
                {!isEmail
                  ? t("We send a 6-digit code to the email of your account.")
                  : compact
                    ? t("A 6-digit code to {email}.", { email: hint })
                    : t("We send a 6-digit code to {email}; set a new password without leaving the card.", { email: hint })}
              </span>
            </div>
          </div>
          <button type="button" className="asu-btn is-glass is-sm" onClick={sendCode} disabled={resetBusy} aria-busy={resetBusy || undefined}>
            {resetBusy ? <span className="asu-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
            <span>{t("Send code")}</span>
          </button>
        </div>
        {googleOpen && providers.includes("google") ? <div className="asu-social">{renderProvider("google", true)}</div> : null}
        {compact ? null : (
          <div className="asu-lead">
            <button type="button" className="asu-lnk" onClick={changeEmail}>
              {t("Use a different email")}
            </button>
            {providers.includes("google") || providers.includes("apple") ? (
              <>
                <span className="asu-sep" aria-hidden="true">·</span>
                <button type="button" className="asu-lnk" onClick={() => setGoogleOpen(true)}>
                  {providers.includes("apple") ? t("I signed up with Apple") : t("I signed up with Google")}
                </button>
              </>
            ) : null}
          </div>
        )}
        {googleOpen && providers.includes("apple") ? <div className="asu-social">{renderProvider("apple", true)}</div> : null}
      </form>
    );
  } else if (step === "reset") {
    body = (
      <form className="asu-step" onSubmit={submitReset} noValidate key="reset">
        <div className="asu-title">
          <h2>{t("Set a new password")}</h2>
          <span className="asu-pill is-known">
            <Mail size={11} aria-hidden="true" />
            {t("Code sent")}
          </span>
        </div>
        <IdRow value={account?.value} compact={compact} onChange={changeEmail} pill={null} />
        <Field id="asu-reset-code" label={t("6-digit code")} icon={KeyRound}>
          <input
            id="asu-reset-code"
            className="asu-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
        </Field>
        <Field
          id="asu-new-password"
          label={t("New password")}
          labelRight={
            resetBreach.status === "breached" ? (
              <em className="asu-leak is-bad">
                <AlertTriangle size={11} aria-hidden="true" />
                {resetBreach.count > 0 ? t("Found in {count} breaches", { count: fmtNumber(resetBreach.count, locale) }) : t("Found in breaches")}
              </em>
            ) : resetBreach.status === "clean" ? (
              <em className="asu-leak">
                <ShieldCheck size={11} aria-hidden="true" />
                {t("Breach check: clean")}
              </em>
            ) : resetBreach.status === "checking" ? (
              <em className="asu-leak is-chk">{t("Breach check…")}</em>
            ) : null
          }
          icon={Lock}
          state={resetBreach.status === "breached" ? "warn" : null}
          trailing={<PasswordToggle shown={showNewPw} onToggle={() => setShowNewPw((v) => !v)} />}
          hint={
            <>
              {newPw && resetBreach.status !== "breached" ? <Meter {...strengthText(t, newPw)} /> : null}
              <button type="button" className="asu-lnk" style={{ alignSelf: "flex-start", fontSize: 12 }} onClick={suggestForReset}>
                {t("Suggest a strong password")}
              </button>
            </>
          }
        >
          <input
            id="asu-new-password"
            type={showNewPw ? "text" : "password"}
            autoComplete="new-password"
            maxLength={72}
            placeholder={t("At least 8 characters")}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
        </Field>
        {alert}
        <button type="submit" className="asu-btn is-prim" disabled={resetBusy || loading || newPw.length < 8 || code.length !== 6} aria-busy={resetBusy || undefined}>
          {resetBusy ? <span className="asu-spin" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
          <span>{t("Change password and sign in")}</span>
        </button>
        <div className="asu-lead">
          <button type="button" className="asu-lnk" onClick={sendCode} disabled={resetBusy}>
            {t("Send the code again")}
          </button>
          <span className="asu-sep" aria-hidden="true">·</span>
          <button type="button" className="asu-lnk" onClick={() => { setStep("login"); setFormError(""); setInfo(""); }}>
            <ArrowLeft size={12} aria-hidden="true" /> {t("Back to sign-in")}
          </button>
        </div>
      </form>
    );
  } else if (step === "passkey") {
    body = (
      <div className="asu-step" key="passkey">
        <div className="asu-pk-hero">
          <span className="asu-pk-ico">
            <KeyRound size={26} aria-hidden="true" />
          </span>
          <div className="asu-title" style={{ justifyContent: "center" }}>
            <h2>{t("Your account is open")}</h2>
          </div>
          <p>{t("Last step: create your sign-in key with {method}. No password, nothing to leak.", { method: methodName })}</p>
        </div>
        {pkState.error ? (
          <p className="asu-alert" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{pkState.error}</span>
          </p>
        ) : null}
        <button type="button" className="asu-btn is-prim" onClick={createPasskey} disabled={pkState.busy} aria-busy={pkState.busy || undefined}>
          {pkState.busy ? <span className="asu-spin" aria-hidden="true" /> : <KeyRound size={17} aria-hidden="true" />}
          <span>{t("Create the key with {method}", { method: methodName })}</span>
        </button>
        <button type="button" className="asu-btn is-glass is-sm" onClick={skipPasskey} disabled={pkState.busy}>
          <span>{t("Skip for now")}</span>
        </button>
        <p className="asu-fh">
          <Info size={13} aria-hidden="true" />
          <span>{t("You can add a key or a password later in Settings > Security.")}</span>
        </p>
      </div>
    );
  }

  return (
    <section className="asu-card" aria-label={step === "login" ? t("Sign in") : t("Create account")} data-step={step}>
      <span className="asu-ready" style={{ width: `${ready}%` }} aria-hidden="true" data-testid="asu-ready" />
      {body}
    </section>
  );
}

function usernameIssueVisible(field) {
  return Boolean(field?.code && field.code !== "server");
}

/** Chromium: offer the new password to the browser's password manager (best effort). */
function storeCredential(id, password, name) {
  try {
    if (typeof window === "undefined" || !window.PasswordCredential || !navigator.credentials?.store || !id || !password) return;
    const cred = new window.PasswordCredential({ id, password, name: name || id });
    navigator.credentials.store(cred).catch(() => {});
  } catch {
    /* not supported here */
  }
}
