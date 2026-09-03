import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mail, RefreshCw, Search, Trash2, Download, MessageCircle } from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import RippleButton from "../ui/RippleButton";
import { Avatar } from "../ui/Avatar";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime, formatTimeAgo } from "../../lib/datetime";
import { ConversationListSkeleton, MessageSkeleton } from "../ui/Skeleton";

export default function AdminDmInbox() {
  const { t, locale } = useLocale();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
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

  const openThread = useCallback(async (key) => {
    setActiveKey(key);
    setThreadLoading(true);
    try {
      const data = await adminFetch(`/dm/${encodeURIComponent(key)}`);
      setThread(data);
    } catch (err) {
      setError(err?.message || t("admin.loadError"));
    } finally {
      setThreadLoading(false);
    }
  }, [t]);

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
        c.last?.preview,
        c.key,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, query]);

  const exportJson = async () => {
    try {
      const data = await adminFetch("/dm/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "dm-inbox.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err?.message || t("admin.loadError"));
    }
  };

  const deleteThread = async (key) => {
    if (!window.confirm(t("admin.deleteThreadConfirm"))) return;
    try {
      await adminFetch(`/dm/${encodeURIComponent(key)}`, { method: "DELETE" });
      if (activeKey === key) {
        setActiveKey("");
        setThread(null);
      }
      await loadList();
    } catch (err) {
      setError(err?.message || t("admin.loadError"));
    }
  };

  const deleteMessage = async (msgId) => {
    if (!activeKey || !msgId) return;
    if (!window.confirm(t("admin.deleteMessageConfirm"))) return;
    try {
      await adminFetch(`/dm/${encodeURIComponent(activeKey)}/messages/${encodeURIComponent(msgId)}`, {
        method: "DELETE",
      });
      await openThread(activeKey);
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
          <RippleButton type="button" onClick={exportJson}>
            <Download size={16} />
            {t("admin.exportDm")}
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
                      onClick={() => openThread(c.key)}
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
                        <span className="admin-dm-preview">{c.last?.preview || t("admin.threadEmpty")}</span>
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
                      {m.mediaType === "image" && m.mediaUrl ? (
                        <img src={m.mediaUrl} alt="" className="admin-dm-media" />
                      ) : null}
                      <p>{m.text || m.preview}</p>
                    </motion.article>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
