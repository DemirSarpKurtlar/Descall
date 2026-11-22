// "Arkadaşlarına göster" (sets draft A celebration): DM the new look to up to 10 friends
// (POST /api/shop2/share). The DM carries a look link that chat renders as a look card.
// Shows the result per friend (sent, or why not).
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import shop2Api from "../../lib/shop2Api.js";
import { filterRecipients } from "../../lib/shop2Logic.js";
import { useS2 } from "./Shop2Context.js";
import { CloseX, Layer } from "./Shop2Bits.jsx";
import { Check, Search, Send, X } from "./shop2Icons.jsx";

const MAX = 10;
const KNOWN = new Set(["recipient_not_friend", "recipient_unavailable", "recipient_no_gifts", "rate_limited", "blocked", "dm_rate_limited"]);
const nameOf = (f) => f?.displayName || f?.display_name || f?.username || "";

export default function Shop2Share({ target, onClose }) {
  const { t } = useLocale();
  const s2 = useS2();
  // null while loading: "Henüz arkadaşın yok" flashed before the list arrived.
  const [friends, setFriends] = useState(null);
  const [chosen, setChosen] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let off = false;
    shop2Api.friends().then((r) => !off && setFriends(Array.isArray(r?.friends) ? r.friends : [])).catch(() => !off && setFriends([]));
    return () => {
      off = true;
    };
  }, []);
  const shown = useMemo(() => filterRecipients(friends || [], "all", query), [friends, query]);
  const byId = useMemo(() => new Map((friends || []).map((f) => [String(f.id), f])), [friends]);
  const toggle = (id) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX) next.add(id);
    setChosen(next);
  };
  const send = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await s2.actions.shareLook({ ...target, toUserIds: [...chosen], message: note.trim() || undefined });
      setResult(res || { results: [] });
    } catch (e) {
      setErr(e?.message || t("shop2.errors.share"));
    } finally {
      setBusy(false);
    }
  };
  const body = result ? (
    <div className="s2-share-res">
      <p className="s2-share-sum">{t("shop2.share.sent", { n: result.sent ?? (result.results || []).filter((r) => r.ok).length, total: (result.results || []).length })}</p>
      <ul>
        {(result.results || []).map((r) => (
          <li key={r.userId} className={r.ok ? "is-ok" : "is-err"}>
            <span className="s2-letter is-xs tone-2">{nameOf(byId.get(String(r.userId))).charAt(0) || "?"}</span>
            <b>{nameOf(byId.get(String(r.userId))) || r.userId}</b>
            {r.ok ? (
              <span className="s2-ok"><Check size={13} />{t("shop2.share.ok")}</span>
            ) : (
              <span className="s2-share-err"><X size={13} />{t(`shop2.share.code.${KNOWN.has(r.code) ? r.code : "other"}`)}</span>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="s2-btn is-primary is-wide" onClick={onClose}>{t("shop2.common.close")}</button>
    </div>
  ) : (
    <>
      <p className="s2-muted">{t("shop2.share.body")}</p>
      <label className="s2-searchbox"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("shop2.gifts.searchFriend")} aria-label={t("shop2.gifts.searchFriend")} /></label>
      <div className="s2-share-list" role="group" aria-label={t("shop2.share.title")}>
        {shown.length ? shown.map((f, i) => {
          const on = chosen.has(String(f.id));
          return (
            <button key={f.id} type="button" className={`s2-friend${on ? " is-on" : ""}`} aria-pressed={on} disabled={!on && chosen.size >= MAX} onClick={() => toggle(String(f.id))}>
              <span className={`s2-letter tone-${(i % 5) + 1}`}>{nameOf(f).charAt(0) || "?"}</span>
              <span className="s2-friend-t"><b>{nameOf(f)}</b></span>
              <span className={`s2-tick${on ? " is-on" : ""}`}><Check size={12} weight="bold" /></span>
            </button>
          );
        }) : <p className="s2-muted" aria-busy={friends == null || undefined}>{t(friends == null ? "shop2.share.loading" : "shop2.gifts.noFriends")}</p>}
      </div>
      <div className="s2-textarea">
        <textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t("shop2.share.notePh")} aria-label={t("shop2.share.note")} />
      </div>
      {err ? <p className="s2-err" role="alert">{err}</p> : null}
      <div className="s2-row">
        <span className="s2-muted s2-share-count">{t("shop2.share.chosen", { n: chosen.size, max: MAX })}</span>
        <button type="button" className="s2-btn" onClick={onClose}>{t("shop2.common.cancel")}</button>
        <button type="button" className="s2-btn is-primary" disabled={!chosen.size || busy} onClick={send}><Send size={15} />{t("shop2.share.send")}</button>
      </div>
    </>
  );
  return (
    <Layer kind={s2.layout === "phone" ? "sheet" : "dialog"} onClose={onClose} label={t("shop2.share.title")} className="s2-dialog is-share">
      <div className="s2-share">
        <div className="s2-co-head">
          <span><h3>{t("shop2.share.title")}</h3></span>
          <CloseX onClick={onClose} label={t("shop2.common.close")} />
        </div>
        {body}
      </div>
    </Layer>
  );
}
