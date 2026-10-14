import { useState, useCallback, useEffect, useMemo, useRef, Suspense, lazy } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Bell, X } from "lucide-react";
import NavigationRail from "./NavigationRail";
import ServerSidebar from "./ServerSidebar";
import ServersSidebar from "../servers/ServersSidebar";
import ChatPanel from "./ChatPanel";
import ErrorBoundary from "../ErrorBoundary";
import { preloadWhenIdle } from "../../lib/preloadIdle";
import FeedbackNudgeBanner from "../feedback/FeedbackNudgeBanner";
import QuickFeedbackModal from "../feedback/QuickFeedbackModal";
import { useActivity } from "../../hooks/useActivity";
import { useMobile } from "../../hooks/useMobile";
import { useMobileKeyboard } from "../../hooks/useMobileKeyboard";
import { useEdgeSwipeBack } from "../../hooks/useEdgeSwipeBack";
import { useGlassUi } from "../../hooks/useGlassUi";
import { buildMainNavItems } from "./navConfig";
import { TabBarGlyph } from "./tabBarIcons";
import { GlassShellContext, GlassTabBar } from "./glass/GlassShell";
import { useTabBarDrag } from "../../hooks/useTabBarDrag";
import { useT } from "../../context/LocaleContext";
import { filterMainNavItems, usePublicFeatures, valorantPlayVisible } from "../../lib/publicFeatures";
import CookieConsentBanner from "../../site/CookieConsentBanner";
import LegalContentModal from "../legal/LegalContentModal";

const ActivitySidebar = lazy(() => import("../activity/ActivitySidebar"));
const ValorantHub = lazy(() => import("../valorant/ValorantHub"));
const UserPanel = lazy(() => import("./UserPanel"));

const VIEW_EASE = [0.22, 1, 0.36, 1];

function mainViewId(activeView) {
  // Play overlays the same slot. A separate motion key remounts the
  // wrapper and lets the underlying server/group empty flash through.
  void activeView;
  return "app";
}

/**
 * Single shared layout, desktop grid, mobile drawer adaptation.
 */
export default function AppLayout({
  children,
  me,
  socket,
  onLogout,
  onProfileUpdated,
  activeDmUser,
  activeGroup,
  groups,
  dms,
  friends,
  onlineUsers,
  onDmSelect,
  onDmPrefAction,
  onGroupSelect,
  onSendMessage,
  onVoiceCall,
  onVideoCall,
  onGroupVoiceCall,
  onGroupVideoCall,
  onStartCall,
  onStartGroupCallFromCalls,
  onAdminClick,
  isAdmin,
  onRefreshGroups,
  onGroupCreated,
  onGroupLeft,
  onGroupRenamed,
  onRefresh,
  friendNotice,
  activeCallBanner,
  onJoinActiveCall,
  onLeaveVoiceRoom,
  isInGroupVoiceRoom = false,
  onDismissActiveBanner,
  friendRequests,
  onAcceptFriend,
  onDeclineFriend,
  notifPermission,
  onRequestNotifPermission,
  typingDmUser,
  typingGroupUsers,
  typingChannelUsers,
  onTypingDmStart,
  onTypingDmStop,
  onTypingGroupStart,
  onTypingGroupStop,
  onTypingChannelStart,
  onTypingChannelStop,
  dmUnread = {},
  groupUnread = {},
  myStatus = "online",
  onStatusChange,
  replyTo = null,
  onClearReply,
  editingMessage = null,
  onCancelEdit,
  onSaveEdit,
  activeView: controlledActiveView,
  onActiveViewChange,
  userPanelOpen: controlledUserPanelOpen,
  onUserPanelOpenChange,
  settingsTab,
  onSettingsTabChange,
  activeTimeout = null,
  friendsLoaded = true,
  groupsLoaded = true,
  servers = [],
  serversLoaded = false,
  activeServer = null,
  activeChannel = null,
  channelUnread = {},
  ownedServerCount = 0,
  maxOwnedServers = 10,
  onServerSelect,
  onChannelSelect,
  onServerBack,
  onChannelBack,
  onCreateServer,
  onLeaveServer,
  onDeleteServer,
  onCreateChannel,
  onUpdateChannel,
  onDeleteChannel,
  onRolesChanged,
  serverFolders = [],
  onServerFoldersChange,
  onMoveServerToFolder,
  onReorderServers,
  onRefreshServers,
  onJoinServer,
  onServerUpdated,
  serverVoice = null,
}) {
  const t = useT();
  const publicFeatures = usePublicFeatures();
  const showPlay = valorantPlayVisible(publicFeatures);
  const { isMobile } = useMobile();
  const reduceMotion = useReducedMotion();
  // Liquid Glass navigation shell (Stage 2): iPhone app (html.glass-ui) + mobile
  // layout only. Off → the exact pre-glass tree (desktop / web / Android / iPad).
  const glassUi = useGlassUi();
  const glassShell = Boolean(glassUi && isMobile);
  const animateMainViews = isMobile && !reduceMotion;
  useMobileKeyboard(isMobile);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [localActiveView, setLocalActiveView] = useState("chat");
  const [localUserPanelOpen, setLocalUserPanelOpen] = useState(false);
  const activeView = controlledActiveView ?? localActiveView;
  const userPanelOpen = controlledUserPanelOpen ?? localUserPanelOpen;
  const hideDesktopPlaySidebar = !isMobile && activeView === "play";
  const setActiveView = useCallback((view) => {
    if (onActiveViewChange) onActiveViewChange(view);
    else setLocalActiveView(view);
  }, [onActiveViewChange]);
  const setUserPanelOpen = useCallback((open) => {
    if (onUserPanelOpenChange) onUserPanelOpenChange(open);
    else setLocalUserPanelOpen(open);
  }, [onUserPanelOpenChange]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState("friend");
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackInitialType, setFeedbackInitialType] = useState("suggestion");

  const activity = useActivity({ socket, me, friends });

  const closeMobileDrawer = useCallback(() => setMobileDrawerOpen(false), []);
  const openMobileDrawer = useCallback(() => setMobileDrawerOpen(true), []);

  useEffect(() => {
    const onOpenFeedback = (event) => {
      const type = event?.detail?.type;
      setFeedbackInitialType(
        type === "bug" || type === "praise" || type === "suggestion" ? type : "suggestion"
      );
      setShowFeedbackModal(true);
    };
    window.addEventListener("descall:open-feedback", onOpenFeedback);
    return () => window.removeEventListener("descall:open-feedback", onOpenFeedback);
  }, []);

  useEffect(
    () =>
      preloadWhenIdle([
        () => import("../activity/ActivitySidebar"),
        () => import("../valorant/ValorantHub"),
        () => import("./UserPanel"),
      ]),
    []
  );

  const openUserPanel = useCallback(() => {
    setUserPanelOpen(true);
    if (isMobile) setMobileDrawerOpen(false);
  }, [isMobile, setUserPanelOpen]);

  const closeUserPanel = useCallback(() => {
    setUserPanelOpen(false);
    // Play / Activity are full-page surfaces, never reopen the chat drawer over them.
    if (
      isMobile &&
      activeView !== "play" &&
      activeView !== "activity" &&
      !activeDmUser &&
      !activeGroup &&
      !(activeView === "servers" && activeChannel)
    ) {
      setMobileDrawerOpen(true);
    }
  }, [isMobile, activeDmUser, activeGroup, activeServer, activeChannel, activeView, setUserPanelOpen]);

  useEffect(() => {
    if (!isMobile) setMobileDrawerOpen(false);
  }, [isMobile]);

  // Mobile: keep the sidebar open for server list + channel list.
  // Only treat an opened channel as "in conversation" (main pane).
  // Play / Activity own the viewport (rail is inside their page or unused) —
  // forcing the drawer open here left a rail-only shell over LFG and broke layout.
  useEffect(() => {
    if (!isMobile) return;
    if (activeView === "play" || activeView === "activity") {
      setMobileDrawerOpen(false);
      return;
    }
    const inServersChannel = activeView === "servers" && !!activeChannel;
    if (!activeDmUser && !activeGroup && !inServersChannel) {
      setMobileDrawerOpen(true);
    }
  }, [isMobile, activeDmUser, activeGroup, activeChannel, activeView]);

  useEffect(() => {
    if (!isMobile || !mobileDrawerOpen) return;
    // Phone web Liquid Glass: the document is the scroll container so Safari's
    // floating toolbar composites over the aurora. An inline overflow lock
    // clips that region to black. Native and the classic drawer keep the lock.
    const native = document.documentElement.classList.contains("native-app");
    if (glassShell && !native) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, mobileDrawerOpen, glassShell]);

  useEffect(() => {
    if (!isMobile || !userPanelOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, userPanelOpen]);

  useEffect(() => {
    if (!userPanelOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeUserPanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userPanelOpen, closeUserPanel]);

  const handleDmSelect = useCallback((dm) => {
    onDmSelect?.(dm);
    if (isMobile) setMobileDrawerOpen(false);
  }, [onDmSelect, isMobile]);

  const handleGroupSelect = useCallback((group) => {
    onGroupSelect?.(group);
    if (isMobile) setMobileDrawerOpen(false);
  }, [onGroupSelect, isMobile]);

  const handleOpenChatFromCalls = useCallback((user) => {
    if (!user?.id) return;
    setActiveView("chat");
    handleDmSelect(user);
  }, [handleDmSelect]);

  const handleOpenGroupFromCalls = useCallback((group) => {
    if (!group?.id) return;
    setActiveView("groups");
    handleGroupSelect(group);
  }, [handleGroupSelect]);

  const handleStartCall = useCallback((user, type = "voice") => {
    if (!user?.id) return;
    onStartCall?.(user, type);
  }, [onStartCall]);

  const handleStartGroupCallFromCalls = useCallback((group, type = "voice") => {
    if (!group?.id) return;
    onStartGroupCallFromCalls?.(group, type);
  }, [onStartGroupCallFromCalls]);

  const handleViewChange = useCallback((view) => {
    // Parent onActiveViewChange owns the URL. Do NOT call onDmSelect(null) /
    // onGroupSelect(null) / onServerBack here, those navigate to /direct,
    // /groups, or /servers and race the destination path (first click looks
    // like a no-op; second click finally sticks).
    setActiveView(view);
    if (userPanelOpen) closeUserPanel();
    if (isMobile) {
      setMobileDrawerOpen(view !== "play" && view !== "activity");
    }
  }, [isMobile, setActiveView, userPanelOpen, closeUserPanel]);

  const handleMobileBack = useCallback(() => {
    // Servers: channel → channel list → server list
    if (activeView === "servers" && activeChannel) {
      onChannelBack?.();
      openMobileDrawer();
      return;
    }
    if (activeView === "servers" && activeServer) {
      onServerBack?.();
      openMobileDrawer();
      return;
    }
    if (activeDmUser) onDmSelect?.(null);
    if (activeGroup) onGroupSelect?.(null);
    openMobileDrawer();
  }, [
    activeView,
    activeDmUser,
    activeGroup,
    activeServer,
    activeChannel,
    onDmSelect,
    onGroupSelect,
    onServerBack,
    onChannelBack,
    openMobileDrawer,
  ]);

  const closePlay = useCallback(() => handleViewChange("chat"), [handleViewChange]);

  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.isElectron;
  const inServersChannel = activeView === "servers" && !!activeServer && !!activeChannel;
  const inConversation = !!(activeDmUser || activeGroup || inServersChannel);
  // Mobile main navigation: the bottom tab bar and the rail + list drawer only
  // show on root tabs. Inner screens (open DM / group / channel, settings) hide
  // it, and so does Play (full-page, own ‹ Descall back). Only those screens
  // get the iOS edge swipe-back; it runs the same back handler as their ‹ button.
  const showMobileTabBar = isMobile && !inConversation && (!userPanelOpen || glassShell);
  const isPlayPage = activeView === "play" && showPlay;
  const mobileNavHidden = isMobile && !mobileDrawerOpen && (!showMobileTabBar || isPlayPage);
  const mainSlotRef = useRef(null);
  const sidebarShellRef = useRef(null);
  useEdgeSwipeBack({
    // Settings has its own swipe-back (UserPanel); Activity keeps its rail.
    enabled: mobileNavHidden && !userPanelOpen && activeView !== "activity" && (isPlayPage || inConversation),
    onBack: isPlayPage ? closePlay : handleMobileBack,
    surfaceRef: mainSlotRef,
    // The list drawer is the real previous screen of a conversation, it slides
    // in live underneath. Play has no list mounted under it → skeleton placeholder.
    underlayRef: isPlayPage ? null : sidebarShellRef,
    placeholder: isPlayPage,
    priority: 10,
  });
  // Root tabs have no previous page: an edge drag is fully inert there (no
  // rubber-band, no navigation), same as iOS root views (2.9.151).
  // On a narrow conversation surface the fixed banner sits directly over the
  // DM header, stealing profile/voice-call taps. Offer it once the user leaves
  // the conversation instead.
  const showNotifBanner =
    !isElectron &&
    !notifBannerDismissed &&
    notifPermission === "default" &&
    !(isMobile && inConversation);

  const handleAddClick = (tab) => {
    const nextTab =
      tab === "friend" || tab === "group" || tab === "quickadd"
        ? tab
        : activeView === "groups"
          ? "group"
          : "friend";
    setAddTab(nextTab);
    setShowAddModal(true);
    // Activity replaces ServerSidebar (where the Add Friend modal lives).
    // Switch to Friends so the modal can mount, otherwise the CTA is a no-op.
    if (activeView === "activity") {
      setActiveView("friends");
      if (isMobile) setMobileDrawerOpen(true);
    }
  };

  const navBadges = useMemo(() => {
    const total = (map) =>
      Object.values(map || {}).reduce((sum, value) => {
        const count = Number(value) || 0;
        return count > 0 ? sum + count : sum;
      }, 0);
    return {
      chat: total(dmUnread),
      groups: total(groupUnread),
      servers: total(channelUnread),
    };
  }, [dmUnread, groupUnread, channelUnread]);

  const glassTabItems = useMemo(
    () => (glassShell ? filterMainNavItems(buildMainNavItems(t), publicFeatures) : []),
    [glassShell, t, publicFeatures]
  );
  const classicTabItems = useMemo(() => {
    if (glassShell) return [];
    const main = filterMainNavItems(
      [
        { id: "chat", label: t("Chat") },
        { id: "servers", label: t("Servers") },
        { id: "friends", label: t("Friends") },
        { id: "play", label: t("Play") },
        { id: "calls", label: t("Calls") },
        { id: "activity", label: t("Activity") },
      ],
      publicFeatures
    );
    return [...main, { id: "you", label: t("You"), settings: true }];
  }, [glassShell, publicFeatures, t]);
  const classicActiveIndex = Math.max(0, classicTabItems.findIndex((item) => item.id === activeView));
  const { navRef: classicNavRef, lensRef: classicLensRef } = useTabBarDrag({
    count: classicTabItems.length,
    activeIndex: classicActiveIndex,
    enabled: !glassShell && showMobileTabBar && classicTabItems.length > 1,
    mode: "stride",
    hotClass: "active",
    onCommit: (index) => {
      const item = classicTabItems[index];
      if (!item) return;
      if (item.settings) openUserPanel();
      else if (item.id !== activeView) handleViewChange(item.id);
    },
  });
  const pendingFriendCount = Array.isArray(friendRequests) ? friendRequests.length : 0;
  const glassTabBadges = useMemo(
    () => ({ ...navBadges, friends: pendingFriendCount }),
    [navBadges, pendingFriendCount]
  );
  const glassShellValue = useMemo(
    () =>
      glassShell
        ? { me, myStatus, onRefresh }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [glassShell, me, myStatus, onRefresh]
  );

  const handleVoiceClick = () => {
    if (activeDmUser && onVoiceCall) onVoiceCall();
    else if (activeGroup && onGroupVoiceCall) onGroupVoiceCall();
  };

  const [consentLegal, setConsentLegal] = useState(null);

  return (
    <GlassShellContext.Provider value={glassShellValue}>
    <div
      className={`app-root${isMobile ? " is-mobile" : ""}${glassShell ? " g-shell" : ""}${mobileDrawerOpen ? " mobile-drawer-open" : ""}${userPanelOpen ? " mobile-settings-open" : ""}${isMobile && inConversation ? " in-conversation" : ""}`}
      data-view={activeView}
    >
      <div className="g-theme-stage" aria-hidden="true">
        <span className="g-theme-wash" />
        <span className="g-theme-drift" />
        <span className="g-theme-specks" />
        <span className="g-theme-sheen" />
      </div>
      <AnimatePresence>
        {showNotifBanner && (
          <motion.div
            initial={{ y: -48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -48, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 380 }}
            className="app-notif-banner"
          >
            <Bell size={15} style={{ flexShrink: 0 }} />
            <span>{t("Allow notifications for messages, calls, and mentions")}</span>
            <button
              type="button"
              className="app-notif-banner-btn"
              onClick={async () => {
                await onRequestNotifPermission?.();
                setNotifBannerDismissed(true);
              }}
            >
              {t("Allow")}
            </button>
            <button
              type="button"
              className="app-notif-banner-dismiss"
              onClick={() => setNotifBannerDismissed(true)}
             aria-label={t("Close")}>
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Soft feedback reminder, top banner, auto-hides in 10s */}
      {me && !showNotifBanner && <FeedbackNudgeBanner enabled />}
      <QuickFeedbackModal isOpen={showFeedbackModal} initialType={feedbackInitialType} onClose={() => setShowFeedbackModal(false)} />

      {/* Mobile drawer backdrop */}
      <AnimatePresence>
        {isMobile && mobileDrawerOpen && (
          <motion.button
            type="button"
            className="mobile-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label={t("Close menu")}
            onClick={closeMobileDrawer}
          />
        )}
      </AnimatePresence>

      {/* Sidebar shell: left vertical nav rail + list sidebar (desktop + mobile drawer). */}
      <div ref={sidebarShellRef} className={`app-sidebar-shell${mobileDrawerOpen ? " open" : ""}`}>
        <NavigationRail
          activeView={activeView}
          onViewChange={handleViewChange}
          onAdminClick={onAdminClick}
          onUserClick={openUserPanel}
          onAddClick={handleAddClick}
          onVoiceClick={handleVoiceClick}
          me={me}
          isAdmin={isAdmin}
          myStatus={myStatus}
          onStatusChange={onStatusChange}
          onProfileUpdated={onProfileUpdated}
          badges={navBadges}
          glass={glassShell}
        />

        {hideDesktopPlaySidebar ? null : activeView === "activity" ? (
          <Suspense fallback={null}>
            <ErrorBoundary scope="pane">
              <ActivitySidebar
                friends={friends}
                friendPresence={activity.friendPresence}
                onlineUsers={onlineUsers}
                onRefresh={onRefresh}
                onAddFriend={() => handleAddClick("friend")}
                onFriendSelect={handleDmSelect}
                me={me}
                myStatus={myStatus}
                history={activity.history}
                currentActivity={activity.currentActivity}
                privacy={activity.settings?.privacy}
              />
            </ErrorBoundary>
          </Suspense>
        ) : activeView === "servers" ? (
          <ServersSidebar
            servers={servers}
            serversLoaded={serversLoaded}
            serverFolders={serverFolders}
            onServerFoldersChange={onServerFoldersChange}
            onMoveServerToFolder={onMoveServerToFolder}
            activeServer={activeServer}
            activeChannel={activeChannel}
            channelUnread={channelUnread}
            ownedCount={ownedServerCount}
            maxOwned={maxOwnedServers}
            onSelectServer={onServerSelect}
            onSelectChannel={onChannelSelect}
            onBackToList={onServerBack}
            onCreateServer={onCreateServer}
            onLeaveServer={onLeaveServer}
            onDeleteServer={onDeleteServer}
            onCreateChannel={onCreateChannel}
            onUpdateChannel={onUpdateChannel}
            onDeleteChannel={onDeleteChannel}
            onRolesChanged={onRolesChanged}
            onReorderServers={onReorderServers}
            onRefresh={onRefreshServers}
            onJoinServer={onJoinServer}
            onServerUpdated={onServerUpdated}
            serverVoice={serverVoice}
            onMobileClose={isMobile ? closeMobileDrawer : undefined}
            isMobile={isMobile}
          />
        ) : (
          <ServerSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            activeView={activeView}
            activeDmUser={activeDmUser}
            activeGroup={activeGroup}
            groups={groups}
            dms={dms}
            friends={friends}
            onlineUsers={onlineUsers}
            socket={socket}
            me={me}
            onDmSelect={handleDmSelect}
            onDmPrefAction={onDmPrefAction}
            onGroupSelect={handleGroupSelect}
            showAddModal={showAddModal}
            setShowAddModal={setShowAddModal}
            addTab={addTab}
            setAddTab={setAddTab}
            onFriendSelect={handleDmSelect}
            onRefreshGroups={onRefreshGroups}
            onGroupCreated={onGroupCreated}
            onGroupLeft={onGroupLeft}
            onGroupRenamed={onGroupRenamed}
            onRefresh={onRefresh}
            friendRequests={friendRequests}
            onAcceptFriend={onAcceptFriend}
            onDeclineFriend={onDeclineFriend}
            onMobileClose={isMobile ? closeMobileDrawer : undefined}
            isMobile={isMobile}
            dmUnread={dmUnread}
            groupUnread={groupUnread}
            friendsLoaded={friendsLoaded}
            groupsLoaded={groupsLoaded}
            onStartCall={handleStartCall}
            onStartGroupCall={handleStartGroupCallFromCalls}
            onOpenChatFromCalls={handleOpenChatFromCalls}
            onOpenGroupFromCalls={handleOpenGroupFromCalls}
          />
        )}
      </div>

      <div ref={mainSlotRef} className="app-main-slot">
        <AnimatePresence initial={false}>
          <motion.div
            key={mainViewId(activeView)}
            className="app-main-view"
            initial={animateMainViews ? (glassShell ? { opacity: 0 } : { opacity: 0, y: 20 }) : false}
            animate={glassShell ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={
              animateMainViews
                ? glassShell
                  ? { opacity: 0, position: "absolute", top: 0, left: 0, right: 0, height: "100%" }
                  : { opacity: 0, y: 12, position: "absolute", top: 0, left: 0, right: 0, height: "100%" }
                : undefined
            }
            transition={
              animateMainViews
                ? glassShell
                  ? { duration: 0.18, ease: "easeOut" } // iOS tab switch: instant, cross-fade only
                  : { duration: 0.38, ease: VIEW_EASE }
                : { duration: 0 }
            }
          >
            {activeView === "play" && showPlay ? (
              <Suspense fallback={null}>
                <ErrorBoundary scope="pane">
                  <ValorantHub
                    me={me}
                    socket={socket}
                    onClose={closePlay}
                    onGroupCreated={onGroupCreated}
                    onOpenGroup={(group) => {
                      handleGroupSelect(group);
                      setActiveView("groups");
                    }}
                    onJoinVoice={(group) => {
                      handleGroupSelect(group);
                      setActiveView("groups");
                      window.setTimeout(() => onGroupVoiceCall?.(), 80);
                    }}
                  />
                </ErrorBoundary>
              </Suspense>
            ) : null}
            <div
              className={activeView === "play" ? "app-chat-keep hidden" : "app-chat-keep"}
              hidden={activeView === "play"}
              aria-hidden={activeView === "play"}
            >
              <ErrorBoundary scope="pane">
              <ChatPanel
                activeView={activeView}
                activeDmUser={activeDmUser}
                activeGroup={activeGroup}
                activeServer={activeServer}
                activeChannel={activeChannel}
                socket={socket}
                me={me}
                activeTimeout={activeTimeout}
                sidebarCollapsed={sidebarCollapsed}
                onlineUsers={onlineUsers}
                friendNotice={friendNotice}
                onSendMessage={onSendMessage}
                onVoiceCall={onVoiceCall}
                onVideoCall={onVideoCall}
                onGroupVoiceCall={onGroupVoiceCall}
                onGroupVideoCall={onGroupVideoCall}
                activeCallBanner={activeCallBanner}
                onJoinActiveCall={onJoinActiveCall}
                onLeaveVoiceRoom={onLeaveVoiceRoom}
                isInGroupVoiceRoom={isInGroupVoiceRoom}
                onDismissActiveBanner={onDismissActiveBanner}
                activity={{ ...activity, me }}
                friends={friends}
                typingDmUser={typingDmUser}
                typingGroupUsers={typingGroupUsers}
                typingChannelUsers={typingChannelUsers}
                onTypingDmStart={onTypingDmStart}
                onTypingDmStop={onTypingDmStop}
                onTypingGroupStart={onTypingGroupStart}
                onTypingGroupStop={onTypingGroupStop}
                onTypingChannelStart={onTypingChannelStart}
                onTypingChannelStop={onTypingChannelStop}
                replyTo={replyTo}
                onClearReply={onClearReply}
                editingMessage={editingMessage}
                onCancelEdit={onCancelEdit}
                onSaveEdit={onSaveEdit}
                isMobile={isMobile}
                onMenuClick={openMobileDrawer}
                onMobileBack={handleMobileBack}
                showMobileBack={isMobile && inConversation}
                onAddClick={handleAddClick}
                onViewChange={handleViewChange}
                onStartCall={handleStartCall}
                onStartGroupCall={handleStartGroupCallFromCalls}
                onOpenChatFromCalls={handleOpenChatFromCalls}
                onOpenGroupFromCalls={handleOpenGroupFromCalls}
                onStartDm={handleOpenChatFromCalls}
                onRefresh={onRefresh}
                groups={groups}
                serverVoice={serverVoice}
              >
                {children}
              </ChatPanel>
              </ErrorBoundary>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {userPanelOpen && (
          <Suspense fallback={null}>
            <ErrorBoundary scope="pane">
              <UserPanel
                key="user-settings-panel"
                me={me}
                onClose={closeUserPanel}
                onLogout={onLogout}
                onProfileUpdated={onProfileUpdated}
                myStatus={myStatus}
                onStatusChange={onStatusChange}
                initialTab={settingsTab}
                onTabChange={onSettingsTabChange}
                activity={activity}
              />
            </ErrorBoundary>
          </Suspense>
        )}
      </AnimatePresence>

      {glassShell ? (
        showMobileTabBar && (!isPlayPage || glassShell) ? (
          <>
            <div className="g-edge-bot" aria-hidden="true" />
            <GlassTabBar
              items={glassTabItems}
              activeId={userPanelOpen ? null : activeView}
              onSelect={handleViewChange}
              badges={glassTabBadges}
            />
          </>
        ) : null
      ) : null}
      {!glassShell && showMobileTabBar && (
        <nav className="mobile-tab-bar" ref={classicNavRef} aria-label={t("Primary")} style={{ touchAction: "pan-y" }}>
          <span ref={classicLensRef} className="mobile-tab-lens" aria-hidden="true" />
          {classicTabItems.map((item, index) => {
            const on = item.settings ? false : activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-tab-index={index}
                className={`mobile-tab${on ? " active" : ""}`}
                aria-current={on ? "page" : undefined}
                onClick={() => (item.settings ? openUserPanel() : handleViewChange(item.id))}
              >
                <TabBarGlyph id={item.id} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
      <CookieConsentBanner variant="app" onOpenPrivacy={() => setConsentLegal("privacy")} />
      <LegalContentModal
        open={Boolean(consentLegal)}
        type={consentLegal || "privacy"}
        onClose={() => setConsentLegal(null)}
      />
    </div>
    </GlassShellContext.Provider>
  );
}
