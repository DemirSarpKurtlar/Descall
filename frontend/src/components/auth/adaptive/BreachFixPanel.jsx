/**
 * The breached password, solved inside the card (growth 1B): a plain reason, then three
 * ways out, chosen with the segmented control:
 *   Önerilen       a memorable suggestion ("Vapur-Simit-Kanat-Lodos-47", lib/adaptiveSignup/
 *                  passphrase.js) that is checked against the breach list first: show, copy,
 *                  new one, "use it and save" (fills the password field; the browser or the
 *                  password manager offers to save it, and the card stores it after sign-up)
 *   Kendi şifrem   tips, focus back on the password field (checked again as it is typed)
 *   Şifresiz       a passkey account (Face ID / Windows Hello / fingerprint) when this device
 *                  can make one, else Google / Apple
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useT } from "../../../context/localeContextInstance";
import { Zap, Pencil, KeyRound, RefreshCw, Copy, Check, Lock, Info } from "../../ui/Icon.jsx";
import { suggestPassphrase, PASSPHRASE_WORDS } from "../../../lib/adaptiveSignup/passphrase.js";
import { checkPasswordBreach } from "../../../lib/adaptiveSignup/breach.js";
import { fetchBreachRange } from "../../../api/adaptiveSignup.js";

const TABS = ["suggested", "own", "passwordless"];

/** isBreached for the generator: true / false, null when the list could not be reached. */
async function suggestionBreached(value) {
  const r = await checkPasswordBreach(value, { fetchRange: fetchBreachRange });
  return r.status === "breached" ? true : r.status === "clean" ? false : null;
}

export function Meter({ level, text }) {
  return (
    <div className={`asu-meter is-${Math.max(0, Math.min(4, level))}`} aria-hidden={text ? undefined : "true"}>
      <i />
      <i />
      <i />
      <i />
      {text ? <span>{text}</span> : <span />}
    </div>
  );
}

export default function BreachFixPanel({
  tab,
  onTab,
  compact = false,
  onUseSuggestion,
  onFocusOwn,
  passkey, // { available, label, onCreate, busy, disabledReason }
  socialFallback = null,
  reason = "breached",
}) {
  const t = useT();
  const { locale } = useLocale();
  const [suggestion, setSuggestion] = useState(null); // { value, words, ... }
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  const draw = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setFailed(false);
    setCopied(false);
    try {
      const next = await suggestPassphrase({ locale, isBreached: suggestionBreached });
      if (id !== seq.current) return;
      if (next) setSuggestion(next);
      else setFailed(true);
    } catch {
      if (id === seq.current) setFailed(true);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (tab === "suggested" && !suggestion && !loading && !failed) draw();
  }, [tab, suggestion, loading, failed, draw]);

  useEffect(() => () => {
    seq.current += 1;
  }, []);

  const copy = async () => {
    if (!suggestion) return;
    try {
      await navigator.clipboard.writeText(suggestion.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const onKeyTabs = (e) => {
    const i = TABS.indexOf(tab);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
      onTab(next);
      document.getElementById(`asu-fix-tab-${next}`)?.focus();
    }
  };

  const tabLabel = { suggested: t("Suggested"), own: t("My own password"), passwordless: t("Passwordless") };
  const TabIcon = { suggested: Zap, own: Pencil, passwordless: KeyRound };

  return (
    <div className="asu-bp" role="group" aria-label={t("Fix the password")}>
      <div className="asu-seg3" role="tablist" aria-label={t("Fix the password")} onKeyDown={onKeyTabs}>
        {TABS.map((k) => {
          const Icon = TabIcon[k];
          return (
            <button
              key={k}
              id={`asu-fix-tab-${k}`}
              type="button"
              role="tab"
              aria-selected={tab === k}
              aria-controls="asu-fix-panel"
              tabIndex={tab === k ? 0 : -1}
              onClick={() => onTab(k)}
            >
              {compact ? null : <Icon size={12} aria-hidden="true" />}
              <span>{tabLabel[k]}</span>
            </button>
          );
        })}
      </div>
      <div id="asu-fix-panel" role="tabpanel" aria-labelledby={`asu-fix-tab-${tab}`} style={{ display: "contents" }}>
        {tab === "suggested" ? (
          <>
            <p>
              {reason === "breached"
                ? compact
                  ? t("It is on stolen password lists, which attackers try first. It has nothing to do with your account. A strong one that is easy to remember:")
                  : t("This password is on lists stolen from other sites, and people who take over accounts try those first. It has nothing to do with your account. Here is a strong one that is easy to remember:")
                : t("A strong password that is easy to remember:")}
            </p>
            <div className="asu-gen">
              <span className={`asu-gen-v${loading && !suggestion ? " is-loading" : ""}`} data-testid="asu-suggestion" aria-live="polite">
                {suggestion ? suggestion.value : loading ? t("Preparing…") : ""}
              </span>
              <button type="button" onClick={draw} disabled={loading} title={t("Make a new one")} aria-label={t("Make a new one")}>
                <RefreshCw size={15} aria-hidden="true" />
              </button>
              {compact ? null : (
                <button type="button" onClick={copy} disabled={!suggestion} title={copied ? t("Copied") : t("Copy")} aria-label={copied ? t("Copied") : t("Copy")}>
                  {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                </button>
              )}
            </div>
            {failed ? (
              <p className="asu-fh is-warn">
                <Info size={13} aria-hidden="true" />
                <span>{t("A suggestion could not be prepared. You can type your own password.")}</span>
              </p>
            ) : (
              <Meter level={suggestion ? 4 : 0} text={suggestion ? t("Very strong · {count} words + number", { count: PASSPHRASE_WORDS }) : ""} />
            )}
            <button type="button" className="asu-btn is-prim is-sm" disabled={!suggestion || loading} onClick={() => suggestion && onUseSuggestion(suggestion.value)}>
              <Check size={16} aria-hidden="true" />
              <span>{t("Use this and save")}</span>
            </button>
            {compact ? null : (
              <div className="asu-bp-f">
                <Lock size={12} aria-hidden="true" />
                <span>{t("The check runs on your device: your password is never sent, only the first 5 characters of its hash.")}</span>
              </div>
            )}
          </>
        ) : null}
        {tab === "own" ? (
          <>
            <p>{t("Type a new password; it is checked again as you type. What works well:")}</p>
            <ul>
              <li>{t("A few words joined into a phrase you use nowhere else.")}</li>
              <li>{t("At least 12 characters, with a number or a symbol.")}</li>
            </ul>
            <button type="button" className="asu-btn is-glass is-sm" onClick={onFocusOwn}>
              <Pencil size={15} aria-hidden="true" />
              <span>{t("Type a new password")}</span>
            </button>
          </>
        ) : null}
        {tab === "passwordless" ? (
          passkey?.available ? (
            <>
              <p>{t("No password at all: you sign in with {method}, so there is nothing to leak.", { method: passkey.method })}</p>
              <button type="button" className="asu-btn is-prim is-sm" onClick={passkey.onCreate} disabled={passkey.busy || Boolean(passkey.disabledReason)} aria-busy={passkey.busy || undefined}>
                {passkey.busy ? <span className="asu-spin" aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
                <span>{passkey.label}</span>
              </button>
              {passkey.disabledReason ? (
                <p className="asu-fh">
                  <Info size={13} aria-hidden="true" />
                  <span>{passkey.disabledReason}</span>
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p>{t("This device cannot make a passkey. You can continue with Google or Apple instead, without a password.")}</p>
              {socialFallback}
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
