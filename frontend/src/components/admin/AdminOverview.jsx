import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity, AlertTriangle, Bell, Clock, Flag, FolderSearch, History, Megaphone,
  RefreshCw, Shield, UserPlus, Users,
} from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import { isRetryableAdminError } from "../../api/adminHttpRetry";
import { Avatar } from "../ui/Avatar";
import RippleButton from "../ui/RippleButton";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime, formatTimeAgo } from "../../lib/datetime";
import { composeOverviewFromLegacy, mergeOverviewWithDb, overviewHasPeople, isOnlineNow } from "../../lib/adminOverviewFallback";
import { SkeletonLine } from "../ui/Skeleton";

function presenceLabel(status, t) {
  const s = String(status || "online");
  if (s === "idle") return t("Idle");
  if (s === "dnd") return t("Do Not Disturb");
  if (s === "invisible") return t("Invisible");
  if (s === "offline") return t("Offline");
  return t("Online Now");
}

function sourceLabel(key, t) {
  if (!key) return "";
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

function personName(user) {
  return user.displayName || user.username || "\u2014";
}

function stamp(value, t, locale) {
  if (!value) return "";
  const ago = formatTimeAgo(value, t, undefined, locale);
  const exact = formatAppDateTime(value, locale);
  if (ago && exact) return `${ago} \u00b7 ${exact}`;
  return ago || exact || "";
}

function RosterList({ people, empty, onOpen, kind, t, locale }) {
  return people.length === 0 ? (
    <p className="muted overview-roster-empty">{empty}</p>
  ) : (
    <ol className="overview-roster">
      {people.map((user, index) => {
        const online = isOnlineNow(user);
        const status = online ? (user.status && user.status !== "offline" ? user.status : "online") : "offline";
        const when = kind === "joined"
          ? stamp(user.createdAt, t, locale)
          : stamp(user.lastSeen, t, locale) || t("Never active");
        const source = kind === "joined" ? sourceLabel(user.source, t) : "";
        return (
          <li key={user.id} className={online ? "is-online" : ""}>
            <button type="button" onClick={() => onOpen(user.id)}>
              <span className="overview-rank">{index + 1}</span>
              <Avatar
                name={personName(user)}
                size={36}
                user={{ avatarUrl: user.avatarUrl, username: user.username }}
              />
              <span className="overview-roster-meta">
                <strong>
                  {personName(user)}
                  {user.username && user.displayName && user.displayName !== user.username ? (
                    <small>@{user.username}</small>
                  ) : null}
                </strong>
                <em>
                  {kind === "active" ? (
                    <b className={`overview-presence is-${status}`}>{presenceLabel(status, t)}</b>
                  ) : null}
                  {source ? <b className="overview-source">{source}</b> : null}
                  {when}
                </em>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function alertCopy(id, t) {
  const map = {
    maintenance: t("admin.overviewAlertMaintenance"),
    chat_frozen: t("admin.overviewAlertFrozen"),
    hot_reports: t("admin.overviewAlertHot"),
    open_reports: t("admin.overviewAlertReports"),
    errors: t("admin.overviewAlertErrors"),
    memory: t("admin.overviewAlertMemory"),
  };
  return map[id] || id;
}

function overviewErrorMessage(err, t) {
  const msg = String(err?.message || "");
  if (err?.status === 404 || msg === "Not found") return t("admin.overviewLoadError");
  if (isRetryableAdminError(err)) return t("admin.overviewGatewayError");
  return msg || t("admin.overviewLoadError");
}

function overviewShortcutsCopy(locale) {
  const tr = String(locale || "").toLowerCase().startsWith("tr");
  return tr
    ? { title: "K\u0131sayollar", hint: "S\u0131k kullan\u0131lan admin sekmelerine atla." }
    : { title: "Shortcuts", hint: "Jump to the usual admin tabs." };
}

async function loadLegacyOverview() {
  const [pulse, stats, inbox, system, audit, feedback, sanctions] = await Promise.all([
    adminFetch("/member-pulse?limit=20").catch(() => null),
    adminFetch("/stats").catch(() => null),
    adminFetch("/reports/summary").catch(() => null),
    adminFetch("/system").catch(() => null),
    adminFetch("/audit?limit=8").catch(() => null),
    adminFetch("/feedback/stats").catch(() => null),
    adminFetch("/moderation/active").catch(() => null),
  ]);
  if (!pulse && !stats) return null;
  return composeOverviewFromLegacy({ pulse, stats, inbox, system, audit, feedback, sanctions });
}

export default function AdminOverview({ onOpenPerson, onGoto }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const shortcuts = overviewShortcutsCopy(locale);

  const load = useCallback(async () => {
    setError("");
    try {
      const [overview, analytics, pulse] = await Promise.all([
        adminFetch("/overview").catch((err) => err),
        adminFetch("/analytics").catch(() => null),
        adminFetch("/member-pulse?limit=20").catch(() => null),
      ]);
      const overviewOk = Boolean(overview?.live);
      const overviewErr = overviewOk ? null : overview;
      const payload = mergeOverviewWithDb(overviewOk ? overview : null, analytics, pulse);
      if (payload && (overviewOk || overviewHasPeople(payload) || Number(payload?.product?.signupsToday) || Number(payload?.live?.connected))) {
        setData(payload);
        setUpdatedAt(new Date());
        return;
      }
      if (overviewErr && typeof overviewErr === "object" && overviewErr.message) {
        const fallback = await loadLegacyOverview();
        if (fallback) {
          setData(mergeOverviewWithDb(fallback, analytics, pulse));
          setUpdatedAt(new Date());
          return;
        }
        setError(overviewErrorMessage(overviewErr, t));
        return;
      }
      setError(t("admin.overviewLoadError"));
    } catch (err) {
      setError(overviewErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load().catch(() => {});
    const id = setInterval(() => load().catch(() => {}), 20000);
    return () => clearInterval(id);
  }, [load]);

  const health = data?.health || { level: "ok", alerts: [] };
  const live = data?.live || { connected: 0, visible: 0, invisible: 0, people: [] };
  const product = data?.product || { signupsToday: 0, sparkline: [], newFeedback: 0 };
  const safety = data?.safety || { openReports: 0, bans: 0, timeouts: 0 };
  const system = data?.system || { uptime: { label: "\u2014" }, rssMb: 0, errorsLastHour: 0 };
  const spark = product.sparkline || [];
  const maxSpark = Math.max(...spark.map((row) => Number(row.signups) || 0), 1);
  const recentlyActive = data?.recentlyActive || [];
  const newlyJoined = data?.newlyJoined || [];
  const onlineInActive = recentlyActive.filter((row) => isOnlineNow(row)).length;
  const visibleActive = useMemo(
    () => (activeFilter === "online" ? recentlyActive.filter((row) => isOnlineNow(row)) : recentlyActive),
    [activeFilter, recentlyActive]
  );

  const openPerson = (id) => {
    if (!id) return;
    onOpenPerson?.(id);
    onGoto?.("people");
  };

  return (
    <section className="admin-section admin-section-full overview-suite">
      <div className="overview-head">
        <div>
          {data ? (
            <div className={`overview-health overview-health-${health.level}`}>
              <span className="overview-health-dot" />
              {t(`admin.overviewHealth.${health.level}`)}
            </div>
          ) : null}
          <h2>{t("admin.overviewTitle")}</h2>
          <p className="muted">{t("admin.overviewSubtitle")}</p>
        </div>
        <div className="overview-head-meta">
          <span className="last-updated">
            <Clock size={14} />
            {updatedAt ? formatAppDateTime(updatedAt.toISOString(), locale) : t("Never")}
          </span>
          <RippleButton type="button" onClick={() => { setLoading(true); load(); }} disabled={loading} className="refresh-btn">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            {t("common.refresh")}
          </RippleButton>
        </div>
      </div>

      {error ? (
        <div className="admin-error-banner">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="overview-kpis" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="overview-kpi">
              <SkeletonLine width="40%" />
              <SkeletonLine width="55%" height={28} />
              <SkeletonLine width="70%" />
            </div>
          ))}
        </div>
      ) : null}

      {data && health.alerts?.length ? (
        <div className="overview-alerts">
          {health.alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              className={`overview-alert overview-alert-${alert.level}`}
              onClick={() => onGoto?.(alert.tab)}
            >
              {alertCopy(alert.id, t)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="overview-kpis">
        <motion.button type="button" className="overview-kpi" onClick={() => onGoto?.("people")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span><Users size={14} /> {t("admin.overviewOnline")}</span>
          <strong>{live.connected || 0}</strong>
          <small>
            {t("{n} visible", { n: live.visible || 0 })}
            {live.invisible ? ` \u00b7 ${t("{n} invisible", { n: live.invisible })}` : ""}
          </small>
        </motion.button>
        <motion.div className="overview-kpi" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span><UserPlus size={14} /> {t("admin.signupsToday")}</span>
          <strong>{product.signupsToday || 0}</strong>
          <small>{t("admin.overviewIstanbulDay")}</small>
        </motion.div>
        <motion.button type="button" className="overview-kpi" onClick={() => onGoto?.("reports")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span><Flag size={14} /> {t("admin.overviewReports")}</span>
          <strong>{safety.openReports || 0}</strong>
          <small>{t("admin.overviewReportTargets", { count: safety.uniqueTargets || 0 })}</small>
        </motion.button>
        <motion.button type="button" className="overview-kpi" onClick={() => onGoto?.("feedback")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span><Bell size={14} /> {t("admin.overviewFeedback")}</span>
          <strong>{product.newFeedback || 0}</strong>
          <small>{t("admin.overviewNewFeedback")}</small>
        </motion.button>
        <motion.button type="button" className="overview-kpi" onClick={() => onGoto?.("moderation")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span><Shield size={14} /> {t("admin.overviewSanctions")}</span>
          <strong>{safety.bans || 0}</strong>
          <small>{t("admin.overviewTimeouts", { count: safety.timeouts || 0 })}</small>
        </motion.button>
        <motion.div className="overview-kpi" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span><Activity size={14} /> {t("admin.overviewUptime")}</span>
          <strong>{system.uptime?.label || "\u2014"}</strong>
          <small>{system.rssMb ? `${system.rssMb} MB` : ""}</small>
        </motion.div>
      </div>

      <div className="overview-split">
        <section className="overview-panel overview-panel-roster">
          <header>
            <History size={16} />
            <div>
              <h3>{t("admin.overviewActive")}</h3>
              <p>{t("admin.overviewActiveHint")}</p>
            </div>
            <div className="overview-filter" role="tablist" aria-label={t("admin.overviewActive")}>
              <button
                type="button"
                className={activeFilter === "all" ? "active" : ""}
                onClick={() => setActiveFilter("all")}
              >
                {t("admin.overviewActiveAll")}
                <em>{recentlyActive.length}</em>
              </button>
              <button
                type="button"
                className={activeFilter === "online" ? "active" : ""}
                onClick={() => setActiveFilter("online")}
              >
                {t("admin.overviewActiveOnline")}
                <em>{onlineInActive}</em>
              </button>
            </div>
          </header>
          <RosterList
            people={visibleActive}
            empty={t("admin.overviewNoActive")}
            onOpen={openPerson}
            kind="active"
            t={t}
            locale={locale}
          />
        </section>

        <section className="overview-panel overview-panel-roster">
          <header>
            <UserPlus size={16} />
            <div>
              <h3>{t("admin.overviewJoined")}</h3>
              <p>{t("admin.overviewJoinedHint")}</p>
            </div>
            <span className="overview-count">{newlyJoined.length}</span>
          </header>
          <RosterList
            people={newlyJoined}
            empty={t("admin.overviewNoJoined")}
            onOpen={openPerson}
            kind="joined"
            t={t}
            locale={locale}
          />
        </section>
      </div>

      <div className="overview-split">
        <section className="overview-panel">
          <header>
            <Megaphone size={16} />
            <div>
              <h3>{t("admin.overviewSpark")}</h3>
              <p>{t("admin.overviewSparkHint")}</p>
            </div>
          </header>
          <div className="overview-spark">
            {spark.map((row) => (
              <div key={row.day} className="overview-spark-col" title={`${row.day}: ${row.signups}`}>
                <span style={{ height: `${Math.max(8, Math.round((Number(row.signups) / maxSpark) * 100))}%` }} />
                <small>{row.day?.slice(5)}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="overview-panel">
          <header>
            <FolderSearch size={16} />
            <div>
              <h3>{shortcuts.title}</h3>
              <p>{shortcuts.hint}</p>
            </div>
          </header>
          <div className="overview-shortcuts">
            <button type="button" onClick={() => onGoto?.("people")}><Users size={14} /> {t("admin.people")}</button>
            <button type="button" onClick={() => onGoto?.("analytics")}><Activity size={14} /> {t("admin.analytics")}</button>
            <button type="button" onClick={() => onGoto?.("reports")}><Flag size={14} /> {t("admin.reports")}</button>
            <button type="button" onClick={() => onGoto?.("moderation")}><Shield size={14} /> {t("admin.moderation")}</button>
          </div>
        </section>
      </div>
    </section>
  );
}
