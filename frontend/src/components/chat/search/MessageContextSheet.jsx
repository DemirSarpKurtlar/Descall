import { useEffect, useState } from "react";
import { Mic, Paperclip, Phone, X } from "../../ui/Icon.jsx";
import { Avatar } from "../../ui/Avatar";
import OverlayPortal from "../../ui/OverlayPortal.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { formatAppDateTime } from "../../../lib/datetime";
import { messageContext } from "../../../lib/messageSearch";

/**
 * An older search result with its neighbours (3.7.7). The chat only keeps the
 * newest page loaded, so a hit further back is shown here instead of scrolling.
 */
function highlight(text, q) {
  if (!q) return text;
  const fold = (s) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const at = fold(text).indexOf(fold(q));
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

export default function MessageContextSheet({ conversationKey, hit, query, onClose }) {
  const { t, locale } = useLocale();
  const [state, setState] = useState({ loading: true, messages: [], error: "" });

  useEffect(() => {
    let live = true;
    messageContext(conversationKey, hit.id)
      .then((d) => live && setState({ loading: false, messages: d?.messages || [], error: "" }))
      .catch((e) => live && setState({ loading: false, messages: [], error: e?.message || t("search.failed") }));
    return () => {
      live = false;
    };
  }, [hit.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <OverlayPortal>
      <div className="msr-scrim" onClick={onClose} role="presentation">
        <section className="msr-sheet" role="dialog" aria-modal="true" aria-label={t("search.context")} onClick={(e) => e.stopPropagation()}>
          <header>
            <h3>{t("search.context")}</h3>
            <time dateTime={hit.createdAt}>{formatAppDateTime(hit.createdAt, locale)}</time>
            <button type="button" className="msr-x" onClick={onClose} aria-label={t("Close")}><X size={18} /></button>
          </header>
          {state.loading ? <p className="msr-hint">{t("search.searching")}</p> : null}
          {state.error ? <p className="msr-hint is-error">{state.error}</p> : null}
          <ol className="msr-ctx">
            {state.messages.map((m) => {
              const name = m.author?.displayName || m.author?.username || t("Unknown");
              return (
                <li key={m.id} className={m.hit ? "is-hit" : ""}>
                  <Avatar user={{ ...(m.author || {}), avatar_url: m.author?.avatarUrl }} name={name} size={28} />
                  <div>
                    <span className="msr-meta">
                      <strong>{name}</strong>
                      <time dateTime={m.createdAt}>{formatAppDateTime(m.createdAt, locale)}</time>
                    </span>
                    {m.kind === "voice" ? (
                      <span className="msr-kind"><Mic size={13} /> {t("search.kindVoice")}</span>
                    ) : m.kind === "call" ? (
                      <span className="msr-kind"><Phone size={13} /> {t("search.kindCall")}</span>
                    ) : m.kind !== "text" ? (
                      <span className="msr-kind"><Paperclip size={13} /> {t("search.kindFile")}</span>
                    ) : (
                      <p>{m.hit ? highlight(m.text, query) : m.text}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </OverlayPortal>
  );
}
