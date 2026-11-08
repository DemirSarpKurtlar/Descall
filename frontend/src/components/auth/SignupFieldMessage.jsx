import { useT } from "../../context/localeContextInstance";

/**
 * Inline message under a register form field (useSignupFieldChecks): the rule that
 * fails, a one-tap fixed username, free usernames when the typed one is taken, or a
 * quiet "available" for the username. Renders nothing when there is nothing to say.
 */
export default function SignupFieldMessage({ id, field, kind, onPick, className = "auth-field-hint" }) {
  const t = useT();
  if (!field) return null;
  const pick = (value) => onPick?.(value);
  if (field.visible && field.message) {
    const taken = field.code === "username_taken";
    return (
      <div id={id} className={`${className} signup-field-msg is-error`} role="alert">
        <span>{taken && field.suggestions?.length ? t("This username is taken. Try one of these:") : t(field.message)}</span>
        {kind === "username" && field.suggestion ? (
          <span className="signup-field-chips">
            <button type="button" className="signup-field-chip" onClick={() => pick(field.suggestion)}>
              {t("Use @{name}", { name: field.suggestion })}
            </button>
          </span>
        ) : null}
        {kind === "username" && taken && field.suggestions?.length ? (
          <span className="signup-field-chips">
            {field.suggestions.map((s) => (
              <button key={s} type="button" className="signup-field-chip" onClick={() => pick(s)}>
                @{s}
              </button>
            ))}
          </span>
        ) : null}
      </div>
    );
  }
  if (kind === "username" && (field.state === "ok" || field.state === "checking")) {
    return (
      <p id={id} className={`${className} signup-field-msg is-${field.state}`} role="status">
        {field.state === "ok" ? t("This username is yours to take.") : t("Checking…")}
      </p>
    );
  }
  return null;
}
