import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime } from "../../lib/datetime";
import { SkeletonLine } from "../ui/Skeleton";

function sourceLabel(key, t) {
  if (!key) return t("common.unknown");
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

export default function AdminUserAnalytics({ userId, onClose }) {
  const { t, locale } = useLocale();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const formatWhen = (value) => {
    if (!value) return t("admin.notYet");
    return formatAppDateTime(value, locale) || String(value);
  };

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    adminFetch(`/users/${userId}/analytics`)
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || t("admin.analyticsLoadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, t]);

  const user = payload?.user || {};
  const timeline = payload?.timeline || [];

  return (
    <div className="admin-user-analytics-overlay" role="dialog" aria-modal="true">
      <div className="admin-user-analytics">
        <header>
          <div>
            <h3>@{user.username || "—"}</h3>
            <p className="muted">{user.email || t("common.unknown")}</p>
          </div>
          <button type="button" className="admin-icon-btn" onClick={onClose} aria-label={t("common.close")}>
            <X size={18} />
          </button>
        </header>

        {loading ? (
          <div className="analytics-dl" aria-busy="true" aria-label={t("Loading...")}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <SkeletonLine width="28%" height={10} />
                <SkeletonLine width={`${42 + (i % 3) * 12}%`} height={13} />
              </div>
            ))}
          </div>
        ) : null}
        {error ? <p className="admin-inline-error">{error}</p> : null}

        {!loading && !error ? (
          <>
            <dl className="analytics-dl">
              <div>
                <dt>{t("admin.signupDate")}</dt>
                <dd>{formatWhen(user.signup_at || user.created_at, t)}</dd>
              </div>
              <div>
                <dt>{t("admin.authMethod")}</dt>
                <dd>
                  {user.auth_method === "google"
                    ? t("admin.googleAuth")
                    : user.auth_method === "email"
                      ? t("admin.emailAuth")
                      : t("admin.otherAuth")}
                </dd>
              </div>
              <div>
                <dt>{t("admin.firstSource")}</dt>
                <dd>{sourceLabel(user.first_touch_source, t)}</dd>
              </div>
              <div>
                <dt>{t("admin.lastSource")}</dt>
                <dd>{sourceLabel(user.last_touch_source, t)}</dd>
              </div>
              <div>
                <dt>{t("admin.campaign")}</dt>
                <dd>{user.first_touch_campaign || t("common.unknown")}</dd>
              </div>
              <div>
                <dt>{t("admin.device")}</dt>
                <dd>{user.signup_device || t("common.unknown")}</dd>
              </div>
              <div>
                <dt>{t("admin.country")}</dt>
                <dd>{user.signup_country || t("common.unknown")}</dd>
              </div>
              {user.suspicious_signup ? (
                <div>
                  <dt>{t("admin.suspicious")}</dt>
                  <dd>{t("admin.suspiciousYes")}</dd>
                </div>
              ) : null}
            </dl>

            <h4>{t("admin.userTimeline")}</h4>
            <ol className="analytics-timeline">
              {timeline.map((step) => (
                <li key={step.key} className={step.done ? "done" : "pending"}>
                  <strong>{t(`admin.timeline.${step.key}`)}</strong>
                  <span>{step.done ? formatWhen(step.at, t) : t("admin.notYet")}</span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </div>
  );
}
