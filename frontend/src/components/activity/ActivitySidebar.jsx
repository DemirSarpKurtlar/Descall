import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Search,
  MessageSquarePlus,
  Plus,
  Users,
  UserPlus,
  Clock,
} from "lucide-react";
import { ActivityTypeIcon } from "../../lib/shopIcons";
import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import { getPresenceStatus, isVisiblyOnline } from "../../lib/presence";
import { openFeedbackModal } from "../../lib/feedbackNudge";
import AnnouncementsButton from "../social/AnnouncementsModal";
import { useT } from "../../context/LocaleContext";
import { TYPE_PRIORITY } from "../../lib/processDatabase";
import { GlassListHeader, GLASS_STATUS_EVENT, useGlassShell } from "../layout/glass/GlassShell";

const TYPE_COLOR = {
  game: "#23a55a",
  music: "#1db954",
  dev: "#5865f2",
  creative: "#eb459e",
  browser: "#4f9ef8",
  communication: "#5865f2",
  media: "#f0b232",
  launcher: "#747f8d",
  manual: "#5865f2",
  app: "#747f8d",
};

export function PresenceCard({ friend, presence, onlineUsers, onSelect }) {
  const t = useT();
  const glassShell = useGlassShell();
  const status = getPresenceStatus(onlineUsers, friend.id);
  const isOnline = isVisiblyOnline(onlineUsers, friend.id);
  const accentColor = presence ? TYPE_COLOR[presence.appType] || "#5865f2" : null;
  const label = friend.displayName || friend.display_name || friend.username;

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="activity-presence-card"
      style={{ borderLeftColor: accentColor || "transparent" }}
      onClick={() => onSelect?.(friend)}
    >
      <div className="activity-presence-avatar">
        <Avatar name={label} user={friend} size={glassShell ? 52 : 36} />
        <StatusBadge status={isOnline ? status : "offline"} />
      </div>
      <div className="activity-presence-info">
        <span className="activity-presence-name">{label}</span>
        {presence ? (
          <span className="activity-presence-status" style={{ color: accentColor }}>
            <span className="activity-presence-icon"><ActivityTypeIcon type={presence.appType} size={14} /></span>
            {presence.displayName}
          </span>
        ) : (
          <span className="activity-presence-idle">{t("Online")}</span>
        )}
      </div>
    </motion.button>
  );
}

export function useOnlinePresenceLists(friends, friendPresence, onlineUsers, searchQuery = "") {
  return useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const activeList = [];
    const idleList = [];
    for (const friend of friends || []) {
      const name = (friend.username || friend.displayName || "").toLowerCase();
      if (q && !name.includes(q)) continue;
      const presence = friendPresence?.[friend.id];
      const isOnline = isVisiblyOnline(onlineUsers, friend.id);
      if (!isOnline) continue;
      if (presence?.displayName) activeList.push({ friend, presence });
      else idleList.push({ friend, presence: null });
    }
    activeList.sort((a, b) => {
      const ai = TYPE_PRIORITY.indexOf(a.presence?.appType);
      const bi = TYPE_PRIORITY.indexOf(b.presence?.appType);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return { active: activeList, idle: idleList, onlineCount: activeList.length + idleList.length };
  }, [friends, friendPresence, onlineUsers, searchQuery]);
}

export default function ActivitySidebar({
  friends,
  friendPresence,
  onlineUsers,
  onAddFriend,
  onFriendSelect,
  me = null,
  myStatus = "online",
  history = [],
  currentActivity = null,
  privacy = "friends",
}) {
  const t = useT();
  const glassShell = useGlassShell();
  const searchRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [segment, setSegment] = useState("friends");
  const { active, idle, onlineCount } = useOnlinePresenceLists(
    friends,
    friendPresence,
    onlineUsers,
    searchQuery
  );

  return (
    <aside className="sidebar-secondary activity-sidebar">
      <div className="sidebar-inner">
        {glassShell ? (
          <GlassListHeader
            title={t("Activity")}
            sub={t("Your presence and history")}
            searchCollapsible
            buttons={[
              { id: "search", icon: Search, label: t("Search") },
              { id: "feedback", icon: MessageSquarePlus, label: t("Send Feedback"), onClick: () => openFeedbackModal({ type: "suggestion", source: "activity_sidebar" }) },
            ]}
            plus={{ icon: UserPlus, label: t("Add friend"), onClick: () => onAddFriend?.() }}
            search={{ value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), inputRef: searchRef, placeholder: t("Search") }}
          />
        ) : (
          <>
          <div className="sidebar-header">
            <h2 className="sidebar-title">{t("Activity")}</h2>
            <div className="sidebar-actions">
              <button
                type="button"
                className="icon-btn"
                title={t("Search")}
                onClick={() => searchRef.current?.focus()}
              >
                <Search size={18} />
              </button>
              <AnnouncementsButton />
              <button
                type="button"
                className="icon-btn"
                title={t("Send Feedback")}
                onClick={() => openFeedbackModal({ type: "suggestion", source: "activity_sidebar" })}
              >
                <MessageSquarePlus size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title={t("Add friend")}
                onClick={() => onAddFriend?.()}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div className="sidebar-search">
            <Search size={16} className="search-icon" />
            <input
              ref={searchRef}
              type="text"
              placeholder={t("Search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          </>
        )}

        <div className="sidebar-content activity-sidebar-content">
          {glassShell && (
            <>
              <div className="g-activity-status">
                <div className="g-activity-status-top">
                  <div>
                    <div className="g-activity-kicker">{t("Your status")}</div>
                    <div className="s" style={{ fontSize: 13, color: "var(--g-t3)", marginTop: 2 }}>{t("Your presence and history")}</div>
                  </div>
                  {privacy !== "hidden" && privacy !== "only-me" ? (
                    <div className="g-activity-vis"><Users size={13} /> {t("Visible to Friends")}</div>
                  ) : null}
                </div>
                <div className="g-activity-me">
                  <Avatar name={me?.displayName || me?.username || t("You")} user={me} size={44} />
                  <div>
                    <strong>{myStatus === "idle" ? t("Idle") : myStatus === "dnd" ? t("Do Not Disturb") : myStatus === "invisible" ? t("Invisible") : t("Online")}</strong>
                    <span>{me?.customStatus || me?.custom_status || currentActivity?.displayName || t("Online")}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="g-activity-set"
                  onClick={() => window.dispatchEvent(new CustomEvent(GLASS_STATUS_EVENT))}
                >
                  {t("Set Status")}
                </button>
              </div>
              <div className="g-activity-seg" role="tablist">
                <button type="button" className={segment === "friends" ? "on" : ""} onClick={() => setSegment("friends")}>
                  <Zap size={14} /> {t("Friends")}
                </button>
                <button type="button" className={segment === "history" ? "on" : ""} onClick={() => setSegment("history")}>
                  <Clock size={14} /> {t("History")}
                </button>
              </div>
            </>
          )}
          {glassShell && segment === "history" ? (
            (history || []).length > 0 ? (
              <div className="activity-history-list">
                {history.map((entry) => (
                  <div key={entry.id} className="activity-history-row">
                    <div className="activity-history-info">
                      <span className="activity-history-name">{entry.display_name || entry.displayName}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="activity-empty-state">
                <div className="activity-empty-icon"><Clock size={28} /></div>
                <p>{t("No activity history yet")}</p>
                <span>{t("Start using apps and games to see them here")}</span>
              </div>
            )
          ) : null}
          {(!glassShell || segment === "friends") && onlineCount > 0 && !glassShell && (
            <div className="activity-sidebar-summary">
              <Users size={14} />
              <span>{t("{count} online", { count: onlineCount })}</span>
            </div>
          )}

          {(!glassShell || segment === "friends") && active.length > 0 && (
            <div className="activity-sidebar-section">
              <div className="activity-sidebar-label">
                {t("Active Now — {count}", { count: active.length })}
              </div>
              <AnimatePresence initial={false}>
                {active.map(({ friend, presence }) => (
                  <PresenceCard
                    key={friend.id}
                    friend={friend}
                    presence={presence}
                    onlineUsers={onlineUsers}
                    onSelect={onFriendSelect}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {(!glassShell || segment === "friends") && idle.length > 0 && (
            <div className="activity-sidebar-section" style={{ marginTop: active.length ? 12 : 0 }}>
              <div className="activity-sidebar-label">
                {t("Online — {count}", { count: idle.length })}
              </div>
              <AnimatePresence initial={false}>
                {idle.map(({ friend }) => (
                  <PresenceCard
                    key={friend.id}
                    friend={friend}
                    presence={null}
                    onlineUsers={onlineUsers}
                    onSelect={onFriendSelect}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {(!glassShell || segment === "friends") && onlineCount === 0 && (
            <div className="activity-empty-state">
              <div className="activity-empty-icon">
                <Zap size={28} />
              </div>
              <p>{searchQuery.trim() ? t("No matches") : t("No friends online")}</p>
              <span>
                {searchQuery.trim()
                  ? t("Try a different name")
                  : t("When friends come online, their activity shows up here.")}
              </span>
              {!searchQuery.trim() && (
                <button type="button" className="activity-empty-cta" onClick={() => onAddFriend?.()}>
                  <Plus size={14} />
                  {t("Add friend")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
