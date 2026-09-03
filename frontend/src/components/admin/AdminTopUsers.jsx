import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity as ActivityIcon,
  Clock,
  MessageSquare,
  RefreshCw,
  Search,
  Star,
  Users,
  Wifi,
} from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import RippleButton from "../ui/RippleButton";
import { Avatar } from "../ui/Avatar";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime, formatTimeAgo } from "../../lib/datetime";
import { ConversationListSkeleton } from "../ui/Skeleton";

const WINDOWS = [
  { id: "24h", labelKey: "admin.window24h" },
  { id: "7d", labelKey: "admin.window7d" },
  { id: "30d", labelKey: "admin.window30d" },
  { id: "all", labelKey: "admin.windowAll" },
];

function rankClass(rank) {
  if (rank === 1) return "is-gold";
  if (rank === 2) return "is-silver";
  if (rank === 3) return "is-bronze";
  return "";
}

export default function AdminTopUsers() {
  const { t, locale } = useLocale();
  const [sort, setSort] = useState("messages");
  const [windowKey, setWindowKey] = useState("all");
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch(
        `/activity/leaderboard?sort=${encodeURIComponent(sort)}&window=${encodeURIComponent(windowKey)}&limit=50`
      );
      setPayload(data);
    } catch (err) {
      setError(err?.message || t("admin.loadError"));
    } finally {
      setLoading(false);
    }
  }, [sort, windowKey, t]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const users = payload?.users || [];
  const summary = payload?.summary || {};
  const maxMessages = Math.max(1, ...users.map((u) => u.messageCount || 0));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.username || ""} ${u.displayName || ""}`.toLowerCase().includes(q)
    );
  }, [users, query]);

  return (
    <section className="admin-section admin-leaderboard">
      <div className="activity-header">
        <div className="activity-title-section">
          <h2>{t("Top Active Users")}</h2>
          <p className="activity-subtitle">{t("admin.leaderboardSubtitle")}</p>
        </div>
        <div className="admin-leaderboard-controls">
          <div className="metric-selector">
            <button type="button" className={sort === "messages" ? "active" : ""} onClick={() => setSort("messages")}>
              <MessageSquare size={14} />
              {t("By Messages")}
            </button>
            <button type="button" className={sort === "activity" ? "active" : ""} onClick={() => setSort("activity")}>
              <ActivityIcon size={14} />
              {t("By Activity")}
            </button>
          </div>
          <div className="period-selector">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                className={windowKey === w.id ? "active" : ""}
                onClick={() => setWindowKey(w.id)}
              >
                {t(w.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-leaderboard-summary">
        <div className="admin-leaderboard-stat">
          <MessageSquare size={16} />
          <strong>{summary.messagesInWindow || 0}</strong>
          <span>{t("admin.messagesInWindow")}</span>
        </div>
        <div className="admin-leaderboard-stat">
          <Users size={16} />
          <strong>{summary.sendersInWindow || 0}</strong>
          <span>{t("admin.sendersInWindow")}</span>
        </div>
        <div className="admin-leaderboard-stat">
          <Wifi size={16} />
          <strong>{summary.onlineNow || 0}</strong>
          <span>{t("admin.onlineNow")}</span>
        </div>
        <div className="admin-leaderboard-stat">
          <Star size={16} />
          <strong>{summary.dmThreads || 0}</strong>
          <span>{t("admin.dmThreads")}</span>
        </div>
      </div>

      <div className="activity-toolbar">
        <label className="admin-leaderboard-search">
          <Search size={14} />
          <input
            className="admin-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.searchUsers")}
          />
        </label>
        <div className="last-updated">
          <Clock size={14} />
          <span>
            {t("Last updated")}:{" "}
            {payload?.generatedAt ? formatAppDateTime(payload.generatedAt, locale) : t("Never")}
          </span>
        </div>
        <RippleButton type="button" onClick={load} disabled={loading} className="refresh-btn">
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          {loading ? t("Loading...") : t("Refresh")}
        </RippleButton>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      {loading && !users.length ? (
        <ConversationListSkeleton count={7} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Users size={40} className="empty-icon" />
          <h3>{t("admin.noLeaderboard")}</h3>
        </div>
      ) : (
        <div className="admin-leaderboard-list">
          {filtered.map((user, index) => {
            const rank = user.rank || index + 1;
            return (
              <motion.article
                key={user.id}
                className={`admin-leaderboard-row ${user.isOnline ? "is-online" : ""}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.24) }}
              >
                <div className={`admin-leaderboard-rank ${rankClass(rank)}`}>{rank}</div>
                <Avatar user={user} name={user.displayName || user.username} size={40} />
                <div className="admin-leaderboard-meta">
                  <div className="admin-leaderboard-name">
                    <strong>{user.displayName || user.username}</strong>
                    {user.displayName && user.displayName !== user.username ? (
                      <span className="muted">@{user.username}</span>
                    ) : null}
                    {user.isOnline ? <span className="admin-badge online">{t("Online")}</span> : null}
                  </div>
                  <div className="admin-leaderboard-chips">
                    <span>{t("{count} msgs", { count: user.messageCount })}</span>
                    {user.dmCount > 0 ? <span>{t("admin.dmCount", { count: user.dmCount })}</span> : null}
                    {user.groupCount > 0 ? <span>{t("admin.groupCount", { count: user.groupCount })}</span> : null}
                    {user.serverCount > 0 ? <span>{t("admin.serverCount", { count: user.serverCount })}</span> : null}
                  </div>
                  <div className="admin-leaderboard-bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(4, (user.messageCount / maxMessages) * 100)}%` }} />
                  </div>
                  <p className="admin-leaderboard-when">
                    {user.lastActiveAt
                      ? `${formatTimeAgo(user.lastActiveAt, t, undefined, locale)} · ${formatAppDateTime(user.lastActiveAt, locale)}`
                      : t("Never active")}
                    {user.lastMessageAt ? ` · ${t("admin.lastMessage")} ${formatTimeAgo(user.lastMessageAt, t, undefined, locale)}` : ""}
                  </p>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </section>
  );
}
