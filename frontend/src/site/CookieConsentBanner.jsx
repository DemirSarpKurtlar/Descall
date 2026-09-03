import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { getCookieConsent, setCookieConsent } from "./analyticsGate";
import { Funnel } from "./analytics";
import { useT } from "../context/localeContextInstance";

export default function CookieConsentBanner() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!getCookieConsent());
  }, []);

  if (!visible || typeof document === "undefined") return null;

  const decide = (choice) => {
    setCookieConsent(choice);
    Funnel.consentDecision({ choice, surface: "react_banner" });
    setVisible(false);
  };

  return createPortal(
    <div className="mkt-consent" role="dialog" aria-label={t("Cookie preferences")}>
      <p>
        {t("Optional analytics only. Essentials stay on.")}{" "}
        <Link to="/privacy" className="mkt-consent-privacy">
          {t("Privacy")}
        </Link>
      </p>
      <div className="mkt-consent-actions">
        <button type="button" className="mkt-btn mkt-btn-ghost" onClick={() => decide("rejected")}>
          {t("Reject")}
        </button>
        <button type="button" className="mkt-btn mkt-btn-primary" onClick={() => decide("accepted")}>
          {t("Accept")}
        </button>
      </div>
    </div>,
    document.body
  );
}
