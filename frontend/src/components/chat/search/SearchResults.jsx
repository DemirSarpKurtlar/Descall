import { useEffect, useRef, useState } from "react";
import { Search } from "../../ui/Icon.jsx";
import { Avatar } from "../../ui/Avatar";
import { useLocale } from "../../../context/LocaleContext";
import { formatAppDateTime } from "../../../lib/datetime";
import { SEARCH_MIN, searchMessages, snippetParts, jumpToLoadedMessage } from "../../../lib/messageSearch";
import MessageContextSheet from "./MessageContextSheet.jsx";
import "../../../styles/message-search.css";

/**
 * Mesaj araması (3.7.7): results for the open conversation under the chat
 * search bar. Searches the whole history on the server (not only the loaded
 * page). A result on screen scrolls into view and flashes; an older one opens
 * with its surrounding messages in MessageContextSheet.
 */
export default function SearchResults({ conversationKey, query, onClose }) {
  const { t, locale } = useLocale();
  const [state, setState] = useState({ status: "idle", results: [], nextBefore: null, error: "" });
  const [context, setContext] = useState(null);
  const reqRef = useRef(0);
  const q = String(query || "").trim();
  const keyId = conversationKey ? JSON.stringify(conversationKey) : "";

  useEffect(() => {
    if (q.length < SEARCH_MIN || !conversationKey) {
      setState({ status: "idle", results: [], nextBefore: null, error: "" });
      return undefined;
    }
    const ctrl = new AbortController();
    const my = ++reqRef.current;
    setState((s) => ({ ...s, status: "loading", error: "" }));
    const timer = setTimeout(() => {
      searchMessages(conversationKey, q, { signal: ctrl.signal })
        .then((d) => {
          if (reqRef.current !== my) return;
          setState({ status: "done", results: d?.results || [], nextBefore: d?.nextBefore || null, error: "" });
        })
        .catch((e) => {
          if (ctrl.signal.aborted || reqRef.current !== my) return;
          setState({ status: "error", results: [], nextBefore: null, error: e?.message || t("search.failed") });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, keyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = () => {
    if (!state.nextBefore || state.status === "loading") return;
    const my = ++reqRef.current;
    setState((s) => ({ ...s, status: "loading" }));
    searchMessages(conversationKey, q, { before: state.nextBefore })
      .then((d) => {
        if (reqRef.current !== my) return;
        setState((s) => ({ status: "done", results: [...s.results, ...(d?.results || [])], nextBefore: d?.nextBefore || null, error: "" }));
      })
      .catch((e) => setState((s) => ({ ...s, status: "error", error: e?.message || t("search.failed") })));
  };

  const open = (r) => {
    if (jumpToLoadedMessage(r.id)) return;
    setContext(r);
  };

  if (q.length < SEARCH_MIN) {
    return q.length ? <div className="msr"><p className="msr-hint">{t("search.typeMore", { n: SEARCH_MIN })}</p></div> : null;
  }

  return (
    <div className="msr" role="region" aria-label={t("search.results")}>
      {state.status === "loading" && !state.results.length ? <p className="msr-hint">{t("search.searching")}</p> : null}
      {state.status === "error" ? <p className="msr-hint is-error">{state.error}</p> : null}
      {state.status === "done" && !state.results.length ? (
        <div className="msr-empty">
          <Search size={22} />
          <p>{t("search.none", { q })}</p>
        </div>
      ) : null}
      {state.results.length ? (
        <>
          <p className="msr-count">{state.nextBefore ? t("search.countMore", { n: state.results.length }) : t("search.count", { n: state.results.length })}</p>
          <ul className="msr-list">
            {state.results.map((r) => {
              const [a, m, b] = snippetParts(r.snippet);
              const name = r.author?.displayName || r.author?.username || t("Unknown");
              return (
                <li key={r.id}>
                  <button type="button" className="msr-item" onClick={() => open(r)}>
                    <Avatar user={{ ...(r.author || {}), avatar_url: r.author?.avatarUrl }} name={name} size={30} />
                    <span className="msr-body">
                      <span className="msr-meta">
                        <strong>{name}</strong>
                        <time dateTime={r.createdAt}>{formatAppDateTime(r.createdAt, locale)}</time>
                      </span>
                      <span className="msr-text">{a}{m ? <mark>{m}</mark> : null}{b}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {state.nextBefore ? (
            <button type="button" className="msr-more" onClick={more} disabled={state.status === "loading"}>
              {state.status === "loading" ? t("search.searching") : t("search.more")}
            </button>
          ) : null}
        </>
      ) : null}
      {context ? (
        <MessageContextSheet conversationKey={conversationKey} hit={context} query={q} onClose={() => setContext(null)} onCloseSearch={onClose} />
      ) : null}
    </div>
  );
}
