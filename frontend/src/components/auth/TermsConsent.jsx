import { useT } from "../../context/localeContextInstance";

/** "I have read and agree to the Terms of Service and Privacy Policy" checkbox (sign-up). */
export default function TermsConsent({ id, checked, onChange, onOpenLegal }) {
  const t = useT();
  return (
    <div className="legal-consent">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        {t("I have read and agree to the")}{" "}
        <button type="button" className="legal-consent-link" onClick={() => onOpenLegal?.("terms")}>
          {t("Terms of Service")}
        </button>{" "}
        {t("and")}{" "}
        <button type="button" className="legal-consent-link" onClick={() => onOpenLegal?.("privacy")}>
          {t("Privacy Policy")}
        </button>
        .
        <span className="legal-consent-note">
          {t("Descall has zero tolerance for objectionable content and abusive users.")}
        </span>
      </label>
    </div>
  );
}
