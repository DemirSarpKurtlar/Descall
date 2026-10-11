import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mail, RefreshCw, Search, Users } from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import { Avatar } from "../ui/Avatar";
import RippleButton from "../ui/RippleButton";
import { SkeletonLine } from "../ui/Skeleton";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime, formatTimeAgo, intlLocaleTag } from "../../lib/datetime";

const FILTERS = [
  { id: "all", label: "admin.directoryFilterAll" },
  { id: "online", label: "admin.directoryOnline" },
  { id: "admin", label: "admin.directoryAdmins" },
  { id: "banned", label: "admin.directoryBanned" },
  { id: "timeout", label: "admin.directoryTimeout" },
  { id: "new", label: "admin.directoryNew" },
  { id: "deleting", label: "admin.directoryDeleting" },
];

function presenceLabel(status, t) {
  if (status === "idle") return t("Idle");
  if (status === "dnd") return t("Do Not Disturb");
  if (status === "invisible") return t("Invisible");
  if (status === "offline") return t("Offline");
  return t("Online Now");
}

function formatCount(value, locale) {
  return new Intl.NumberFormat(intlLocaleTag(locale)).format(Number(value) || 0);
}

function providerLabel(provider) {
  if (provider === "google") return "Google";
  if (provider === "apple") return "Apple";
  return "";
}

export default function AdminUserDirectory({ onOpenPerson }) {
  const { t, locale } = useLocale();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const queryRef = useRef("");
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = draft.trim();
      if (next === queryRef.current) return;
      queryRef.current = next;
      setQuery(next);
      setPage(0);
    }, 220);
    return () => clearTimeout(handle);
  }, [draft]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "40",
        sort,
        filter,
      });
      if (query) params.set("q", query);
      const next = await adminFetch(`/directory?${params.toString()}`);
      setData(next);
    } catch (err) {
      setError(err?.message || t("admin.directoryLoadError"));
    } finally {
      setLoading(false);
    }
  }, [page, sort, filter, query, t]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const summary = data?.summary || {};
  const users = data?.users || [];
  const filtered = Number(data?.filtered) || 0;
  const pages = Math.max(1, Number(data?.pages) || 1);
  const from = filtered === 0 ? 0 : page * 40 + 1;
  const to = Math.min(filtered, page * 40 + users.length);
  const total = Number(summary.total ?? data?.total) || 0;

  const pickFilter = (id) => {
    setFilter(id);
    setPage(0);
  };

  const stats = [
    { id: "online", label: t("admin.directoryOnline"), value: summary.online },
    { id: "admin", label: t("admin.directoryAdmins"), value: summary.admins },
    { id: "banned", label: t("admin.directoryBanned"), value: summary.banned },
    { id: "timeout", label: t("admin.directoryTimeout"), value: summary.timeouts },
    { id: "new", label: t("admin.directoryNew"), value: summary.fresh },
    { id: "deleting", label: t("admin.directoryDeleting"), value: summary.deleting },
  ];

  return (
    <section className="admin-section admin-section-full user-directory">
      <div className="dir-hero">
        <div>
          <p className="dir-kicker">
            <Users size={14} />
            {t("admin.users")}
          </p>
          <h2 className="dir-total">{loading && !data ? <SkeletonLine width={120} height={42} /> : formatCount(total, locale)}</h2>
          <p className="muted">{t("admin.directorySubtitle")}</p>
        </div>
        <RippleButton type="button" onClick={() => load()} disabled={loading} className="refresh-btn">
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          {t("common.refresh")}
        </RippleButton>
      </div>

      <div className="dir-stats" role="tablist" aria-label={t("admin.users")}>
        {stats.map((stat) => (
          <button
            key={stat.id}
            type="button"
            role="tab"
            aria-selected={filter === stat.id}
            className={`dir-stat${filter === stat.id ? " is-on" : ""}`}
            onClick={() => pickFilter(filter === stat.id ? "all" : stat.id)}
          >
            <span>{stat.label}</span>
            <strong>{data ? formatCount(stat.value, locale) : "—"}</strong>
          </button>
        ))}
      </div>

      <div className="dir-tools">
        <label className="dir-search">
          <Search size={16} />
          <input
            className="admin-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("admin.directorySearch")}
            aria-label={t("admin.directorySearch")}
          />
        </label>
        <div className="dir-filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dir-chip${filter === item.id ? " is-on" : ""}`}
              onClick={() => pickFilter(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <label className="dir-sort">
          <span>{t("admin.directorySort")}</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(0);
            }}
          >
            <option value="name">{t("admin.directorySortName")}</option>
            <option value="newest">{t("admin.directorySortNewest")}</option>
            <option value="seen">{t("admin.directorySortSeen")}</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="admin-error-banner">
          <span>{error}</span>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="dir-list" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="dir-row is-skeleton">
              <SkeletonLine width={44} height={44} />
              <SkeletonLine width="70%" />
            </div>
          ))}
        </div>
      ) : null}

      {data && users.length === 0 ? (
        <div className="dir-empty">
          <Users size={28} />
          <h3>{t("admin.directoryEmptyTitle")}</h3>
          <p>{t("admin.directoryEmptyBody")}</p>
        </div>
      ) : null}

      {users.length > 0 ? (
        <ol className={`dir-list${loading ? " is-loading" : ""}`}>
          {users.map((user) => {
            const name = user.displayName || user.username || "—";
            const provider = providerLabel(user.provider);
            const seen = user.lastSeen
              ? formatTimeAgo(user.lastSeen, t, undefined, locale) || formatAppDateTime(user.lastSeen, locale)
              : t("admin.directoryNever");
            return (
              <li key={user.id}>
                <button type="button" className="dir-row" onClick={() => onOpenPerson?.(user.id)}>
                  <span className={`dir-avatar${user.isOnline ? " is-on" : ""}`}>
                    <Avatar
                      name={name}
                      size={44}
                      animate="never"
                      user={{ avatarUrl: user.avatarUrl, username: user.username }}
                    />
                    <i className={`dir-dot is-${user.status || "offline"}`} />
                  </span>
                  <span className="dir-id">
                    <strong>{name}</strong>
                    <em>@{user.username}</em>
                  </span>
                  <span className="dir-mail">
                    <Mail size={13} />
                    {user.email || "—"}
                  </span>
                  <span className="dir-badges">
                    {user.isOnline ? <i className={`is-${user.status || "online"}`}>{presenceLabel(user.status, t)}</i> : null}
                    {user.isAdmin ? <i className="is-admin">{t("admin.adminBadge")}</i> : null}
                    {user.banned ? <i className="is-ban">{t("admin.directoryBanned")}</i> : null}
                    {user.timedOut ? <i className="is-time">{t("admin.directoryTimeout")}</i> : null}
                    {user.pendingDeletion ? <i className="is-del">{t("admin.directoryPendingDelete")}</i> : null}
                    {user.twoFactor ? <i>2FA</i> : null}
                    {provider ? <i>{provider}</i> : null}
                  </span>
                  <span className="dir-when">
                    <b>{t("admin.directoryJoined")}</b>
                    <small>{user.createdAt ? formatAppDateTime(user.createdAt, locale) : "—"}</small>
                  </span>
                  <span className="dir-when">
                    <b>{t("admin.directoryLastSeen")}</b>
                    <small>{seen}</small>
                  </span>
                  <ChevronRight size={16} className="dir-chevron" />
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      {data ? (
        <div className="dir-pager">
          <span>{t("admin.directoryRange", { from: formatCount(from, locale), to: formatCount(to, locale), total: formatCount(filtered, locale) })}</span>
          <div>
            <button type="button" onClick={() => setPage((n) => Math.max(0, n - 1))} disabled={page <= 0 || loading} aria-label={t("admin.directoryPrev")}>
              <ChevronLeft size={16} />
            </button>
            <em>{page + 1} / {pages}</em>
            <button type="button" onClick={() => setPage((n) => n + 1)} disabled={page + 1 >= pages || loading} aria-label={t("admin.directoryNext")}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
