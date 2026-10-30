import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, ChevronRight, RefreshCw } from "../ui/Icon.jsx";
import { adminFetch } from "../../api/adminHttp";
import { isRetryableAdminError } from "../../api/adminHttpRetry";
import { Avatar } from "../ui/Avatar";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime, formatTimeAgo } from "../../lib/datetime";
import { composeOverviewFromLegacy, mergeOverviewWithDb, overviewHasPeople, isOnlineNow } from "../../lib/adminOverviewFallback";
import { SkeletonLine } from "../ui/Skeleton";
import { PRIORITIES } from "./feedback3/fbModel.js";
import {
  auditTargetLabel,
  auditVerb,
  buildTodo,
  pendingCount,
  presenceSegments,
  signedDelta,
  signupTrend,
} from "./adminOverviewModel.js";
import "../../styles/admin-overview.css";

/**
 * Yönetici Paneli › Genel Bakış (3.1, onaylı taslak 30 Eki 2026): the six KPI
 * boxes, recently active, newly joined, a to-do list and recent admin actions.
 * Data: GET /api/admin/overview (+ member-pulse); legacy fallback and the
 * localStorage cache keep the last numbers on screen when the API is slow.
 */

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

function clock(value, locale) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(String(locale || "tr").startsWith("tr") ? "tr-TR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Istanbul",
  });
}

const OVERVIEW_CACHE_KEY = "descall:admin-overview";

function readOverviewCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OVERVIEW_CACHE_KEY) || "");
    if (!parsed?.data?.live) return null;
    const at = parsed.at ? new Date(parsed.at) : null;
    return { data: parsed.data, at: at && !Number.isNaN(at.getTime()) ? at : null };
  } catch {
    return null;
  }
}

function writeOverviewCache(data) {
  try {
    localStorage.setItem(OVERVIEW_CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), data }));
  } catch {
    /* private mode */
  }
}

function overviewErrorMessage(err, t, hasData) {
  const msg = String(err?.message || "");
  if (err?.status === 404 || msg === "Not found") return t("admin.overviewLoadError");
  if (isRetryableAdminError(err) || err?.code === "transient") {
    // The transport string says saved numbers are still on screen. Use it
    // only when a previous payload is actually visible.
    return hasData ? (msg || t("admin.overviewGatewayError")) : t("admin.overviewGatewayError");
  }
  return msg || t("admin.overviewLoadError");
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
  const cached = useMemo(() => readOverviewCache(), []);
  const [data, setData] = useState(cached?.data || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(cached?.at || null);
  const dataRef = useRef(cached?.data || null);
  dataRef.current = data;
  const [activeFilter, setActiveFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const [overview, pulse] = await Promise.all([
        adminFetch("/overview").catch((err) => err),
        adminFetch("/member-pulse?limit=20").catch(() => null),
      ]);
      const overviewOk = Boolean(overview?.live);
      const overviewErr = overviewOk ? null : overview;
      const payload = mergeOverviewWithDb(overviewOk ? overview : null, null, pulse);
      if (payload && (overviewOk || overviewHasPeople(payload) || Number(payload?.product?.signupsToday) || Number(payload?.live?.connected))) {
        setData(payload);
        setUpdatedAt(new Date());
        writeOverviewCache(payload);
        setError("");
        return;
      }
      if (overviewErr && typeof overviewErr === "object" && overviewErr.message) {
        const fallback = await loadLegacyOverview();
        if (fallback) {
          const merged = mergeOverviewWithDb(fallback, null, pulse);
          setData(merged);
          setUpdatedAt(new Date());
          writeOverviewCache(merged);
          setError("");
          return;
        }
        setError(overviewErrorMessage(overviewErr, t, Boolean(dataRef.current)));
        return;
      }
      setError(t("admin.overviewLoadError"));
    } catch (err) {
      setError(overviewErrorMessage(err, t, Boolean(dataRef.current)));
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
  const healthLevel = ["ok", "watch", "high", "critical"].includes(health.level) ? health.level : "watch";
  const live = data?.live || { connected: 0, visible: 0, invisible: 0, statusCounts: null };
  const product = data?.product || { signupsToday: 0, sparkline: [], newFeedback: 0 };
  const safety = data?.safety || { openReports: 0, bans: 0, timeouts: 0 };
  const system = data?.system || { uptime: { label: "\u2014" }, rssMb: 0 };
  const recentlyActive = data?.recentlyActive || [];
  const newlyJoined = data?.newlyJoined || [];
  const onlineInActive = recentlyActive.filter((row) => isOnlineNow(row)).length;
  const visibleActive = useMemo(
    () => (activeFilter === "online" ? recentlyActive.filter((row) => isOnlineNow(row)) : recentlyActive),
    [activeFilter, recentlyActive]
  );
  const segments = presenceSegments(live.statusCounts);
  const segTotal = segments.reduce((a, [, v]) => a + v, 0);
  const trend = signupTrend(product.sparkline, product.signupsToday);
  const todo = useMemo(() => buildTodo(data), [data]);
  const pending = pendingCount(todo);
  const audit = (data?.recentAudit || []).slice(0, 5);
  const tr = String(locale || "tr").toLowerCase().startsWith("tr");
  const fmt1 = (v) => (v == null ? "" : Number(v).toLocaleString(tr ? "tr-TR" : "en-US", { maximumFractionDigits: 1 }));

  const openPerson = (id) => {
    if (!id) return;
    onOpenPerson?.(id);
    onGoto?.("people");
  };

  const say = (spec) => (Array.isArray(spec) ? t(spec[0], spec[1]) : spec);

  const kpis = [
    {
      id: "online",
      label: t("admin.overviewOnline"),
      value: live.connected || 0,
      go: "directory",
      hue: true,
      sub: (
        <>
          {segTotal > 0 ? (
            <span className="aov-bar" aria-hidden="true">
              {segments.map(([k, v]) => <i key={k} className={`is-${k}`} style={{ flexGrow: v }} />)}
            </span>
          ) : null}
          {t("admin.ovVisibleInvisible", { v: live.visible || 0, i: live.invisible || 0 })}
        </>
      ),
    },
    {
      id: "signups",
      label: t("admin.signupsToday"),
      value: product.signupsToday || 0,
      go: "signupStats",
      sub:
        trend.delta == null ? (
          t("admin.overviewIstanbulDay")
        ) : (
          <>
            <b className={trend.delta > 0 ? "is-up" : trend.delta < 0 ? "is-down" : ""}>{signedDelta(trend.delta)}</b>{" "}
            {t("admin.ovVsYesterday", { d: "" }).trim()} · {t("admin.ovAvg7", { n: fmt1(trend.avg) })}
          </>
        ),
    },
    {
      id: "reports",
      label: t("admin.overviewReports"),
      value: safety.openReports || 0,
      go: "reports",
      sub: safety.openReports ? t("admin.ovTodoReportsSub", { n: safety.uniqueTargets || safety.openReports }) : t("admin.ovNoPending"),
    },
    {
      id: "feedback",
      label: t("admin.overviewFeedback"),
      value: product.newFeedback || 0,
      go: "feedback",
      sub: product.feedbackInProgress ? t("admin.ovFeedbackSub", { n: product.feedbackInProgress }) : t("admin.ovFeedbackSubNone"),
    },
    {
      id: "bans",
      label: t("admin.overviewSanctions"),
      value: safety.bans || 0,
      go: "moderation",
      sub: t("admin.overviewTimeouts", { count: safety.timeouts || 0 }),
    },
    {
      id: "uptime",
      label: t("admin.overviewUptime"),
      value: system.uptime?.label || "\u2014",
      sub: system.rssMb ? t("admin.ovUptimeSub", { mb: system.rssMb }) : "",
    },
  ];

  const roster = (people, kind) =>
    people.length === 0 ? (
      <p className="aov-empty">{kind === "joined" ? t("admin.overviewNoJoined") : t("admin.overviewNoActive")}</p>
    ) : (
      <ol className="aov-rows">
        {people.map((user) => {
          const online = isOnlineNow(user);
          const status = online ? (user.status && user.status !== "offline" ? user.status : "online") : "offline";
          const at = kind === "joined" ? user.createdAt : user.lastSeen;
          const source = kind === "joined" ? sourceLabel(user.source, t) : "";
          return (
            <li key={user.id}>
              <button type="button" className="aov-row" onClick={() => openPerson(user.id)}>
                <Avatar name={personName(user)} size={30} user={{ avatarUrl: user.avatarUrl, username: user.username }} animate="none" />
                <span className="aov-row-main">
                  <b>
                    {personName(user)}
                    {user.username && user.displayName && user.displayName !== user.username ? <small>@{user.username}</small> : null}
                  </b>
                  {kind === "joined" ? (
                    <em className={`aov-src is-${user.source || "unknown"}`}>{source || t("admin.other")}</em>
                  ) : (
                    <em><span className={`aov-dot is-${status}`} />{presenceLabel(status, t)}</em>
                  )}
                </span>
                <span className="aov-row-when">
                  <b>{at ? formatTimeAgo(at, t, undefined, locale) : t("Never active")}</b>
                  {clock(at, locale)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    );

  const todoSub = (item) => {
    if (item.sub?.focus) {
      const f = item.sub.focus;
      const pr = PRIORITIES[f.priority]?.[0];
      return [f.username, tr ? pr : f.priority, f.excerpt].filter(Boolean).join(" \u00b7 ");
    }
    return say(item.sub);
  };

  return (
    <section className="aov" aria-busy={loading && !data ? true : undefined}>
      <header className="aov-head">
        <div>
          <h1>{t("admin.ovTitle")}</h1>
          <p>{updatedAt ? t("admin.ovLive", { when: formatAppDateTime(updatedAt.toISOString(), locale) }) : t("admin.overviewSubtitle")}</p>
        </div>
        <div className="aov-head-r">
          {data ? (
            <span className={`aov-health is-${healthLevel}`}>
              <span className="aov-health-dot" />
              {t(`admin.overviewHealth.${healthLevel}`)}
            </span>
          ) : null}
          <button type="button" className="aov-btn" onClick={() => { setLoading(true); load(); }} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            {t("common.refresh")}
          </button>
        </div>
      </header>

      {error ? (
        data ? (
          <p className="admin-stale-note">{error}</p>
        ) : (
          <div className="admin-error-banner" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )
      ) : null}

      <div className="aov-kpis">
        {data
          ? kpis.map((k) => {
              const Tag = k.go ? "button" : "div";
              return (
                <Tag
                  key={k.id}
                  {...(k.go ? { type: "button", onClick: () => onGoto?.(k.go) } : {})}
                  className={`aov-kpi aov-glass${k.hue ? " is-hue" : ""}`}
                  data-kpi={k.id}
                >
                  <span className="aov-kpi-l">
                    {k.label}
                    {k.go ? <ChevronRight size={14} aria-hidden="true" /> : null}
                  </span>
                  <span className="aov-kpi-v tnum">{k.value}</span>
                  <span className="aov-kpi-s">{k.sub}</span>
                </Tag>
              );
            })
          : [0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="aov-kpi aov-glass">
                <SkeletonLine width="45%" />
                <SkeletonLine width="35%" height={28} />
                <SkeletonLine width="70%" />
              </div>
            ))}
      </div>

      {data ? (
        <div className="aov-grid">
          <section className="aov-panel aov-glass aov-active">
            <header className="aov-ph">
              <div>
                <h3>{t("admin.overviewActive")}</h3>
                <p>{t("admin.ovActiveHint")}</p>
              </div>
              <div className="aov-seg" role="tablist" aria-label={t("admin.overviewActive")}>
                <button type="button" role="tab" aria-selected={activeFilter === "all"} className={activeFilter === "all" ? "is-on" : ""} onClick={() => setActiveFilter("all")}>
                  {t("admin.overviewActiveAll")} <b className="tnum">{recentlyActive.length}</b>
                </button>
                <button type="button" role="tab" aria-selected={activeFilter === "online"} className={activeFilter === "online" ? "is-on" : ""} onClick={() => setActiveFilter("online")}>
                  {t("admin.overviewActiveOnline")} <b className="tnum">{onlineInActive}</b>
                </button>
              </div>
            </header>
            {roster(visibleActive, "active")}
            <button type="button" className="aov-more" onClick={() => onGoto?.("directory")}>
              {t("admin.ovAllUsers")}<ChevronRight size={13} aria-hidden="true" />
            </button>
          </section>

          <section className="aov-panel aov-glass aov-joined">
            <header className="aov-ph">
              <div>
                <h3>{t("admin.overviewJoined")}</h3>
                <p>{t("admin.ovJoinedHint")}</p>
              </div>
              <span className="aov-chip tnum">{t("admin.ovToday", { n: product.signupsToday || 0 })}</span>
            </header>
            {roster(newlyJoined, "joined")}
            <button type="button" className="aov-more" onClick={() => onGoto?.("signupStats")}>
              {t("admin.signupStats")}<ChevronRight size={13} aria-hidden="true" />
            </button>
          </section>

          <div className="aov-rail">
            <section className="aov-panel aov-glass aov-todo">
              <header className="aov-ph">
                <div>
                  <h3>{t("admin.ovTodo")}</h3>
                  <p>{t("admin.ovTodoHint")}</p>
                </div>
                {pending ? <span className="aov-count tnum">{pending}</span> : null}
              </header>
              <ul className="aov-todo-list">
                {todo.map((item) => {
                  const Glyph = item.level === "ok" ? CheckCircle : item.level === "bad" ? AlertCircle : AlertTriangle;
                  const body = (
                    <>
                      <Glyph size={18} weight="fill" className="aov-todo-ic" aria-hidden="true" />
                      <span className="aov-todo-tx">
                        <b>{say(item.title)}</b>
                        <em>{todoSub(item)}</em>
                      </span>
                      {item.tab ? (
                        <span className="aov-todo-go">{t("admin.ovTodoOpen")}<ChevronRight size={13} aria-hidden="true" /></span>
                      ) : null}
                    </>
                  );
                  return (
                    <li key={item.id} className={`is-${item.level}`}>
                      {item.tab ? (
                        <button type="button" className="aov-todo-row" onClick={() => onGoto?.(item.tab)}>{body}</button>
                      ) : (
                        <div className="aov-todo-row">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="aov-panel aov-glass aov-audit">
              <header className="aov-ph">
                <div>
                  <h3>{t("admin.ovAudit")}</h3>
                  <p>{t("admin.ovAuditHint")}</p>
                </div>
              </header>
              {audit.length ? (
                <ol className="aov-audit-list">
                  {audit.map((e) => {
                    const target = auditTargetLabel(e.target);
                    return (
                      <li key={e.id}>
                        <span className="aov-audit-dot" aria-hidden="true" />
                        <span className="aov-audit-tx">
                          <b>{e.actor || "admin"}</b> {auditVerb(e.action, locale)}
                          {target ? <> <b>{target}</b></> : null}
                        </span>
                        <span className="aov-audit-at">{e.at ? formatTimeAgo(e.at, t, undefined, locale) : ""}</span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="aov-empty">{t("admin.overviewNoAudit")}</p>
              )}
              <button type="button" className="aov-more" onClick={() => onGoto?.("audit")}>
                {t("admin.overviewOpenAudit")}<ChevronRight size={13} aria-hidden="true" />
              </button>
            </section>
          </div>
        </div>
      ) : null}
    </section>
  );
}
