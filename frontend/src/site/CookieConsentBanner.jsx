import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { getCookieConsent, isAnalyticsAllowed, setCookieConsent } from "./analyticsGate";
import { Funnel } from "./analytics";
import { useT } from "../context/localeContextInstance";

export default function CookieConsentBanner({ variant = "marketing", onOpenPrivacy }) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const app = variant === "app";

  useEffect(() => {
    setVisible(!getCookieConsent());
  }, []);

  if (!visible || typeof document === "undefined") return null;

  const decide = (choice) => {
    setCookieConsent(choice);
    Funnel.consentDecision({ choice, surface: app ? "app_banner" : "react_banner" });
    if (!isAnalyticsAllowed()) {
      import("./analytics")
        .then((m) => m.shutdownAnalytics())
        .catch(() => {});
    }
    setVisible(false);
  };

  const desktop = app && typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
  const className = app ? `app-consent${desktop ? " is-desktop" : ""}` : "mkt-consent";

  return createPortal(
    <div className={className} role="dialog" aria-label={t("Cookie preferences")}>
      <p>
        {t("Optional analytics only. Essentials stay on.")}{" "}
        {app ? (
          <button type="button" className="app-consent-privacy" onClick={() => onOpenPrivacy?.()}>
            {t("Privacy")}
          </button>
        ) : (
          <Link to="/privacy" className="mkt-consent-privacy">
            {t("Privacy")}
          </Link>
        )}
      </p>
      <div className={app ? "app-consent-actions" : "mkt-consent-actions"}>
        <button
          type="button"
          className={app ? "app-consent-reject" : "mkt-btn mkt-btn-ghost"}
          onClick={() => decide("rejected")}
        >
          {t("Reject")}
        </button>
        <button
          type="button"
          className={app ? "app-consent-accept" : "mkt-btn mkt-btn-primary"}
          onClick={() => decide("accepted")}
        >
          {t("Accept")}
        </button>
      </div>
    </div>,
    document.body
  );
}
