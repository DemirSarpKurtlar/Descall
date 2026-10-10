import { useT } from "../../context/LocaleContext";

/** Local strength hint. The server still rejects short and breached passwords. */
export function passwordStrength(password) {
  const value = String(password || "");
  if (!value) return { score: 0, label: "", tooShort: false };
  let score = 0;
  if (value.length >= 10) score += 1;
  if (value.length >= 14) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  const label = score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : "Strong";
  return { score, label, tooShort: value.length < 10 };
}

export default function PasswordStrength({ password }) {
  const t = useT();
  const info = passwordStrength(password);
  if (!password) return null;
  const tone = info.tooShort ? "Weak" : info.label;
  return (
    <p className="auth-field-hint" role="status">
      {t(tone)}
      {info.tooShort ? ` — ${t("Password must be at least 10 characters.")}` : ""}
      {" · "}
      {t("Use at least 10 characters. A mix of letters and numbers is safer.")}
    </p>
  );
}
