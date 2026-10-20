import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Search, Users, X } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { loadPollVoters } from "../../lib/pollStore";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { foldTr } from "../../lib/slashCommands";
import { Portal, relativeTr } from "./dsxShared";
import "./dsx.css";

/** "Kim oy verdi?" (poll/05). Never opens for anonymous polls (the server refuses too). */
export default function VotersSheet({ poll, currentUserId, onClose }) {
  const reduce = useReducedMotion();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(() => poll?.options?.[0]?.id || null);
  const [q, setQ] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadPollVoters(poll).then((res) => {
      if (!alive) return;
      if (res?.ok) setData(res);
      else setError(res?.message || "Oy verenler yüklenemedi.");
    });
    return () => {
      alive = false;
    };
  }, [poll]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const snap = data?.poll || poll;
  const list = useMemo(() => {
    const rows = data?.voters?.[tab] || [];
    const f = foldTr(q).trim();
    if (!f) return rows;
    return rows.filter((u) => foldTr(`${u.displayName || ""} ${u.username || ""}`).includes(f));
  }, [data, tab, q]);

  const transition = reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.sheet);
  return (
    <Portal>
      <motion.div className="dsx-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <div className="dsx-sheetwrap">
        <motion.div
          className="dsx-heavy dsx-voters"
          role="dialog"
          aria-modal="true"
          aria-label="Kim oy verdi?"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
          transition={transition}
        >
          <div className="dsx-shd">
            <span className="ti"><Users className="dsx-ico" /></span>
            <div style={{ minWidth: 0 }}>
              <b>Kim oy verdi?</b>
              <span>
                {snap.question} · {snap.voters || 0} oy
              </span>
            </div>
            <button ref={closeRef} type="button" className="x" aria-label="Kapat" onClick={onClose}>
              <X className="dsx-ico" />
            </button>
          </div>
          <div className="dsx-vtabs" role="tablist">
            {(snap.options || []).map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                className="dsx-vtab"
                aria-selected={tab === o.id}
                onClick={() => setTab(o.id)}
              >
                {o.emoji ? <span>{o.emoji}</span> : null}
                {o.text} <b>{o.votes ?? 0}</b>
              </button>
            ))}
          </div>
          <label className="dsx-srch">
            <Search className="dsx-ico" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Oy verenlerde ara" aria-label="Oy verenlerde ara" />
          </label>
          <div className="dsx-vl" role="tabpanel">
            {error ? <div className="dsx-empty-note">{error}</div> : null}
            {!error && !data ? <div className="dsx-empty-note">Yükleniyor…</div> : null}
            {data && !list.length ? <div className="dsx-empty-note">{q ? "Eşleşen kimse yok" : "Bu seçeneğe henüz oy yok"}</div> : null}
            {list.map((u) => (
              <div key={u.id} className={`dsx-vr ${String(u.id) === String(currentUserId) ? "me" : ""}`}>
                <Avatar size={38} name={u.displayName || u.username || ""} user={u} imageUrl={u.avatarUrl || undefined} animate="never" />
                <div style={{ minWidth: 0 }}>
                  <div className="nm" style={u.color ? { color: u.color } : undefined}>
                    {u.displayName || u.username || "Bilinmeyen üye"}
                    {String(u.id) === String(currentUserId) ? " (sen)" : ""}
                  </div>
                  <div className="un">{u.username ? `@${u.username}` : ""}</div>
                </div>
                <span className="tm">{relativeTr(u.votedAt)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </Portal>
  );
}
