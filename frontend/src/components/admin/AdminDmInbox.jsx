import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mail, RefreshCw, Search, Trash2, MessageCircle, Lock, Mic, Paperclip } from "../ui/Icon.jsx";
import { adminFetch } from "../../api/adminHttp";
import { confirmAction } from "../../lib/glassConfirm";
import RippleButton from "../ui/RippleButton";
import { Avatar } from "../ui/Avatar";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime, formatTimeAgo } from "../../lib/datetime";
import { ConversationListSkeleton, MessageSkeleton } from "../ui/Skeleton";
import OverlayPortal from "../ui/OverlayPortal.jsx";
import "../../styles/admin-dm.css";

/**
 * DM inceleme (3.7.1). The list is metadata only (who, how many, when). The
 * text of one conversation opens after a purpose + written reason; the server
 * asks for the step-up code and writes the view to the audit log. Matches the
 * privacy policy: staff read content only for a report, a security
 * investigation or a legal request.
 */
export const DM_VIEW_PURPOSES = ["report", "security", "legal"];
export const DM_REASON_MIN = 10;

export function canSubmitView(purpose, reason) {
  return DM_VIEW_PURPOSES.includes(purpose) && String(reason || "").trim().length >= DM_REASON_MIN;
}

function ViewReasonDialog({ conversation, onCancel, onSubmit, busy, error, t }) {
  const [purpose, setPurpose] = useState("report");
  const [reason, setReason] = useState("");
  const [left, right] = conversation?.users || [];
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const ok = canSubmitView(purpose, reason);
  return (
    <OverlayPortal>
      <div className="adm-dmv-scrim" onClick={onCancel} role="presentation">
        <form
          className="adm-dmv-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adm-dmv-title"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => { e.preventDefault(); if (ok && !busy) onSubmit({ purpose, reason: reason.trim() }); }}
        >
          <div className="adm-dmv-icon"><Lock size={20} /></div>
          <h3 id="adm-dmv-title">{t("admin.dmViewTitle")}</h3>
          <p className="adm-dmv-who">{t("admin.vs", { a: left?.username || "-", b: right?.username || "-" })}</p>
          <p className="adm-dmv-note">{t("admin.dmViewNote")}</p>
          <div className="adm-dmv-purposes" role="radiogroup" aria-label={t("admin.dmViewPurpose")}>
            {DM_VIEW_PURPOSES.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={purpose === id} className={purpose === id ? "is-on" : ""} onClick={() => setPurpose(id)}>
                {t(`admin.dmPurpose_${id}`)}
              </button>
            ))}
          </div>
          <label className="adm-dmv-label" htmlFor="adm-dmv-reason">{t("admin.dmViewReason")}</label>
          <textarea id="adm-dmv-reason" className="admin-input" rows={3} maxLength={300} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} placeholder={t("admin.dmViewReasonPh")} />
          <span className="adm-dmv-count">{reason.trim().length < DM_REASON_MIN ? t("admin.dmViewReasonMin", { n: DM_REASON_MIN }) : ""}</span>
          {error ? <p className="admin-inline-error">{error}</p> : null}
          <div className="adm-dmv-actions">
            <button type="button" className="adm-dmv-cancel" onClick={onCancel}>{t("Cancel")}</button>
            <button type="submit" className="adm-dmv-go" disabled={!ok || busy}>{busy ? t("admin.dmViewOpening") : t("admin.dmViewOpen")}</button>
          </div>
        </form>
      </div>
    </OverlayPortal>
  );
}

export default function AdminDmInbox() {
  const { t, locale } = useLocale();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [asking, setAsking] = useState(null);
  const [askError, setAskError] = useState("");
  const [viewMeta, setViewMeta] = useState(null);
  const messagesRef = useRef(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch("/dm/conversations");
      setConversations(data.conversations || []);
    } catch (err) {
      setError(err?.message || t("admin.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const openThread = useCallback(async (conversation, { purpose, reason }) => {
    setThreadLoading(true);
    setAskError("");
    try {
      const data = await adminFetch(`/dm/${encodeURIComponent(conversation.key)}/view`, {
        method: "POST",
        body: JSON.stringify({ purpose, reason }),
      });
      setActiveKey(conversation.key);
      setThread(data);
      setViewMeta({ purpose, reason, at: data?.viewedAt || new Date().toISOString() });
      setAsking(null);
    } catch (err) {
      setAskError(err?.message || t("admin.loadError"));
    } finally {
      setThreadLoading(false);
    }
  }, [t]);

  const reopen = useCallback(async () => {
    if (!activeKey || !viewMeta) return;
    const conv = conversations.find((c) => c.key === activeKey) || { key: activeKey };
    await openThread(conv, viewMeta);
  }, [activeKey, viewMeta, conversations, openThread]);

  useEffect(() => {
    loadList().catch(() => {});
  }, [loadList]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread?.messages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const hay = [
        ...(c.users || []).map((u) => `${u.username} ${u.displayName}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, query]);

  const deleteThread = async (key) => {
    if (!(await confirmAction({
      message: t("admin.deleteThreadConfirm"),
      confirmLabel: t("Delete"),
      cancelLabel: t("Cancel"),
    }))) return;
    try {
      await adminFetch(`/dm/${encodeURIComponent(key)}`, { method: "DELETE" });
      if (activeKey === key) {
        setActiveKey("");
        setThread(null);
        setViewMeta(null);
      }
      await loadList();
    } catch (err) {
      setError(err?.message || t("admin.loadError"));
    }
  };

  const deleteMessage = async (msgId) => {
    if (!activeKey || !msgId) return;
    if (!(await confirmAction({
      message: t("admin.deleteMessageConfirm"),
      confirmLabel: t("Delete"),
      cancelLabel: t("Cancel"),
    }))) return;
    try {
      await adminFetch(`/dm/${encodeURIComponent(activeKey)}/messages/${encodeURIComponent(msgId)}`, {
        method: "DELETE",
      });
      setThread((th) => (th ? { ...th, messages: (th.messages || []).filter((m) => m.id !== msgId) } : th));
      await loadList();
    } catch (err) {
      setError(err?.message || t("admin.loadError"));
    }
  };

  const leftId = thread?.users?.[0]?.id;

  return (
    <section className="admin-section admin-dm-inbox">
      <div className="activity-header">
        <div className="activity-title-section">
          <h2>{t("admin.dmInboxTitle")}</h2>
          <p className="activity-subtitle">{t("admin.dmInboxSubtitle")}</p>
        </div>
        <div className="admin-row">
          <span className="muted">{t("admin.threadCount", { count: conversations.length })}</span>
          <RippleButton type="button" onClick={loadList} disabled={loading} className="refresh-btn">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            {t("Refresh")}
          </RippleButton>
        </div>
      </div>

      {error ? <p className="admin-inline-error">{error}</p> : null}

      <div className="admin-dm-layout">
        <div className="admin-dm-list">
          <label className="admin-leaderboard-search">
            <Search size={14} />
            <input
              className="admin-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("admin.dmSearch")}
            />
          </label>
          {loading && !conversations.length ? (
            <ConversationListSkeleton count={6} />
          ) : filtered.length === 0 ? (
            <div className="empty-state compact">
              <Mail size={32} className="empty-icon" />
              <p>{t("admin.noDmThreads")}</p>
            </div>
          ) : (
            <ul>
              {filtered.map((c) => {
                const [left, right] = c.users || [];
                const title = t("admin.vs", {
                  a: left?.displayName || left?.username || "—",
                  b: right?.displayName || right?.username || "—",
                });
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      className={`admin-dm-item ${activeKey === c.key ? "is-active" : ""}`}
                      onClick={() => { setAskError(""); setAsking(c); }}
                    >
                      <div className="admin-dm-avatars">
                        <span className={`admin-dm-avatar-wrap ${left?.isOnline ? "is-online" : ""}`}>
                          <Avatar user={left} name={left?.username} size={32} />
                        </span>
                        <span className={`admin-dm-avatar-wrap ${right?.isOnline ? "is-online" : ""}`}>
                          <Avatar user={right} name={right?.username} size={32} />
                        </span>
                      </div>
                      <div className="admin-dm-item-meta">
                        <strong>{title}</strong>
                        <span className="muted">
                          {t("{count} msgs", { count: c.messageCount })}
                          {c.lastAt ? ` · ${formatTimeAgo(c.lastAt, t, undefined, locale)}` : ""}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="admin-dm-thread">
          {!activeKey ? (
            <div className="empty-state">
              <MessageCircle size={40} className="empty-icon" />
              <h3>{t("admin.selectThread")}</h3>
              <p className="muted">{t("admin.dmSelectNote")}</p>
            </div>
          ) : threadLoading ? (
            <MessageSkeleton count={6} />
          ) : (
            <>
              <div className="admin-dm-thread-head">
                <div className="admin-dm-thread-people">
                  {(thread?.users || []).map((u) => (
                    <div key={u.id} className="admin-dm-person">
                      <Avatar user={u} name={u.displayName || u.username} size={28} />
                      <strong>{u.displayName || u.username}</strong>
                      {u.displayName && u.displayName !== u.username ? <span className="muted">@{u.username}</span> : null}
                    </div>
                  ))}
                  <p className="muted">{t("{count} msgs", { count: thread?.messages?.length || 0 })}</p>
                </div>
                <RippleButton type="button" className="danger" onClick={() => deleteThread(activeKey)}>
                  <Trash2 size={14} />
                  {t("admin.deleteThread")}
                </RippleButton>
              </div>
              {viewMeta ? (
                <p className="adm-dmv-banner">
                  <Lock size={14} />
                  <span>{t("admin.dmViewLogged", { purpose: t(`admin.dmPurpose_${viewMeta.purpose}`), when: formatAppDateTime(viewMeta.at, locale) })}</span>
                  <button type="button" onClick={reopen} disabled={threadLoading}>{t("Refresh")}</button>
                </p>
              ) : null}
              <div className="admin-dm-messages" ref={messagesRef}>
                {(thread?.messages || []).length === 0 ? (
                  <p className="muted">{t("admin.threadEmpty")}</p>
                ) : (
                  (thread.messages || []).map((m) => (
                    <motion.article
                      key={m.id}
                      className={`admin-dm-bubble ${m.fromUserId === leftId ? "is-left" : "is-right"}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <header>
                        <strong>{m.fromDisplayName || m.fromUsername}</strong>
                        <span>{m.timestamp ? formatAppDateTime(m.timestamp, locale) : ""}</span>
                        {m.readAt ? <em>{t("admin.read")}</em> : <em>{t("admin.unread")}</em>}
                        <button type="button" onClick={() => deleteMessage(m.id)} aria-label={t("Delete")}>
                          <Trash2 size={12} />
                        </button>
                      </header>
                      {m.kind === "image" && m.mediaUrl ? (
                        <img src={m.mediaUrl} alt="" className="admin-dm-media" />
                      ) : null}
                      {m.kind === "voice" ? (
                        <p className="adm-dmv-kind"><Mic size={14} /> {t("admin.dmKindVoice")}</p>
                      ) : m.kind === "file" ? (
                        <p className="adm-dmv-kind"><Paperclip size={14} /> {t("admin.dmKindFile")}</p>
                      ) : m.text ? (
                        <p>{m.text}</p>
                      ) : null}
                    </motion.article>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {asking ? (
        <ViewReasonDialog
          conversation={asking}
          busy={threadLoading}
          error={askError}
          t={t}
          onCancel={() => setAsking(null)}
          onSubmit={(v) => openThread(asking, v)}
        />
      ) : null}
    </section>
  );
}
