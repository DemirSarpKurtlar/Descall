import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../../context/localeContextInstance";
import { formatDate } from "../../i18n/format";
import { API_BASE_URL } from "../../config/api";
import { SITE_OPERATOR } from "../siteIdentity";
import JsonLd, { buildBreadcrumbLd } from "../JsonLd";

/**
 * Public status / trust page, factual Beta note + live API health probe.
 * No fabricated uptime percentages.
 */
const SITE_TRANSPORT = "TLS / DTLS-SRTP";

export default function StatusPage() {
  const { t, locale } = useLocale();
  const [api, setApi] = useState({ state: "checking", detail: "" });

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/status`, { signal: ctrl.signal });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setApi({
            state: "ok",
            detail: body?.status || body?.ok ? t("API reachable") : `HTTP ${res.status}`,
          });
        } else {
          setApi({ state: "degraded", detail: `HTTP ${res.status}` });
        }
      } catch (err) {
        if (cancelled) return;
        setApi({
          state: "unreachable",
          detail: err?.name === "AbortError" ? t("Request timed out") : t("Network error"),
        });
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UI audit #23: the date follows the page language (long date style).
  const updated =
    formatDate(`${SITE_OPERATOR.statusReviewedIso}T12:00:00Z`, locale, { dateStyle: "long" }) || SITE_OPERATOR.statusReviewedIso;

  const crumbs = [
    { label: "Home", to: "/" },
    { label: "Status", to: "/status" },
  ];

  const badge =
    api.state === "ok" ? "ok" : api.state === "checking" ? "checking" : "warn";

  return (
    <div className="mkt-status">
      <JsonLd data={buildBreadcrumbLd(crumbs)} />
      <nav className="seo-crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={c.to}>
            {i > 0 ? " / " : null}
            <Link to={c.to}>{t(c.label)}</Link>
          </span>
        ))}
      </nav>
      <h1>{t("Descall service status")}</h1>
      <p className="mkt-lead">
        {t(SITE_OPERATOR.statusNote)} {t("Last updated")}: {updated}.
      </p>

      {/* UI audit #23: one two-column glass list, the live API state is its
          first row (status dot), no hand-typed ':' separators. */}
      <dl className="mkt-status-list">
        <div className={`mkt-status-row is-api is-${badge}`}>
          <dt>{t("API / realtime")}</dt>
          <dd role="status">
            <span className="mkt-status-dot" aria-hidden="true" />
            {api.state === "checking" && t("Checking…")}
            {api.state === "ok" && t("Operational")}
            {api.state === "degraded" && t("Degraded")}
            {api.state === "unreachable" && t("Unreachable from this browser")}
            {api.detail ? ` · ${api.detail}` : ""}
          </dd>
        </div>
        <div className="mkt-status-row">
          <dt>{t("Product stage")}</dt>
          <dd>{t("Beta")}</dd>
        </div>
        <div className="mkt-status-row">
          <dt>{t("Transport security")}</dt>
          <dd>{SITE_TRANSPORT}</dd>
        </div>
        <div className="mkt-status-row">
          <dt>{t("Operator")}</dt>
          <dd>{`${SITE_OPERATOR.operatorName} · ${SITE_OPERATOR.country}`}</dd>
        </div>
        <div className="mkt-status-row">
          <dt>{t("Support")}</dt>
          <dd><a href={`mailto:${SITE_OPERATOR.supportEmail}`}>{SITE_OPERATOR.supportEmail}</a></dd>
        </div>
        <div className="mkt-status-row">
          <dt>GitHub</dt>
          <dd>
            <a href={SITE_OPERATOR.githubUrl} rel="noopener noreferrer" target="_blank">
              {SITE_OPERATOR.githubUrl.replace("https://", "")}
            </a>
          </dd>
        </div>
      </dl>

      <p className="seo-note">{t("The API row is checked live from your browser each time you open this page.")}</p>

      <p className="seo-note">
        <Link to="/security">{t("Security details")}</Link>
        {" · "}
        <Link to="/contact">{t("Contact")}</Link>
      </p>
    </div>
  );
}
