import { useEffect, useRef, useState } from "react";
import { useT } from "../../context/localeContextInstance";
import { checkSignupUsername } from "../../api/auth";

export const USERNAME_RULE = /^[a-zA-Z0-9_.-]{2,24}$/;

/** Client-side mirror of the backend rules (validateUsername). */
export function localUsernameError(value) {
  const v = String(value || "").trim();
  if (v.length < 2) return "At least 2 characters.";
  if (v.length > 24) return "At most 24 characters.";
  if (!USERNAME_RULE.test(v)) return "Only letters, numbers, _ . and -";
  return null;
}

/** Name from Apple → a username suggestion ("Ayşe Yılmaz" → "ayseyilmaz"). */
export function usernameFromName(name) {
  const map = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };
  return String(name || "")
    .replace(/[çğıİöşü]/gi, (c) => map[c.toLowerCase()] || map[c] || c)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 20);
}

/**
 * Username step for a new Apple account (owner rule 3.7.19: the person picks it,
 * nothing is filled in for them). The field starts empty; the name from Apple is
 * only offered as a chip to tap. Debounced live availability, inline rules,
 * suggestions when taken. `onState({ value, ok })`.
 */
export default function SignupUsernamePicker({ initial = "", onState, check = checkSignupUsername, debounceMs = 350 }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState({ state: "idle" }); // idle | checking | ok | taken | invalid | error
  const seq = useRef(0);
  const suggestion = String(initial || "").trim();

  useEffect(() => {
    const v = value.trim();
    const local = v ? localUsernameError(v) : null;
    if (!v) { setStatus({ state: "idle" }); onState?.({ value: v, ok: false }); return undefined; }
    if (local) { setStatus({ state: "invalid", message: local }); onState?.({ value: v, ok: false }); return undefined; }
    setStatus({ state: "checking" });
    onState?.({ value: v, ok: false });
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await check(v);
        if (id !== seq.current) return;
        if (res?.available) { setStatus({ state: "ok" }); onState?.({ value: v, ok: true }); }
        else setStatus({ state: res?.suggestions ? "taken" : "invalid", message: res?.error, suggestions: res?.suggestions || [] });
      } catch {
        if (id === seq.current) setStatus({ state: "error" });
      }
    }, debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const msg = {
    idle: t("Pick the name people will find you by."),
    checking: t("Checking…"),
    ok: t("This username is yours to take."),
    taken: t("This username is taken. Try one of these:"),
    invalid: t(status.message || "Invalid username."),
    error: t("Couldn't check right now. Try again."),
  }[status.state];

  return (
    <div className={`signup-username g-glass-heavy is-${status.state}`}>
      <label htmlFor="signup-username-input" className="signup-username-label">{t("Username")}</label>
      <div className="signup-username-field">
        <span className="signup-username-at" aria-hidden="true">@</span>
        <input
          id="signup-username-input"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\s/g, ""))}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={24}
          autoComplete="username"
          aria-invalid={status.state === "invalid" || status.state === "taken"}
          aria-describedby="signup-username-status"
        />
        <span className={`signup-username-dot is-${status.state}`} aria-hidden="true" />
      </div>
      <p id="signup-username-status" className="signup-username-status" role="status">{msg}</p>
      {!value && suggestion && (
        <div className="signup-username-suggestions">
          <span className="signup-username-suggest-label">{t("Suggestion:")}</span>
          <button type="button" className="signup-username-chip" onClick={() => setValue(suggestion)}>@{suggestion}</button>
        </div>
      )}
      {status.state === "taken" && status.suggestions?.length > 0 && (
        <div className="signup-username-suggestions">
          {status.suggestions.map((s) => (
            <button key={s} type="button" className="signup-username-chip" onClick={() => setValue(s)}>@{s}</button>
          ))}
        </div>
      )}
      <p className="signup-username-rules">{t("2–24 characters: letters, numbers, _ . -")}</p>
    </div>
  );
}
