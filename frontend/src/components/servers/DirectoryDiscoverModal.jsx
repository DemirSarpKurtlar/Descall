import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useModalFocus from "../../hooks/useModalFocus";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  BookOpen, Box, Check, Compass, Cpu, Crosshair, ExternalLink, Gamepad2, Globe, LayoutGrid, MessageCircle,
  MoreHorizontal, Music, Palette, Plus, Search, Sparkles, Swords, Target, Trophy, Users, X,
} from "../ui/Icon.jsx";
import { useLocale, useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { getDirectoryInvite, listDirectoryServers } from "../../api/directory";
import { joinServerByInvite } from "../../api/servers";
import { serverMessage } from "../../i18n/serverText.js";
import { DIRECTORY_CATEGORIES, DIRECTORY_SORTS } from "../../lib/serverDirectory.js";
import { directoryPath } from "../../site/directory/directoryPaths.js";
import { ServerIcon } from "./ServerIcon";
import "../../styles/server-directory.css";
import { useRumView } from "../../lib/perf/useRumTiming.js";

const PAGE = 24;
const SORT_KEYS = { members: "dir.discover.sortMembers", online: "dir.discover.sortOnline", newest: "dir.discover.sortNewest" };
/** Topic icon on the chips and the card banners. */
const CATEGORY_ICONS = {
  "gaming-minecraft": Box,
  "gaming-fps": Crosshair,
  "gaming-cs2": Target,
  "gaming-lol": Swords,
  "gaming-other": Gamepad2,
  study: BookOpen,
  music: Music,
  art: Palette,
  tech: Cpu,
  anime: Sparkles,
  sports: Trophy,
  "chat-friends": MessageCircle,
  other: MoreHorizontal,
};

/** Wheel over the topic row scrolls it sideways (it has no visible scrollbar). */
function useSidewaysWheel(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref]);
}

function DiscoverCardSkeleton() {
  return (
    <div className="dir-card dir-card--skeleton" aria-hidden="true">
      <div className="dir-card-banner skeleton-line" />
      <div className="dir-card-body">
        <div className="dir-card-icon skeleton-line" />
        <div className="skeleton-line" style={{ width: "62%", height: 13 }} />
        <div className="skeleton-line" style={{ width: "44%", height: 10 }} />
        <div className="skeleton-line" style={{ width: "92%", height: 10 }} />
      </div>
    </div>
  );
}

function EmptyArt() {
  return (
    <div className="dir-empty-art" aria-hidden="true">
      <span className="dir-empty-ghost is-left"><i /><b /></span>
      <span className="dir-empty-ghost is-right"><i /><b /></span>
      <span className="dir-empty-front">
        <i><Compass size={18} /></i>
        <b />
      </span>
    </div>
  );
}

/**
 * Discover (item 8): the public server directory inside the app, opened from the servers
 * sidebar. Topic chips, search, sort; Join asks the directory for the server's public
 * invite and joins through the normal invite flow (bans, verification, rules).
 * Gallery layout (owner-picked draft A): two columns of cards with a topic-coloured banner.
 * onListServer is passed only when the open server can be listed by this user (owner or
 * admin); it opens that server's Community and Discovery settings. Without it the empty
 * state shows where the setting lives instead.
 */
export default function DirectoryDiscoverModal({ onClose, onJoined, onListServer, myServers = [] }) {
  // Performans: samples taken here belong to "app/kesfet" (lib/perf/useRumTiming.js).
  useRumView("app/kesfet");
  const t = useT();
  const { locale } = useLocale();
  const { toast } = useToast();
  const dialogRef = useRef(null);
  useModalFocus(true, dialogRef);
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
  const chipsRef = useRef(null);
  useSidewaysWheel(chipsRef);

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
        ref={dialogRef}
        className="server-modal dir-modal dir-glass"
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
            <Compass size={22} />
          </span>
          <div className="dir-head-copy">
            <h3 id="dir-modal-title">{t("dir.discover.title")}</h3>
            <p className="server-modal-lead">{t("dir.discover.lead")}</p>
          </div>
          <button type="button" className="dir-close" onClick={onClose} aria-label={t("dir.discover.close")} title={t("dir.discover.close")}>
            <X size={18} />
          </button>
        </div>

        <div className="dir-tools">
          <label className="dir-search">
            <Search size={17} aria-hidden="true" />
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
          <div className="dir-sort" role="radiogroup" aria-label={t("dir.discover.sortLabel")}>
            {DIRECTORY_SORTS.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={sort === id} className={sort === id ? "is-on" : ""} onClick={() => setSort(id)}>
                {t(SORT_KEYS[id])}
              </button>
            ))}
          </div>
        </div>

        <div className="dir-chips" ref={chipsRef} role="tablist" aria-label={t("dir.discover.categories")}>
          <button type="button" role="tab" aria-selected={category === null} className={`dir-chip${category === null ? " is-on" : ""}`} onClick={() => setCategory(null)}>
            <LayoutGrid size={15} aria-hidden="true" />
            {t("dir.discover.all")}
          </button>
          {DIRECTORY_CATEGORIES.map((id) => {
            const Icon = CATEGORY_ICONS[id] || MoreHorizontal;
            return (
              <button key={id} type="button" role="tab" aria-selected={category === id} className={`dir-chip${category === id ? " is-on" : ""}`} data-cat={id} onClick={() => setCategory(id)}>
                <Icon size={15} aria-hidden="true" />
                {t(`dir.cat.${id}`)}
              </button>
            );
          })}
        </div>

        <div className="dir-list" aria-busy={loading}>
          {loading && rows.length === 0 ? (
            <div className="dir-grid" aria-label={t("dir.discover.title")}>
              {Array.from({ length: 4 }).map((_, i) => (
                <DiscoverCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="dir-empty">
              <EmptyArt />
              <h4>{error}</h4>
              <div className="dir-empty-actions">
                <button type="button" className="dir-btn" onClick={() => setReload((n) => n + 1)}>
                  {t("dir.discover.retry")}
                </button>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="dir-empty">
              <EmptyArt />
              <h4>
                {query.trim()
                  ? t("dir.discover.emptySearch")
                  : category
                    ? t("dir.discover.emptyCategory", { category: t(`dir.cat.${category}`) })
                    : t("dir.discover.empty")}
              </h4>
              <p>{t("dir.discover.emptyHint")}</p>
              <div className="dir-empty-actions">
                {onListServer ? (
                  <button type="button" className="dir-btn is-primary" onClick={onListServer}>
                    <Plus size={16} aria-hidden="true" />
                    {t("dir.discover.listMine")}
                  </button>
                ) : null}
                {category || query.trim() ? (
                  <button
                    type="button"
                    className="dir-btn"
                    onClick={() => {
                      setCategory(null);
                      setQuery("");
                    }}
                  >
                    {t("dir.discover.allTopics")}
                  </button>
                ) : null}
              </div>
              {!onListServer ? (
                <ol className="dir-steps">
                  <li>{t("dir.discover.step1")}</li>
                  <li>{t("dir.discover.step2")}</li>
                  <li>{t("dir.discover.step3")}</li>
                </ol>
              ) : null}
            </div>
          ) : (
            <div className="dir-grid">
              {rows.map((s) => {
                const member = mine.has(String(s.id));
                const Icon = CATEGORY_ICONS[s.category] || Compass;
                return (
                  <article key={s.id} className="dir-card" data-cat={s.category || "other"}>
                    <div className="dir-card-banner" aria-hidden="true">
                      <Icon size={42} strokeWidth={1.6} />
                    </div>
                    <div className="dir-card-body">
                      <ServerIcon server={s} className="dir-card-icon" fallbackClassName="dir-card-icon-fallback" />
                      <div className="dir-card-row">
                        <strong className="dir-card-name" title={s.name}>
                          {s.name}
                        </strong>
                        <button
                          type="button"
                          className={`dir-btn dir-join${member ? " is-member" : " is-primary"}`}
                          disabled={busyId != null}
                          onClick={() => join(s)}
                        >
                          {member ? <Check size={15} aria-hidden="true" /> : null}
                          {busyId === s.id ? t("dir.discover.joining") : member ? t("dir.discover.open") : t("dir.discover.join")}
                        </button>
                      </div>
                      <span className="dir-card-meta">
                        <span className="dir-meta-members">
                          <Users size={13} aria-hidden="true" />
                          {t("dir.discover.members", { count: s.memberCount })}
                        </span>
                        {s.onlineCount ? <span className="dir-meta-online">{t("dir.discover.online", { count: s.onlineCount })}</span> : null}
                        {s.language ? <span>{t(`dir.lang.${s.language}`)}</span> : null}
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
                  </article>
                );
              })}
            </div>
          )}
          {nextOffset != null && rows.length > 0 ? (
            <button type="button" className="dir-btn dir-more" disabled={loading} onClick={loadMore}>
              {loading ? t("Loading…") : t("dir.discover.more")}
            </button>
          ) : null}
        </div>

        <div className="dir-actions">
          <a className="dir-web" href={webPath} target="_blank" rel="noopener noreferrer">
            <Globe size={15} aria-hidden="true" />
            {t("dir.discover.web")}
            <ExternalLink size={13} aria-hidden="true" />
          </a>
          {onListServer && rows.length > 0 ? (
            <button type="button" className="dir-btn" onClick={onListServer}>
              <Plus size={16} aria-hidden="true" />
              {t("dir.discover.listMine")}
            </button>
          ) : (
            <button type="button" className="dir-btn" onClick={onClose}>
              {t("dir.discover.close")}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
