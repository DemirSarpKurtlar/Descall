import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Clock } from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import RippleButton from "../ui/RippleButton";
import { useT } from "../../context/LocaleContext";

const SOURCE_ORDER = [
  "google_ads",
  "google_organic",
  "discord",
  "reddit",
  "youtube",
  "instagram",
  "twitter",
  "referral",
  "direct",
  "other",
];

function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Math.round(Number(value) * 1000) / 10}%`;
}

function sourceLabel(key, t) {
  const map = {
    google_ads: t("admin.googleAds"),
    google_organic: t("admin.googleOrganic"),
    discord: t("admin.discord"),
    reddit: t("admin.reddit"),
    youtube: t("admin.youtube"),
    instagram: t("admin.instagram"),
    twitter: t("admin.twitter"),
    referral: t("admin.referral"),
    direct: t("admin.direct"),
    other: t("admin.other"),
  };
  return map[key] || key;
}

function authLabel(key, t) {
  if (key === "google") return t("admin.googleAuth");
  if (key === "email") return t("admin.emailAuth");
  return t("admin.otherAuth");
}

export default function AdminAnalytics() {
  const t = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await adminFetch("/analytics");
      setData(payload);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err?.message || t("admin.analyticsLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const funnel = data?.funnel || [];
  const maxFunnel = Math.max(...funnel.map((step) => Number(step.count) || 0), 1);
  const daily = data?.daily || [];
  const maxDaily = Math.max(...daily.map((row) => Number(row.signups) || 0), 1);
  const sources = data?.bySource || {};
  const auth = data?.byAuthMethod || {};
  const devices = data?.byDevice || {};
  const campaigns = data?.campaigns || [];
  const countries = data?.countries || [];
  const ads = data?.googleAds || {};

  return (
    <section className="admin-section admin-analytics-section">
      <div className="activity-header">
        <div className="activity-title-section">
          <h2>{t("admin.analyticsTitle")}</h2>
          <p className="activity-subtitle">{t("admin.analyticsSubtitle")}</p>
        </div>
        <div className="activity-toolbar">
          <div className="last-updated">
            <Clock size={14} />
            <span>
              {t("Last updated")}: {updatedAt ? updatedAt.toLocaleTimeString() : t("Never")}
            </span>
          </div>
          <RippleButton type="button" onClick={() => load()} disabled={loading} className="refresh-btn">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            {loading ? t("Loading...") : t("Refresh")}
          </RippleButton>
        </div>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}
      {data?.unavailable ? <p className="muted">{t("admin.analyticsUnavailable")}</p> : null}

      <div className="growth-summary">
        <motion.div className="summary-card accent-blue" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="summary-label">{t("admin.totalSignups")}</span>
          <span className="summary-value">{data?.totalSignups || 0}</span>
        </motion.div>
        <motion.div className="summary-card accent-green" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="summary-label">{t("admin.activeToday")}</span>
          <span className="summary-value">{data?.activeToday || 0}</span>
        </motion.div>
        <motion.div className="summary-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="summary-label">{t("admin.active7d")}</span>
          <span className="summary-value">{data?.active7d || 0}</span>
        </motion.div>
        <motion.div className="summary-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="summary-label">{t("admin.active30d")}</span>
          <span className="summary-value">{data?.active30d || 0}</span>
        </motion.div>
        <motion.div className="summary-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="summary-label">{t("admin.signupsToday")}</span>
          <span className="summary-value">{data?.signupsToday || 0}</span>
        </motion.div>
        <motion.div className="summary-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="summary-label">{t("admin.signups7d")}</span>
          <span className="summary-value">{data?.signups7d || 0}</span>
        </motion.div>
        <motion.div className="summary-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="summary-label">{t("admin.signups30d")}</span>
          <span className="summary-value">{data?.signups30d || 0}</span>
        </motion.div>
        <motion.div className="summary-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="summary-label">{t("admin.firstTimeUsers")}</span>
          <span className="summary-value">{data?.firstTimeUsers || 0}</span>
        </motion.div>
      </div>

      <div className="attribution-grid analytics-split">
        <div className="attribution-panel">
          <h3>{t("admin.bySource")}</h3>
          <ul className="attribution-list">
            {SOURCE_ORDER.map((key) => (
              <li key={key}>
                <span>{sourceLabel(key, t)}</span>
                <strong>{sources[key] || 0}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="attribution-panel">
          <h3>{t("admin.byAuth")}</h3>
          <ul className="attribution-list">
            {["google", "email", "other"].map((key) => (
              <li key={key}>
                <span>{authLabel(key, t)}</span>
                <strong>{auth[key] || 0}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="attribution-panel">
        <h3>{t("admin.userFunnel")}</h3>
        <div className="analytics-funnel">
          {funnel.map((step, index) => {
            const prev = index === 0 ? step.count : funnel[index - 1]?.count || 0;
            const width = Math.max(8, Math.round(((Number(step.count) || 0) / maxFunnel) * 100));
            return (
              <div key={step.key} className="analytics-funnel-row">
                <div className="analytics-funnel-meta">
                  <span>{t(`admin.funnel.${step.key}`) || step.label}</span>
                  <strong>{step.count || 0}</strong>
                  {index > 0 ? <em>{formatPct(prev > 0 ? step.count / prev : null)}</em> : null}
                </div>
                <div className="analytics-funnel-track">
                  <div className="analytics-funnel-fill" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="attribution-grid analytics-split">
        <div className="attribution-panel">
          <h3>{t("admin.googleAdsTitle")}</h3>
          <ul className="attribution-list">
            <li>
              <span>{t("admin.googleAdsVisits")}</span>
              <strong>{ads.clicks || 0}</strong>
            </li>
            <li>
              <span>{t("admin.googleAdsSignups")}</span>
              <strong>{ads.signups || 0}</strong>
            </li>
            <li>
              <span>{t("admin.googleAdsCvr")}</span>
              <strong>{formatPct(ads.conversionRate)}</strong>
            </li>
            <li>
              <span>{t("admin.googleAdsCps")}</span>
              <strong>{t("admin.googleAdsCostUnavailable")}</strong>
            </li>
          </ul>
          <p className="activity-subtitle">{t("admin.googleAdsNote")}</p>
        </div>
        <div className="attribution-panel">
          <h3>{t("admin.topCampaigns")}</h3>
          {campaigns.length === 0 ? (
            <p className="muted">{t("admin.noCampaigns")}</p>
          ) : (
            <table className="admin-table analytics-mini-table">
              <thead>
                <tr>
                  <th>{t("admin.campaign")}</th>
                  <th>{t("admin.clicks")}</th>
                  <th>{t("admin.signups")}</th>
                  <th>{t("admin.cvr")}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.slice(0, 12).map((row) => (
                  <tr key={row.campaign}>
                    <td>{row.campaign}</td>
                    <td>{row.clicks == null ? "—" : row.clicks}</td>
                    <td>{row.signups}</td>
                    <td>{formatPct(row.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="attribution-grid analytics-split">
        <div className="attribution-panel">
          <h3>{t("admin.device")}</h3>
          <ul className="attribution-list">
            {["desktop", "mobile", "tablet", "unknown"].map((key) => (
              <li key={key}>
                <span>{t(`admin.device_${key}`)}</span>
                <strong>{devices[key] || 0}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="attribution-panel">
          <h3>{t("admin.country")}</h3>
          {countries.length === 0 ? (
            <p className="muted">{t("admin.noCountry")}</p>
          ) : (
            <table className="admin-table analytics-mini-table">
              <thead>
                <tr>
                  <th>{t("admin.country")}</th>
                  <th>{t("admin.visitors")}</th>
                  <th>{t("admin.signups")}</th>
                  <th>{t("admin.cvr")}</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((row) => (
                  <tr key={row.country}>
                    <td>{row.country === "unknown" ? t("common.unknown") : row.country}</td>
                    <td>{row.visitors}</td>
                    <td>{row.signups}</td>
                    <td>{formatPct(row.conversionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="growth-chart-container">
        <h3>{t("admin.dailySignups")}</h3>
        {daily.length === 0 ? (
          <p className="muted">{t("No growth data yet")}</p>
        ) : (
          <div className="growth-chart" role="img" aria-label={t("admin.dailySignups")}>
            {daily.map((row) => {
              const height = row.signups > 0 ? Math.max(8, Math.round((Number(row.signups) / maxDaily) * 100)) : 0;
              return (
                <div key={row.date} className="chart-bar-wrapper" title={`${row.date}: ${row.signups}`}>
                  <div className="chart-bar-container">
                    <div
                      className={`chart-bar${row.signups === 0 ? " is-empty" : ""}`}
                      style={{ height: row.signups > 0 ? `${height}%` : 4 }}
                    >
                      {row.signups > 0 ? <span className="bar-value">{row.signups}</span> : null}
                    </div>
                  </div>
                  <span className="bar-label">{String(row.date).slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
