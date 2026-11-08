import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import JsonLd, { buildBreadcrumbLd } from "../JsonLd";
import { API_BASE_URL } from "../../config/api";
import { DIRECTORY_SORTS } from "../../lib/serverDirectory.js";
import {
  DIRECTORY_CATEGORIES,
  DIRECTORY_MIN_PAGE_SERVERS,
  directoryPageCount,
  directoryPath,
  directoryServerLanguage,
  directoryTwinPath,
  parseDirectoryPath,
} from "../directory/directoryPaths.js";
import { directoryCopy, directoryCrumbs, directoryLanguageName, directoryText } from "../directory/directoryRoutes.js";
import { buildDirectoryItemListLd, directoryCardId } from "../directory/directoryLd.js";
import "../directory/directory.css";

const SORT_KEYS = { members: "sortMembers", online: "sortOnline", newest: "sortNewest" };
const PAGE = 48;
const POPULAR = 12;

async function getJson(path, { method = "GET", signal } = {}) {
  const res = await fetch(`${API_BASE_URL}/api/directory${path}`, {
    method,
    signal,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? "{}" : undefined,
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Robots meta follows the live list: a category page with fewer than 3 servers is noindex. */
function useDirectoryRobots(noindex, ready, pathname) {
  useEffect(() => {
    if (!ready) return;
    const el = document.head.querySelector('meta[name="robots"]');
    if (el && noindex) el.setAttribute("content", "noindex,follow");
  }, [noindex, ready, pathname]);
}

function ServerCard({ lang, server, onJoin, busy }) {
  const dt = (key, vars) => directoryText(lang, key, vars);
  return (
    <li className="mkt-dir-card" id={directoryCardId(server.id)}>
      {server.iconUrl ? (
        <img className="mkt-dir-icon" src={server.iconUrl} width="56" height="56" alt={server.name} loading="lazy" decoding="async" />
      ) : (
        <span className="mkt-dir-icon is-letter" aria-hidden="true">
          {String(server.name || "?").trim().charAt(0).toUpperCase()}
        </span>
      )}
      <div className="mkt-dir-copy">
        <h3>{server.name}</h3>
        <p className="mkt-dir-meta">
          <span>{dt("members", { count: server.memberCount })}</span>
          {server.onlineCount ? <span className="is-online">{dt("online", { count: server.onlineCount })}</span> : null}
          <span>{directoryLanguageName(lang, server.language)}</span>
        </p>
        {server.description ? <p className="mkt-dir-desc">{server.description}</p> : null}
        {server.tags?.length ? (
          <p className="mkt-dir-tags">
            {server.tags.map((tag) => (
              <span key={tag}>{`#${tag}`}</span>
            ))}
          </p>
        ) : null}
      </div>
      <button type="button" className="mkt-btn mkt-btn-primary mkt-dir-join" disabled={busy} onClick={() => onJoin(server)}>
        {busy ? dt("joinWorking") : dt("join")}
      </button>
    </li>
  );
}

/**
 * Public server directory pages (item 8): /communities, /communities/<slug> and the
 * Turkish /tr/topluluklar twins. The prerendered shell (scripts/directoryPrerender.mjs)
 * is the first paint and what crawlers read; this page loads the live list, lets visitors
 * sort and search, and turns Join into the server's public invite (/servers/join/<code>).
 */
export default function DirectoryPage() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const page = parseDirectoryPath(pathname) || { lang: "en", category: null };
  const { lang, category } = page;
  const copy = directoryCopy(lang);
  const dt = useCallback((key, vars) => directoryText(lang, key, vars), [lang]);
  const serverLang = directoryServerLanguage(lang);

  const [sort, setSort] = useState("members");
  const [query, setQuery] = useState("");
  const pageKey = `${category || ""}|${serverLang || ""}`;
  const [state, setState] = useState({ status: "loading", key: "", servers: [], total: 0, categories: null });
  const [joining, setJoining] = useState(null);
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (serverLang) params.set("language", serverLang);
        params.set("sort", sort);
        params.set("limit", String(category ? PAGE : POPULAR));
        if (query.trim()) params.set("q", query.trim());
        const [list, summary] = await Promise.all([
          getJson(`/servers?${params}`, { signal: ctrl.signal }),
          getJson("/summary", { signal: ctrl.signal }),
        ]);
        setState({ status: "ready", key: pageKey, servers: list.servers || [], total: list.total || 0, categories: summary.categories || null });
      } catch (err) {
        if (err?.name === "AbortError") return;
        setState((s) => ({ ...s, key: pageKey, status: "error" }));
      }
    }, query ? 280 : 0);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [category, serverLang, sort, query, pageKey]);

  const join = useCallback(
    async (server) => {
      setJoining(server.id);
      setJoinError("");
      try {
        const invite = await getJson(`/servers/${encodeURIComponent(server.id)}/invite`, { method: "POST" });
        if (!invite?.path) throw new Error("no invite");
        window.location.assign(invite.path);
      } catch {
        setJoinError(dt("joinFailed"));
        setJoining(null);
      }
    },
    [dt]
  );

  // ?join=<id>: the prerendered Join link (works without JavaScript on the shell).
  useEffect(() => {
    const id = new URLSearchParams(search).get("join");
    if (!id) return;
    navigate({ pathname, search: "" }, { replace: true });
    join({ id });
  }, [search, pathname, navigate, join]);

  const ready = state.status === "ready" && state.key === pageKey;
  const count = category ? directoryPageCount(state.categories, lang, category) : null;
  useDirectoryRobots(Boolean(category) && (count ?? 0) < DIRECTORY_MIN_PAGE_SERVERS, ready, pathname);

  const crumbs = directoryCrumbs(lang, category);
  const twin = directoryTwinPath(pathname, lang === "tr" ? "en" : "tr");
  const jsonLd = useMemo(
    () => [buildBreadcrumbLd(crumbs), buildDirectoryItemListLd({ lang, category, servers: ready ? state.servers : [] })].filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, category, ready, state.servers]
  );

  const h1 = category ? copy.cat[category].h1 : copy.home.h1;
  const lead = category ? copy.cat[category].intro : copy.home.lead;

  return (
    <article className="seo-landing seo-tone-community mkt-dir">
      <JsonLd data={jsonLd} />
      <header className="seo-hero">
        <nav className="seo-breadcrumbs" aria-label={dt("breadcrumb")}>
          <ol>
            {crumbs.map((c, i) => (
              <li key={c.path}>
                {i > 0 ? <ChevronIcon /> : null}
                {i === crumbs.length - 1 ? <span aria-current="page">{c.name}</span> : <Link to={c.path}>{c.name}</Link>}
              </li>
            ))}
          </ol>
        </nav>
        <h1>{h1}</h1>
        <p className="seo-lead">{lead}</p>
        {twin ? (
          <p className="mkt-dir-twin">
            <Link to={twin}>{dt("otherLanguage")}</Link>
          </p>
        ) : null}
      </header>

      <nav className="mkt-dir-topics" aria-label={dt("categoriesTitle")}>
        <Link to={directoryPath(lang)} className={!category ? "is-on" : ""} aria-current={!category ? "page" : undefined}>
          {dt("allTopics")}
        </Link>
        {DIRECTORY_CATEGORIES.map((id) => (
          <Link key={id} to={directoryPath(lang, id)} className={category === id ? "is-on" : ""} aria-current={category === id ? "page" : undefined}>
            {copy.cat[id].label}
            {ready ? <span className="mkt-dir-count">{directoryPageCount(state.categories, lang, id)}</span> : null}
          </Link>
        ))}
      </nav>

      <section className="mkt-dir-list-wrap" aria-labelledby="mkt-dir-list-title">
        <div className="mkt-dir-bar">
          <h2 id="mkt-dir-list-title">{category ? dt("listTitle") : dt("popularTitle")}</h2>
          {category ? (
            <div className="mkt-dir-tools">
              <label className="mkt-dir-search">
                <span className="mkt-dir-sr">{dt("searchLabel")}</span>
                <input type="search" value={query} maxLength={80} placeholder={dt("searchPlaceholder")} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <label className="mkt-dir-sort">
                <span>{dt("sortLabel")}</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {DIRECTORY_SORTS.map((id) => (
                    <option key={id} value={id}>
                      {dt(SORT_KEYS[id])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>
        {joinError ? (
          <p className="mkt-dir-error" role="alert">
            {joinError}
          </p>
        ) : null}
        {state.status === "error" && state.key === pageKey ? (
          <p className="mkt-dir-empty">{dt("unavailable")}</p>
        ) : ready && state.servers.length === 0 ? (
          query ? (
            <p className="mkt-dir-empty">{dt("noMatch")}</p>
          ) : (
            <div className="mkt-dir-empty">
              <h3>{dt("emptyTitle")}</h3>
              <p>{dt("emptyBody")}</p>
            </div>
          )
        ) : (
          <ol className="mkt-dir-list" aria-busy={!ready}>
            {state.servers.map((s) => (
              <ServerCard key={s.id} lang={lang} server={s} busy={joining === s.id} onJoin={join} />
            ))}
          </ol>
        )}
      </section>

      <section className="mkt-section mkt-prose mkt-dir-how">
        <h2>{dt("howTitle")}</h2>
        {copy.ui.how.map((p) => (
          <p key={p.slice(0, 32)}>{p}</p>
        ))}
      </section>

      <section className="seo-bottom-cta">
        <h2>{dt("ctaTitle")}</h2>
        <p>{dt("ctaBody")}</p>
        <div className="mkt-cta-row">
          <Link to={lang === "tr" ? "/tr/register" : "/register"} className="mkt-btn mkt-btn-primary">
            {dt("ctaStart")}
          </Link>
          <Link to={lang === "tr" ? "/tr/download" : "/download"} className="mkt-btn mkt-btn-soft">
            {dt("ctaDownload")}
          </Link>
        </div>
      </section>
    </article>
  );
}
