import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Compass, Search, Server, X } from "../ui/Icon.jsx";
import { useLocale, useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { getDirectoryInvite, listDirectoryServers } from "../../api/directory";
import { joinServerByInvite } from "../../api/servers";
import { serverMessage } from "../../i18n/serverText.js";
import { DIRECTORY_CATEGORIES, DIRECTORY_SORTS } from "../../lib/serverDirectory.js";
import { directoryPath } from "../../site/directory/directoryPaths.js";
import { ServerIcon } from "./ServerIcon";
import { ServerListSkeleton } from "../ui/Skeleton";
import "../../styles/server-directory.css";

const PAGE = 24;
const SORT_KEYS = { members: "dir.discover.sortMembers", online: "dir.discover.sortOnline", newest: "dir.discover.sortNewest" };

/**
 * Discover (item 8): the public server directory inside the app, opened from the servers
 * sidebar. Topic chips, search, sort; Join asks the directory for the server's public
 * invite and joins through the normal invite flow (bans, verification, rules).
 */
export default function DirectoryDiscoverModal({ onClose, onJoined, myServers = [] }) {
  const t = useT();
  const { locale } = useLocale();
  const { toast } = useToast();
  const [category, setCategory] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("members");
  const [rows, setRows] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [reload, setReload] = useState(0);
  const searchRef = useRef(null);

  const mine = useMemo(() => new Map((myServers || []).map((s) => [String(s.id), s])), [myServers]);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const data = await listDirectoryServers({ category, q: query.trim() || undefined, sort, limit: PAGE }, { signal: ctrl.signal });
        setRows(data?.servers || []);
        setNextOffset(data?.nextOffset ?? null);
      } catch (err) {
        if (err?.name === "AbortError") return;
        setRows([]);
        setNextOffset(null);
        setError(serverMessage(err?.body) || t("dir.discover.error"));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, query ? 280 : 0);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [category, query, sort, reload, t]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadMore = async () => {
    if (nextOffset == null || loading) return;
    setLoading(true);
    try {
      const data = await listDirectoryServers({ category, q: query.trim() || undefined, sort, limit: PAGE, offset: nextOffset });
      setRows((prev) => [...prev, ...(data?.servers || []).filter((s) => !prev.some((p) => p.id === s.id))]);
      setNextOffset(data?.nextOffset ?? null);
    } catch (err) {
      setError(serverMessage(err?.body) || t("dir.discover.error"));
    } finally {
      setLoading(false);
    }
  };

  const join = useCallback(
    async (card) => {
      const existing = mine.get(String(card.id));
      if (existing) {
        onJoined?.(existing);
        onClose?.();
        return;
      }
      setBusyId(card.id);
      try {
        const invite = await getDirectoryInvite(card.id);
        const data = await joinServerByInvite(invite.code);
        toast(t("dir.discover.joined", { name: card.name }), "success");
        onJoined?.(data?.server || { id: card.id, name: card.name, iconUrl: card.iconUrl });
        onClose?.();
      } catch (err) {
        toast(serverMessage(err?.body) || err?.message || t("dir.discover.error"), "error");
        setBusyId(null);
      }
    },
    [mine, onClose, onJoined, t, toast]
  );

  if (typeof document === "undefined") return null;
  // Absolute: the desktop and phone apps do not serve the public pages themselves.
  const webPath = `https://descall.com${directoryPath(locale === "tr" ? "tr" : "en", category)}`;

  return createPortal(
    <motion.div className="server-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="server-modal dir-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dir-modal-title"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dir-head">
          <span className="dir-head-icon" aria-hidden="true">
            <Compass size={20} />
          </span>
          <div className="dir-head-copy">
            <h3 id="dir-modal-title">{t("dir.discover.title")}</h3>
            <p className="server-modal-lead">{t("dir.discover.lead")}</p>
          </div>
          <button type="button" className="icon-btn dir-close" onClick={onClose} aria-label={t("dir.discover.close")} title={t("dir.discover.close")}>
            <X size={18} />
          </button>
        </div>

        <div className="dir-tools">
          <label className="dir-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("dir.discover.search")}
              aria-label={t("dir.discover.search")}
              maxLength={80}
            />
          </label>
          <label className="dir-sort">
            <span>{t("dir.discover.sortLabel")}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {DIRECTORY_SORTS.map((id) => (
                <option key={id} value={id}>
                  {t(SORT_KEYS[id])}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="dir-chips" role="tablist" aria-label={t("dir.discover.categories")}>
          <button type="button" role="tab" aria-selected={category === null} className={`dir-chip${category === null ? " is-on" : ""}`} onClick={() => setCategory(null)}>
            {t("dir.discover.all")}
          </button>
          {DIRECTORY_CATEGORIES.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={category === id} className={`dir-chip${category === id ? " is-on" : ""}`} onClick={() => setCategory(id)}>
              {t(`dir.cat.${id}`)}
            </button>
          ))}
        </div>

        <div className="dir-list" aria-busy={loading}>
          {loading && rows.length === 0 ? (
            <ServerListSkeleton count={5} label={t("dir.discover.title")} />
          ) : error ? (
            <div className="server-empty-state compact dir-empty">
              <p>{error}</p>
              <button type="button" className="server-ghost-btn" onClick={() => setReload((n) => n + 1)}>
                {t("dir.discover.retry")}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="server-empty-state compact dir-empty">
              <Server size={28} strokeWidth={1.5} />
              <p>{t("dir.discover.empty")}</p>
              <p className="dir-muted">{t("dir.discover.emptyHint")}</p>
            </div>
          ) : (
            rows.map((s) => {
              const member = mine.has(String(s.id));
              return (
                <article key={s.id} className="dir-card">
                  <ServerIcon server={s} />
                  <div className="dir-card-copy">
                    <strong className="dir-card-name">{s.name}</strong>
                    <span className="dir-card-meta">
                      {t("dir.discover.members", { count: s.memberCount })}
                      {s.onlineCount ? <span className="dir-dot">{t("dir.discover.online", { count: s.onlineCount })}</span> : null}
                      <span className="dir-dot">{t(`dir.lang.${s.language}`)}</span>
                    </span>
                    {s.description ? <p className="dir-card-desc">{s.description}</p> : null}
                    {s.tags?.length ? (
                      <span className="dir-tags">
                        {s.tags.map((tag) => (
                          <span key={tag} className="dir-tag">
                            {`#${tag}`}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <button type="button" className="server-primary-btn sm dir-join" disabled={busyId != null} onClick={() => join(s)}>
                    {busyId === s.id ? t("dir.discover.joining") : member ? t("dir.discover.open") : t("dir.discover.join")}
                  </button>
                </article>
              );
            })
          )}
        </div>

        <div className="server-modal-actions dir-actions">
          <a className="dir-web" href={webPath} target="_blank" rel="noopener noreferrer">
            {t("dir.discover.web")}
          </a>
          {nextOffset != null ? (
            <button type="button" className="server-ghost-btn" disabled={loading} onClick={loadMore}>
              {t("dir.discover.more")}
            </button>
          ) : null}
          <button type="button" className="server-ghost-btn" onClick={onClose}>
            {t("dir.discover.close")}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
