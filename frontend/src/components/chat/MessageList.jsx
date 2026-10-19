import { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from "react";
import { usePrivateMediaUrl, refreshMediaUrl, needsRefresh as needsPrivateMediaRefresh } from "../../lib/privateMediaUrls.js";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { FileText, Download, Smile, SmilePlus, Reply, X, Pin, PinOff, Pencil, Trash2, Flag } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import CallSummaryBubble from "./CallSummaryBubble";
import { resolveCallSummary } from "../../lib/callSummary";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import ActiveCallBanner from "../ActiveCallBanner";
import UserProfileModal from "../social/UserProfileModal";
import ReportUserModal from "../social/ReportUserModal";
import GameMessageBubble from "./GameMessageBubble";
import MessageReactions from "./MessageReactions";
import MessageContent from "./MessageContent";
import { plainText } from "../../lib/messageMarkdown";
import { displayText } from "../../lib/profanity";
import { casinoHiddenOnThisDevice, isCasinoChatMessage } from "../../lib/casinoCommands";
import { useBlockedUserIds } from "../../lib/blockedUsers";
import { InviteLinkEmbedList } from "./InviteLinkEmbed";
import SlashCommandEmbed from "./SlashCommandEmbed";
import PollCard from "../polls/PollCard";
import LegacyPollCard, { isLegacyPollText } from "../polls/LegacyPollCard";
import AppCard from "../polls/AppCard";
import VotersSheet from "../polls/VotersSheet";
import PollCreateSheet from "../polls/PollCreateSheet";
import { useCompact } from "../polls/dsxShared";
import { bindPollSocket, editPollNow } from "../../lib/pollStore";
import { BarChart3 } from "lucide-react";
import MessageMediaLightbox from "./MessageMediaLightbox";
import { MessageSkeleton } from "../ui/Skeleton";
import { getPresenceStatus } from "../../lib/presence";
import UserHoverCard from "../social/UserHoverCard";
import AdminBadge from "../social/AdminBadge";
import { BadgeIcon, CountryBadge, NameEffectText, profileAuraClass } from "../ui/Cosmetics";
import { mergeUserProfiles, pickAvatarUrl, resolveDisplayName } from "../../lib/userProfile";
import { useT } from "../../context/LocaleContext";
import { messageHoverToolbar, HOVER_TOOLBAR_GRACE_MS } from "../../lib/singleActiveHover";
import { placeHoverToolbar } from "../../lib/hoverToolbarPlacement";
import { getLocale } from "../../i18n/runtime";
import { formatMessageClock, formatMessageDate, intlLocaleTag, parseAppDate } from "../../lib/datetime";
import useGlassUi from "../../hooks/useGlassUi";
import GlassConfirm from "../ui/GlassConfirm";
import { trackMessageDelete } from "../../lib/messageDeleteFeedback";
import useMaterialize from "../../hooks/useMaterialize";
import { hapticImpactMedium, hapticLight, primeHaptics } from "../../lib/haptics";
import { attachReplySwipe } from "../../lib/messageReplySwipe";
import { useOffscreenRows } from "../../hooks/useOffscreenRows";
import { cancelSwipeBackIfPending, swipeBackEdgeBand } from "../../hooks/useEdgeSwipeBack";
import {
  MESSAGE_MENU_LONG_PRESS_MS,
  attachMenuPress,
  createMediaPressGate,
  messageMenuOpensOnTap,
  pressToActivate,
  swallowOpeningPress,
  visualMediaPreview,
  buildLiftedBubble,
  liftLayout,
  menuHeight,
  reactBarWidth,
} from "../../lib/glassMessageMenu";
import { SPRINGS, framerSpring, REDUCED_MOTION_FADE } from "../../lib/fluid/springs";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢"];
const PICKER_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "👏", "🤔", "👎"];

function dmConversationId(a, b) {
  if (!a || !b) return null;
  return [a, b].sort().join("::");
}

/** Fill / preserve avatar fields from friends / presence / me so letters don't stick. */
function enrichAvatarUser(user, { me, friends, onlineUsers, currentUser } = {}) {
  if (!user) return user;
  const id = user.id;
  const fromMe =
    id && (me?.id === id || currentUser?.id === id)
      ? me || currentUser
      : null;
  const fromFriend = id && Array.isArray(friends) ? friends.find((f) => f.id === id) : null;
  const fromOnline = id && Array.isArray(onlineUsers) ? onlineUsers.find((u) => u.id === id) : null;
  return mergeUserProfiles(user, fromOnline, fromFriend, fromMe) || user;
}

function hoverAnchorFromRect(rect) {
  if (!rect) return null;
  return {
    x: rect.right + 8,
    y: Math.max(8, rect.top - 8),
    // If the card would overflow right, flip to the left of the avatar.
    flipX: rect.left - 8,
  };
}

function dayKeyOf(iso) {
  const d = parseAppDate(iso);
  if (!d) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDayLabel(iso, t) {
  const date = parseAppDate(iso);
  if (!date) return "";
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const that = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((today - that) / 86400000);
    if (diffDays === 0) return t("Today");
    if (diffDays === 1) return t("Yesterday");
    return formatMessageDate(date, intlLocaleTag(getLocale()), { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}


const STICK_TO_BOTTOM_PX = 100;

function getMessagesScroller(fromEl) {
  if (!fromEl) return null;
  return fromEl.closest?.(".messages-container") || fromEl.parentElement;
}

function isNearBottom(el, threshold = STICK_TO_BOTTOM_PX) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function scrollScrollerToBottom(el) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

/**
 * Discord-style message list with day / unread separators.
 */
export default function MessageList({
  messages,
  currentUser,
  onJoinActiveCall,
  onDismissActiveBanner,
  me,
  friends,
  onlineUsers,
  onStartDm,
  socket,
  activeGroup,
  activeDmUser = null,
  activeChannel = null,
  activeServer = null,
  canManageMessages = false,
  loading = false,
  unreadCount = 0,
  onReply,
  searchQuery = "",
  editingMessageId = null,
  onStartEdit,
}) {
  const t = useT();
  const glassUi = useGlassUi();
  const messagesEndRef = useRef(null);
  const listRef = useRef(null);
  useOffscreenRows(listRef, messages?.length || 0);
  const stickToBottomRef = useRef(true);
  const prevLastIdRef = useRef(null);
  const [profileTarget, setProfileTarget] = useState(null);
  // Messages from people I blocked are collapsed until tapped ("Show").
  const blockedIds = useBlockedUserIds();
  const [revealedBlocked, setRevealedBlocked] = useState(() => new Set());
  const [reportTarget, setReportTarget] = useState(null);
  const [hoverUser, setHoverUser] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);
  // 2.12.0 polls: one voters sheet / edit sheet for the whole list.
  const [votersPoll, setVotersPoll] = useState(null);
  const [editPoll, setEditPoll] = useState(null);
  const compactCards = useCompact(720);
  useEffect(() => {
    if (socket) bindPollSocket(socket);
  }, [socket]);
  const appActions = useMemo(
    () => ({
      startDm: (u) => u?.id && onStartDm?.(u),
      openProfile: (u) => u?.id && setProfileTarget(u),
      openSettings: () => (me?.id || currentUser?.id) && setProfileTarget(me || currentUser),
      runCommand: activeChannel?.id && socket
        ? (text) => socket.emit("server:channel:message", {
            serverId: activeServer?.id || activeChannel?.serverId,
            channelId: activeChannel.id,
            content: text,
            tempId: `cmd-${Date.now()}`,
          })
        : null,
    }),
    [onStartDm, activeChannel?.id, activeChannel?.serverId, activeServer?.id, socket, me, currentUser]
  );

  const conversationType = activeChannel?.id
    ? "server"
    : activeGroup
      ? "group"
      : "dm";
  const conversationId = activeChannel?.id
    || activeGroup?.id
    || dmConversationId(currentUser?.id || me?.id, activeDmUser?.id);
  const serverId = activeServer?.id || activeChannel?.serverId || null;

  const trimmedSearch = searchQuery.trim();
  const isSearching = trimmedSearch.length > 0;
  const [serverSearchResults, setServerSearchResults] = useState(null);

  useEffect(() => {
    if (conversationType !== "server" || !socket || !activeChannel?.id) {
      setServerSearchResults(null);
      return undefined;
    }
    if (trimmedSearch.length < 2) {
      setServerSearchResults(null);
      return undefined;
    }

    const onResults = ({ channelId, messages: results } = {}) => {
      if (channelId === activeChannel.id) {
        setServerSearchResults(Array.isArray(results) ? results : []);
      }
    };

    socket.on("server:channel:message:search", onResults);
    const timer = setTimeout(() => {
      socket.emit("server:channel:message:search", {
        channelId: activeChannel.id,
        q: trimmedSearch,
        limit: 50,
      });
    }, 250);

    return () => {
      clearTimeout(timer);
      socket.off("server:channel:message:search", onResults);
    };
  }, [conversationType, socket, activeChannel?.id, trimmedSearch]);

  const myId = currentUser?.id || me?.id;

  const resolveScroller = useCallback(() => {
    return getMessagesScroller(listRef.current) || getMessagesScroller(messagesEndRef.current);
  }, []);

  useEffect(() => {
    stickToBottomRef.current = true;
    prevLastIdRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    const scroller = resolveScroller();
    if (!scroller) return undefined;
    const onScroll = () => {
      stickToBottomRef.current = isNearBottom(scroller);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [conversationId, resolveScroller]);

  useEffect(() => {
    const scroller = resolveScroller();
    const list = listRef.current;
    if (!scroller || !list || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current && !isSearching && !loading) {
        scrollScrollerToBottom(scroller);
      }
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, [conversationId, isSearching, loading, resolveScroller]);

  useLayoutEffect(() => {
    if (loading || isSearching) return;
    const scroller = resolveScroller();
    if (!scroller) return;

    const msgs = Array.isArray(messages) ? messages : [];
    const last = msgs[msgs.length - 1];
    const lastId = last?.id ?? null;
    const prevLastId = prevLastIdRef.current;
    prevLastIdRef.current = lastId;

    const lastIsOwn = Boolean(last) && (
      last.from?.id === myId
      || last.sender_id === myId
      || last.userId === myId
      || String(last.id || "").startsWith("temp-")
    );

    if (!(stickToBottomRef.current || lastIsOwn || prevLastId == null)) return;
    if (lastIsOwn) stickToBottomRef.current = true;
    scrollScrollerToBottom(scroller);
  }, [messages, loading, isSearching, myId, resolveScroller]);

  const searchedMessages = useMemo(() => {
    const msgs = Array.isArray(messages) ? messages : [];
    if (!isSearching) return msgs;

    if (conversationType === "server" && trimmedSearch.length >= 2 && serverSearchResults?.length) {
      return serverSearchResults;
    }

    const needle = trimmedSearch.toLowerCase();
    return msgs.filter((m) => typeof m?.text === "string" && m.text.toLowerCase().includes(needle));
  }, [messages, isSearching, trimmedSearch, conversationType, serverSearchResults]);

  const groupedMessages = useMemo(() => {
    const msgs = searchedMessages;
    if (!msgs.length) return [];

    const grouped = [];
    let currentGroup = null;
    const unreadStartIndex =
      !isSearching && unreadCount > 0 ? Math.max(0, msgs.length - unreadCount) : -1;

    const flush = () => {
      if (currentGroup) {
        grouped.push(currentGroup);
        currentGroup = null;
      }
    };

    msgs.forEach((msg, index) => {
      const dayKey = dayKeyOf(msg?.timestamp);
      const prevDay = index > 0 ? dayKeyOf(msgs[index - 1]?.timestamp) : null;
      if (dayKey && dayKey !== prevDay) {
        flush();
        grouped.push({
          isDaySep: true,
          label: formatDayLabel(msg.timestamp, t),
          id: `day-${dayKey}-${index}`,
        });
      }

      if (index === unreadStartIndex) {
        flush();
        grouped.push({ isUnreadSep: true, id: `unread-${index}` });
      }

      // Call summary and active call bubbles break grouping, render standalone
      // Also recover legacy rows that were stored/rendered as raw JSON text.
      // DM rows are tagged type "call_summary" with the numbers in the JSON
      // text, always merge it in (see lib/callSummary.js).
      const summaryMsg = resolveCallSummary(msg) || msg;

      if (summaryMsg.type === "call_summary") {
        flush();
        grouped.push({ isSummary: true, summary: summaryMsg, id: summaryMsg.id });
        return;
      }
      if (msg.type === "active_call") {
        flush();
        grouped.push({ isActiveBanner: true, banner: msg, id: msg.id });
        return;
      }
      // Native iOS: casino boards, slash results, and result embeds are not shown.
      if (casinoHiddenOnThisDevice() && isCasinoChatMessage(msg)) {
        flush();
        return;
      }
      // Game messages render standalone (no grouping)
      if (msg.isGameMessage || msg.type?.startsWith("game_")) {
        flush();
        grouped.push({ isGame: true, gameMsg: msg, id: msg.id });
        return;
      }

      const prevMsg = msgs[index - 1];
      const crossedDay = Boolean(dayKey && prevDay && dayKey !== prevDay);
      const crossedUnread = index === unreadStartIndex;
      const isSameSender = prevMsg?.from?.id === msg.from?.id && prevMsg?.type !== "call_summary";
      const timeDiff = prevMsg
        ? (parseAppDate(msg.timestamp)?.getTime() || 0) - (parseAppDate(prevMsg.timestamp)?.getTime() || 0)
        : Infinity;
      const isCompact =
        isSameSender && timeDiff < 5 * 60 * 1000 && !crossedDay && !crossedUnread;

      if (isCompact && currentGroup) {
        currentGroup.messages.push(msg);
      } else {
        flush();
        currentGroup = { user: msg.from, messages: [msg], isCompact: false };
      }
    });

    flush();
    return grouped;
  }, [searchedMessages, unreadCount, isSearching, t]);

  if (loading) {
    return (
      <div className="message-list is-loading-skeleton" ref={listRef} aria-busy="true">
        <MessageSkeleton count={8} />
      </div>
    );
  }

  if (isSearching && groupedMessages.length === 0) {
    return (
      <div className="message-list" ref={listRef}>
        <div className="message-search-empty">
          <span>{t('No messages match "{query}"', { query: trimmedSearch })}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef}>
      {isSearching && (
        <div className="message-search-result-count">
          {t("{count} matching messages", { count: groupedMessages.reduce((n, g) => n + (g.messages?.length || (g.isSummary || g.isGame || g.isActiveBanner ? 1 : 0)), 0) })}
        </div>
      )}
      {groupedMessages.map((group, groupIndex) => {
        if (group.isDaySep) {
          return (
            <div key={group.id || `day-${groupIndex}`} className="message-day-sep">
              <span>{group.label}</span>
            </div>
          );
        }
        if (group.isUnreadSep) {
          return (
            <div key={group.id || `unread-${groupIndex}`} className="message-unread-sep">
              <span>{t("New messages")}</span>
            </div>
          );
        }
        if (group.isSummary) {
          return <CallSummaryBubble key={group.id || `summary-${groupIndex}`} summary={group.summary} />;
        }
        if (group.isActiveBanner) {
          return (
            <ActiveCallBanner
              key={group.id || `active-call-${groupIndex}`}
              banner={group.banner}
              onJoin={onJoinActiveCall}
              onDismiss={onDismissActiveBanner}
            />
          );
        }
        if (group.isGame) {
          return (
            <GameMessageBubble
              key={group.id || `game-${groupIndex}`}
              message={group.gameMsg}
              isOwn={group.gameMsg.from?.id === currentUser?.id}
              currentUserId={currentUser?.id}
              socket={socket}
              onGameAction={() => {}}
            />
          );
        }

        const groupKey = group.messages?.[0]?.id || group.id || `msg-group-${groupIndex}`;
        if (
          group.user?.id &&
          group.user.id !== currentUser?.id &&
          blockedIds.has(String(group.user.id)) &&
          !revealedBlocked.has(groupKey)
        ) {
          const n = group.messages?.length || 1;
          return (
            <div key={`blocked-${groupKey}`} className="msg-blocked-collapsed" role="note">
              <span>
                {n === 1
                  ? t("1 message from a blocked user")
                  : t("{count} messages from a blocked user", { count: n })}
              </span>
              <button
                type="button"
                onClick={() =>
                  setRevealedBlocked((prev) => {
                    const next = new Set(prev);
                    next.add(groupKey);
                    return next;
                  })
                }
              >
                {t("Show")}
              </button>
            </div>
          );
        }

        const isOwn = group.user?.id === currentUser?.id;
        const avatarUser = enrichAvatarUser(group.user, { me, friends, onlineUsers, currentUser });
        const openProfile = () => {
          setHoverUser(null);
          setHoverPos(null);
          if (avatarUser?.id) setProfileTarget(avatarUser);
        };
        const showHoverCard = (el, event) => {
          // iOS turns a tap into mouseenter and leaves the card up. Glass
          // already presents the profile sheet, so the hover card must not open.
          if (glassUi) return;
          if (event?.pointerType === "touch") return;
          if (!avatarUser?.id || !el) return;
          const rect = el.getBoundingClientRect();
          const friend = (friends || []).find((f) => f.id === avatarUser.id);
          const online = (onlineUsers || []).find((u) => u.id === avatarUser.id);
          setHoverUser(
            mergeUserProfiles(avatarUser, friend, online, {
              status: getPresenceStatus(onlineUsers, avatarUser.id),
            })
          );
          setHoverPos(hoverAnchorFromRect(rect));
        };
        const hideHoverCard = () => {
          setHoverUser(null);
          setHoverPos(null);
        };

        return (
          <div
            key={group.messages?.[0]?.id || group.id || `msg-group-${groupIndex}`}
            className={`message-group is-left ${isOwn ? "is-mine" : ""}`}
          >
            {!group.isCompact && (
              <div className="message-header">
                <div
                  className="message-avatar"
                  onClick={openProfile}
                  style={{ cursor: avatarUser?.id ? "pointer" : "default" }}
                  onMouseEnter={glassUi ? undefined : (e) => showHoverCard(e.currentTarget, e)}
                  onMouseLeave={hideHoverCard}
                >
                  <Avatar
                    key={avatarUser?.id || avatarUser?.username || "msg-avatar"}
                    name={resolveDisplayName(avatarUser)}
                    size={40}
                    user={avatarUser}
                    imageUrl={pickAvatarUrl(avatarUser)}
                    animate="hover"
                  />
                  <StatusBadge
                    status={getPresenceStatus(onlineUsers, avatarUser?.id)}
                    user={avatarUser}
                  />
                </div>
                <div className="message-meta">
                  <span
                    className="message-author"
                    onClick={openProfile}
                    style={{ cursor: avatarUser?.id ? "pointer" : "default" }}
                    onMouseEnter={glassUi ? undefined : (e) => {
                      if (!avatarUser?.id) return;
                      e.currentTarget.style.textDecoration = "underline";
                      showHoverCard(e.currentTarget, e);
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.textDecoration = "";
                      hideHoverCard();
                    }}
                  >
                    <NameEffectText user={avatarUser}>{resolveDisplayName(avatarUser)}</NameEffectText>
                    {(avatarUser?.isBot || avatarUser?.id === "descall-apps") ? (
                      <span className="msg-bot-badge" title="Descall Apps">UYGULAMA</span>
                    ) : null}
                    <BadgeIcon user={avatarUser} />
                    <CountryBadge user={avatarUser} compact />
                    <AdminBadge user={avatarUser} variant="inline" />
                  </span>
                  <span className="message-timestamp">
                    {formatTimestamp(group.messages[0]?.timestamp)}
                  </span>
                </div>
              </div>
            )}

            <div className="message-content-wrapper">
              {group.messages.map((msg) => {
                const ts = parseAppDate(msg.timestamp || msg.created_at)?.getTime?.() || 0;
                const isFresh =
                  String(msg.id || "").startsWith("temp-") ||
                  (ts > 0 && Date.now() - ts < 2800);
                return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={isOwn}
                  isCompact={group.isCompact}
                  isFresh={isFresh}
                  currentUserId={currentUser?.id || me?.id}
                  socket={socket}
                  conversationType={conversationType}
                  conversationId={conversationId}
                  serverId={serverId}
                  canManageMessages={canManageMessages}
                  onReply={onReply}
                  onStartEdit={onStartEdit}
                  editingMessageId={editingMessageId}
                  onReport={setReportTarget}
                  highlight={trimmedSearch}
                  onOpenPollVoters={setVotersPoll}
                  onEditPoll={setEditPoll}
                  appActions={appActions}
                  compactCards={compactCards}
                  chatBubbleKey={
                    isOwn
                      ? me?.equippedChatBubble?.effect_key || avatarUser?.equippedChatBubble?.effect_key || null
                      : avatarUser?.equippedChatBubble?.effect_key || null
                  }
                  reactionBurstKey={
                    isOwn
                      ? me?.equippedReactionBurst?.effect_key || avatarUser?.equippedReactionBurst?.effect_key || null
                      : avatarUser?.equippedReactionBurst?.effect_key || null
                  }
                />
              );
              })}
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />

      {hoverUser && hoverPos && (
        <UserHoverCard user={hoverUser} anchor={hoverPos} />
      )}

      <AnimatePresence>
        {votersPoll ? (
          <VotersSheet key="voters" poll={votersPoll} currentUserId={currentUser?.id || me?.id} onClose={() => setVotersPoll(null)} />
        ) : null}
        {editPoll ? (
          <PollCreateSheet
            key="edit"
            compact={compactCards}
            initial={editPoll}
            onClose={() => setEditPoll(null)}
            onSubmit={async (poll) => {
              const res = await editPollNow(editPoll, poll);
              if (res?.ok) setEditPoll(null);
              return res;
            }}
          />
        ) : null}
      </AnimatePresence>

      <UserProfileModal
        open={!!profileTarget}
        onClose={() => setProfileTarget(null)}
        userId={profileTarget?.id}
        username={profileTarget?.username}
        displayName={profileTarget ? resolveDisplayName(profileTarget) : undefined}
        avatarUrl={pickAvatarUrl(profileTarget)}
        createdAt={profileTarget?.createdAt || profileTarget?.created_at || null}
        me={me}
        friends={friends}
        onlineUsers={onlineUsers}
        onStartDm={onStartDm}
      />
      <ReportUserModal
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetId={reportTarget?.id}
        targetUsername={reportTarget?.username}
        snippet={reportTarget?.snippet}
        contextType={reportTarget?.contextType || conversationType}
        contextId={reportTarget?.contextId}
        occurredAt={reportTarget?.occurredAt}
      />
    </div>
  );
}

function MessageBubble({
  message,
  isOwn,
  isCompact,
  isFresh = false,
  currentUserId,
  socket,
  conversationType,
  conversationId,
  serverId = null,
  canManageMessages = false,
  onReply,
  onStartEdit,
  editingMessageId = null,
  onReport,
  onOpenPollVoters,
  onEditPoll,
  appActions,
  compactCards = false,
  highlight = "",
  chatBubbleKey = null,
  reactionBurstKey = null,
}) {
  const t = useT();
  const glass = useGlassUi();
  const bubbleRef = useRef(null);
  const pressDetach = useRef(null);
  const pressGate = useRef(null);
  if (!pressGate.current) pressGate.current = createMediaPressGate();
  const suppressMediaClickUntil = useRef(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.text || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hideTimer = useRef(null);
  const mediaTypeNorm = String(message.mediaType || "").toLowerCase();
  const rawMediaUrl = message.mediaUrl || message.media_url || "";
  const { url: mediaUrl, onMediaError } = usePrivateMediaUrl(rawMediaUrl);
  const mediaPreview = visualMediaPreview(message);
  const isVisualMedia = Boolean(mediaPreview);
  const isGif = Boolean(mediaPreview?.isGif);
  const mediaOnly = isVisualMedia && !String(message.text || "").trim();
  const isPollV2 = mediaTypeNorm === "poll_v2";
  const isPollEnd = mediaTypeNorm === "poll_end";
  const isLegacyPoll = mediaTypeNorm === "poll" || isLegacyPollText(message.text);
  const appCard = message.embed && typeof message.embed === "object" && message.embed.card ? message.embed : null;
  const hasCard = isPollV2 || Boolean(appCard) || isLegacyPoll;
  const hasSlashEmbed = Boolean(message.embed && typeof message.embed === "object") || hasCard;
  const x = useMotionValue(0);
  const replyHintOpacity = useTransform(
    x,
    [0, 20, 56],
    [0, 0.4, 1]
  );
  const reactions = Array.isArray(message.reactions) ? message.reactions : [];
  const reply = message.replyTo || message.reply_to || null;
  const isPinned = Boolean(message.pinnedAt);
  const hideCasino = casinoHiddenOnThisDevice() && isCasinoChatMessage(message);

  const togglePin = useCallback(() => {
    if (!message?.id || String(message.id).startsWith("temp-")) return;
    hapticImpactMedium();
    if (conversationType === "server") {
      if (!canManageMessages) return;
      socket?.emit(isPinned ? "server:channel:message:unpin" : "server:channel:message:pin", {
        serverId,
        channelId: conversationId,
        messageId: message.id,
      });
    } else if (conversationType === "group") {
      socket?.emit(isPinned ? "group:message:unpin" : "group:message:pin", {
        messageId: message.id,
        groupId: conversationId,
      });
    } else if (conversationId) {
      const [a, b] = String(conversationId).split("::");
      const toUserId = a === currentUserId ? b : a;
      socket?.emit(isPinned ? "dm:message:unpin" : "dm:message:pin", { messageId: message.id, toUserId });
    }
  }, [
    message?.id,
    isPinned,
    conversationType,
    conversationId,
    currentUserId,
    socket,
    serverId,
    canManageMessages,
  ]);

  const saveEdit = useCallback(() => {
    const next = editDraft.trim();
    if (!next || !message?.id || String(message.id).startsWith("temp-")) {
      setEditing(false);
      return;
    }
    if (next === (message.text || "")) {
      setEditing(false);
      return;
    }
    if (conversationType === "server") {
      socket?.emit("server:channel:message:edit", {
        serverId,
        channelId: conversationId,
        messageId: message.id,
        newText: next,
      });
    } else if (conversationType === "group") {
      socket?.emit("group:message:edit", {
        messageId: message.id,
        newText: next,
        groupId: conversationId,
      });
    } else if (conversationId) {
      const [a, b] = String(conversationId).split("::");
      const toUserId = a === currentUserId ? b : a;
      socket?.emit("dm:message:edit", { messageId: message.id, newText: next, toUserId });
    }
    setEditing(false);
  }, [
    editDraft,
    message?.id,
    message?.text,
    conversationType,
    conversationId,
    currentUserId,
    socket,
    serverId,
  ]);

  const emitDelete = useCallback(() => {
    if (!message?.id || String(message.id).startsWith("temp-")) return;
    let scope = "";
    if (conversationType === "server") {
      scope = `server:${conversationId}`;
      socket?.emit("server:channel:message:delete", {
        serverId,
        channelId: conversationId,
        messageId: message.id,
      });
    } else if (conversationType === "group") {
      scope = `group:${conversationId}`;
      socket?.emit("group:message:delete", {
        messageId: message.id,
        groupId: conversationId,
      });
    } else if (conversationId) {
      const [a, b] = String(conversationId).split("::");
      const toUserId = a === currentUserId ? b : a;
      scope = `dm:${toUserId}`;
      socket?.emit("dm:message:delete", { messageId: message.id, toUserId });
    }
    trackMessageDelete(message.id, scope);
    setMenuOpen(false);
  }, [message?.id, conversationType, conversationId, currentUserId, socket, serverId]);

  const deleteMessage = useCallback(() => {
    if (!message?.id || String(message.id).startsWith("temp-")) return;
    setMenuOpen(false);
    setPickerOpen(false);
    setConfirmDelete(true);
  }, [message?.id]);

  const canDelete = isOwn || (conversationType === "server" && canManageMessages);
  // Polls, poll-end lines and app cards are not text-editable (the poll has its own editor).
  const canEdit = isOwn && !isPollV2 && !isPollEnd && !appCard && mediaTypeNorm !== "app_card" && Boolean(String(message.text || "").trim());
  const isEditTarget = Boolean(glass && editingMessageId && editingMessageId === message.id);

  const beginEdit = useCallback(() => {
    if (glass) {
      let toUserId = null;
      if (conversationType !== "server" && conversationType !== "group" && conversationId) {
        const [a, b] = String(conversationId).split("::");
        toUserId = a === currentUserId ? b : a;
      }
      onStartEdit?.({
        id: message.id,
        text: message.text || "",
        conversationType,
        conversationId,
        serverId,
        toUserId,
      });
    } else {
      setEditDraft(message.text || "");
      setEditing(true);
    }
    setMenuOpen(false);
    setPickerOpen(false);
  }, [
    glass,
    conversationType,
    conversationId,
    currentUserId,
    onStartEdit,
    message.id,
    message.text,
    serverId,
  ]);

  useEffect(() => {
    if (!isEditTarget) return;
    bubbleRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [isEditTarget]);
  const canPin =
    conversationType === "server" ? canManageMessages : Boolean(conversationId);

  const resetSwipe = useCallback(() => {
    setSwiping(false);
    x.stop();
    x.set(0);
  }, [x]);

  const clearHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const openLightbox = useCallback(() => {
    pressDetach.current?.();
    pressGate.current.noteLightbox(true);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    pressDetach.current?.();
    pressGate.current.noteLightbox(false);
    setLightboxOpen(false);
  }, []);

  const beginMenuPress = useCallback((event, { pressed = false, fromMedia = false } = {}) => {
    if (!glass || editing) return;
    if (event.button != null && event.button !== 0) return;
    const el = event.currentTarget;
    if (!el) return;
    // Warm the native haptics bridge now so the lift tick lands on the
    // same frame as the menu (onFire), not one bridge round-trip later.
    primeHaptics();
    pressDetach.current?.();
    let detach = () => {};
    const session = attachMenuPress({
      gate: pressGate.current,
      event,
      el,
      delay: MESSAGE_MENU_LONG_PRESS_MS,
      onTeardown: () => {
        if (pressed) el.removeAttribute("data-pressed");
        if (pressDetach.current === detach) pressDetach.current = null;
      },
      onFire: () => {
        hapticImpactMedium();
        swallowOpeningPress();
        // The opening gesture's click is swallowed on window capture, so the
        // button handler may never see it. Ignore taps only briefly.
        if (fromMedia) suppressMediaClickUntil.current = Date.now() + 800;
        setMenuOpen(true);
        setPickerOpen(false);
      },
    });
    if (!session) return;
    detach = session.detach;
    pressDetach.current = detach;
    if (pressed) el.setAttribute("data-pressed", "");
  }, [glass, editing]);

  useEffect(() => {
    if (!menuOpen) suppressMediaClickUntil.current = 0;
  }, [menuOpen]);

  // Single shared hover toolbar: opening this one closes any other instantly.
  const hoverKey = useRef(null);
  if (!hoverKey.current) hoverKey.current = {};
  const closeFromOwner = useCallback(() => {
    setMenuOpen(false);
    setPickerOpen(false);
  }, []);

  const openMenu = () => {
    clearHide();
    if (!messageHoverToolbar.activate(hoverKey.current, closeFromOwner)) return;
    setMenuOpen(true);
  };

  const scheduleClose = () => {
    clearHide();
    messageHoverToolbar.scheduleRelease(hoverKey.current, HOVER_TOOLBAR_GRACE_MS);
  };

  useEffect(() => {
    const key = hoverKey.current;
    if (menuOpen) messageHoverToolbar.activate(key, closeFromOwner);
    else messageHoverToolbar.forget(key);
  }, [menuOpen, closeFromOwner]);

  useEffect(() => {
    messageHoverToolbar.setLocked(hoverKey.current, pickerOpen);
  }, [pickerOpen, menuOpen]);

  useEffect(() => () => messageHoverToolbar.forget(hoverKey.current), []);

  // Desktop hover toolbar placement (lib/hoverToolbarPlacement.js): the pill is
  // anchored to the row's top-right inside the visible chat column, never on the
  // header (avatar, name, badges, time) and never clipped; above the row when
  // short of space, quick reactions folded into the emoji button as a last resort.
  const [barCompact, setBarCompact] = useState(false);
  const placeBar = useCallback(() => {
    const el = bubbleRef.current;
    const bar = el?.querySelector(":scope > .message-hover-bar");
    if (!el || !bar) return;
    const row = el.closest(".message-group") || el.parentElement;
    const list = el.closest(".message-list");
    if (!row || !list) return;
    const rect = (n) => n.getBoundingClientRect();
    // The visible column is the list's scroll container (the list itself can be
    // taller than the viewport and start far above it).
    let scroller = list;
    for (let n = list; n && n !== document.body; n = n.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight) { scroller = n; break; }
    }
    const l = rect(scroller);
    const lw = scroller.clientWidth || l.width;
    // Visible part of the list (it can extend under the title bar / window edge).
    const clip = {
      left: Math.max(l.left, 0),
      right: Math.min(l.left + lw, window.innerWidth),
      top: Math.max(l.top, 0),
      bottom: Math.min(l.bottom, window.innerHeight),
    };
    const qr = bar.querySelector(".msg-quick-react");
    const compactNow = bar.classList.contains("is-compact");
    if (!compactNow && qr) bar.dataset.qrw = String(qr.offsetWidth + 8);
    const qrW = Number(bar.dataset.qrw || 0);
    const fullWidth = compactNow ? bar.offsetWidth + qrW : bar.offsetWidth;
    const compactW = fullWidth - qrW;
    // Row header (avatar, name, badges, time) plus the floating conversation
    // header pills that overlay the top of the list.
    const obstacles = [
      ...row.querySelectorAll(":scope > .message-header .message-avatar, :scope > .message-header .message-meta > *"),
      ...document.querySelectorAll(".chat-top-chrome .header-left, .chat-top-chrome .header-right"),
    ].map(rect).filter((r) => r.width > 0 && r.height > 0);
    // The hovered message itself: the pill may overlap the row's empty top-right,
    // never the text, media or embed it acts on.
    obstacles.push(rect(el));
    const p = placeHoverToolbar({
      row: rect(row), clip, bubble: rect(el), obstacles,
      fullW: fullWidth, compactW, barH: bar.offsetHeight || 44,
    });
    const b = rect(el);
    el.style.setProperty("--mhb-shift", `${Math.round(p.right - b.right)}px`);
    el.style.setProperty("--mhb-top", `${Math.round(p.top - b.top)}px`);
    bar.dataset.place = p.where;
    setBarCompact(p.compact);
  }, []);
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el || glass) return undefined;
    if (!menuOpen) {
      el.style.removeProperty("--mhb-shift");
      el.style.removeProperty("--mhb-top");
      setBarCompact(false);
      return undefined;
    }
    placeBar();
    window.addEventListener("resize", placeBar);
    return () => window.removeEventListener("resize", placeBar);
  }, [menuOpen, glass, placeBar]);

  // Full reaction picker: open below the bar, flip above when it would be
  // clipped by the bottom of the message list.
  const [pickerFlip, setPickerFlip] = useState(false);
  useLayoutEffect(() => {
    if (!pickerOpen) { setPickerFlip(false); return; }
    const el = bubbleRef.current;
    const bar = el?.querySelector(".message-hover-bar");
    const list = el?.closest(".message-list");
    if (!bar || !list) return;
    const b = bar.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const need = 160;
    setPickerFlip(b.bottom + need > l.bottom && b.top - need >= l.top - 4);
  }, [pickerOpen]);

  useEffect(() => {
    pressGate.current.noteLightbox(lightboxOpen);
    if (lightboxOpen) pressDetach.current?.();
  }, [lightboxOpen]);

  useEffect(() => () => {
    clearHide();
    pressDetach.current?.();
  }, []);

  const triggerReply = useCallback(() => {
    onReply?.({
      id: message.id,
      text: message.text || "",
      mediaType: message.mediaType,
      from: message.from || {
        id: message.sender_id || message.from?.id,
        username: message.from?.username || message.username,
      },
    });
    setMenuOpen(false);
    setPickerOpen(false);
    resetSwipe();
  }, [message, onReply, resetSwipe]);

  const replyLive = useRef({ triggerReply, resetSwipe, isOwn, editing });
  replyLive.current = { triggerReply, resetSwipe, isOwn, editing };
  useEffect(() => {
    if (!glass || mediaOnly) return undefined;
    const el = bubbleRef.current;
    if (!el) return undefined;
    return attachReplySwipe(el, {
      getDirection: () => "right",
      getEdgeWidth: () => swipeBackEdgeBand(),
      shouldIgnore: (target) => {
        if (replyLive.current.editing) return true;
        const node = target?.nodeType === 1 ? target : target?.parentElement;
        return Boolean(node?.closest?.("a, button, input, textarea, video, .message-reactions"));
      },
      onClaim: () => {
        cancelSwipeBackIfPending();
        primeHaptics();
        setSwiping(true);
      },
      onMove: (dx) => {
        x.set(dx);
      },
      onHaptic: () => hapticLight(),
      onReply: () => replyLive.current.triggerReply(),
      onCancel: () => replyLive.current.resetSwipe(),
    });
  }, [glass, mediaOnly, x]);

  const emitReact = useCallback((emoji) => {
    if (!message?.id || !conversationType || !conversationId || !emoji) return;
    if (String(message.id).startsWith("temp-")) return;

    const mine = reactions.some((r) => r.emoji === emoji && r.userId === currentUserId);
    if (mine) {
      socket?.emit("reaction:remove", {
        messageId: message.id,
        conversationType,
        conversationId,
        emoji,
      });
    } else {
      socket?.emit("reaction:add", {
        messageId: message.id,
        conversationType,
        conversationId,
        emoji,
      });
    }
    setPickerOpen(false);
  }, [message?.id, conversationType, conversationId, reactions, currentUserId, socket]);

  if (hideCasino) return null;

  return (
    <div className={`message-swipe-wrap is-left${swiping ? " is-swiping" : ""}`}>
      {swiping && (
        <motion.div
          className="message-swipe-hint"
          style={{ opacity: replyHintOpacity }}
          aria-hidden="true"
        >
          <Reply size={16} />
        </motion.div>
      )}

      <motion.div
        ref={bubbleRef}
        initial={{
          opacity: 0,
          y: isOwn && isFresh ? 14 : 8,
          scale: isOwn && isFresh ? 0.96 : 0.99,
        }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: isOwn && isFresh ? 0.28 : 0.2,
          ease: [0.16, 1, 0.3, 1],
        }}
        style={{ x }}
        drag={glass || mediaOnly ? false : "x"}
        dragDirectionLock
        dragSnapToOrigin
        dragConstraints={{ left: 0, right: 72 }}
        dragElastic={glass ? 0 : 0.18}
        onDragStart={() => { if (!glass) setSwiping(true); }}
        onDragEnd={(_, info) => {
          if (glass) return;
          const dx = info.offset.x;
          const shouldReply = dx >= 48;
          // Always snap hint away, cancel / incomplete swipe must not leave the icon stuck
          resetSwipe();
          if (shouldReply) triggerReply();
        }}
        data-no-swipe-back=""
        data-editing={isEditTarget ? "1" : undefined}
        className={`message-bubble is-left ${isOwn ? "own" : ""} ${isCompact ? "compact" : ""} ${menuOpen ? "menu-open" : ""} ${isEditTarget ? "is-editing" : ""} ${mediaOnly ? "has-media-only" : ""} ${isVisualMedia ? "has-media" : ""} ${hasSlashEmbed ? "has-slash-embed" : ""} ${hasCard ? "has-card" : ""} ${isPollEnd ? "has-poll-end" : ""} ${chatBubbleKey ? `cosmetic-chat-bubble bubble-${chatBubbleKey}` : ""}`}
        onMouseEnter={glass ? undefined : openMenu}
        onMouseLeave={glass ? undefined : scheduleClose}
        onPointerDown={(e) => {
          if (e.target.closest("a, button, video, img, .message-media, .message-reactions, .slash-embed")) return;
          beginMenuPress(e, { pressed: true });
        }}
        onClick={(e) => {
          // Touch / click toggle for devices without hover. Glass uses long-press.
          if (e.target.closest("a, button, video, img, .message-media, .message-hover-bar, .message-reactions, .slash-embed")) return;
          if (!messageMenuOpensOnTap(glass) ) return;
          if (window.matchMedia("(hover: none)").matches) {
            setMenuOpen((v) => !v);
            setPickerOpen(false);
          }
        }}
      >
        {reply && (
          <button
            type="button"
            className="message-reply-quote"
            onClick={(e) => {
              e.stopPropagation();
              onReply?.(reply.id ? { ...reply, id: reply.id } : reply);
            }}
            title={t("Replying to")}
          >
            <span className="message-reply-author">
              {reply.from?.username || reply.username || t("Message")}
            </span>
            <span className="message-reply-text">
              {reply.text
                ? displayText(plainText(String(reply.text)).slice(0, 120))
                : reply.mediaType
                ? `📎 ${reply.mediaType}`
                : t("Original message")}
            </span>
          </button>
        )}

        {isPinned && (
          <div className="message-pinned-badge" title={t("Pinned")}>
            <Pin size={11} strokeWidth={2.5} />
            <span>{t("Pinned")}</span>
          </div>
        )}

        {editing && !glass ? (
          <div className="msg-edit-box" onClick={(e) => e.stopPropagation()}>
            <input
              className="msg-edit-input"
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") {
                  setEditDraft(message.text || "");
                  setEditing(false);
                }
              }}
              autoFocus
            />
            <div className="msg-edit-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit}>
                {t("Save")}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditDraft(message.text || "");
                  setEditing(false);
                }}
              >
                {t("Cancel")}
              </button>
            </div>
          </div>
        ) : isPollV2 ? (
          <PollCard
            message={message}
            scope={conversationType}
            compact={compactCards}
            onOpenVoters={onOpenPollVoters}
            onEdit={onEditPoll}
          />
        ) : isPollEnd ? (
          <div className="dsx-poll-end" role="status">
            <BarChart3 className="dsx-ico" />
            <span>{String(message.text || "").replace(/^📊\s*/u, "")}</span>
          </div>
        ) : appCard ? (
          <AppCard
            message={message}
            embed={appCard}
            socket={socket}
            serverId={serverId}
            channelId={conversationType === "server" ? conversationId : null}
            compact={compactCards}
            actions={appActions || {}}
          />
        ) : message.embed ? (
          <SlashCommandEmbed embed={message.embed} type={message.appType || message.type} />
        ) : isLegacyPoll && message.text ? (
          <LegacyPollCard text={message.text} />
        ) : (
          message.text && (
            <>
              <MessageContent text={message.text} highlight={highlight} />
              {message.editedAt ? (
                <span className="msg-edited" style={{ fontSize: 11, opacity: 0.65, marginLeft: 4 }}>
                  ({t("edited")})
                </span>
              ) : null}
              <InviteLinkEmbedList text={message.text} />
            </>
          )
        )}

        {mediaUrl && (
          <div className={`message-media${isVisualMedia ? " is-visual" : ""}`}>
            {isVisualMedia ? (
              <button
                type="button"
                className="message-media-trigger"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  beginMenuPress(e, { fromMedia: true });
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (Date.now() < suppressMediaClickUntil.current) {
                    suppressMediaClickUntil.current = 0;
                    return;
                  }
                  if (!pressGate.current.accepts()) return;
                  openLightbox();
                }}
                aria-label={isGif ? t("Open GIF") : t("Open image")}
              >
                <img
                  src={mediaUrl}
                  alt={
                    isGif
                      ? "GIF"
                      : message.originalName || t("Image")
                  }
                  className="message-image"
                  loading="lazy"
                  draggable={false}
                  onError={onMediaError}
                />
                {isGif && (
                  <span className="message-media-badge" aria-hidden="true">GIF</span>
                )}
              </button>
            ) : mediaTypeNorm === "video" ? (
              <video
                src={mediaUrl}
                controls
                className="message-video"
                onError={onMediaError}
                onClick={(e) => e.stopPropagation()}
              />
            ) : mediaTypeNorm === "audio" || mediaTypeNorm === "voice" ? (
              <VoiceMessagePlayer
                audioUrl={mediaUrl}
                duration={message.duration || message.durationSeconds || 0}
                isOwn={isOwn}
              />
            ) : (mediaTypeNorm === "document" || mediaTypeNorm === "file") ? (
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={message.originalName || true}
                className="message-file-chip"
                onClick={(e) => {
                  if (!needsPrivateMediaRefresh(mediaUrl)) return;
                  e.preventDefault();
                  const popup = window.open("about:blank", "_blank", "noopener");
                  refreshMediaUrl(rawMediaUrl).then((next) => {
                    if (next && popup) popup.location.href = next;
                    else if (popup) popup.close();
                  });
                }}
              >
                <div className="message-file-ico">
                  <FileText size={18} />
                </div>
                <div className="message-file-meta">
                  <div className="message-file-name">{message.originalName || t("File")}</div>
                  {message.size && (
                    <div className="message-file-size">
                      {message.size < 1024 * 1024
                        ? `${Math.round(message.size / 1024)} KB`
                        : `${(message.size / (1024 * 1024)).toFixed(1)} MB`}
                    </div>
                  )}
                </div>
                <Download size={16} />
              </a>
            ) : null}
          </div>
        )}

        {isVisualMedia && (
          <MessageMediaLightbox
            open={lightboxOpen}
            src={mediaUrl}
            alt={isGif ? "GIF" : message.originalName || t("Image")}
            onClose={closeLightbox}
          />
        )}

        {reactions.length > 0 && (
          <MessageReactions
            messageId={message.id}
            conversationType={conversationType}
            conversationId={conversationId}
            reactions={reactions}
            currentUserId={currentUserId}
            socket={socket}
            burstKey={isOwn ? reactionBurstKey : null}
          />
        )}

        {!isCompact && isOwn && (
          <div className="message-footer">
            <span
              className="message-status"
              title={message.sending ? t("Sending…") : message.deliveredAt ? t("Delivered") : t("Sent")}
              style={{ opacity: message.sending ? 0.4 : 1 }}
            >
              {message.deliveredAt ? "✓✓" : "✓"}
            </span>
          </div>
        )}

        <AnimatePresence>
          {menuOpen && !editing && !glass && (
            <motion.div
              className={`message-hover-bar other${barCompact ? " is-compact" : ""}`}
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 2, scale: 0.98, transition: { duration: 0.08, ease: "easeOut" } }}
              transition={{ duration: 0.14 }}
              onMouseEnter={openMenu}
              onMouseLeave={scheduleClose}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="msg-quick-react">
                {QUICK_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="emoji-chip"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      emitReact(e);
                    }}
                    title={`${t("React")} ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`hover-bar-btn ${pickerOpen ? "active" : ""}`}
                title={t("More reactions")} aria-label={t("More reactions")}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setPickerOpen((v) => !v);
                }}
              >
                <Smile size={14} />
              </button>
              <button
                type="button"
                className="hover-bar-btn"
                title={t("Reply")} aria-label={t("Reply")}
                onClick={(ev) => {
                  ev.stopPropagation();
                  triggerReply();
                }}
              >
                <Reply size={14} />
              </button>
              {canPin && (
                <button
                  type="button"
                  className={`hover-bar-btn ${isPinned ? "active" : ""}`}
                  title={isPinned ? t("Unpin") : t("Pin")} aria-label={isPinned ? t("Unpin") : t("Pin")}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    togglePin();
                  }}
                >
                  {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="hover-bar-btn"
                  title={t("Edit")} aria-label={t("Edit")}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    beginEdit();
                  }}
                >
                  <Pencil size={14} />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="hover-bar-btn danger"
                  title={t("Delete")} aria-label={t("Delete")}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    deleteMessage();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
              {!isOwn && (
                <button
                  type="button"
                  className="hover-bar-btn"
                  title={t("report.action")} aria-label={t("report.action")}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    const author = message.from || {};
                    const id = author.id || message.sender_id || message.userId || message.user_id;
                    if (!id || id === currentUserId) return;
                    onReport?.({
                      id,
                      username: author.username || message.username,
                      snippet: String(message.text || "").slice(0, 400),
                      contextType: conversationType,
                      contextId: message.id,
                      occurredAt: message.timestamp || message.created_at || message.createdAt,
                    });
                    setMenuOpen(false);
                  }}
                >
                  <Flag size={14} />
                </button>
              )}

              <AnimatePresence>
                {pickerOpen && (
                  <motion.div
                    className={`message-inline-picker${pickerFlip ? " flip-up" : ""}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="message-inline-picker-head">
                      <span>{t("React")}</span>
                      <button type="button" onClick={() => setPickerOpen(false)} aria-label={t("Close")}>
                        <X size={12} />
                      </button>
                    </div>
                    <div className="message-inline-picker-grid">
                      {PICKER_EMOJIS.map((e) => (
                        <button key={e} type="button" onClick={() => emitReact(e)}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
        {glass && menuOpen && !editing && (
          <GlassMessageMenu
            bubbleRef={bubbleRef}
            // 2.12.0: every bubble sits on the left, so the menu anchors left too.
            isOwn={false}
            onClose={() => { setMenuOpen(false); setPickerOpen(false); }}
            quick={QUICK_EMOJIS}
            onReact={emitReact}
            onMore={() => setPickerOpen((v) => !v)}
            pickerOpen={pickerOpen}
            pickerEmojis={PICKER_EMOJIS}
            onReply={triggerReply}
            canPin={canPin}
            isPinned={isPinned}
            onPin={togglePin}
            canEdit={canEdit}
            onEdit={beginEdit}
            canDelete={canDelete}
            onDelete={deleteMessage}
            canReport={!isOwn}
            onReport={() => {
              const author = message.from || {};
              const id = author.id || message.sender_id || message.userId || message.user_id;
              if (!id || id === currentUserId) return;
              onReport?.({
                id,
                username: author.username || message.username,
                snippet: String(message.text || "").slice(0, 400),
                contextType: conversationType,
                contextId: message.id,
                occurredAt: message.timestamp || message.created_at || message.createdAt,
              });
              setMenuOpen(false);
            }}
            t={t}
          />
        )}
        {confirmDelete && (
          <GlassConfirm
            title={t("Delete message")}
            message={t("This message will be deleted for everyone. This cannot be undone.")}
            confirmLabel={t("Delete")}
            cancelLabel={t("Cancel")}
            danger
            onConfirm={() => {
              setConfirmDelete(false);
              emitDelete();
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </motion.div>
    </div>
  );
}

function prefersReducedMotionNow() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * iOS-style long-press menu (glass phone layout). The lifted preview is a
 * clone of the real rendered bubble (`buildLiftedBubble`): same skin, markdown,
 * newlines, media and size, floating with no box behind it. Reaction bar and
 * menu are separate heavy frosted surfaces (frost.css), positioned by
 * `liftLayout` so nothing is clipped. The real bubble stays hidden
 * (`.menu-open`) until the copy has flown back.
 */
function GlassMessageMenu({
  bubbleRef, isOwn, onClose, quick, onReact, onMore, pickerOpen, pickerEmojis,
  onReply, canPin, isPinned, onPin, canEdit, onEdit, canDelete, onDelete, canReport, onReport, t,
}) {
  const [closing, setClosing] = useState(false);
  const bar = useMaterialize(!closing);
  const menu = useMaterialize(!closing);
  const act = (fn) => pressToActivate(fn);
  const [lift, setLift] = useState(null);
  const slotRef = useRef(null);
  const reduced = useMemo(() => prefersReducedMotionNow(), []);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const built = buildLiftedBubble(el);
    if (!built) return;
    const r = el.getBoundingClientRect();
    // getBoundingClientRect includes the press shrink (`scale`); use the
    // layout size and keep the visual centre.
    const w = built.width || r.width;
    const h = built.height || r.height;
    setLift({
      built,
      rect: { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h },
      // Start the copy at the press shrink the finger left on the original.
      pressScale: w > 0 ? Math.min(1, Math.max(0.9, r.width / w)) : 1,
    });
  }, [bubbleRef]);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const root = lift?.built?.root;
    if (!slot || !root) return undefined;
    slot.appendChild(root);
    return () => {
      if (root.parentNode === slot) slot.removeChild(root);
    };
  }, [lift]);

  const closeRef = useRef({ started: false, done: false, timer: null });
  const finishClose = useCallback(() => {
    const c = closeRef.current;
    if (c.done) return;
    c.done = true;
    clearTimeout(c.timer);
    onClose?.();
  }, [onClose]);
  const beginClose = useCallback(() => {
    const c = closeRef.current;
    if (c.started) return;
    c.started = true;
    setClosing(true);
    // Fly-back normally ends in onAnimationComplete; the timer is the floor.
    c.timer = setTimeout(finishClose, reduced ? 200 : 650);
  }, [finishClose, reduced]);
  useEffect(() => () => clearTimeout(closeRef.current.timer), []);

  if (!lift || typeof document === "undefined") return null;
  const menuRows = 2 + (canPin ? 1 : 0) + (canEdit ? 1 : 0) + (canDelete ? 1 : 0) + (canReport ? 1 : 0);
  // Visible area: with the keyboard up the visual viewport is shorter than
  // the layout viewport, so clamp the bar and menu to what the user sees.
  const vv = window.visualViewport;
  const layout = liftLayout({
    rect: lift.rect,
    vw: window.innerWidth,
    vh: vv?.height || window.innerHeight,
    viewTop: vv?.offsetTop || 0,
    isOwn,
    barW: reactBarWidth(quick.length),
    menuH: menuHeight({ rows: menuRows, separators: canDelete || canReport ? 1 : 0, picker: pickerOpen }),
  });
  const liftSpring = framerSpring(SPRINGS.default);
  // Lift in place (2.13.1): scale only, never a translate, so the copy stays
  // exactly over the hidden original. Reduced motion: no scale at all.
  const back = { scale: 1, opacity: 1 };
  const lifted = { scale: reduced ? 1 : layout.liftScale, opacity: 1 };
  return createPortal(
    <>
      <motion.button
        type="button"
        className="g-scrim g-msg-scrim"
        aria-label={t("Close")}
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={reduced ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize)}
        {...act(beginClose)}
      />
      <div className="g-msg-pop">
        <motion.div
          className="g-lift"
          style={{
            top: layout.liftTop,
            left: layout.liftLeft,
            width: lift.rect.width,
            height: lift.rect.height,
            transformOrigin: layout.origin,
          }}
          data-placement={layout.placement}
          initial={reduced ? { scale: 1, opacity: 1 } : { scale: lift.pressScale, opacity: 1 }}
          animate={closing ? back : lifted}
          transition={reduced ? REDUCED_MOTION_FADE : { scale: liftSpring, opacity: { duration: 0.12 } }}
          onAnimationComplete={() => {
            if (closing && !reduced) finishClose();
          }}
        >
          <motion.div
            className="g-lift-shadow"
            style={{ borderRadius: lift.built.radius }}
            initial={{ opacity: 0 }}
            animate={{ opacity: closing ? 0 : 1 }}
            transition={reduced ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize)}
            aria-hidden="true"
          />
          <div ref={slotRef} className="g-lift-slot" />
        </motion.div>
        <div
          ref={bar.ref}
          className="g-react-bar g-glass g-heavy g-materialize"
          role="toolbar"
          style={{
            top: layout.barTop,
            left: layout.barLeft,
            maxWidth: layout.barW,
            ["--g-mat-origin"]: `${isOwn ? "100%" : "0%"} ${layout.barFromBelow ? "100%" : "0%"}`,
          }}
        >
          {quick.map((e) => (
            <button key={e} type="button" className="emoji-chip" {...act(() => onReact(e))}>{e}</button>
          ))}
          <button type="button" className="hover-bar-btn" aria-label={t("More reactions")} {...act(onMore)}>
            <Smile size={18} />
          </button>
        </div>
        <div
          className="g-msg-stack"
          style={{ top: layout.menuTop, left: layout.menuLeft, width: layout.menuW }}
        >
          <div
            ref={menu.ref}
            className="g-menu g-glass g-heavy g-materialize"
            role="menu"
            style={{ ["--g-mat-origin"]: `${isOwn ? "100%" : "0%"} ${layout.menuFromAbove ? "0%" : "100%"}` }}
          >
            <button type="button" className="g-mi" {...act(onReply)}><Reply size={19} />{t("Reply")}</button>
            {canPin && (
              <button type="button" className="g-mi" {...act(onPin)}>
                {isPinned ? <PinOff size={19} /> : <Pin size={19} />}
                {isPinned ? t("Unpin") : t("Pin")}
              </button>
            )}
            {canEdit && (
              <button type="button" className="g-mi" {...act(onEdit)}><Pencil size={19} />{t("Edit")}</button>
            )}
            <button type="button" className="g-mi" {...act(onMore)}><SmilePlus size={19} />{t("More reactions")}</button>
            {(canDelete || canReport) && <div className="g-msep" />}
            {canDelete && (
              <button type="button" className="g-mi danger" {...act(onDelete)}><Trash2 size={19} />{t("Delete")}</button>
            )}
            {canReport && (
              <button type="button" className="g-mi" {...act(onReport)}><Flag size={19} />{t("report.action")}</button>
            )}
          </div>
          {pickerOpen && (
            <div className="g-menu g-glass g-heavy g-msg-picker">
              <div className="message-inline-picker-grid">
                {pickerEmojis.map((e) => (
                  <button key={e} type="button" className="emoji-chip" {...act(() => onReact(e))}>{e}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

function formatTimestamp(iso) {
  const date = parseAppDate(iso);
  if (!date) return "";
  try {
    const now = new Date();
    const loc = intlLocaleTag(getLocale());
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return formatMessageClock(date, loc);
    return formatMessageDate(date, loc, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
