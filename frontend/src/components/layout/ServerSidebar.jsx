import { useState, useMemo, useEffect, useRef, useLayoutEffect } from "react";
import { rowMenuMotion, rowMenuOrigin } from "../../lib/rowMenuMotion";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Hash, Phone, MessageSquare, ChevronDown, Bell, UserPlus, X, User, Users, MoreHorizontal, LogOut, Edit3, Check, UserRoundPlus, RefreshCw, Link2, Loader2, UsersRound, Pin, PinOff, BellOff, Mail, MailOpen, CircleSlash, Flag, ImagePlus, ImageOff } from "../ui/Icon.jsx";
import GroupIcon from "../groups/GroupIcon";
import { useGroupPhotoChanger } from "../groups/useGroupPhotoChanger";
import { groupAvatarUrl } from "../../lib/avatarFile";
import { MagnifyingGlass as Search, Megaphone, Chat as MessageSquarePlus, Plus } from "./phosphorInline.jsx";
import SwipeRevealRow, { swipeActionsWidth } from "./SwipeRevealRow";
import GlassConfirm from "../ui/GlassConfirm";
import { copyText } from "../../lib/copyText";
import CallsView from "../calls/CallsView";
import PullToRefresh from "../ui/PullToRefresh";
import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import { getToken } from "../../lib/storage";
import { API_BASE_URL } from "../../config/api";
import { announcementIcon, loadAnnouncements, loadUnreadAnnouncementCount, markAnnouncementRead } from "../../lib/announcements";
import { renameGroup as renameGroupApi } from "../../api/groups";
import { getFriendSuggestions, sendFriendRequest } from "../../api/friends";
import { resolveDisplayName } from "../../lib/userProfile";
import { getPresenceStatus, isVisiblyOnline, STATUS_META } from "../../lib/presence";
import GroupInviteModal from "../groups/GroupInviteModal";
import GroupRenameSheet from "../groups/GroupRenameSheet";
import { useToast } from "../../context/ToastContext";
import GroupAddMemberSheet from "../groups/GroupAddMemberSheet";
import "../groups/GroupMenu.css";
import { openFeedbackModal } from "../../lib/feedbackNudge";
import { useLocale, useT } from "../../context/LocaleContext";
import { displayText } from "../../lib/profanity";
import { localizeListPreview } from "../../lib/listPreview";
import { confirmToggleBlock, useBlockedUserIds } from "../../lib/blockedUsers";
import ReportUserModal from "../social/ReportUserModal";
import AdminBadge from "../social/AdminBadge";
import InviteCard from "../friends/InviteCard";
import { BlockListSkeleton, ConversationListSkeleton } from "../ui/Skeleton";
import { parseAppDate, formatMessageClock, formatMessageDate } from "../../lib/datetime";
import { GlassListHeader, useGlassShell } from "./glass/GlassShell";
import { framerSpring, SPRINGS } from "../../lib/fluid/springs";
import { hapticImpactMedium } from "../../lib/fluid/haptics";
import useGlassUi from "../../hooks/useGlassUi";
import { requestChatPrefetch } from "../../lib/chatPrefetch";



export default function ServerSidebar({
  collapsed,
  onToggleCollapse,
  activeView,
  activeDmUser,
  activeGroup,
  groups,
  dms,
  friends,
  onlineUsers,
  socket,
  onDmSelect,
  onGroupSelect,
  onFriendSelect,
  showAddModal: showAddModalProp,
  setShowAddModal: setShowAddModalProp,
  addTab: addTabProp,
  setAddTab: setAddTabProp,
  onRefreshGroups,
  onRefresh,
  onGroupCreated,
  onGroupLeft,
  onGroupRenamed,
  onGroupMemberAdded,
  onGroupAvatarChanged,
  friendRequests,
  messageRequests,
  onAcceptFriend,
  onDeclineFriend,
  onAcceptMessageRequest,
  onDeclineMessageRequest,
  onMobileClose,
  isMobile = false,
  dmUnread = {},
  groupUnread = {},
  me = null,
  friendsLoaded = true,
  groupsLoaded = true,
  onStartCall,
  onOpenChatFromCalls,
  onStartGroupCall,
  onOpenGroupFromCalls,
  onDmPrefAction,
}) {
  const t = useT();
  const glassShell = useGlassShell();
  const [searchQuery, setSearchQuery] = useState("");
  // Calls history lives in CallsView; it hands us its refetch.
  const callsRefreshRef = useRef(null);
  // Pull-to-refresh / header refresh: real server refetch for this list.
  const refreshList = () => {
    const work = [Promise.resolve(onRefresh?.({ force: true }))];
    if (activeView === "groups") work.push(Promise.resolve(onRefreshGroups?.()));
    if (activeView === "calls" && callsRefreshRef.current) work.push(Promise.resolve(callsRefreshRef.current()));
    return Promise.allSettled(work);
  };
  const [expandedSections, setExpandedSections] = useState({
    dms: true,
    groups: true,
    friends: true,
  });
  const [internalShowAddModal, setInternalShowAddModal] = useState(false);
  const [internalAddTab, setInternalAddTab] = useState("friend");
  const showAddModal = showAddModalProp ?? internalShowAddModal;
  const setShowAddModal = setShowAddModalProp ?? setInternalShowAddModal;
  const addTab = addTabProp ?? internalAddTab;
  const setAddTab = setAddTabProp ?? setInternalAddTab;
  const [friendUsername, setFriendUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState("");
  const [announcementUnread, setAnnouncementUnread] = useState(0);
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState("");
  const [sentUsernames, setSentUsernames] = useState(() => new Set());

  useEffect(() => {
    if (!socket) return;
    const onFriendError = ({ message }) => {
      setAddError(message || t("Friend action failed."));
      setTimeout(() => setAddError(""), 4000);
    };
    const onFriendSent = ({ to } = {}) => {
      setAddSuccess(to ? t("Request sent to {to}", { to }) : t("Request sent."));
      setTimeout(() => setAddSuccess(""), 3000);
      if (to) setSentUsernames((prev) => new Set(prev).add(to));
    };
    socket.on("friend:error", onFriendError);
    socket.on("friend:request:sent", onFriendSent);
    return () => {
      socket.off("friend:error", onFriendError);
      socket.off("friend:request:sent", onFriendSent);
    };
  }, [socket, t]);

  useEffect(() => {
    if (!glassShell) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const count = await loadUnreadAnnouncementCount(API_BASE_URL, getToken());
        if (!cancelled && count != null && count > 0) setAnnouncementUnread(count);
      } catch {
        /* no count in this response, leave the badge off */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [glassShell]);

  useEffect(() => {
    if (!showAnnouncements) return undefined;
    let cancelled = false;
    (async () => {
      setAnnouncementsLoading(true);
      setAnnouncementsError("");
      try {
        const rows = await loadAnnouncements(API_BASE_URL, getToken());
        if (!cancelled) {
          setAnnouncements(rows);
          if (glassShell) {
            setAnnouncementUnread(0);
            const token = getToken();
            for (const row of rows) markAnnouncementRead(API_BASE_URL, token, row.id);
          }
        }
      } catch (err) {
        console.error("Failed to load announcements:", err);
        if (!cancelled) {
          setAnnouncements([]);
          setAnnouncementsError(t("Failed to load announcements"));
        }
      } finally {
        if (!cancelled) setAnnouncementsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAnnouncements, t, glassShell]);

  const fetchSuggestions = async () => {
    setSuggestionsLoading(true);
    setSuggestionsError("");
    try {
      const data = await getFriendSuggestions(14);
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (err) {
      setSuggestionsError(err.message || t("Failed to load suggestions"));
    } finally {
      setSuggestionsLoading(false);
    }
  };

  useEffect(() => {
    if (showAddModal && addTab === "quickadd") {
      fetchSuggestions();
    }
  }, [showAddModal, addTab]);

  const handleQuickAdd = (username) => {
    if (!username || sentUsernames.has(username)) return;
    if (socket?.connected) {
      socket.emit("friend:request", { toUsername: username });
    } else {
      sendFriendRequest(username).catch(() => {
        setSentUsernames((prev) => {
          const next = new Set(prev);
          next.delete(username);
          return next;
        });
      });
    }
    // Optimistic, friend:request:sent / friend:error confirm or roll this back.
    setSentUsernames((prev) => new Set(prev).add(username));
  };

  const handleAddFriend = async () => {
    if (!friendUsername.trim()) return;
    setAddLoading(true);
    setAddError("");
    setAddSuccess("");
    try {
      const username = friendUsername.trim();
      if (socket?.connected) {
        socket.emit("friend:request", { toUsername: username });
      } else {
        await sendFriendRequest(username);
      }
      setFriendUsername("");
      setAddSuccess(t("Request sent to {to}", { to: username }));
      setTimeout(() => setAddSuccess(""), 3000);
    } catch (err) {
      setAddError(err.message || t("Failed to send friend request"));
    } finally {
      setAddLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setAddLoading(true);
    setAddError("");
    setAddSuccess("");
    try {
      const token = getToken();
      const url = `${API_BASE_URL}/groups/create`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          name: groupName.trim(),
          memberIds: selectedGroupMembers.map(m => m.id)
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || t("Failed to create group (status {status})", { status: res.status }));
      setAddSuccess(t('Group "{name}" created', { name: groupName.trim() }));
      setGroupName("");
      setSelectedGroupMembers([]);
      setTimeout(() => setAddSuccess(""), 3000);
      setShowAddModal(false);
      // Optimistically add the new group immediately, then do a background refresh
      if (data.group) onGroupCreated?.(data.group);
      onRefreshGroups?.();
    } catch (err) {
      setAddError(err.message || t("Network error. Is backend deployed?"));
    } finally {
      setAddLoading(false);
    }
  };

  const toggleGroupMember = (friend) => {
    setSelectedGroupMembers(prev => {
      const exists = prev.find(m => m.id === friend.id);
      if (exists) {
        return prev.filter(m => m.id !== friend.id);
      } else {
        return [...prev, friend];
      }
    });
  };

  const filteredDms = useMemo(() => {
    if (!Array.isArray(dms)) return [];
    if (!searchQuery) return dms;
    return dms.filter(dm => 
      (dm.displayName || dm.username || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [dms, searchQuery]);


  const filteredGroups = useMemo(() => {
    if (!Array.isArray(groups)) return [];
    if (!searchQuery) return groups;
    return groups.filter(group =>
      group.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [groups, searchQuery]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (collapsed) {
    return null; // Collapsed state handled by parent
  }

  return (
    <aside className="sidebar-secondary">
      <div className="sidebar-inner">
        {glassShell ? (
          <GlassListHeader
            title={
              activeView === "dms"
                ? t("Direct Messages")
                : activeView === "groups"
                  ? t("Groups")
                  : activeView === "friends"
                    ? t("Friends")
                    : activeView === "calls"
                      ? t("Calls")
                      : t("Chats")
            }
            sub={activeView === "calls" ? t("Quick-dial friends or jump back into recent DM & group calls.") : ""}
            searchCollapsible={activeView === "calls"}
            buttons={
              activeView === "calls"
                ? [
                    { id: "search", icon: Search, label: t("Search") },
                    { id: "refresh", icon: RefreshCw, label: t("Refresh"), onClick: () => refreshList() },
                  ]
                : [
                    { id: "search", icon: Search, label: t("Search") },
                    { id: "announcements", icon: Megaphone, label: t("Announcements"), badge: announcementUnread > 0 ? announcementUnread : undefined, onClick: () => setShowAnnouncements(!showAnnouncements) },
                    { id: "feedback", icon: MessageSquarePlus, label: t("Send Feedback"), onClick: () => openFeedbackModal({ type: "suggestion", source: "server_sidebar" }) },
                  ]
            }
            plus={
              activeView === "calls"
                ? null
                : {
                    label: t("Add"),
                    onClick: () => {
                      setShowAddModal(true);
                      setAddTab(activeView === "groups" ? "group" : "friend");
                      setAddError("");
                      setAddSuccess("");
                    },
                  }
            }
            search={{ value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: t("Search") }}
          />
        ) : (
          <>
        {/* Header */}
          <div className="sidebar-header">
            <h2 className="sidebar-title">
              {activeView === "chat" && t("Chats")}
              {activeView === "dms" && t("Direct Messages")}
              {activeView === "groups" && t("Groups")}
              {activeView === "friends" && t("Friends")}
              {activeView === "calls" && t("Calls")}
            </h2>
            <div className="sidebar-actions">
              <button
                className="icon-btn"
                title={t("Search")} aria-label={t("Search")}
                onClick={() => {
                  const searchInput = document.querySelector('.search-input');
                  searchInput?.focus();
                }}
              >
                <Search size={18} />
              </button>
              <button
                className="icon-btn"
                title={t("Announcements")} aria-label={t("Announcements")}
                onClick={() => setShowAnnouncements(!showAnnouncements)}
              >
                <Megaphone size={18} />
              </button>
              <button
                className="icon-btn"
                title={t("Send Feedback")} aria-label={t("Send Feedback")}
                onClick={() => openFeedbackModal({ type: "suggestion", source: "server_sidebar" })}
              >
                <MessageSquarePlus size={18} />
              </button>
              <button
                className="icon-btn"
                title={t("Add")} aria-label={t("Add")}
                onClick={() => {
                  setShowAddModal(true);
                  setAddTab(activeView === "groups" ? "group" : "friend");
                  setAddError("");
                  setAddSuccess("");
                }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="sidebar-search">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder={t("Search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          </>
        )}

        {/* Content */}
        <div className="sidebar-content">
          <PullToRefresh enabled={isMobile} onRefresh={refreshList}>
          {(activeView === "chat" || activeView === "dms") && (
            <DMList
              dms={filteredDms}
              activeDmUser={activeDmUser}
              onlineUsers={onlineUsers}
              expanded={expandedSections.dms}
              onToggle={() => toggleSection("dms")}
              onDmSelect={onDmSelect}
              isMobile={isMobile}
              unreadById={dmUnread}
              loading={!friendsLoaded}
              onAddFriend={() => { setAddTab("friend"); setShowAddModal(true); }}
              onPrefAction={onDmPrefAction}
            />
          )}

          {activeView === "groups" && (
            <GroupList
              groups={filteredGroups}
              friends={friends}
              activeGroup={activeGroup}
              expanded={expandedSections.groups}
              onToggle={() => toggleSection("groups")}
              onGroupSelect={onGroupSelect}
              onGroupLeft={onGroupLeft}
              onGroupRenamed={onGroupRenamed}
              onGroupMemberAdded={onGroupMemberAdded}
              onGroupAvatarChanged={onGroupAvatarChanged}
              isMobile={isMobile}
              unreadById={groupUnread}
              loading={!groupsLoaded}
              onCreateGroup={() => { setAddTab("group"); setShowAddModal(true); }}
            />
          )}

          {activeView === "friends" && (
            <FriendsList
              friends={friends}
              onlineUsers={onlineUsers}
              expanded={expandedSections.friends}
              onToggle={() => toggleSection("friends")}
              onFriendSelect={onFriendSelect}
              onStartCall={onStartCall}
              searchQuery={searchQuery}
              friendRequests={friendRequests}
              messageRequests={messageRequests}
              onAcceptFriend={onAcceptFriend}
              onDeclineFriend={onDeclineFriend}
              onAcceptMessageRequest={onAcceptMessageRequest}
              onDeclineMessageRequest={onDeclineMessageRequest}
              isMobile={isMobile}
              loading={!friendsLoaded}
              me={me}
              onShareInvite={async () => {
                try {
                  const { buildFriendInviteUrl, toPublicShareUrl } = await import("../../lib/referral");
                  const { Funnel } = await import("../../site/analytics");
                  const url = toPublicShareUrl(buildFriendInviteUrl(me?.username));
                  await copyText(url);
                  Funnel.inviteGenerated({ method: "empty_state", username: me?.username });
                  setAddSuccess(t("Invite link copied"));
                  setTimeout(() => setAddSuccess(""), 3000);
                } catch {
                  setAddError(t("Could not copy invite link"));
                  setTimeout(() => setAddError(""), 3000);
                }
              }}
              onQuickAdd={() => { setAddTab("quickadd"); setShowAddModal(true); }}
            />
          )}

          {/* Canonical Calls UI lives in ChatPanel, sidebar only offers contacts. */}
          {activeView === "calls" && glassShell ? (
            <CallsView
              me={me}
              friends={friends}
              groups={groups}
              onlineUsers={onlineUsers}
              socket={socket}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onStartCall={onStartCall}
              onStartGroupCall={onStartGroupCall}
              onOpenChat={onOpenChatFromCalls}
              onOpenGroup={onOpenGroupFromCalls}
              refreshRef={callsRefreshRef}
            />
          ) : activeView === "calls" && (
            <FriendsList
              friends={friends}
              onlineUsers={onlineUsers}
              expanded={expandedSections.friends}
              onToggle={() => toggleSection("friends")}
              onFriendSelect={(user) => {
                onOpenChatFromCalls?.(user);
                onMobileClose?.();
              }}
              friendRequests={friendRequests}
              messageRequests={messageRequests}
              onAcceptFriend={onAcceptFriend}
              onDeclineFriend={onDeclineFriend}
              onAcceptMessageRequest={onAcceptMessageRequest}
              onDeclineMessageRequest={onDeclineMessageRequest}
              isMobile={isMobile}
              me={me}
              loading={!friendsLoaded}
              showInvite={false}
              onQuickAdd={() => { setAddTab("quickadd"); setShowAddModal(true); }}
            />
          )}
          </PullToRefresh>
        </div>

        {/* Add Friend / Create Group Modal, portal to body (sidebar contain traps fixed) */}
        {createPortal(
        <AnimatePresence>
          {showAddModal && (
            <motion.div
              className={`add-modal-backdrop${glassShell ? " g-scrim g-add-scrim" : ""}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
            >
              <motion.div
                className={`add-modal${glassShell ? " g-add-sheet g-glass g-heavy" : ""}`}
                initial={glassShell ? { y: 28, opacity: 0 } : { scale: 0.9, opacity: 0, y: 20 }}
                animate={glassShell ? { y: 0, opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
                exit={glassShell ? { y: 28, opacity: 0 } : { scale: 0.9, opacity: 0, y: 20 }}
                transition={glassShell ? framerSpring(SPRINGS.sheet) : { type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                {glassShell ? <div className="g-grabber" aria-hidden="true" /> : null}
                <div className="add-modal-header">
                  <h3>{t("Create New")}</h3>
                  <button className="icon-btn" onClick={() => setShowAddModal(false)} aria-label={t("Close")}><X size={18} /></button>
                </div>

                <div className="add-modal-tabs">
                  <button className={`add-modal-tab ${addTab === "quickadd" ? "active" : ""}`} onClick={() => { setAddTab("quickadd"); setAddError(""); setAddSuccess(""); }}>
                    <UserPlus size={16} /> {t("Quick Add")}
                  </button>
                  <button className={`add-modal-tab ${addTab === "friend" ? "active" : ""}`} onClick={() => { setAddTab("friend"); setAddError(""); setAddSuccess(""); }}>
                    <User size={16} /> {glassShell ? t("Friend") : t("Add Friend")}
                  </button>
                  <button className={`add-modal-tab ${addTab === "group" ? "active" : ""}`} onClick={() => { setAddTab("group"); setAddError(""); setAddSuccess(""); }}>
                    <Users size={16} /> {glassShell ? t("Group") : t("Create Group")}
                  </button>
                </div>

                <div className="add-modal-body">
                  {addTab === "quickadd" && (
                    <div className="quick-add-panel">
                      <p className="quick-add-intro">
                        {t("People you may know, ranked by mutual friends and shared groups.")}
                      </p>
                      {suggestionsLoading ? (
                        <div className="quick-add-loading">
                          <Loader2 size={22} className="spin" />
                          <span>{t("Finding people you may know...")}</span>
                        </div>
                      ) : suggestionsError ? (
                        <div className="quick-add-empty">
                          <span>{suggestionsError}</span>
                          <button type="button" className="add-modal-btn" onClick={fetchSuggestions}>
                            <RefreshCw size={14} /> {t("Try again")}
                          </button>
                        </div>
                      ) : suggestions.length === 0 ? (
                        <div className="quick-add-empty">
                          <UsersRound size={28} style={{ opacity: 0.5 }} />
                          <span>{t("No suggestions right now, check back after you join a few groups or make some friends.")}</span>
                        </div>
                      ) : (
                        <div className="quick-add-list">
                          {suggestions.map((s) => {
                            const sent = sentUsernames.has(s.username);
                            return (
                              <motion.div
                                key={s.id}
                                className="quick-add-card"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18 }}
                              >
                                <Avatar user={s} size={40} />
                                <div className="quick-add-card-meta">
                                  <span className="quick-add-card-name">{s.displayName || s.username}</span>
                                  {s.reason === "mutual" ? (
                                    <span className="quick-add-card-badge mutual">
                                      <UsersRound size={11} />
                                      {t("{count} mutual friends", { count: s.mutualFriends })}
                                    </span>
                                  ) : s.reason === "group" ? (
                                    <span className="quick-add-card-badge group">
                                      <Hash size={11} />
                                      {t("{count} shared groups", { count: s.sharedGroups })}
                                    </span>
                                  ) : (
                                    <span className="quick-add-card-badge suggested">
                                      {t("Suggested for you")}
                                    </span>
                                  )}
                                </div>
                                <motion.button
                                  type="button"
                                  className={`quick-add-btn ${sent ? "sent" : ""}`}
                                  whileTap={{ scale: 0.94 }}
                                  disabled={sent}
                                  onClick={() => handleQuickAdd(s.username)}
                                >
                                  {sent ? <Check size={15} /> : <UserPlus size={15} />}
                                  {sent ? t("Sent") : t("Add")}
                                </motion.button>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {addTab === "friend" && (
                    <>
                      <label className="add-modal-label">{t("Enter a username to add")}</label>
                      {glassShell ? (
                        <div className="g-add-field">
                          <User size={18} aria-hidden />
                          <input className="add-modal-input" value={friendUsername} onChange={(e) => setFriendUsername(e.target.value)} placeholder={t("e.g. johndoe")} onKeyDown={(e) => e.key === "Enter" && handleAddFriend()} />
                        </div>
                      ) : (
                        <input className="add-modal-input" value={friendUsername} onChange={(e) => setFriendUsername(e.target.value)} placeholder={t("e.g. johndoe")} onKeyDown={(e) => e.key === "Enter" && handleAddFriend()} />
                      )}
                      <motion.button type="button" className="add-modal-btn" onClick={handleAddFriend} disabled={addLoading || !friendUsername.trim()} whileTap={{ scale: 0.97 }}>
                        {glassShell && !addLoading ? <UserPlus size={18} /> : null}
                        {addLoading ? t("Sending...") : t("Send Friend Request")}
                      </motion.button>
                      {glassShell ? <p className="g-add-hint">{t("Send a friend request with their username")}</p> : null}
                    </>
                  )}
                  {addTab === "group" && (
                    <>
                      <label className="add-modal-label">{t("Group name")}</label>
                      <input className="add-modal-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t("e.g. Gaming Squad")} onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()} />
                      
                      <label className="add-modal-label" style={{ marginTop: 12 }}>{t("Add members (optional)")}</label>
                      <div className="group-members-select" style={{ maxHeight: 150, overflowY: "auto", marginBottom: 12 }}>
                        {Array.isArray(friends) && friends.length > 0 ? (
                          friends.map(friend => {
                            const isSelected = selectedGroupMembers.find(m => m.id === friend.id);
                            return (
                              <div
                                key={friend.id}
                                className={`group-member-option ${isSelected ? "selected" : ""}`}
                                onClick={() => toggleGroupMember(friend)}
                                style={{
                                  padding: 8,
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  backgroundColor: isSelected ? "var(--primary-soft)" : "var(--surface-2)",
                                  marginBottom: 4
                                }}
                              >
                                <Avatar user={friend} size={24} />
                                <span style={{ fontSize: 13 }}>{resolveDisplayName(friend)}</span>
                                {isSelected && <span style={{ marginLeft: "auto", color: "var(--primary)" }}>✓</span>}
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ padding: 8, color: "var(--text-muted)", fontSize: 12 }}>
                            {t("No friends to add. Add friends first.")}
                          </div>
                        )}
                      </div>
                      
                      <motion.button type="button" className="add-modal-btn" onClick={handleCreateGroup} disabled={addLoading || !groupName.trim()} whileTap={{ scale: 0.97 }}>
                        {addLoading ? t("Creating...") : t("Create Group")}
                      </motion.button>
                    </>
                  )}
                  {addError && <div className="add-modal-error">{addError}</div>}
                  {addSuccess && <div className="add-modal-success">{addSuccess}</div>}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
        )}

        {/* Announcements Modal, portal to body */}
        {createPortal(
        <AnimatePresence>
          {showAnnouncements && (
              <motion.div
                className={`add-modal-backdrop${glassShell ? " g-scrim g-announce-scrim" : ""}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAnnouncements(false)}
              >
                <motion.div
                  className={`add-modal${glassShell ? " g-announce" : ""}`}
                  initial={glassShell ? { opacity: 0 } : { scale: 0.9, opacity: 0, y: 20 }}
                  animate={glassShell ? { opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
                  exit={glassShell ? { opacity: 0 } : { scale: 0.9, opacity: 0, y: 20 }}
                  transition={glassShell ? { duration: 0.18 } : { type: "spring", damping: 25, stiffness: 300 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="add-modal-header">
                    <h3>{glassShell ? `📢 ${t("Announcements")}` : "📢 Announcements"}</h3>
                  <button className="icon-btn" onClick={() => setShowAnnouncements(false)} aria-label={t("Close")}><X size={18} /></button>
                </div>

                <div className="announcements-modal-content">
                  {announcementsLoading ? (
                    <BlockListSkeleton count={4} label={t("Loading announcements...")} />
                  ) : announcementsError ? (
                    <div className={glassShell ? "announcements-empty" : undefined} style={glassShell ? undefined : { padding: "16px", color: "var(--text-muted)", fontSize: "14px", textAlign: "center" }}>{announcementsError}</div>
                  ) : announcements.length === 0 ? (
                    <div className={glassShell ? "announcements-empty" : undefined} style={glassShell ? undefined : { padding: "16px", color: "var(--text-muted)", fontSize: "14px", textAlign: "center" }}>{t("No announcements")}</div>
                  ) : (
                    announcements.map((a) => {
                      const AnnIcon = glassShell ? announcementIcon(a.emoji) : null;
                      return (
                      <div key={a.id} className="announcement-item">
                        {glassShell ? (
                          <span className="g-ann-mark" style={a.color ? { background: a.color } : undefined} aria-hidden="true">
                            {AnnIcon ? <AnnIcon size={18} strokeWidth={2} /> : (a.emoji || "📢")}
                          </span>
                        ) : null}
                        <div className="announcement-title">{a.title}</div>
                        <div className="announcement-content">{a.content}</div>
                        <div className="announcement-meta">
                          {a.author && <span className="announcement-author">{t("By {author}", { author: a.author })}</span>}
                          {a.createdAt && <span className="announcement-date">{glassShell ? glassAnnouncementWhen(a.createdAt) : new Date(a.createdAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
        )}
      </div>
    </aside>
  );
}

function SidebarSectionContent({ expanded, children }) {
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          key="section-body"
          className="section-content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ overflow: "hidden" }}
        >
          <motion.div
            initial={{ y: -6 }}
            animate={{ y: 0 }}
            exit={{ y: -4 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SectionChevron({ expanded }) {
  return (
    <motion.span
      className="section-chevron"
      animate={{ rotate: expanded ? 0 : -90 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: "inline-flex", transformOrigin: "50% 50%" }}
      aria-hidden="true"
    >
      <ChevronDown size={16} />
    </motion.span>
  );
}

function formatConversationTime(iso, t, locale) {
  if (!iso) return "";
  try {
    const d = parseAppDate(iso);
    if (!d) return "";
    const now = new Date();
    const loc = locale === "tr" ? "tr-TR" : locale === "en" ? "en-US" : undefined;
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return formatMessageClock(d, loc);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return t("Yesterday");
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6);
    if (d >= weekAgo) {
      return formatMessageDate(d, loc, { weekday: "short" });
    }
    return formatMessageDate(d, loc, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatUnreadCount(n) {
  const count = Number(n) || 0;
  if (count <= 0) return null;
  if (count > 99) return "99+";
  return String(count);
}

function UnreadBadge({ count }) {
  const label = formatUnreadCount(count);
  return (
    <AnimatePresence mode="popLayout">
      {label && (
        <motion.span
          key={label}
          className="conv-unread-badge"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          aria-label={`${label} unread`}
        >
          {label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

const LIST_LAYOUT_TRANSITION = {
  layout: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  opacity: { duration: 0.2 },
};

function ConvMoreButton({ buttonRef, open, label, onToggle }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`conv-more-btn${open ? " is-open" : ""}`}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
    >
      <MoreHorizontal size={14} />
    </button>
  );
}

function DMList({ dms, activeDmUser, onlineUsers, expanded, onToggle, onDmSelect, isMobile, unreadById = {}, loading = false, onAddFriend, onPrefAction }) {
  const t = useT();
  const { locale } = useLocale();
  const safeDms = Array.isArray(dms) ? dms : [];
  const [openMenuId, setOpenMenuId] = useState(null);
  // { id, x, y } while the menu was opened by right-clicking the row.
  const [menuPoint, setMenuPoint] = useState(null);
  const [confirmClose, setConfirmClose] = useState(null);
  const [actionError, setActionError] = useState("");
  const [swipeOpenId, setSwipeOpenId] = useState(null);
  const [reportTarget, setReportTarget] = useState(null); // { id, username }
  const menuRef = useRef(null);
  const dotBtnRefs = useRef({});

  // The menu (portaled) closes itself on outside pointerdown / Esc. A row-level
  // mousedown listener used to close it before taps on its items registered.
  const closeMenu = () => {
    setOpenMenuId(null);
    setMenuPoint(null);
  };

  const runAction = async (dm, action) => {
    setSwipeOpenId(null);
    closeMenu();
    if (action === "close") {
      setConfirmClose(dm);
      return;
    }
    if (action === "report") {
      setReportTarget({ id: dm.id, username: dm.username });
      return;
    }
    if (action === "block") {
      try {
        await confirmToggleBlock({ userId: dm.id, username: dm.username, t });
      } catch (err) {
        setActionError(err?.message || t("Something went wrong."));
        setTimeout(() => setActionError(""), 4000);
      }
      return;
    }
    try {
      await onPrefAction?.(dm, action);
    } catch (err) {
      setActionError(err?.message || t("Could not update this chat."));
      setTimeout(() => setActionError(""), 4000);
    }
  };

  const confirmCloseChat = async () => {
    const dm = confirmClose;
    setConfirmClose(null);
    if (!dm) return;
    try {
      await onPrefAction?.(dm, "close");
    } catch (err) {
      setActionError(err?.message || t("Could not update this chat."));
      setTimeout(() => setActionError(""), 4000);
    }
  };

  return (
    <>
      {actionError && (
        <div style={{
          margin: "4px 8px", padding: "8px 12px", borderRadius: 8,
          background: "var(--danger-soft)", color: "var(--danger)", fontSize: 12,
        }}>
          {actionError}
        </div>
      )}

      <div className="sidebar-section">
        <button
          className="section-header"
          onClick={onToggle}
        >
          <span className="section-title">{t("CHATS")}</span>
          <SectionChevron expanded={expanded} />
        </button>

        <SidebarSectionContent expanded={expanded}>
          {loading && safeDms.length === 0 ? (
            <ConversationListSkeleton count={7} label={t("Loading conversations")} />
          ) : safeDms.length === 0 ? (
            <div className="sidebar-empty-friends">
              <div className="empty-illustration empty-illu-chats compact" aria-hidden="true">
                <div className="empty-illu-blob" />
                <div className="empty-illu-blob secondary" />
              </div>
              <strong>{t("No conversations yet")}</strong>
              <span>{t("Add a friend to start chatting, messages, voice, and screen share in one place.")}</span>
              {onAddFriend && (
                <div className="sidebar-empty-friends-actions">
                  <button type="button" className="mkt-btn mkt-btn-soft" onClick={onAddFriend}>
                    {t("Add friend")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="conv-list">
              {safeDms.map((dm) => {
                const isOnline = isVisiblyOnline(onlineUsers, dm.id);
                const isActive = activeDmUser?.id === dm.id;
                const unread = dm.unreadCount || unreadById[dm.id] || 0;
                const timeLabel = formatConversationTime(dm.lastActivity, t, locale);
                const swipeOpen = isMobile && swipeOpenId === dm.id;

                return (
                  <motion.div
                    key={dm.id}
                    /* layout animations projected DM avatars across the chat header */
                    layout={false}
                    ref={openMenuId === dm.id ? menuRef : null}
                    className={`conv-group-wrap${isMobile ? " is-swipeable" : " is-desktop"}${swipeOpen ? " swipe-open" : ""}${openMenuId === dm.id ? " menu-open" : ""}${isActive ? " is-active-row" : ""}`}
                    transition={LIST_LAYOUT_TRANSITION}
                    style={{ position: "relative" }}
                    onMouseEnter={() => requestChatPrefetch("dm", dm.id)}
                    onContextMenu={(e) => {
                      if (isMobile) return;
                      e.preventDefault();
                      e.stopPropagation();
                      // Native feel: the menu opens right under the cursor.
                      setMenuPoint({ id: dm.id, x: e.clientX, y: e.clientY });
                      setOpenMenuId(dm.id);
                    }}
                  >
                    {isMobile ? (
                      <SwipeableDmRow
                        dm={dm}
                        isActive={isActive}
                        unread={unread}
                        timeLabel={timeLabel}
                        onlineUsers={onlineUsers}
                        isOnline={isOnline}
                        swipeOpen={swipeOpen}
                        onOpen={() => onDmSelect?.(dm)}
                        onAction={(action) => runAction(dm, action)}
                        onSwipeOpenChange={(open) => {
                          setSwipeOpenId(open ? dm.id : null);
                          if (open) closeMenu();
                        }}
                        onCloseOthers={() => {
                          if (swipeOpenId && swipeOpenId !== dm.id) setSwipeOpenId(null);
                        }}
                      />
                    ) : (
                      <>
                        <DmRowFront
                          dm={dm}
                          isActive={isActive}
                          unread={unread}
                          timeLabel={timeLabel}
                          onlineUsers={onlineUsers}
                          isOnline={isOnline}
                          isMobile={false}
                          swipeOpen={false}
                          onOpen={() => onDmSelect?.(dm)}
                        />
                        <ConvMoreButton
                          buttonRef={(el) => { dotBtnRefs.current[dm.id] = el; }}
                          open={openMenuId === dm.id}
                          label={t("More")}
                          onToggle={() => {
                            setMenuPoint(null);
                            setOpenMenuId(openMenuId === dm.id ? null : dm.id);
                          }}
                        />
                        <AnimatePresence>
                          {openMenuId === dm.id && (
                            <DmContextMenu
                              dm={dm}
                              unread={unread}
                              onClose={closeMenu}
                              onAction={(action) => runAction(dm, action)}
                              anchorRef={{ current: dotBtnRefs.current[dm.id] }}
                              anchorPoint={menuPoint?.id === dm.id ? menuPoint : null}
                            />
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </SidebarSectionContent>
      </div>

      <ReportUserModal
        open={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        targetId={reportTarget?.id}
        targetUsername={reportTarget?.username}
        contextType="dm"
      />
      <AnimatePresence>
        {confirmClose && (
          <ConfirmDialog
            title={t("Close this chat?")}
            message={t("This chat leaves your list. Messages stay, it comes back if they write you.")}
            confirmLabel={t("Close chat")}
            danger
            onConfirm={confirmCloseChat}
            onCancel={() => setConfirmClose(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

const DM_SWIPE_WIDTH = 248;
// Four glass actions per row (DM: pin/mute/unread/close; group: invite/add/more/leave).
const GLASS_SWIPE_WIDTH = swipeActionsWidth(4);

function DmRowContent({ dm, unread, timeLabel, onlineUsers, isOnline }) {
  const t = useT();
  const glass = useGlassUi();
  const presence = onlineUsers?.find((u) => u.id === dm.id)?.status || (isOnline ? "online" : "offline");
  const preview = displayText(localizeListPreview(dm.lastMessage, t)) || t("No messages yet");
  const typing = glass && /yazıyor|typing/i.test(String(preview));
  return (
    <>
      <div className="dm-avatar">
        <Avatar
          key={dm.id || dm.username}
          name={resolveDisplayName(dm)}
          size={40}
          user={dm}
        />
        <StatusBadge status={presence} />
        {glass && (presence === "offline" || presence === "invisible") ? (
          <span className="status-badge g-st-off" aria-hidden />
        ) : null}
      </div>
      <div className="dm-info conv-row-body">
        <div className="conv-row-top">
          <span className={`dm-name ${unread > 0 ? "unread" : ""}`}>{resolveDisplayName(dm)}</span>
          <span className="conv-row-meta">
            {timeLabel ? (
              <span className={`conv-time ${unread > 0 ? "unread" : ""}`}>{timeLabel}</span>
            ) : null}
            <span className="conv-row-flags" aria-hidden>
              {dm.pinned ? <Pin size={11} /> : null}
              {dm.muted ? <BellOff size={11} /> : null}
            </span>
          </span>
        </div>
        <div className="conv-row-bottom">
          <span className={`dm-preview ${unread > 0 ? "unread" : ""}${typing ? " is-typing" : ""}`}>
            {preview}
          </span>
          <UnreadBadge count={unread} />
        </div>
      </div>
    </>
  );
}

function SwipeableDmRow({
  dm,
  isActive,
  unread,
  timeLabel,
  onlineUsers,
  isOnline,
  swipeOpen,
  onOpen,
  onAction,
  onSwipeOpenChange,
  onCloseOthers,
}) {
  const t = useT();
  const glass = useGlassUi();
  return (
    <SwipeRevealRow
      open={swipeOpen}
      width={glass ? GLASS_SWIPE_WIDTH : DM_SWIPE_WIDTH}
      onOpenChange={onSwipeOpenChange}
      onCloseOthers={onCloseOthers}
      front={
        <button
          type="button"
          className={`dm-item conv-row group-row-front ${isActive ? "active" : ""} ${unread > 0 ? "has-unread" : ""}${glass && dm.muted ? " is-muted" : ""}`}
          onClick={() => {
            if (swipeOpen) {
              onSwipeOpenChange?.(false);
              return;
            }
            onOpen?.();
          }}
        >
          <DmRowContent
            dm={dm}
            unread={isActive ? 0 : unread}
            timeLabel={timeLabel}
            onlineUsers={onlineUsers}
            isOnline={isOnline}
          />
        </button>
      }
      actions={
        <>
          <button type="button" className="group-swipe-btn pin" onClick={() => onAction?.("pin")}>
            {dm.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            <span>{dm.pinned ? t("Unpin chat") : t("Pin")}</span>
          </button>
          <button type="button" className="group-swipe-btn mute" onClick={() => onAction?.("mute")}>
            {dm.muted ? <Bell size={15} /> : <BellOff size={15} />}
            <span>{dm.muted ? t("Unmute") : t("Mute")}</span>
          </button>
          <button type="button" className="group-swipe-btn unread" onClick={() => onAction?.("unread")}>
            {unread > 0 ? <MailOpen size={15} /> : <Mail size={15} />}
            <span>{unread > 0 ? t("Mark read") : t("Unread")}</span>
          </button>
          <button type="button" className="group-swipe-btn close" onClick={() => onAction?.("close")}>
            <X size={15} />
            <span>{t("Close")}</span>
          </button>
        </>
      }
    />
  );
}

function DmRowFront({
  dm,
  isActive,
  unread,
  timeLabel,
  onlineUsers,
  isOnline,
  isMobile,
  swipeOpen,
  onOpen,
  onSwipeOpenChange,
}) {
  return (
    <motion.button
      layout={false}
      type="button"
      className={`dm-item conv-row group-row-front ${isActive ? "active" : ""} ${unread > 0 ? "has-unread" : ""}`}
      onClick={() => {
        if (isMobile && swipeOpen) {
          onSwipeOpenChange?.(false);
          return;
        }
        onOpen?.();
      }}
      whileHover={undefined}
      transition={LIST_LAYOUT_TRANSITION}
      style={{ width: "100%" }}
    >
      <DmRowContent
        dm={dm}
        unread={isActive ? 0 : unread}
        timeLabel={timeLabel}
        onlineUsers={onlineUsers}
        isOnline={isOnline}
      />
    </motion.button>
  );
}

function DmContextMenu({ dm, unread, onClose, onAction, anchorRef, anchorPoint = null }) {
  const t = useT();
  const blockedIds = useBlockedUserIds();
  const reduceMotion = useReducedMotion();
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, origin: "top right", visibility: "hidden" });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    // offsetWidth/Height ignore the opening scale, so the first measure is exact.
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const pad = 8;

    // Right-click → open at the pointer, flipping at the viewport edges.
    if (anchorPoint) {
      let left = anchorPoint.x;
      let top = anchorPoint.y;
      if (left + w > window.innerWidth - pad) left = anchorPoint.x - w;
      if (top + h > window.innerHeight - pad) top = anchorPoint.y - h;
      left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
      setPosition({ top, left, origin: rowMenuOrigin(anchorPoint.x, anchorPoint.y, left, top, w, h), visibility: "visible" });
      return;
    }

    const anchor = anchorRef?.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    let top = rect.bottom + 6;
    let below = true;
    let left = rect.right - w;
    if (left < pad) left = pad;
    if (top + h > window.innerHeight - pad) { top = rect.top - h - 6; below = false; }
    setPosition({ top, left, origin: below ? "top right" : "bottom right", visibility: "visible" });
  }, [anchorRef, anchorPoint]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !anchorRef?.current?.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, anchorRef]);

  const itemStyle = {
    width: "100%", display: "flex", alignItems: "center", gap: 10,
    padding: "10px 14px", background: "none", border: "none",
    cursor: "pointer", fontSize: 13, color: "var(--text-1)",
    transition: "background 0.1s",
  };

  return createPortal(
    <motion.div
      ref={menuRef}
      role="menu"
      className="gd-row-menu"
      {...rowMenuMotion(reduceMotion)}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        visibility: position.visibility,
        transformOrigin: position.origin,
        zIndex: 10000,
        background: "rgba(40, 40, 44, 0.92)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 12,
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
        minWidth: 180,
        overflow: "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => { onAction?.("pin"); onClose(); }}
        style={itemStyle}
        onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-3)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "none"}
      >
        {dm.pinned ? <PinOff size={14} style={{ color: "var(--primary)" }} /> : <Pin size={14} style={{ color: "var(--primary)" }} />}
        {dm.pinned ? t("Unpin chat") : t("Pin")}
      </button>
      <button
        type="button"
        onClick={() => { onAction?.("mute"); onClose(); }}
        style={itemStyle}
        onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-3)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "none"}
      >
        {dm.muted ? <Bell size={14} style={{ color: "var(--text-muted)" }} /> : <BellOff size={14} style={{ color: "var(--text-muted)" }} />}
        {dm.muted ? t("Unmute") : t("Mute")}
      </button>
      <button
        type="button"
        onClick={() => { onAction?.("unread"); onClose(); }}
        style={itemStyle}
        onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-3)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "none"}
      >
        {unread > 0 ? <MailOpen size={14} style={{ color: "var(--text-muted)" }} /> : <Mail size={14} style={{ color: "var(--text-muted)" }} />}
        {unread > 0 ? t("Mark read") : t("Mark unread")}
      </button>
      <div style={{ height: 1, background: "var(--border-2)", margin: "2px 0" }} />
      <button
        type="button"
        onClick={() => { onAction?.("block"); onClose(); }}
        style={itemStyle}
        onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-3)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "none"}
      >
        <CircleSlash size={14} style={{ color: "var(--text-muted)" }} />
        {blockedIds.has(String(dm.id)) ? t("Unblock") : t("Block")}
      </button>
      <button
        type="button"
        onClick={() => { onAction?.("report"); onClose(); }}
        style={itemStyle}
        onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-3)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "none"}
      >
        <Flag size={14} style={{ color: "var(--text-muted)" }} />
        {t("report.action")}
      </button>
      <button
        type="button"
        className="is-danger"
        onClick={() => { onAction?.("close"); onClose(); }}
        style={{ ...itemStyle, color: "var(--danger)" }}
        onMouseEnter={(e) => e.currentTarget.style.background = "var(--danger-soft)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "none"}
      >
        <X size={14} />
        {t("Close chat")}
      </button>
    </motion.div>,
    document.body
  );
}

function GroupContextMenu({ group, onClose, onLeave, onRename, onAddMember, onInvite, anchorRef, anchorPoint = null, onChangePhoto, onRemovePhoto }) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, origin: "top right", visibility: "hidden" });

  useLayoutEffect(() => {
    const anchor = anchorRef?.current;
    const menu = menuRef.current;
    if (!menu) return undefined;
    // offsetWidth/Height ignore the presentation scale, so the first measure is exact.
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const pad = 8;

    // Pointer / long-press / "Daha fazla" → anchored at that point, like a native context menu.
    if (anchorPoint) {
      let left = anchorPoint.x;
      let top = anchorPoint.y;
      if (left + w > window.innerWidth - pad) left = anchorPoint.x - w;
      // A trigger button passes its top edge so a flipped menu sits above it, not over it.
      if (top + h > window.innerHeight - pad) top = (anchorPoint.top ?? anchorPoint.y) - h - (anchorPoint.top != null ? 6 : 0);
      left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
      setPosition({ top, left, origin: rowMenuOrigin(anchorPoint.x, anchorPoint.y, left, top, w, h), visibility: "visible" });
      return undefined;
    }

    if (!anchor) return undefined;

    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const gap = 6;
      let top = anchorRect.bottom + gap;
      let below = true;
      if (top + h > window.innerHeight - pad) {
        top = anchorRect.top - h - gap;
        below = false;
      }
      top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
      let left = anchorRect.right - w;
      left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
      setPosition({ top, left, origin: below ? "top right" : "bottom right", visibility: "visible" });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, anchorPoint]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !anchorRef?.current?.contains(e.target)) {
        onClose();
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", handleOutside, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutside, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [onClose, anchorRef]);

  // A long-press opens the menu under a finger that is still down; the lift
  // must not count as a tap on whichever item appeared there.
  const openedAt = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  const pressedInside = useRef(false);

  const item = (label, Icon, onSelect, { danger = false, testId } = {}) => (
    <button
      type="button"
      role="menuitem"
      className={`grp-menu-item${danger ? " is-danger" : ""}`}
      data-testid={testId}
      onPointerDown={() => { pressedInside.current = true; }}
      onClick={(e) => {
        e.stopPropagation();
        const fresh = performance.now() - openedAt.current < 450;
        if (fresh && !pressedInside.current && e.detail !== 0) return;
        onSelect?.();
        onClose();
      }}
    >
      <span>{label}</span>
      <Icon size={18} strokeWidth={2} />
    </button>
  );

  return createPortal(
    <>
      <motion.div
        className="grp-menu-catcher"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <motion.div
        ref={menuRef}
        role="menu"
        aria-label={group?.name}
        className="grp-menu"
        data-testid="group-menu"
        {...rowMenuMotion(reduceMotion)}
        style={{
          top: position.top,
          left: position.left,
          visibility: position.visibility,
          transformOrigin: position.origin,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grp-menu-section">
          {item(t("Invite People"), Link2, onInvite, { testId: "group-menu-invite" })}
          {item(t("Add Member"), UserRoundPlus, onAddMember, { testId: "group-menu-add" })}
        </div>
        <div className="grp-menu-section">
          {item(t("Rename Group"), Edit3, onRename, { testId: "group-menu-rename" })}
          {item(t("Change Group Photo"), ImagePlus, onChangePhoto, { testId: "group-menu-photo" })}
          {groupAvatarUrl(group) ? item(t("Remove Group Photo"), ImageOff, onRemovePhoto, { testId: "group-menu-remove-photo" }) : null}
        </div>
        <div className="grp-menu-section">
          {item(t("Leave Group"), LogOut, onLeave, { danger: true, testId: "group-menu-leave" })}
        </div>
      </motion.div>
    </>,
    document.body
  );
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }) {
  const t = useT();
  return (
    <GlassConfirm
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel={t("Cancel")}
      danger={danger}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/**
 * Group actions shared by the sidebar row menu, the mobile swipe actions and
 * the in-chat group info sheet: invite, add member, rename, photo, leave.
 * Render `element` once; call `run(group, action)`.
 */
export function useGroupActions({ friends, onGroupLeft, onGroupRenamed, onGroupAvatarChanged, onMemberAdded } = {}) {
  const t = useT();
  const { toast } = useToast();
  const [confirmLeave, setConfirmLeave] = useState(null);   // group object
  const [renameGroupTarget, setRenameGroupTarget] = useState(null); // group object
  const [addMemberGroup, setAddMemberGroup] = useState(null); // group object
  const [inviteGroup, setInviteGroup] = useState(null); // group object
  const groupPhoto = useGroupPhotoChanger({ onUpdated: onGroupAvatarChanged });

  const handleLeave = async (group) => {
    try {
      const res = await fetch(`${API_BASE_URL}/groups/${group.id}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to leave group");
      onGroupLeft?.(group.id);
    } catch (err) {
      toast(t(err?.message || "Failed to leave group"), "error");
    } finally {
      setConfirmLeave(null);
    }
  };

  // Rejects with { code } so the sheet can stay open and explain why.
  const handleRename = async (group, newName) => {
    const body = await renameGroupApi(group.id, newName);
    const name = body?.name || newName;
    onGroupRenamed?.(group.id, name);
    // Keep the open sheet's header in sync if the parent list hasn't re-rendered yet.
    setRenameGroupTarget((cur) => (cur?.id === group.id ? { ...cur, name } : cur));
    toast(t("Group renamed"), "success");
  };

  const run = (group, action) => {
    if (!group) return;
    if (action === "invite") setInviteGroup(group);
    else if (action === "add") setAddMemberGroup(group);
    else if (action === "rename") setRenameGroupTarget(group);
    else if (action === "photo") groupPhoto.pick(group);
    else if (action === "remove-photo") groupPhoto.remove(group);
    else if (action === "leave") setConfirmLeave(group);
  };

  const element = (
    <>
      {groupPhoto.element}

      <AnimatePresence>
        {confirmLeave && (
          <ConfirmDialog
            title={t("Leave Group")}
            message={t('Are you sure you want to leave "{name}"? You won\'t be able to see its messages anymore.', { name: confirmLeave.name })}
            confirmLabel={t("Leave")}
            danger
            onConfirm={() => handleLeave(confirmLeave)}
            onCancel={() => setConfirmLeave(null)}
          />
        )}
      </AnimatePresence>

      <GroupRenameSheet
        group={renameGroupTarget}
        open={Boolean(renameGroupTarget)}
        onClose={() => setRenameGroupTarget(null)}
        onSubmit={(name) => handleRename(renameGroupTarget, name)}
      />

      <GroupAddMemberSheet
        group={addMemberGroup}
        open={Boolean(addMemberGroup)}
        friends={friends}
        onClose={() => setAddMemberGroup(null)}
        onMemberAdded={(friend, body) => {
          const groupId = addMemberGroup?.id;
          if (!groupId) return;
          // Server group (fresh members[] + count) when the response has it,
          // otherwise the friend row; the socket echo is idempotent.
          onMemberAdded?.(groupId, { user: body?.user || friend, group: body?.group || null });
          setAddMemberGroup((cur) => (cur?.id === groupId && body?.group?.members ? { ...cur, ...body.group } : cur));
        }}
      />

      <GroupInviteModal
        group={inviteGroup}
        open={Boolean(inviteGroup)}
        onClose={() => setInviteGroup(null)}
      />
    </>
  );

  return { run, element, actionError: "", groupPhoto };
}

function GroupList({ groups, friends, activeGroup, expanded, onToggle, onGroupSelect, onGroupLeft, onGroupRenamed, onGroupMemberAdded, onGroupAvatarChanged, isMobile, unreadById = {}, loading = false, onCreateGroup }) {
  const t = useT();
  const { locale } = useLocale();
  const safeGroups = Array.isArray(groups) ? groups : [];
  const [openMenuId, setOpenMenuId] = useState(null);
  // { id, x, y } while the menu was opened by right-clicking the row.
  const [menuPoint, setMenuPoint] = useState(null);
  const [swipeOpenId, setSwipeOpenId] = useState(null);
  const menuRef = useRef(null);
  const dotBtnRefs = useRef({});
  // Same handlers drive the row menu, the swipe actions and the group info sheet.
  const groupActions = useGroupActions({ friends, onGroupLeft, onGroupRenamed, onGroupAvatarChanged, onMemberAdded: onGroupMemberAdded });

  // The portaled menu closes itself on outside pointerdown / Esc. A row-level
  // mousedown listener used to close it before taps on its items registered.
  const closeMenu = () => {
    setOpenMenuId(null);
    setMenuPoint(null);
  };

  const openAction = (group, action, point) => {
    if (action === "more") {
      // Overflow: the full group menu (rename, photo, remove photo…) under the button.
      setMenuPoint(point ? { id: group.id, x: point.x, y: point.y, top: point.top } : null);
      setOpenMenuId(group.id);
      return;
    }
    setSwipeOpenId(null);
    closeMenu();
    groupActions.run(group, action);
  };

  return (
    <>
      <div className="sidebar-section">
        <button
          className="section-header"
          onClick={onToggle}
        >
          <span className="section-title">{t("GROUPS")}</span>
          <SectionChevron expanded={expanded} />
        </button>

        <SidebarSectionContent expanded={expanded}>
              {loading && safeGroups.length === 0 ? (
                <ConversationListSkeleton count={6} label={t("Loading groups")} />
              ) : safeGroups.length === 0 ? (
                <div className="sidebar-empty-friends">
                  <div className="empty-illustration empty-illu-groups compact" aria-hidden="true">
                    <div className="empty-illu-blob" />
                    <div className="empty-illu-blob secondary" />
                  </div>
                  <strong>{t("No groups yet")}</strong>
                  <span>{t("Create a group for friends, chat, call, and share your screen together.")}</span>
                  {onCreateGroup && (
                    <div className="sidebar-empty-friends-actions">
                      <button type="button" className="mkt-btn mkt-btn-soft" onClick={onCreateGroup}>
                        {t("Create group")}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                safeGroups.map((group) => {
                  const isActive = activeGroup?.id === group.id;
                  const unread = group.unreadCount || unreadById[group.id] || 0;
                  const timeLabel = formatConversationTime(group.lastActivity, t, locale);
                  const preview = group.lastMessage || (group.removed ? t("gk.previewRemovedMe") : t("No messages yet"));
                  const swipeOpen = isMobile && swipeOpenId === group.id;

                  return (
                    <motion.div
                      key={group.id}
                      layout={false}
                      ref={openMenuId === group.id ? menuRef : null}
                      className={`conv-group-wrap${isMobile ? " is-swipeable" : " is-desktop"}${swipeOpen ? " swipe-open" : ""}${openMenuId === group.id ? " menu-open" : ""}${isActive ? " is-active-row" : ""}`}
                      transition={LIST_LAYOUT_TRANSITION}
                      style={{ position: "relative" }}
                      onMouseEnter={() => requestChatPrefetch("group", group.id)}
                      onContextMenu={(e) => {
                        if (isMobile) return;
                        e.preventDefault();
                        e.stopPropagation();
                        // Native feel: the menu opens right under the cursor.
                        setMenuPoint({ id: group.id, x: e.clientX, y: e.clientY });
                        setOpenMenuId(group.id);
                      }}
                    >
                      {isMobile ? (
                        <SwipeableGroupRow
                          group={group}
                          isActive={isActive}
                          unread={unread}
                          timeLabel={timeLabel}
                          preview={preview}
                          swipeOpen={swipeOpen}
                          onOpen={() => onGroupSelect?.(group)}
                          onAction={(action, point) => openAction(group, action, point)}
                          onSwipeOpenChange={(open) => {
                            setSwipeOpenId(open ? group.id : null);
                            if (open) closeMenu();
                          }}
                          onCloseOthers={() => {
                            if (swipeOpenId && swipeOpenId !== group.id) setSwipeOpenId(null);
                          }}
                        />
                      ) : (
                        <>
                          <GroupRowFront
                            group={group}
                            isActive={isActive}
                            unread={unread}
                            timeLabel={timeLabel}
                            preview={preview}
                            isMobile={false}
                            swipeOpen={false}
                            onOpen={() => onGroupSelect?.(group)}
                            onSwipeOpenChange={() => {}}
                            onCloseOthers={() => {}}
                          />
                          <ConvMoreButton
                            buttonRef={(el) => { dotBtnRefs.current[group.id] = el; }}
                            open={openMenuId === group.id}
                            label={t("More")}
                            onToggle={() => {
                              setMenuPoint(null);
                              setOpenMenuId(openMenuId === group.id ? null : group.id);
                            }}
                          />
                        </>
                      )}
                      {/* One menu for every entry point: ⋯, right-click, long-press, swipe "Daha fazla". */}
                      <AnimatePresence>
                        {openMenuId === group.id && (
                          <GroupContextMenu
                            group={group}
                            onClose={closeMenu}
                            onLeave={() => openAction(group, "leave")}
                            onRename={() => openAction(group, "rename")}
                            onChangePhoto={() => openAction(group, "photo")}
                            onRemovePhoto={() => openAction(group, "remove-photo")}
                            onAddMember={() => openAction(group, "add")}
                            onInvite={() => openAction(group, "invite")}
                            anchorRef={{ current: isMobile ? null : dotBtnRefs.current[group.id] }}
                            anchorPoint={menuPoint?.id === group.id ? menuPoint : null}
                          />
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              )}
        </SidebarSectionContent>
      </div>

      {groupActions.element}
    </>
  );
}

const GROUP_SWIPE_WIDTH = 248;

function glassAnnouncementWhen(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const min = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (min < 60) return `${Math.max(1, min)}dk`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}sa`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}g`;
  return new Date(iso).toLocaleDateString("tr-TR");
}

function glassGroupInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toLocaleUpperCase("tr");
  return (parts[0]?.[0] || "").toLocaleUpperCase("tr");
}

function GroupRowContent({ group, unread, timeLabel, preview }) {
  const t = useT();
  const glass = useGlassUi();
  const members = glass && Array.isArray(group.members) ? group.members.slice(0, 4) : [];
  const memberCount = group.memberCount || group.members?.length || 0;
  return (
    <>
      <div className={`group-icon${groupAvatarUrl(group) ? " has-group-photo" : ""}`} style={{ width: 36, height: 36, borderRadius: 10, background: "var(--primary-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)", fontWeight: 700, fontSize: 14, flexShrink: 0, overflow: "hidden" }}>
        <GroupIcon
          group={group}
          size={36}
          radius={10}
          initials={glass ? glassGroupInitials(group.name) : group.name?.charAt(0)?.toUpperCase()}
        />
      </div>
      <div className="group-info conv-row-body">
        <div className="conv-row-top">
          <span className={`group-name ${unread > 0 ? "unread" : ""}`}>{group.name}</span>
          <span className="conv-row-meta">
            {timeLabel ? (
              <span className={`conv-time ${unread > 0 ? "unread" : ""}`}>{timeLabel}</span>
            ) : null}
            <span className="conv-row-flags" aria-hidden>
              {group.pinned ? <Pin size={11} /> : null}
              {group.muted ? <BellOff size={11} /> : null}
            </span>
          </span>
        </div>
        <div className="conv-row-bottom">
          <span className={`group-members dm-preview ${unread > 0 ? "unread" : ""}`}>{displayText(localizeListPreview(preview, t))}</span>
          <UnreadBadge count={unread} />
        </div>
        {glass && memberCount > 0 ? (
          <div className="g-member-stack">
            {members.map((m) => (
              <Avatar key={m.id || m.username} name={resolveDisplayName(m)} size={20} user={m} />
            ))}
            <span className="g-member-count">{t("{count} members", { count: memberCount })}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Mobile swipe-to-reveal: front + actions as flex siblings (same row height). */
function SwipeableGroupRow({
  group,
  isActive,
  unread,
  timeLabel,
  preview,
  swipeOpen,
  onOpen,
  onAction,
  onSwipeOpenChange,
  onCloseOthers,
}) {
  const t = useT();
  const glass = useGlassUi();
  // Long-press (touch) opens the same glass group menu at the finger, like an iOS context menu.
  const lp = useRef({ timer: 0, x: 0, y: 0, fired: false });
  useEffect(() => () => clearTimeout(lp.current.timer), []);
  const cancelLongPress = () => clearTimeout(lp.current.timer);
  return (
    <SwipeRevealRow
      open={swipeOpen}
      width={glass ? GLASS_SWIPE_WIDTH : GROUP_SWIPE_WIDTH}
      onFullSwipe={() => onAction?.("leave")}
      onOpenChange={onSwipeOpenChange}
      onCloseOthers={onCloseOthers}
      front={
        <button
          type="button"
          className={`group-item conv-row group-row-front ${isActive ? "active" : ""} ${unread > 0 ? "has-unread" : ""}`}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" || swipeOpen) return;
            const st = lp.current;
            st.fired = false;
            st.x = e.clientX;
            st.y = e.clientY;
            clearTimeout(st.timer);
            st.timer = setTimeout(() => {
              st.fired = true;
              hapticImpactMedium();
              onAction?.("more", { x: st.x, y: st.y });
            }, 480);
          }}
          onPointerMove={(e) => {
            if (Math.hypot(e.clientX - lp.current.x, e.clientY - lp.current.y) > 8) cancelLongPress();
          }}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => {
            if (lp.current.fired) {
              lp.current.fired = false;
              return;
            }
            if (swipeOpen) {
              onSwipeOpenChange?.(false);
              return;
            }
            onOpen?.();
          }}
        >
          <GroupRowContent group={group} unread={isActive ? 0 : unread} timeLabel={timeLabel} preview={preview} />
        </button>
      }
      actions={
        <>
          <button type="button" className="group-swipe-btn invite" onClick={() => onAction?.("invite")}>
            <Link2 size={15} />
            <span>{t("Invite")}</span>
          </button>
          <button type="button" className="group-swipe-btn add" onClick={() => onAction?.("add")}>
            <UserRoundPlus size={15} />
            <span>{t("Add")}</span>
          </button>
          <button
            type="button"
            className="group-swipe-btn more"
            aria-haspopup="menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onAction?.("more", { x: r.left + r.width / 2, y: r.bottom + 6, top: r.top });
            }}
          >
            <MoreHorizontal size={15} />
            <span>{t("More")}</span>
          </button>
          <button type="button" className="group-swipe-btn leave" onClick={() => onAction?.("leave")}>
            <LogOut size={15} />
            <span>{t("Leave")}</span>
          </button>
        </>
      }
    />
  );
}

function GroupRowFront({
  group,
  isActive,
  unread,
  timeLabel,
  preview,
  isMobile,
  swipeOpen,
  onOpen,
  onSwipeOpenChange,
}) {
  return (
    <motion.button
      layout={false}
      type="button"
      className={`group-item conv-row group-row-front ${isActive ? "active" : ""} ${unread > 0 ? "has-unread" : ""}`}
      onClick={() => {
        if (isMobile && swipeOpen) {
          onSwipeOpenChange?.(false);
          return;
        }
        onOpen?.();
      }}
      whileHover={undefined}
      transition={LIST_LAYOUT_TRANSITION}
      style={{ width: "100%" }}
    >
      <GroupRowContent
        group={group}
        unread={isActive ? 0 : unread}
        timeLabel={timeLabel}
        preview={preview}
      />
    </motion.button>
  );
}

function FriendsList({ friends, onlineUsers, expanded, onToggle, onFriendSelect, onStartCall, searchQuery = "", friendRequests, messageRequests, onAcceptFriend, onDeclineFriend, onAcceptMessageRequest, onDeclineMessageRequest, isMobile, onQuickAdd, me, onShareInvite, loading = false, showInvite = true }) {
  const t = useT();
  const glassShell = useGlassShell();
  const safeFriends = Array.isArray(friends) ? friends : [];
  const safeOnlineUsers = Array.isArray(onlineUsers) ? onlineUsers : [];
  const pendingRequests = Array.isArray(friendRequests) ? friendRequests : [];
  const pendingMessages = Array.isArray(messageRequests) ? messageRequests : [];

  const onlineFriends = safeFriends.filter((f) => isVisiblyOnline(safeOnlineUsers, f.id));
  const offlineFriends = safeFriends.filter((f) => !isVisiblyOnline(safeOnlineUsers, f.id));

  if (glassShell) {
    const q = String(searchQuery || "").trim().toLowerCase();
    const matches = (friend) => {
      if (!q) return true;
      const name = resolveDisplayName(friend).toLowerCase();
      const handle = String(friend.username || "").toLowerCase();
      const custom = String(friend.customStatus || friend.custom_status || "").toLowerCase();
      return name.includes(q) || handle.includes(q) || custom.includes(q);
    };
    const pendingShown = pendingRequests.filter(matches);
    const messageShown = pendingMessages.filter((req) => {
      if (!q) return true;
      const name = resolveDisplayName(req).toLowerCase();
      const handle = String(req.username || "").toLowerCase();
      const preview = String(req.preview || "").toLowerCase();
      return name.includes(q) || handle.includes(q) || preview.includes(q);
    });
    const onlineShown = onlineFriends.filter(matches);
    const offlineShown = offlineFriends.filter(matches);
    const friendSub = (friend) => {
      const custom = friend.customStatus || friend.custom_status;
      if (custom) return custom;
      const status = getPresenceStatus(safeOnlineUsers, friend.id);
      return t(STATUS_META[status]?.label || "Offline");
    };
    return (
      <div className="sidebar-section g-friends">
        <div className="section-content">
          {me?.username ? <InviteCard username={me.username} compact /> : null}
          {pendingShown.length > 0 && (
            <div className="friend-category">
              <div className="g-sect is-pending"><span>{t("Pending, {count}", { count: pendingShown.length })}</span></div>
              {pendingShown.map((req) => (
                <div key={req.id} className="g-friend-row">
                  <div className="friend-avatar">
                    <Avatar name={resolveDisplayName(req)} size={52} user={req} />
                  </div>
                  <div className="g-friend-meta">
                    <span className="friend-name">{resolveDisplayName(req)}</span>
                    <span className="g-friend-sub is-dim">@{req.username}</span>
                  </div>
                  <button type="button" className="g-ib ok" title={t("Accept")} aria-label={t("Accept Friend")} onClick={() => onAcceptFriend?.(req.id)}>
                    <Check size={18} />
                  </button>
                  <button type="button" className="g-ib no" title={t("Decline")} aria-label={t("Decline")} onClick={() => onDeclineFriend?.(req.id)}>
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {messageShown.length > 0 && (
            <div className="friend-category">
              <div className="g-sect is-pending"><span>{t("Message requests, {count}", { count: messageShown.length })}</span></div>
              {messageShown.map((req) => (
                <div key={req.id} className="g-friend-row">
                  <div className="friend-avatar">
                    <Avatar name={resolveDisplayName(req)} size={52} user={req} />
                  </div>
                  <div className="g-friend-meta">
                    <span className="friend-name">{resolveDisplayName(req)}</span>
                    <span className="g-friend-sub is-dim">{req.preview || t("Message request")}</span>
                  </div>
                  <button type="button" className="g-ib ok" title={t("Accept")} aria-label={t("Accept message request")} onClick={() => onAcceptMessageRequest?.(req.id)}>
                    <Check size={18} />
                  </button>
                  <button type="button" className="g-ib no" title={t("Decline")} aria-label={t("Decline message request")} onClick={() => onDeclineMessageRequest?.(req.id)}>
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {onlineShown.length > 0 && (
            <div className="friend-category">
              <div className="g-sect"><span>{t("Online, {count}", { count: onlineShown.length })}</span></div>
              {onlineShown.map((friend) => (
                <div key={friend.id} className="g-friend-row">
                  <button type="button" className="g-friend-main" onClick={() => onFriendSelect?.(friend)}>
                    <div className="friend-avatar">
                      <Avatar name={resolveDisplayName(friend)} size={52} user={friend} />
                      <StatusBadge status={safeOnlineUsers.find((u) => u.id === friend.id)?.status || "online"} />
                    </div>
                    <div className="g-friend-meta">
                      <span className="friend-name">
                        <span className="friend-name-text">{resolveDisplayName(friend)}</span>
                        <AdminBadge user={friend} variant="inline" />
                      </span>
                      <span className="g-friend-sub">{friendSub(friend)}</span>
                    </div>
                  </button>
                  <button type="button" className="g-ib brand" title={t("Send Message")} aria-label={t("Send Message")} onClick={() => onFriendSelect?.(friend)}>
                    <MessageSquare size={18} />
                  </button>
                  <button type="button" className="g-ib" title={t("Voice Call")} aria-label={t("Voice Call")} onClick={() => onStartCall?.(friend, "voice")}>
                    <Phone size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {offlineShown.length > 0 && (
            <div className="friend-category">
              <div className="g-sect"><span>{t("Offline, {count}", { count: offlineShown.length })}</span></div>
              {offlineShown.map((friend) => (
                <div key={friend.id} className="g-friend-row">
                  <button type="button" className="g-friend-main" onClick={() => onFriendSelect?.(friend)}>
                    <div className="friend-avatar">
                      <Avatar name={resolveDisplayName(friend)} size={52} user={friend} />
                      <StatusBadge status="offline" />
                    </div>
                    <div className="g-friend-meta">
                      <span className="friend-name">
                        <span className="friend-name-text">{resolveDisplayName(friend)}</span>
                        <AdminBadge user={friend} variant="inline" />
                      </span>
                      <span className="g-friend-sub is-dim">{friendSub(friend)}</span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
          {loading && safeFriends.length === 0 && pendingRequests.length === 0 && pendingMessages.length === 0 ? (
            <ConversationListSkeleton count={6} label={t("Loading conversations")} />
          ) : safeFriends.length === 0 && pendingRequests.length === 0 && pendingMessages.length === 0 ? (
            <div className="sidebar-empty-friends">
              <strong>{t("No friends yet")}</strong>
              <span>{t("Share your invite link, friends join free and connect with you instantly.")}</span>
              <div className="sidebar-empty-friends-actions">
                <button type="button" className="mkt-btn mkt-btn-soft" onClick={onQuickAdd}>
                  {t("Add friend")}
                </button>
              </div>
            </div>
          ) : onlineShown.length === 0 && offlineShown.length === 0 && pendingShown.length === 0 && messageShown.length === 0 ? (
            <p className="g-friends-empty">{t("No results")}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-section">
      <button
        className="section-header"
        onClick={onToggle}
        style={{ position: "relative" }}
      >
        <span className="section-title" style={{ flex: 1, textAlign: "left" }}>{t("FRIENDS")}</span>
        {(pendingRequests.length + pendingMessages.length) > 0 && (
          <span style={{
            background: "var(--danger)", color: "#fff", fontSize: 10, fontWeight: 700,
            borderRadius: 10, padding: "1px 6px", minWidth: 16, textAlign: "center", lineHeight: "16px",
            marginRight: 6,
          }}>
            {pendingRequests.length + pendingMessages.length}
          </span>
        )}
        {onQuickAdd && (
          <span
            role="button"
            tabIndex={0}
            title={t("Quick Add")}
            aria-label={t("Quick Add")}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickAdd(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onQuickAdd(); } }}
            className="friends-quick-add-btn"
          >
            <UserPlus size={13} />
          </span>
        )}
        <SectionChevron expanded={expanded} />
      </button>

      <SidebarSectionContent expanded={expanded}>
            {showInvite && me?.username && (
              <div style={{ padding: "8px 10px 4px" }}>
                <InviteCard username={me.username} compact />
              </div>
            )}
            {pendingRequests.length > 0 && (
              <div className="friend-category">
                <span className="category-label" style={{ color: "var(--warning)" }}>
                  {t("Pending, {count}", { count: pendingRequests.length })}
                </span>
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 8px", borderRadius: 8,
                      background: "var(--surface-2)", marginBottom: 4,
                    }}
                  >
                    <div className="friend-avatar" style={{ flexShrink: 0 }}>
                      <Avatar name={req.username} size={32} user={req} />
                    </div>
                    <span className="friend-name" style={{ flex: 1, fontSize: 13 }}>{req.username}</span>
                    <button
                      type="button"
                      title={t("Accept")}
                      aria-label={t("Accept Friend")}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onAcceptFriend?.(req.id);
                      }}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: "none",
                        background: "var(--success-soft)", color: "var(--success)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, transition: "background 0.15s",
                        touchAction: "manipulation",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--success)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "var(--success-soft)"}
                    >
                      <UserPlus size={14} />
                    </button>
                    <button
                      type="button"
                      title={t("Decline")}
                      aria-label={t("Decline")}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeclineFriend?.(req.id);
                      }}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: "none",
                        background: "var(--danger-soft)", color: "var(--danger)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, transition: "background 0.15s",
                        touchAction: "manipulation",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--danger)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "var(--danger-soft)"}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pendingMessages.length > 0 && (
              <div className="friend-category">
                <span className="category-label" style={{ color: "var(--warning)" }}>
                  {t("Message requests, {count}", { count: pendingMessages.length })}
                </span>
                {pendingMessages.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 8px", borderRadius: 8,
                      background: "var(--surface-2)", marginBottom: 4,
                    }}
                  >
                    <div className="friend-avatar" style={{ flexShrink: 0 }}>
                      <Avatar name={req.username} size={32} user={req} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="friend-name" style={{ fontSize: 13 }}>{req.username}</span>
                      {req.preview ? (
                        <span style={{ display: "block", fontSize: 11, opacity: 0.72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {req.preview}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      title={t("Accept")}
                      aria-label={t("Accept message request")}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onAcceptMessageRequest?.(req.id);
                      }}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: "none",
                        background: "var(--success-soft)", color: "var(--success)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                        touchAction: "manipulation",
                      }}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      title={t("Decline")}
                      aria-label={t("Decline message request")}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeclineMessageRequest?.(req.id);
                      }}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: "none",
                        background: "var(--danger-soft)", color: "var(--danger)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                        touchAction: "manipulation",
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {onlineFriends.length > 0 && (
              <div className="friend-category">
                <span className="category-label">{t("Online, {count}", { count: onlineFriends.length })}</span>
                {onlineFriends.map((friend) => (
                  <motion.button
                    key={friend.id}
                    className="friend-item"
                    onClick={() => onFriendSelect?.(friend)}
                    whileHover={undefined}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <div className="friend-avatar">
                      <Avatar 
                        name={resolveDisplayName(friend)} 
                        size={32}
                        user={friend}
                      />
                      <StatusBadge
                        status={safeOnlineUsers.find((u) => u.id === friend.id)?.status || "online"}
                      />
                    </div>
                    <div className="friend-meta">
                      <span className="friend-name">
                        {resolveDisplayName(friend)}
                        <AdminBadge user={friend} variant="inline" />
                      </span>
                      {(friend.customStatus || friend.custom_status) && (
                        <span className="friend-custom-status">
                          {friend.customStatus || friend.custom_status}
                        </span>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {offlineFriends.length > 0 && (
              <div className="friend-category">
                <span className="category-label">{t("Offline, {count}", { count: offlineFriends.length })}</span>
                {offlineFriends.map((friend) => (
                  <motion.button
                    key={friend.id}
                    className="friend-item offline"
                    onClick={() => onFriendSelect?.(friend)}
                    whileHover={undefined}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <div className="friend-avatar">
                      <Avatar
                        name={resolveDisplayName(friend)}
                        size={32}
                        user={friend}
                      />
                      <StatusBadge status="offline" />
                    </div>
                    <div className="friend-meta">
                      <span className="friend-name">
                        {resolveDisplayName(friend)}
                        <AdminBadge user={friend} variant="inline" />
                      </span>
                      {(friend.customStatus || friend.custom_status) && (
                        <span className="friend-custom-status">
                          {friend.customStatus || friend.custom_status}
                        </span>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
            {loading && safeFriends.length === 0 && pendingRequests.length === 0 && pendingMessages.length === 0 ? (
              <ConversationListSkeleton count={6} label={t("Loading conversations")} />
            ) : safeFriends.length === 0 && pendingRequests.length === 0 && pendingMessages.length === 0 ? (
              <div className="sidebar-empty-friends">
                <div className="empty-illustration empty-illu-friends compact" aria-hidden="true">
                  <div className="empty-illu-blob" />
                  <div className="empty-illu-blob secondary" />
                </div>
                <strong>{t("No friends yet")}</strong>
                <span>{t("Share your invite link, friends join free and connect with you instantly.")}</span>
                <div className="sidebar-empty-friends-actions">
                  <button type="button" className="mkt-btn mkt-btn-soft" onClick={onQuickAdd}>
                    {t("Add friend")}
                  </button>
                </div>
              </div>
            ) : null}
      </SidebarSectionContent>
    </div>
  );
}
