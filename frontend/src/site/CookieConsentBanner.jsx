import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { getCookieConsent, isAnalyticsAllowed, setCookieConsent } from "./analyticsGate";
import { Funnel } from "./analytics";
import { useT } from "../context/localeContextInstance";
import { IconCookie, IconGear } from "./icons";
import { useDocumentMarker } from "../hooks/useDocumentMarker";
import "./cookie-consent.css";

/**
 * Cookie bar (approved 2026-10-19, design/maintenance-and-menus-2026-10-19/1-cerez-*).
 * One card for the app (Electron, web, iPhone) and the public site: heavy frosted
 * glass, cookie tile, "Ayarlar / Reddet / Kabul et". Desktop is a single row;
 * at 600 px and below it stacks with "Kabul et" full width on top.
 * "Ayarlar" opens the choices inside the same card (analytics switch + Kaydet).
 */
export default function CookieConsentBanner({ variant = "marketing", onOpenPrivacy }) {
  const t = useT();
  const titleId = useId();
  const textId = useId();
  const [visible, setVisible] = useState(false);
  const [prefs, setPrefs] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const app = variant === "app";

  useEffect(() => {
    setVisible(!getCookieConsent());
  }, []);
  // Classes instead of body:has(.dc-consent) (A3: whole-document restyles).
  useDocumentMarker("has-dc-consent", visible);
  useDocumentMarker("has-dc-consent-site", visible && !app);

  if (!visible || typeof document === "undefined") return null;

  const decide = (choice, surface) => {
    setCookieConsent(choice);
    Funnel.consentDecision({ choice, surface: surface || (app ? "app_banner" : "react_banner") });
    if (!isAnalyticsAllowed()) {
      import("./analytics")
        .then((m) => m.shutdownAnalytics())
        .catch(() => {});
    }
    setVisible(false);
  };

  const desktop = app && typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
  const className = [
    "dc-consent",
    app ? "is-app" : "is-site",
    desktop ? "is-desktop" : "",
    prefs ? "is-prefs" : "",
  ].filter(Boolean).join(" ");

  const policy = app ? (
    <button type="button" className="dc-consent-link" onClick={() => onOpenPrivacy?.()}>
      <span className="dc-wide">{t("Policy")}</span>
      <span className="dc-narrow">{t("Cookie policy")}</span>
    </button>
  ) : (
    <Link to="/privacy" className="dc-consent-link">
      <span className="dc-wide">{t("Policy")}</span>
      <span className="dc-narrow">{t("Cookie policy")}</span>
    </Link>
  );

  return createPortal(
    <div className={className} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={textId}>
      <div className="dc-consent-main">
        <span className="dc-consent-ico" aria-hidden="true">
          <IconCookie size={24} />
        </span>
        <div className="dc-consent-text">
          <h2 id={titleId}>{t("We care about your privacy")}</h2>
          <p id={textId}>
            <span className="dc-wide">{t("We only use essential cookies; we ask for your permission for analytics.")}</span>
            <span className="dc-narrow">{t("We only use the cookies Descall needs to run. We ask for your permission for analytics cookies.")}</span>{" "}
            {policy}
          </p>
        </div>
      </div>

      {prefs ? (
        <div className="dc-consent-prefs">
          <div className="dc-consent-row">
            <div>
              <b>{t("Essential cookies")}</b>
              <small>{t("Sign-in and security. Always on.")}</small>
            </div>
            <span className="dc-consent-always">{t("Always on")}</span>
          </div>
          <label className="dc-consent-row">
            <div>
              <b>{t("Analytics cookies")}</b>
              <small>{t("Helps us see which screens are used. Off unless you turn it on.")}</small>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={analytics}
              aria-label={t("Analytics cookies")}
              className={`dc-switch${analytics ? " is-on" : ""}`}
              onClick={() => setAnalytics((v) => !v)}
            >
              <span />
            </button>
          </label>
          <div className="dc-consent-acts">
            <button type="button" className="dc-btn" onClick={() => setPrefs(false)}>
              {t("Back")}
            </button>
            <button
              type="button"
              className="dc-btn is-primary"
              onClick={() => decide(analytics ? "accepted" : "rejected", app ? "app_settings" : "react_settings")}
            >
              {t("Save")}
            </button>
          </div>
        </div>
      ) : (
        <div className="dc-consent-acts">
          <button type="button" className="dc-btn is-ghost is-settings" onClick={() => setPrefs(true)}>
            <IconGear size={16} />
            {t("Settings")}
          </button>
          <button type="button" className="dc-btn is-reject" onClick={() => decide("rejected")}>
            {t("Reject")}
          </button>
          <button type="button" className="dc-btn is-primary is-accept" onClick={() => decide("accepted")}>
            {t("Accept cookies")}
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
