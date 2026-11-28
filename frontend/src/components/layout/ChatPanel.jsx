import { Suspense, lazy, useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback, useSyncExternalStore, cloneElement, isValidElement } from "react";
import { DetailPaneSkeleton } from "../ui/Skeleton";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Phone, Video, Users, Hash,
  Search, MessageSquare, X, ChevronDown, ChevronRight, Menu, ChevronLeft,
  UserPlus, Plus, Crown, Pin, Timer, ImagePlus, ShieldCheck,
} from "../ui/Icon.jsx";
import { useGroupMemberMenu, GroupRemovedBanner } from "../groups/GroupMemberRemoval";
import { groupRoleOf } from "../../lib/groupMembers";
import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import MessageList from "../chat/MessageList";
import MessageComposer from "../chat/MessageComposer";
import ActiveCallBanner from "../ActiveCallBanner";
import ActivityView from "../activity/ActivityView";
import TypingIndicator from "../chat/TypingIndicator";
import EmptyState from "../ui/EmptyState";
import { useOnboarding } from "../onboarding/OnboardingContext";
import { OnbMainSlot, OnbJoinedSlot } from "../onboarding/slots";
import CallsView from "../calls/CallsView";
import { getToken } from "../../lib/storage";
import { subscribeTyping, getTypingSnapshot } from "../../lib/typingStore";
import { apiBase } from "../../lib/nodeRouting";
import SearchResults from "../chat/search/SearchResults.jsx";
import { getPresenceStatus, STATUS_META, isVisiblyOnline } from "../../lib/presence";
import { resolveDisplayName } from "../../lib/userProfile";
import { mediaTypeLabel } from "../../lib/listPreview.js";
import { useLocale } from "../../context/LocaleContext";
import { formatDate, upper } from "../../i18n/format";
import { channelTopicText } from "../../i18n/serverTemplateTopics.js";
import { channelDisplayName, channelTopicL10n, messageL10n, serverDisplayName } from "../../lib/serverL10n.js";
import { TopicMarkerToggle, useOriginalsVersion } from "../servers/l10n/ServerL10nBits.jsx";
import { displayText } from "../../lib/profanity";
import { useBlockedUserIds } from "../../lib/blockedUsers";
import BlockUserButton from "../social/BlockUserButton";
import AdminBadge from "../social/AdminBadge";
import PopOutButton from "../../premium/desktop/PopOutButton.jsx";
import PremiumBadge from "../../premium/PremiumBadge.jsx";
import UserProfileModal from "../social/UserProfileModal";
import ServerMembersPanel from "../servers/ServerMembersPanel";
import ServerVoicePanel from "../servers/ServerVoicePanel";
import { serverHasPermission, serverPermissionsLoaded } from "../../lib/serverPermissions";
import { isTextLikeChannel, useChannelPerms, channelHasPermission, channelPermsKnown } from "../../lib/channelPermissions";
import useGlassUi from "../../hooks/useGlassUi";
import GroupIcon from "../groups/GroupIcon";
import GroupInfoSheet from "../groups/GroupInfoSheet";
import { useGroupActions } from "./ServerSidebar";
import { groupAvatarUrl } from "../../lib/avatarFile";
import PinnedMessagesPopover from "./PinnedMessagesPopover";
import { HELLO_STICKER_TOKEN } from "../../lib/descallStickers";
import { typingFlareKey } from "../../lib/typingFlare.js";
import {
  readServerMembersPanelOpen,
  writeServerMembersPanelOpen,
  subscribeServerMembersPanel,
  serverMembersPanelDocks,
  resolveMembersPanelOpen,
} from "../../lib/serverMembersPanelPref.js";
const DmGiftStrip = lazy(() => import("../../plus2/PlusBits.jsx").then((m) => ({ default: m.DmGiftStrip })));

function glassGroupInitials(name, locale) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return upper(parts[0][0] + parts[1][0], locale);
  return upper(parts[0]?.[0] || "", locale);
}

export default function ChatPanel({
  historyLoadError = false,
  onGroupAvatarChanged,
  onGroupLeft,
  onGroupRenamed,
  onGroupMemberAdded,
  onGroupMemberRemoved,
  onGroupRoleChanged,
  onRemovedGroupDismiss,
  activeView,
  activeDmUser,
  activeGroup,
  activeServer = null,
  activeChannel = null,
  socket,
  me,
  sidebarCollapsed,
  onlineUsers,
  messages = [],
  friendNotice,
  onSendMessage,
  onVoiceCall,
  onVideoCall,
  onGroupVoiceCall,
  onGroupVideoCall,
  activity,
  friends,
  typingDmUser: typingDmUserProp,
  typingGroupUsers: typingGroupUsersProp,
  typingChannelUsers: typingChannelUsersProp,
  onTypingDmStart,
  onTypingDmStop,
  onTypingGroupStart,
  onTypingGroupStop,
  onTypingChannelStart,
  onTypingChannelStop,
  replyTo = null,
  onClearReply,
  editingMessage = null,
  onCancelEdit,
  onSaveEdit,
  isMobile = false,
  onMenuClick,
  onMobileBack,
  showMobileBack = false,
  onAddClick,
  onViewChange,
  onStartCall,
  activitySplitView = false,
  onOpenChatFromCalls,
  onStartGroupCall,
  onOpenGroupFromCalls,
  onStartDm,
  onRefresh,
  groups = [],
  activeTimeout = null,
  children,
  serverVoice = null,
}) {
  const { t, locale } = useLocale();
  // Draft C: a "Show original" toggle on a topic re-renders the header.
  useOriginalsVersion();
  const glass = useGlassUi();
  const messagesRef = useRef(null);
  // Live typing comes from lib/typingStore (App no longer re-renders per typing
  // event); explicit props still win so the panel can be driven directly.
  const typingLive = useSyncExternalStore(subscribeTyping, getTypingSnapshot, getTypingSnapshot);
  const typingDmUser = typingDmUserProp !== undefined ? typingDmUserProp : typingLive.dm;
  const typingGroupUsers = typingGroupUsersProp !== undefined ? typingGroupUsersProp : typingLive.group;
  const typingChannelUsers = typingChannelUsersProp !== undefined ? typingChannelUsersProp : typingLive.channel;
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Members panel: beside a server text channel on the desktop layout it follows the
  // saved choice (lib/serverMembersPanelPref.js) across channel, server and tab
  // switches and reloads. Groups, voice rooms and the phone sheet keep local state.
  const [looseMembers, setLooseMembers] = useState(false);
  const savedServerMembers = useSyncExternalStore(subscribeServerMembersPanel, readServerMembersPanelOpen, readServerMembersPanelOpen);
  const [showPinned, setShowPinned] = useState(false);
  const membersDock = serverMembersPanelDocks({
    isMobile,
    activeView,
    hasServer: Boolean(activeServer),
    channelType: activeChannel?.type || null,
  });
  const showMembers = resolveMembersPanelOpen({
    docks: membersDock,
    saved: savedServerMembers,
    local: looseMembers,
    searchOpen: showSearch,
    pinnedOpen: showPinned,
  });
  const setShowMembers = useCallback((open) => {
    if (membersDock) {
      writeServerMembersPanelOpen(open);
      if (open) { setShowSearch(false); setShowPinned(false); }
    } else {
      setLooseMembers(Boolean(open));
    }
  }, [membersDock]);
  const pinButtonRef = useRef(null);
  // DM header "⋯" (A2, mockup #05): pinned messages, pin chat, mute, report, block.
  // Same handlers as the sidebar swipe actions / row menu.
  const groupActions = useGroupActions({ friends, onGroupLeft, onGroupRenamed, onGroupAvatarChanged, onMemberAdded: onGroupMemberAdded });
  const groupPhoto = groupActions.groupPhoto;
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  useEffect(() => { setGroupInfoOpen(false); }, [activeGroup?.id]);
  const reduceMotion = useReducedMotion();
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [profileTarget, setProfileTarget] = useState(null);
  const groupRemoved = Boolean(activeGroup?.removed);
  const memberMenu = useGroupMemberMenu({
    group: activeGroup,
    me,
    friends,
    onOpenProfile: (user) => setProfileTarget(user),
    onStartDm,
    onRemoved: onGroupMemberRemoved,
    onRoleChanged: onGroupRoleChanged,
    onClose: () => {
      setGroupInfoOpen(false);
      if (isMobile) setShowMembers(false);
    },
  });
  const [dismissBusy, setDismissBusy] = useState(false);
  useEffect(() => {
    const openProfile = (event) => {
      const user = event.detail?.user;
      if (user?.id) setProfileTarget(user);
    };
    window.addEventListener("descall:open-profile", openProfile);
    return () => window.removeEventListener("descall:open-profile", openProfile);
  }, []);

  const conversationKey = activeGroup?.id
    ? { kind: "group", groupId: activeGroup.id }
    : activeDmUser?.id
      ? { kind: "dm", withUserId: activeDmUser.id }
      : activeView === "servers" && isTextLikeChannel(activeChannel) && activeChannel?.id
        ? { kind: "server", channelId: activeChannel.id, serverId: activeServer?.id }
        : null;

  const serverPermissionsReady =
    !activeServer ||
    serverPermissionsLoaded(activeServer) ||
    Boolean(activeServer?.isOwner);
  // Channel bits from the server (overwrites, read-only announcements, timeouts); the
  // server-wide flag only until they arrive (server audit P2 / DF-4).
  const chanPerms = useChannelPerms(socket, activeView === "servers" ? activeServer?.id : null);
  const chanPermsKnown = channelPermsKnown(chanPerms, activeChannel?.id);
  const canSendChannel =
    activeView === "servers" &&
    isTextLikeChannel(activeChannel) &&
    (chanPermsKnown
      ? channelHasPermission(activeServer, activeChannel?.id, "SEND_MESSAGES", chanPerms)
      : serverPermissionsReady && serverHasPermission(activeServer, "SEND_MESSAGES"));
  const showComposer =
    Boolean(activeDmUser || activeGroup) ||
    (activeView === "servers" &&
      isTextLikeChannel(activeChannel) &&
      (canSendChannel || (!serverPermissionsReady && !chanPermsKnown)));
  // Read-only text channel (no SEND, or a members-read-only announcement channel):
  // say so instead of an empty space. A timeout has its own banner.
  const readOnlyChannelNotice =
    activeView === "servers" &&
    isTextLikeChannel(activeChannel) &&
    !canSendChannel &&
    (chanPermsKnown || serverPermissionsReady) &&
    !chanPerms?.timedOut &&
    !activeTimeout?.timedOut
      ? activeChannel?.type === "announcement"
        ? t("chperm.readOnlyAnnouncement")
        : t("chperm.readOnlyChannel")
      : null;
  const blockedIds = useBlockedUserIds();
  // DM with someone I blocked: no messages or calls (the server enforces it too).
  const dmBlockedByMe = Boolean(activeDmUser?.id && blockedIds.has(String(activeDmUser.id)));
  const composerDisabled =
    historyLoadError ||
    Boolean(activeTimeout?.timedOut) ||
    dmBlockedByMe ||
    (!activeDmUser && !activeGroup && !canSendChannel);

  // Quick actions on an empty DM / group (ConversationStart in MessageList): the same
  // handlers as the composer's hello sticker, the header call button, the header
  // avatar and the group info "Add". The callbacks are stable (they read the latest
  // props from a ref) so the memoized MessageList does not re-render for them.
  const startRef = useRef(null);
  startRef.current = { onSendMessage, onVoiceCall, onGroupVoiceCall, activeDmUser, activeGroup, groupActions };
  const startSayHi = useCallback(() => startRef.current.onSendMessage?.(HELLO_STICKER_TOKEN), []);
  const startCall = useCallback(() => {
    const cur = startRef.current;
    if (cur.activeGroup) cur.onGroupVoiceCall?.();
    else cur.onVoiceCall?.();
  }, []);
  const startProfile = useCallback(() => {
    const user = startRef.current.activeDmUser;
    if (user) setProfileTarget(user);
  }, []);
  const startAddPeople = useCallback(() => {
    const cur = startRef.current;
    if (cur.activeGroup) cur.groupActions.run(cur.activeGroup, "add");
  }, []);
  const startOwnDm = Boolean(activeDmUser?.id && me?.id && String(activeDmUser.id) === String(me.id));
  const startCanSend = Boolean(showComposer && !composerDisabled && !groupRemoved);
  const startCanCall = Boolean(!dmBlockedByMe && !groupRemoved && !startOwnDm);
  const startCanAdd = Boolean(activeGroup && !groupRemoved);
  const conversationStart = useMemo(() => ({
    onSayHi: startCanSend ? startSayHi : null,
    onCall: startCanCall ? startCall : null,
    onProfile: startProfile,
    onAddPeople: startCanAdd ? startAddPeople : null,
  }), [startCanSend, startCanCall, startCanAdd, startSayHi, startCall, startProfile, startAddPeople]);

  useEffect(() => {
    if (!socket) return undefined;
    const onDmPinned = ({ withUserId, pinned } = {}) => {
      if (conversationKey?.kind === "dm" && withUserId === conversationKey.withUserId) {
        setPinnedMessages(pinned || []);
      }
    };
    const onGroupPinned = ({ groupId, pinned } = {}) => {
      if (conversationKey?.kind === "group" && groupId === conversationKey.groupId) {
        setPinnedMessages(pinned || []);
      }
    };
    const onServerPinned = ({ channelId, pinned } = {}) => {
      if (conversationKey?.kind === "server" && channelId === conversationKey.channelId) {
        setPinnedMessages(pinned || []);
      }
    };
    const refresh = () => {
      if (!conversationKey) return;
      if (conversationKey.kind === "dm") socket.emit("dm:pinned:list", { withUserId: conversationKey.withUserId });
      else if (conversationKey.kind === "group") socket.emit("group:pinned:list", { groupId: conversationKey.groupId });
      else if (conversationKey.kind === "server") socket.emit("server:channel:pinned:list", { channelId: conversationKey.channelId });
    };
    // A deleted or edited pinned message updates the pin list at once (polish messaging-23).
    const onGone = ({ messageId } = {}) => {
      if (!messageId) return;
      setPinnedMessages((list) => (list.some((m) => m.id === messageId) ? list.filter((m) => m.id !== messageId) : list));
    };
    const onEdited = ({ messageId, newText } = {}) => {
      if (!messageId || typeof newText !== "string") return;
      setPinnedMessages((list) => (list.some((m) => m.id === messageId)
        ? list.map((m) => (m.id === messageId ? { ...m, text: newText, content: newText } : m))
        : list));
    };
    const GONE = ["dm:message:deleted", "group:message:deleted", "server:channel:message:deleted"];
    const EDITED = ["dm:message:edited", "group:message:edited", "server:channel:message:edited"];
    GONE.forEach((ev) => socket.on(ev, onGone));
    EDITED.forEach((ev) => socket.on(ev, onEdited));
    socket.on("dm:pinned:list", onDmPinned);
    socket.on("group:pinned:list", onGroupPinned);
    socket.on("server:channel:pinned:list", onServerPinned);
    socket.on("dm:message:pinned", refresh);
    socket.on("dm:message:unpinned", refresh);
    socket.on("group:message:pinned", refresh);
    socket.on("group:message:unpinned", refresh);
    socket.on("server:channel:message:pinned", refresh);
    socket.on("server:channel:message:unpinned", refresh);
    return () => {
      GONE.forEach((ev) => socket.off(ev, onGone));
      EDITED.forEach((ev) => socket.off(ev, onEdited));
      socket.off("dm:pinned:list", onDmPinned);
      socket.off("group:pinned:list", onGroupPinned);
      socket.off("server:channel:pinned:list", onServerPinned);
      socket.off("dm:message:pinned", refresh);
      socket.off("dm:message:unpinned", refresh);
      socket.off("group:message:pinned", refresh);
      socket.off("group:message:unpinned", refresh);
      socket.off("server:channel:message:pinned", refresh);
      socket.off("server:channel:message:unpinned", refresh);
    };
  }, [socket, conversationKey?.kind, conversationKey?.withUserId, conversationKey?.groupId, conversationKey?.channelId]);

  useEffect(() => {
    setPinnedMessages([]);
    setShowPinned(false);
    setLooseMembers(false);
    setProfileTarget(null);
  }, [activeDmUser?.id, activeGroup?.id, activeChannel?.id]);

  const togglePinnedPanel = () => {
    const next = !showPinned;
    setShowPinned(next);
    // Docked server list: hidden while the popover is open, the saved choice stays.
    setLooseMembers(false);
    setShowSearch(false);
    if (next && socket && conversationKey) {
      if (conversationKey.kind === "dm") socket.emit("dm:pinned:list", { withUserId: conversationKey.withUserId });
      else if (conversationKey.kind === "group") socket.emit("group:pinned:list", { groupId: conversationKey.groupId });
      else if (conversationKey.kind === "server") socket.emit("server:channel:pinned:list", { channelId: conversationKey.channelId });
    }
  };

  const unpinMessage = (messageId) => {
    if (!socket || !conversationKey) return;
    if (conversationKey.kind === "dm") {
      socket.emit("dm:message:unpin", { messageId, toUserId: conversationKey.withUserId });
    } else if (conversationKey.kind === "group") {
      socket.emit("group:message:unpin", { messageId, groupId: conversationKey.groupId });
    } else if (conversationKey.kind === "server") {
      socket.emit("server:channel:message:unpin", {
        serverId: conversationKey.serverId,
        channelId: conversationKey.channelId,
        messageId,
      });
    }
  };

  const typingNames = useMemo(() => {
    if (activeDmUser) return typingDmUser ? [resolveDisplayName(typingDmUser)] : [];
    if (activeGroup) {
      const groupMap = typingGroupUsers?.[activeGroup.id];
      if (!(groupMap instanceof Map)) return [];
      return Array.from(groupMap.values()).map((u) => resolveDisplayName(u));
    }
    if (activeView === "servers" && isTextLikeChannel(activeChannel) && activeChannel?.id) {
      const channelMap = typingChannelUsers?.[activeChannel.id];
      if (!(channelMap instanceof Map)) return [];
      return Array.from(channelMap.values()).map((u) => resolveDisplayName(u));
    }
    return [];
  }, [
    activeDmUser,
    activeGroup,
    activeView,
    activeChannel?.id,
    activeChannel?.type,
    typingDmUser,
    typingGroupUsers,
    typingChannelUsers,
  ]);

  // The typing person's flare (not the viewer's own): lib/typingFlare.js.
  const typingFlare = useMemo(() => {
    let typers = [];
    if (activeDmUser) typers = typingDmUser ? [typingDmUser] : [];
    else if (activeGroup) {
      const groupMap = typingGroupUsers?.[activeGroup.id];
      typers = groupMap instanceof Map ? Array.from(groupMap.values()) : [];
    } else if (activeView === "servers" && activeChannel?.id) {
      const channelMap = typingChannelUsers?.[activeChannel.id];
      typers = channelMap instanceof Map ? Array.from(channelMap.values()) : [];
    }
    return typingFlareKey({ typers, activeDmUser, friends });
  }, [activeDmUser, activeGroup, activeView, activeChannel?.id, typingDmUser, typingGroupUsers, typingChannelUsers, friends]);

  const scrollToBottom = () => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
    setShowSearch(false);
    setSearchQuery("");
  }, [activeDmUser?.id, activeGroup?.id, activeChannel?.id]);

  // Close members sheet when leaving a conversation / server surface
  useEffect(() => {
    if (!activeDmUser && !activeGroup && !(activeView === "servers" && activeServer)) {
      setLooseMembers(false);
    }
  }, [activeDmUser, activeGroup, activeView, activeServer]);

  // One conversation identity at a time, never stack DM + group chrome.
  // The header remounts under chat-top-chrome (keyed) so Electron DM→group
  // never leaves a stuck header node. Group voice rings members; it is not a room.
  const headerGroup = activeGroup || null;
  const headerDm = headerGroup ? null : activeDmUser || null;
  // Avatar effects paint outside the avatar circle. In the 40px header slot
  // shrink the photo so the whole effect fits instead of being clipped square.
  const headerDmHasCosmetics = Boolean(headerDm?.equippedAvatarEffect?.effect_key);
  const headerDmAvatarSize = headerDmHasCosmetics ? 28 : 40;
  const headerGroupIconSize = 40;
  const glassServerChannel = Boolean(glass && activeView === "servers" && activeChannel);
  const glassConv = Boolean(glass && (headerDm || headerGroup || glassServerChannel));
  const glassHash = glassServerChannel && activeChannel?.type !== "voice" && activeChannel?.type !== "stage";
  // Desktop layout with nothing open (Electron, Tauri, web, iPad landscape):
  // the list column right next to this pane already carries the same title
  // ("Sohbetler" twice side by side on the owner's iPad, 27 Nov). The pane
  // keeps its actions and a screen-reader heading, not a second visible title.
  const emptyPaneTitle =
    !isMobile && !headerDm && !headerGroup && !(activeView === "servers" && activeChannel) &&
    (activeView === "chat" || activeView === "dms" || activeView === "groups" || activeView === "servers");
  // 2.11.14: DM, group and server text channels float the header pills over
  // the message list (spec splash-header-2026-10-18 §2). The panel frost moves
  // to .chat-panel-bg so the pills' own blur sees the messages under them.
  const floatingHeader = Boolean(
    !isMobile
      && activeView !== "activity" && activeView !== "friends" && activeView !== "calls"
      && (activeView === "servers" ? isTextLikeChannel(activeChannel) : Boolean(headerDm || headerGroup))
  );
  const chromeRef = useRef(null);
  const headerConversationKey = headerGroup
    ? `group:${headerGroup.id}`
    : headerDm
      ? `dm:${headerDm.id || headerDm.username || "user"}`
      : activeChannel
        ? `channel:${activeChannel.id}`
        : activeServer
          ? `server:${activeServer.id}`
          : `view:${activeView || "none"}`;

  const getTitle = () => {
    if (headerDm) return resolveDisplayName(headerDm);
    if (headerGroup) return headerGroup.name;
    if (activeView === "servers" && activeChannel) {
      return activeChannel.type === "voice" || activeChannel.type === "stage" ? channelDisplayName(activeChannel) : `#${channelDisplayName(activeChannel)}`;
    }
    if (activeServer) return serverDisplayName(activeServer);
    if (activeView === "chat") return t("Chats");
    if (activeView === "dms") return t("Direct Messages");
    if (activeView === "groups") return t("Groups");
    if (activeView === "calls")    return t("Calls");
    if (activeView === "activity") return t("Activity");
    if (activeView === "servers") return t("Servers");
    return t("Descall");
  };

  const getSubtitle = () => {
    if (headerDm) {
      const status = getPresenceStatus(onlineUsers, headerDm.id);
      const label = STATUS_META[status]?.label || "Offline";
      return t(label);
    }
    if (headerGroup) {
      return t("{count} members", { count: headerGroup.memberCount || 0 });
    }
    if (activeView === "servers" && activeChannel) {
      if (glass && activeServer?.name) {
        const shownServer = serverDisplayName(activeServer);
        const count = activeServer.memberCount || 0;
        return `${shownServer} · ${t("{count} members", { count })}`;
      }
      const topic = channelTopicText(activeChannel, t);
      if (topic) return topic;
      if (activeChannel.type === "voice") return t("Voice channel");
      if (activeChannel.type === "stage") return t("Stage channel");
      return serverDisplayName(activeServer) || t("Text channel");
    }
    if (activeServer) {
      return t("{count} members", { count: activeServer.memberCount || 1 });
    }
    return "";
  };

  // iPad and wide phones show the list beside this pane: no "open the menu" there
  // (polish world-social-06).
  const menuHidden = isMobile && !activitySplitView;
  const onboarding = useOnboarding();
  const onboardingHome = Boolean(onboarding?.active) && !isMobile && (activeView === "chat" || activeView === "dms") && !activeDmUser && !activeGroup;
  const emptyCopy = (() => {
    if (activeView === "friends") {
      const hasFriends = Array.isArray(friends) && friends.length > 0;
      return {
        title: hasFriends ? t("Pick a friend") : t("Find your friends"),
        body: menuHidden
          ? (hasFriends
            ? t("Open the menu to pick a friend or start a new conversation")
            : t("Open the menu to see friends and who is online"))
          : (hasFriends
            ? t("Pick a friend on the left to chat or call")
            : t("Add a friend to start chatting and calling")),
        primary: { label: t("Add friend"), action: () => onAddClick?.("friend"), icon: UserPlus },
        secondary: { label: t("Browse chats"), action: () => onViewChange?.("chat"), icon: MessageSquare },
        icon: Users,
        illustration: "friends",
      };
    }
    if (activeView === "groups") {
      return {
        title: t("No group selected"),
        body: menuHidden
          ? t("Open the menu to browse your groups")
          : t("Create a group or pick one from the sidebar"),
        primary: { label: t("Create group"), action: () => onAddClick?.("group"), icon: Plus },
        secondary: { label: t("Find friends"), action: () => onViewChange?.("friends"), icon: UserPlus },
        icon: Users,
        illustration: "groups",
      };
    }
    if (activeView === "calls") {
      return {
        title: t("Ready when you are"),
        body: t("Pick a DM or group, then start a voice or video call"),
        primary: { label: t("Open chats"), action: () => onViewChange?.("chat"), icon: MessageSquare },
        secondary: { label: t("Open groups"), action: () => onViewChange?.("groups"), icon: Users },
        icon: Phone,
        illustration: "calls",
      };
    }
    if (activeView === "servers") {
      return {
        title: t("Pick a home"),
        body: t("Servers hold channels, roles, and voice rooms. Create one or join with an invite."),
        primary: undefined,
        secondary: undefined,
        icon: Hash,
        illustration: "chat",
      };
    }
    return {
      title: t("Your chats live here"),
      body: t("Pick a friend, start a DM, or create a group, Descall keeps it light."),
      primary: { label: t("Start a chat"), action: () => onAddClick?.("friend"), icon: UserPlus },
      secondary: { label: t("Create group"), action: () => onAddClick?.("group"), icon: Plus },
      icon: MessageSquare,
      illustration: "chat",
    };
  })();

  // Scroll-edge layer shows only once a message sits under the pills.
  // Attribute write, no React state: scrolling must not re-render the panel.
  // The chrome is keyed per conversation, so every DM / channel switch mounts a
  // fresh one. Two things used to blink the dark frosted band across the top of
  // the panel on each switch: the first decision ran after paint (the band was
  // gone for a frame, then faded back in), and the loading skeleton overflows
  // the list by a few px, so the band faded in for the skeleton and straight
  // out again when a short channel replaced it. Now the first decision lands
  // before paint with no transition, and a loading list never counts as
  // "under the pills" (styles/glass-desktop/floatingHeader.css, selftest
  // chatScrollEdge.selftest.mjs).
  useLayoutEffect(() => {
    if (!floatingHeader) return undefined;
    const scroller = messagesRef.current;
    const chrome = chromeRef.current;
    if (!scroller || !chrome) return undefined;
    let frame = 0;
    let settle = 0;
    const sync = () => {
      frame = 0;
      const loading = Boolean(scroller.querySelector(".is-loading-skeleton"));
      const under = !loading && scroller.scrollTop > 2;
      if ((chrome.dataset.scrolled === "1") !== under) chrome.dataset.scrolled = under ? "1" : "0";
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    chrome.dataset.edgeInit = "1";
    sync();
    settle = requestAnimationFrame(() => {
      settle = requestAnimationFrame(() => {
        settle = 0;
        delete chrome.dataset.edgeInit;
      });
    });
    scroller.addEventListener("scroll", schedule, { passive: true });
    // Skeleton -> messages does not always move scrollTop (a list that fits).
    const mo = typeof MutationObserver === "function" ? new MutationObserver(schedule) : null;
    mo?.observe(scroller, { childList: true, subtree: true });
    return () => {
      scroller.removeEventListener("scroll", schedule);
      mo?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      if (settle) cancelAnimationFrame(settle);
      delete chrome.dataset.edgeInit;
    };
  }, [floatingHeader, headerConversationKey, activeDmUser?.id, activeGroup?.id, activeChannel?.id]);

  // 3.7.14 floating composer: the composer floats over the list (no band), so
  // the list keeps its last message clear of it with a bottom padding equal to
  // the composer's live height (it grows with multi-line text, reply bars and
  // attachment previews). Written as a CSS variable, no React state.
  const mainRef = useRef(null);
  useEffect(() => {
    if (!floatingHeader || typeof ResizeObserver === "undefined") return undefined;
    const main = mainRef.current;
    const composer = main?.querySelector(":scope > .composer-container");
    if (!main || !composer) return undefined;
    const ro = new ResizeObserver(() => {
      const scroller = messagesRef.current;
      const atBottom = scroller ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 24 : false;
      main.style.setProperty("--composer-float-h", `${Math.ceil(composer.getBoundingClientRect().height)}px`);
      if (scroller && atBottom) scroller.scrollTop = scroller.scrollHeight;
    });
    ro.observe(composer);
    return () => ro.disconnect();
  }, [floatingHeader, headerConversationKey, activeDmUser?.id, activeGroup?.id, activeChannel?.id, groupRemoved, showComposer, activeView]);

  return (
    <div className={`chat-panel-shell${showMembers && !headerDm && !isMobile ? " is-members-docked" : ""}`}>
      <main ref={mainRef} className={floatingHeader ? "main-panel is-floating-header" : "main-panel"}>
        {floatingHeader ? <div className="chat-panel-bg" aria-hidden="true" /> : null}
        {activeTimeout?.timedOut && (
          <div className="timeout-banner" role="status">
            <Timer size={16} className="timeout-banner-icon" aria-hidden />
            <div className="timeout-banner-body">
              <div className="timeout-banner-title">
                <strong>{t("You are timed out")}</strong>
                {(activeTimeout.categoryLabel || activeTimeout.reason) && (
                  <span className="timeout-banner-cat">
                    {activeTimeout.categoryLabel || activeTimeout.reason}
                  </span>
                )}
              </div>
              {activeTimeout.until && (
                <span className="timeout-banner-until">
                  {t("Until")}: {formatDate(activeTimeout.until, locale, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              )}
              <p>
                {activeTimeout.message ||
                  t("You cannot send messages until the timeout ends.")}
              </p>
            </div>
          </div>
        )}
        {/* Activity, Friends and Calls paint their own titles. A mounted
            chat header added a second "Aktivite" h1, and on Friends it
            fell through to a stray "Descall" h1 the mockup does not have. */}
        {activeView !== "activity" && activeView !== "friends" && activeView !== "calls" && (
        <div
          className="chat-top-chrome"
          key={headerConversationKey}
          ref={chromeRef}
        >
        {glassConv ? <div className="g-edge-top g-edge-conv" aria-hidden="true" /> : null}
        {floatingHeader ? <div className="chat-scroll-edge" aria-hidden="true" /> : null}
        <header className={glassConv ? "panel-header g-conv" : "panel-header"}>
        <div className="header-left">
          {isMobile && (showMobileBack || onMenuClick) && (
            <button
              type="button"
              className="icon-btn mobile-nav-btn"
              data-mobile-back={showMobileBack ? "1" : undefined}
              onClick={showMobileBack ? onMobileBack : onMenuClick}
              aria-label={showMobileBack ? t("Back to list") : t("Open menu")}
            >
              {showMobileBack ? <ChevronLeft size={22} /> : <Menu size={20} />}
            </button>
          )}
          {emptyPaneTitle ? (
            <h1 className="a11y-sr">{getTitle()}</h1>
          ) : (
          <div className={`header-identity${glassConv ? " g-peer" : ""}${headerDm || headerGroup || glassHash ? " has-lead" : ""}`}>
            {headerDm ? (
              <button
                type="button"
                className={`header-avatar${headerDmHasCosmetics ? " has-cosmetics" : ""}`}
                onClick={() => setProfileTarget(headerDm)}
                aria-label={t("View profile")}
                title={t("View profile")}
              >
                <Avatar
                  key={headerDm.id || headerDm.username}
                  name={resolveDisplayName(headerDm)}
                  size={floatingHeader && !headerDmHasCosmetics ? 40 : headerDmAvatarSize}
                  user={headerDm}
                  loading="eager"
                />
                <StatusBadge status={getPresenceStatus(onlineUsers, headerDm.id)} />
              </button>
            ) : headerGroup ? (
              <div
                className={`header-icon is-clickable${groupAvatarUrl(headerGroup) ? " has-group-photo" : ""}`}
                role="button"
                tabIndex={0}
                title={t("Group info")}
                aria-label={t("Group info")}
                onClick={() => setGroupInfoOpen(true)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setGroupInfoOpen(true); } }}
              >
                <GroupIcon
                  group={headerGroup}
                  size={floatingHeader ? 40 : headerGroupIconSize}
                  radius={floatingHeader ? 20 : 12}
                  className="header-group-photo"
                  initials={glass ? glassGroupInitials(headerGroup.name, locale) : headerGroup.name?.charAt(0)?.toUpperCase()}
                />
              </div>
            ) : glassHash ? (
              <div className="header-icon g-hash" aria-hidden="true">
                <Hash size={18} />
              </div>
            ) : null}
            <div
              className={`header-title-block${headerDm ? " is-dm" : ""}${glassConv ? " g-peer-text" : ""}`}
              role={headerDm || headerGroup ? "button" : undefined}
              tabIndex={headerDm || headerGroup ? 0 : undefined}
              aria-haspopup={headerGroup ? "dialog" : undefined}
              onClick={headerDm ? () => setProfileTarget(headerDm) : headerGroup ? () => setGroupInfoOpen(true) : undefined}
              onKeyDown={headerDm || headerGroup ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (headerDm) setProfileTarget(headerDm);
                  else setGroupInfoOpen(true);
                }
              } : undefined}
              title={headerDm ? t("View profile") : headerGroup ? t("Group info") : undefined}
              style={{ cursor: headerDm || headerGroup ? "pointer" : "default" }}
            >
              <h1 className={glassConv ? "header-title g-peer-name" : "header-title"}>
                <span className={glassConv ? "header-title-text g-peer-name-text" : "header-title-text"}>{glassHash ? channelDisplayName(activeChannel) : getTitle()}</span>
                {headerDm && <AdminBadge user={headerDm} variant="inline" />}
                {headerDm && <PremiumBadge user={headerDm} variant="inline" />}
              </h1>
              {getSubtitle() && (
                <span className={`header-subtitle${glassConv ? " g-peer-status" : ""}${glass && (headerGroup || glassServerChannel || (headerDm && getPresenceStatus(onlineUsers, headerDm.id) !== "online")) ? " is-dim" : ""}`}>
                  {/* Draft C: a translated topic carries its marker; tapping it shows the original. */}
                  {activeView === "servers" && activeChannel && !(glass && activeServer?.name) && channelTopicL10n(activeChannel)?.canToggle ? (
                    <span className="sl10n-topic">
                      <span className="sl10n-topic-text">{getSubtitle()}</span>
                      <TopicMarkerToggle channel={activeChannel} sourceLocale={activeServer?.l10n?.sourceLocale} />
                    </span>
                  ) : getSubtitle()}
                </span>
              )}
            </div>
          </div>
          )}
        </div>

        <div className="header-right">
          <PopOutButton />
          <button
            className={`icon-btn ${showSearch ? "active" : ""}`}
            title={t("Search")}
            aria-label={t("Search")}
            data-shortcut="chat-search"
            onClick={() => { setShowSearch(!showSearch); setLooseMembers(false); }}
          >
            <Search size={20} />
          </button>
          {!headerDm && (
            <button
              className={`icon-btn ${showMembers ? "active" : ""}`}
              title={t("Members")}
              aria-label={t("Members")}
              aria-pressed={showMembers}
              onClick={() => { setShowMembers(!showMembers); setShowSearch(false); }}
            >
              <Users size={20} />
            </button>
          )}
          {(headerDm || headerGroup || (activeView === "servers" && isTextLikeChannel(activeChannel))) && (
            <button
              ref={pinButtonRef}
              className={`icon-btn ${showPinned ? "active" : ""}`}
              title={t("Pinned messages")}
              aria-label={t("Pinned messages")}
              aria-haspopup="dialog"
              aria-expanded={showPinned}
              onClick={togglePinnedPanel}
            >
              <Pin size={20} />
              {pinnedMessages.length > 0 && (
                <span className="icon-btn-badge">{pinnedMessages.length}</span>
              )}
            </button>
          )}
          {(headerGroup || (headerDm && !dmBlockedByMe)) && (
            <>
              {headerDm ? null : <span className="header-actions-sep" aria-hidden="true" />}
              <button 
                className="icon-btn" 
                title={t("Voice Call")}
                aria-label={t("Voice Call")}
                onClick={() => headerGroup ? onGroupVoiceCall?.() : onVoiceCall?.()}
                disabled={Boolean(headerGroup?.removed)}
              >
                <Phone size={20} />
              </button>
              <button 
                className="icon-btn" 
                title={t("Video Call")}
                aria-label={t("Video Call")}
                onClick={() => headerGroup ? onGroupVideoCall?.() : onVideoCall?.()}
                disabled={Boolean(headerGroup?.removed)}
              >
                <Video size={20} />
              </button>
            </>
          )}
          {/* Mockup #29/#30: DM actions are one pill — search, pin, call, video, block.
              Profile (avatar/title) carries share, nickname, report; the DM list carries pin/mute chat. */}
          {headerDm?.id && headerDm.id !== me?.id ? (
            <BlockUserButton
              userId={headerDm.id}
              username={headerDm.username}
              displayName={resolveDisplayName(headerDm)}
              className={`icon-btn header-block-btn${dmBlockedByMe ? " active" : ""}`}
              iconSize={20}
              compact
            />
          ) : null}
        </div>
      </header>

        </div>
        )}

      <AnimatePresence initial={false}>
      {showSearch && activeView !== "activity" && (
        <motion.div
          key="chat-search"
          className="chat-search-bar"
          role="search"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
          transition={reduceMotion ? { duration: 0.16 } : { type: "spring", bounce: 0, duration: 0.32 }}
        >
          <label className="chat-search-field">
            <Search size={16} aria-hidden="true" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setShowSearch(false); setSearchQuery(""); } }}
              aria-label={t("Search messages...")}
              placeholder={t("Search messages...")}
              autoFocus
            />
          </label>
          <button
            type="button"
            className="icon-btn"
            onClick={() => { setShowSearch(false); setSearchQuery(""); }}
            aria-label={t("Close")}
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
      </AnimatePresence>
      {/* Mesaj araması (3.7.7): whole-history results from the server. */}
      {showSearch && activeView !== "activity" && conversationKey ? (
        <SearchResults
          conversationKey={conversationKey}
          query={searchQuery}
          onClose={() => { setShowSearch(false); setSearchQuery(""); }}
        />
      ) : null}

      {/* Friend Notice Banner */}
      <AnimatePresence>
        {friendNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="friend-notice-banner"
            style={{
              padding: "10px 16px",
              backgroundColor: "var(--primary-soft)",
              color: "var(--primary)",
              fontSize: "13px",
              fontWeight: 500,
              textAlign: "center",
              borderBottom: "1px solid var(--border)"
            }}
          >
            {friendNotice}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Activity view fills the full panel, rendered outside messages-container to avoid double-scroll */}
      {activeView === "activity" ? (
        <ActivityView
          me={activity?.me}
          currentActivity={activity?.currentActivity}
          manualOverride={activity?.manualOverride}
          history={activity?.history}
          historyLoaded={activity?.historyLoaded !== false}
          friendPresence={activity?.friendPresence}
          friends={friends}
          settings={activity?.settings}
          isElectron={activity?.isElectron}
          onSetManual={activity?.setManual}
          onClearManual={activity?.clearManual}
          onUpdatePrivacy={activity?.updatePrivacy}
          onlineUsers={onlineUsers}
          /* UI audit #147: on iPad the list column already shows the friends
             list (ActivitySidebar); the detail side shows your status and
             history like desktop instead of a second copy of that list. */
          isMobile={isMobile && !activitySplitView}
          onRefresh={onRefresh}
          onAddFriend={() => onAddClick?.("friend")}
          onFriendSelect={onStartDm}
          onMenuClick={onMenuClick}
        />
      ) : activeView === "calls" && !activeDmUser && !activeGroup ? (
        <CallsView
          me={me}
          friends={friends}
          groups={groups}
          onlineUsers={onlineUsers}
          socket={socket}
          onStartCall={onStartCall}
          onStartGroupCall={onStartGroupCall}
          onOpenChat={onOpenChatFromCalls}
          onOpenGroup={onOpenGroupFromCalls}
        />
      ) : activeView === "servers" && isTextLikeChannel(activeChannel) ? (
      <div className="messages-container" ref={messagesRef}>
        {isValidElement(children)
          ? cloneElement(children, { searchQuery: "" })
          : children}
        <OnbJoinedSlot channelId={activeChannel?.id} />
      </div>
      ) : activeView === "servers" ? (
        (activeChannel?.type === "voice" || activeChannel?.type === "stage") && activeServer ? (
          <ServerVoicePanel
            channel={activeChannel}
            server={activeServer}
            me={me}
            serverVoice={serverVoice}
          />
        ) : !activeServer && typeof window !== "undefined" && /^\/servers\/[^/]+/.test(window.location.pathname) ? (
          /* UI audit #92: a server is already in the URL while the list loads, so
             show its loading skeleton, not "pick a server on the left". */
          <DetailPaneSkeleton label={t("Loading servers")} />
        ) : (
        <EmptyState
          className="server-main-placeholder"
          icon={activeChannel?.type === "voice" || activeChannel?.type === "stage" ? Phone : Hash}
          title={activeChannel
            ? activeChannel.type === "voice" || activeChannel.type === "stage"
              ? channelDisplayName(activeChannel)
              : `#${channelDisplayName(activeChannel)}`
            : activeServer
              ? serverDisplayName(activeServer)
              : t("Servers")}
          body={channelTopicText(activeChannel, t)
            ? channelTopicText(activeChannel, t)
            : !activeServer
              ? t("Pick a server on the left, or create a new one with +.")
              : t("Pick a text or voice channel from the list on the left.")}
        />
        )
      ) : onboardingHome ? (
        /* "Başla panosu" (growth 2A): a new account's first five days, Chats home with nothing open. */
        <div className="onb-host">
          <OnbMainSlot isMobile={isMobile} />
        </div>
      ) : (
      <div
        className="messages-container"
        ref={messagesRef}
        key={activeDmUser?.id || activeGroup?.id || "messages"}
      >
        {(activeDmUser || activeGroup) ? (
          isValidElement(children)
            ? cloneElement(children, { searchQuery: "", conversationStart })
            : children
        ) : (
          <EmptyState
            icon={emptyCopy.icon || MessageSquare}
            title={emptyCopy.title}
            body={emptyCopy.body}
            illustration={emptyCopy.illustration || "chat"}
            primary={emptyCopy.primary}
            secondary={emptyCopy.secondary}
          />
        )}
      </div>
      )}

      {activeView !== "activity" && !showComposer && readOnlyChannelNotice && (
        <div className="composer-container chperm-readonly" role="status">
          <div className="chperm-readonly-bar">
            <Hash size={15} aria-hidden="true" />
            <span>{readOnlyChannelNotice}</span>
          </div>
        </div>
      )}
      {/* Typing + composer only on real chat surfaces, never under Activity */}
      {activeView !== "activity" && showComposer && (
        <>
          {/* Descall+ 2.0 (moment 11): gift cards between you two (open / live status), above the composer. */}
          {activeDmUser?.id && !dmBlockedByMe ? <Suspense fallback={null}><DmGiftStrip otherUserId={activeDmUser.id} /></Suspense> : null}

          {dmBlockedByMe && (
            <div className="dm-blocked-banner" role="status">
              <span>{t("You blocked this user. You can't message or call each other.")}</span>
              <BlockUserButton
                userId={activeDmUser.id}
                username={activeDmUser.username}
                className="dm-blocked-banner-btn"
                iconSize={14}
              />
            </div>
          )}
          {groupRemoved ? (
            <GroupRemovedBanner
              group={activeGroup}
              busy={dismissBusy}
              onDismiss={async () => {
                setDismissBusy(true);
                try {
                  await onRemovedGroupDismiss?.(activeGroup.id);
                } finally {
                  setDismissBusy(false);
                }
              }}
            />
          ) : (
          <div className={`composer-container${historyLoadError ? " is-history-error" : ""}`} aria-disabled={historyLoadError || undefined}>
            {/* Typing pill rides on the composer (absolute, bottom: 100%), so it
                always sits just above it, even when the composer is
                position: fixed (iOS glass capsule, keyboard lift, safe area). */}
            <AnimatePresence>
              {typingNames.length > 0 && (
                <motion.div
                  key="typing-bar"
                  className="chat-typing-bar"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.18 }}
                >
                  <TypingIndicator
                    names={typingNames}
                    flareKey={typingFlare}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <MessageComposer
              onSend={onSendMessage}
              disabled={composerDisabled}
              activeDmUser={activeDmUser}
              activeGroup={activeGroup}
              activeChannel={activeChannel}
              activeServer={activeServer}
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
              me={me}
              onlineUsers={onlineUsers}
              friends={friends}
              recentMessages={messages}
            />
          </div>
          )}
        </>
      )}
    </main>

    <UserProfileModal
      open={!!profileTarget}
      onClose={() => setProfileTarget(null)}
      userId={profileTarget?.id}
      username={profileTarget?.username}
      displayName={profileTarget?.displayName || profileTarget?.display_name}
      avatarUrl={profileTarget?.avatarUrl || profileTarget?.avatar_url}
      createdAt={profileTarget?.createdAt || profileTarget?.created_at || null}
      me={me}
      friends={friends}
      onlineUsers={onlineUsers}
      onStartDm={onStartDm}
      onStartCall={onStartCall}
    />

    {/* Members Panel */}
    <AnimatePresence>
      {showMembers && !headerDm && (
        <>
          {isMobile ? (
            <motion.div
              key="members-backdrop"
              className="members-panel-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setShowMembers(false)}
              aria-hidden="true"
            />
          ) : null}
          <motion.aside
            key="members-panel"
            className={`members-panel${activeView === "servers" && activeServer ? " server-members-panel" : ""}`}
            role="complementary"
            aria-label={t("Members")}
            initial={isMobile ? { x: "100%" } : { x: 24, opacity: 0 }}
            animate={isMobile ? { x: 0 } : { x: 0, opacity: 1 }}
            exit={isMobile ? { x: "100%" } : { x: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          >
            {activeView === "servers" && activeServer ? (
              <ServerMembersPanel
                server={activeServer}
                me={me}
                friends={friends}
                onlineUsers={onlineUsers}
                onClose={() => setShowMembers(false)}
                onOpenProfile={(user) => setProfileTarget(user)}
                onStartDm={onStartDm}
              />
            ) : (
              (() => {
                const raw =
                  activeGroup?.members?.length > 0
                    ? activeGroup.members
                    : activeDmUser
                      ? [activeDmUser]
                      : [];
                const ownerId = activeGroup?.created_by ?? null;
                const decorated = raw.map((m) => {
                  const status = getPresenceStatus(onlineUsers, m.id);
                  return {
                    ...m,
                    _status: status,
                    _online: isVisiblyOnline(onlineUsers, m.id),
                    _isOwner: ownerId != null && m.id === ownerId,
                    _isGroupAdmin: Boolean(activeGroup) && groupRoleOf(activeGroup, m.id) === "admin",
                  };
                });
                const online = decorated
                  .filter((m) => m._online)
                  .sort((a, b) => Number(b._isOwner) - Number(a._isOwner) || resolveDisplayName(a).localeCompare(resolveDisplayName(b)));
                const offline = decorated
                  .filter((m) => !m._online)
                  .sort((a, b) => Number(b._isOwner) - Number(a._isOwner) || resolveDisplayName(a).localeCompare(resolveDisplayName(b)));

                const renderRow = (m) => {
                  const name = resolveDisplayName(m);
                  const statusLabel = t(STATUS_META[m._status]?.label || "Offline");
                  const menuable = Boolean(activeGroup) && !groupRemoved;
                  return (
                    <div
                      key={m.id}
                      className={`member-row${m._online ? "" : " is-offline"}${menuable ? " is-menuable" : ""}${memberMenu.menuMemberId === m.id ? " is-menu-open" : ""}`}
                      data-username={m.username || undefined}
                      {...(menuable
                        ? {
                            role: "button",
                            tabIndex: 0,
                            "aria-haspopup": "menu",
                            "aria-expanded": memberMenu.menuMemberId === m.id,
                            onClick: (e) => memberMenu.openFor(m, e),
                            onContextMenu: (e) => memberMenu.openFor(m, e),
                            onKeyDown: (e) => {
                              if (e.key === "Enter" || e.key === " " || e.key === "ContextMenu") memberMenu.openFor(m, e);
                            },
                          }
                        : {})}
                    >
                      <div className="member-avatar-wrap">
                        <Avatar name={name} size={36} user={m} />
                        <StatusBadge status={m._status} />
                      </div>
                      <div className="member-meta">
                        <div className="member-name-row">
                          <span className="member-name">{name}</span>
                          <AdminBadge user={m} variant="inline" />
                          <PremiumBadge user={m} variant="inline" />
                          {m._isOwner && (
                            <span className="member-owner-badge" title={t("Owner")}>
                              <Crown size={11} strokeWidth={2.25} aria-hidden="true" />
                              <span className="member-owner-text">{t("Owner")}</span>
                            </span>
                          )}
                          {m._isGroupAdmin && (
                            <span className="member-owner-badge is-group-admin" title={t("gk.adminBadge")}>
                              <ShieldCheck size={11} strokeWidth={2.25} aria-hidden="true" />
                              <span className="member-owner-text">{t("gk.adminBadge")}</span>
                            </span>
                          )}
                        </div>
                        <span className="member-status-label">{statusLabel}</span>
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    <div className="members-panel-header">
                      <h4>
                        {t("Members")}
                        <span className="members-panel-count">{decorated.length}</span>
                      </h4>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setShowMembers(false)}
                        title={t("Close")}
                        aria-label={t("Close")}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="members-panel-scroll">
                      {activeGroup ? (
                        <section className="group-photo-card" aria-label={t("Group photo")}>
                          <button
                            type="button"
                            className="group-photo-card-icon"
                            onClick={() => groupPhoto.pick(activeGroup)}
                            title={t("Change Group Photo")}
                            aria-label={t("Change Group Photo")}
                            disabled={groupPhoto.busyId === activeGroup.id}
                          >
                            <GroupIcon group={activeGroup} size={72} radius={22} />
                            <span className="group-photo-card-badge" aria-hidden="true"><ImagePlus size={13} /></span>
                          </button>
                          <div className="group-photo-card-name">{activeGroup.name}</div>
                          <div className="group-photo-card-actions">
                            <button type="button" className="group-photo-card-btn" onClick={() => groupPhoto.pick(activeGroup)} disabled={groupPhoto.busyId === activeGroup.id}>
                              {t("Change Group Photo")}
                            </button>
                            {groupAvatarUrl(activeGroup) ? (
                              <button type="button" className="group-photo-card-btn is-danger" onClick={() => groupPhoto.remove(activeGroup)} disabled={groupPhoto.busyId === activeGroup.id}>
                                {t("Remove")}
                              </button>
                            ) : null}
                          </div>
                        </section>
                      ) : null}
                      {online.length > 0 && (
                        <section className="members-section">
                          <h5 className="members-section-label">
                            {t("Online, {count}", { count: online.length })}
                          </h5>
                          <div className="members-section-list">{online.map(renderRow)}</div>
                        </section>
                      )}
                      {offline.length > 0 && (
                        <section className="members-section">
                          <h5 className="members-section-label">
                            {t("Offline, {count}", { count: offline.length })}
                          </h5>
                          <div className="members-section-list">{offline.map(renderRow)}</div>
                        </section>
                      )}
                      {decorated.length === 0 && (
                        <p className="members-empty">{t("No members")}</p>
                      )}
                    </div>
                  </>
                );
              })()
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
    {memberMenu.layer}

    {/* Pinned messages: glass popover under the header pin button (2.10.109). */}
    <PinnedMessagesPopover
      open={showPinned}
      anchorRef={pinButtonRef}
      onClose={() => setShowPinned(false)}
      items={pinnedMessages}
      t={t}
      resolveName={resolveDisplayName}
      renderText={(pm) => {
        // Draft C: a pinned official message of a localized server in the reader's language.
        const shown = activeView === "servers" ? messageL10n(pm, activeServer, { readerLocale: locale }) : null;
        if (shown) return displayText(shown.text);
        return displayText(pm.text) || (pm.mediaType ? mediaTypeLabel(pm.mediaType, t) : t("Message"));
      }}
      onUnpin={unpinMessage}
    />
    {groupActions.element}
    <GroupInfoSheet
      open={groupInfoOpen && Boolean(activeGroup)}
      group={activeGroup}
      onClose={() => setGroupInfoOpen(false)}
      onAction={(action) => groupActions.run(activeGroup, action)}
      onlineUsers={onlineUsers}
      onOpenProfile={(user) => setProfileTarget(user)}
      onMemberMenu={activeGroup && !activeGroup.removed ? memberMenu.openFor : null}
      menuMemberId={memberMenu.menuMemberId}
      t={t}
    />
    </div>
  );
}
