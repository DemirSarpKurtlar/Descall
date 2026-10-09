import { t } from '../i18n/runtime';
import { isChannelMuted } from './serverChannelMutes';
import { displayText } from './profanity';
import { brandIconUrl } from "../components/brand/brandIconUrl";
import {
  DM_INCOMING_TAG,
  beginIncomingShow,
  createIncomingCloseGate,
  incomingShowStillCurrent,
  markIncomingDismissed,
  planIncomingDismiss,
} from "./callNotificationClose";

const COOLDOWN_MS = 800;
const CALL_TAG = DM_INCOMING_TAG;

function readUserSettings() {
  try {
    const raw =
      localStorage.getItem('descall_user_settings') ||
      localStorage.getItem('descall_settings') ||
      '{}';
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readMyStatus() {
  try {
    const saved = localStorage.getItem('descall:myStatus');
    if (['online', 'idle', 'dnd', 'invisible'].includes(saved)) return saved;
  } catch {
    /* ignore */
  }
  return 'online';
}

/** DND mutes desktop notifications; live incoming calls still ring. */
function isDndMuted({ allowDuringDnd = false } = {}) {
  if (allowDuringDnd) return false;
  return readMyStatus() === 'dnd';
}

class NotificationService {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
    this.hasPermission = false;
    this.initialized = false;
    this.lastNotificationTime = 0;
    // tag → last shown timestamp (cooldown is per conversation, not global,
    // so a burst across DM/group/server never swallows a different chat)
    this._lastByTag = new Map();
    this.pendingNotifications = [];
    // tag → timeout id — prevents duplicate notifications for the same event
    this._activeByTag = new Map();
    // tag → { notification, data } for page Notification handles.
    // requireInteraction call cards never time out; without the handle nothing
    // can close() them when the ring ends.
    this._shownByTag = new Map();
    // tags currently executing the async show() path
    this._pendingByTag = new Set();
    // In-flight incoming-call shows. Dismiss marks that ticket cancelled so a
    // show() that is still awaiting focus does not raise a dead ring.
    this._incomingGate = createIncomingCloseGate();
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    if (this.isElectron) {
      this.hasPermission = true;
      this._registerClickHandler();
    } else if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        this.hasPermission = true;
      }
      // Don't auto-request on init — let requestPermission() be called explicitly
      // so the browser doesn't block the prompt (requires user gesture in some browsers)
    }

    this._drainPending();
  }

  // Call this from a button click / user gesture to request web permission
  async requestPermission() {
    if (this.isElectron) return 'granted';
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') {
      this.hasPermission = true;
      return 'granted';
    }
    if (Notification.permission === 'denied') return 'denied';
    const result = await Notification.requestPermission().catch(() => 'denied');
    this.hasPermission = result === 'granted';
    return result;
  }

  getPermissionState() {
    if (this.isElectron) return 'granted';
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }

  _registerClickHandler() {
    if (!this.isElectron || !window.electronAPI?.onNotificationClicked) return;
    window.electronAPI.onNotificationClicked((payload) => {
      window.dispatchEvent(new CustomEvent('descall:notification-click', { detail: payload }));
    });
  }

  async _isWindowActive() {
    // Hidden (tray / minimized / background) is never "active".
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    if (this.isElectron && window.electronAPI?.isWindowFocused) {
      try {
        return Boolean(await window.electronAPI.isWindowFocused());
      } catch {
        // IPC failure must not swallow the notification.
        return false;
      }
    }
    return typeof document !== 'undefined' ? document.hasFocus() : false;
  }

  async show({ title, body: rawBody, tag = 'descall', requireInteraction = false, silent = false, data = {}, avatarUrl = null, incomingTicket = null }) {
    // Native iOS app: bad words in notification text are masked with ***.
    const body = displayText(rawBody);
    if (!this.initialized) {
      this.pendingNotifications.push({ title, body, tag, requireInteraction, silent, data, avatarUrl, incomingTicket });
      await this.init();
      return;
    }
    if (!this.hasPermission) return;

    // Drop concurrent async calls for the same tag (e.g. two rapid socket events)
    if (this._pendingByTag.has(tag)) return;
    this._pendingByTag.add(tag);

    // Tag-based dedup: close any existing shown notification with the same tag
    if (this._activeByTag.has(tag)) {
      clearTimeout(this._activeByTag.get(tag));
      this._activeByTag.delete(tag);
    }

    try {
      if (incomingTicket && !incomingShowStillCurrent(this._incomingGate, incomingTicket)) return;

      // Rate limit per tag — skip non-call repeats of the same chat during cooldown
      const now = Date.now();
      const lastForTag = this._lastByTag.get(tag) || 0;
      if (!requireInteraction && now - lastForTag < COOLDOWN_MS) return;

      // Skip if window is focused (user can already see the message)
      const windowActive = await this._isWindowActive();
      if (windowActive && !requireInteraction) return;
      if (incomingTicket && !incomingShowStillCurrent(this._incomingGate, incomingTicket)) return;

      this._lastByTag.set(tag, now);
      this.lastNotificationTime = now;
      if (this._lastByTag.size > 200) {
        for (const [k, ts] of this._lastByTag) {
          if (now - ts > 60_000) this._lastByTag.delete(k);
        }
      }

      if (this.isElectron && window.electronAPI?.showNotification) {
        window.electronAPI.showNotification(title, { body, tag, data, requireInteraction, silent, avatarUrl });
      } else {
        this._showWebNotification({ title, body, tag, requireInteraction, silent, data });
      }

      // Track this tag as active; clear after its visible duration
      const ttl = requireInteraction ? 30_000 : 6_000;
      const timer = setTimeout(() => this._activeByTag.delete(tag), ttl);
      this._activeByTag.set(tag, timer);
    } catch (err) {
      console.error('[Notification] show failed:', err);
    } finally {
      this._pendingByTag.delete(tag);
    }
  }

  _showWebNotification({ title, body, tag, requireInteraction, silent, data }) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const prev = this._shownByTag.get(tag);
      try { prev?.notification?.close(); } catch { /* replaced by the new card */ }
      const n = new Notification(title, {
        body,
        tag,
        requireInteraction,
        silent,
        icon: brandIconUrl(),
        badge: brandIconUrl(),
        data,
      });
      this._shownByTag.set(tag, { notification: n, data });
      n.onclose = () => {
        if (this._shownByTag.get(tag)?.notification === n) this._shownByTag.delete(tag);
      };
      n.onclick = () => {
        window.focus();
        n.close();
        window.dispatchEvent(new CustomEvent('descall:notification-click', { detail: data }));
      };
      if (!requireInteraction) setTimeout(() => n.close(), 5000);
    } catch (err) {
      console.error('[Notification] Failed to show:', err);
    }
  }

  _closeHandle(tag) {
    if (this._activeByTag.has(tag)) {
      clearTimeout(this._activeByTag.get(tag));
      this._activeByTag.delete(tag);
    }
    const entry = this._shownByTag.get(tag);
    if (!entry) return;
    this._shownByTag.delete(tag);
    try { entry.notification?.close(); } catch { /* already gone */ }
  }

  /**
   * Close the incoming-call desktop notification for one ring outcome.
   * Page Notification handles, Electron toasts, and service-worker pushes
   * that share the call tag are all closed. Other tags are left alone.
   */
  dismissIncomingCall(query = {}) {
    const kind = query.kind === "group" ? "group" : "dm";
    const identity = kind === "group" ? (query.groupId || null) : (query.fromId || null);
    markIncomingDismissed(this._incomingGate, kind, identity);
    const shown = [...this._shownByTag.entries()].map(([tag, entry]) => ({
      tag,
      data: entry?.data,
    }));
    const plan = planIncomingDismiss({ ...query, kind }, shown);
    for (const tag of plan.shownTags) this._closeHandle(tag);
    this._closeNativeIncoming(plan.closeTags, plan.query);
  }

  _closeNativeIncoming(tags, query) {
    if (typeof window !== "undefined" && window.electronAPI?.closeNotification) {
      try { window.electronAPI.closeNotification({ tags }); } catch { /* ignore */ }
    }
    this._closeServiceWorkerCallNotifications(query);
  }

  _closeServiceWorkerCallNotifications(query) {
    if (typeof navigator === "undefined" || !navigator.serviceWorker?.getRegistration) return;
    const message = {
      type: "descall:close-call-notifications",
      kind: query.kind,
      tags: query.tags || [],
      fromId: query.fromId || null,
      groupId: query.groupId || null,
    };
    const send = (worker) => {
      try { worker?.postMessage(message); } catch { /* ignore */ }
    };
    try { send(navigator.serviceWorker.controller); } catch { /* ignore */ }
    navigator.serviceWorker.getRegistration().then((reg) => {
      send(reg?.active);
      if (reg?.waiting && reg.waiting !== reg.active) send(reg.waiting);
    }).catch(() => {});
  }

  _drainPending() {
    const queued = this.pendingNotifications.splice(0);
    queued.forEach((opts, i) => setTimeout(() => this.show(opts), i * COOLDOWN_MS));
  }

  // ─── Typed notification helpers ───────────────────────────────────────────

  async dm({ from, text, conversationId }) {
    if (isDndMuted()) return;
    if (readUserSettings().msgNotifications === false) return;
    await this.show({
      title: from,
      body: text?.substring(0, 120) || t("New message"),
      tag: `dm-${conversationId}`,
      data: { type: 'dm', conversationId, from },
    });
  }

  // Legacy alias used in existing App.jsx calls
  async newMessage({ from, text, preview, conversationId }) {
    await this.dm({ from, text: preview || text, conversationId });
  }

  async groupMessage({ groupName, from, text, groupId }) {
    if (isDndMuted()) return;
    if (readUserSettings().msgNotifications === false) return;
    await this.show({
      title: groupName,
      body: `${from}: ${(text || t("New message")).substring(0, 100)}`,
      tag: `group-${groupId}`,
      data: { type: 'group', groupId, from, groupName },
    });
  }

  async mention({
    groupName,
    from,
    text,
    groupId,
    dmConversationId,
    serverId,
    channelId,
    serverName,
    channelName,
  }) {
    if (isDndMuted()) return;
    const settings = readUserSettings();
    if (settings.msgNotifications === false) return;
    if (settings.mentionNotifications === false) return;
    if (channelId && isChannelMuted(channelId)) return;
    const contextLabel =
      serverName && channelName
        ? `${serverName} #${channelName}`
        : serverName || groupName || null;
    await this.show({
      title: `💬 ${t("{from} mentioned you", { from })}`,
      body: contextLabel
        ? `${contextLabel}: ${(text || '').substring(0, 100)}`
        : (text || '').substring(0, 120),
      tag: `mention-${groupId || dmConversationId || channelId || 'x'}`,
      requireInteraction: true,
      data: {
        type: 'mention',
        groupId,
        dmConversationId,
        serverId,
        channelId,
        serverName,
        channelName,
        from,
      },
    });
  }

  /** New message in a server text channel (server notification level "all"). */
  async serverMessage({ serverId, channelId, serverName, channelName, from, text, kind, avatarUrl = null }) {
    if (isDndMuted()) return;
    if (readUserSettings().msgNotifications === false) return;
    if (channelId && isChannelMuted(channelId)) return;
    const where = serverName && channelName
      ? `${serverName} #${channelName}`
      : serverName || (channelName ? `#${channelName}` : t("New message"));
    const preview = kind === 'voice'
      ? t("🎤 Voice message")
      : (text || '').trim() || (kind === 'media' ? '📎' : t("New message"));
    await this.show({
      title: where,
      body: `${from || t("Someone")}: ${preview.substring(0, 100)}`,
      tag: `server-${channelId || serverId || 'x'}`,
      avatarUrl,
      data: { type: 'server-message', serverId, channelId, serverName, channelName, from },
    });
  }

  // Legacy alias
  async groupMention({ groupName, from, text, groupId }) {
    await this.mention({ groupName, from, text, groupId });
  }

  async incomingCall({ from, fromId = null, type = 'voice' }) {
    // Live calls still notify during DND so you don't miss them
    if (readUserSettings().callNotifications === false) return;
    const incomingTicket = beginIncomingShow(this._incomingGate, "dm", fromId);
    await this.show({
      title: `📞 ${t("{from} is calling", { from })}`,
      body: type === 'video' ? t("Video call") : t("Voice call"),
      tag: CALL_TAG,
      requireInteraction: true,
      incomingTicket,
      data: { type: 'call', from, fromId, callType: type },
    });
  }

  async groupCall({ groupName, from, groupId = null }) {
    if (readUserSettings().callNotifications === false) return;
    const incomingTicket = beginIncomingShow(this._incomingGate, "group", groupId);
    const tag = groupId ? `group-call-${groupId}` : `group-call-${groupName || "Grup"}`;
    await this.show({
      title: `📞 ${t("{groupName} — Group Call", { groupName })}`,
      body: t("{from} started a group call", { from }),
      tag,
      requireInteraction: true,
      incomingTicket,
      data: { type: 'group-call', groupName, groupId, from },
    });
  }

  async missedCall({ from, type = 'voice' }) {
    if (isDndMuted()) return;
    await this.show({
      title: t("Missed Call"),
      body: type === 'video'
        ? t("{from} made a video call", { from })
        : t("{from} made a voice call", { from }),
      tag: `missed-call-${from}`,
      data: { type: 'missed-call', from, callType: type },
    });
  }

  async friendRequest({ from, fromId }) {
    if (isDndMuted()) return;
    await this.show({
      title: t("Friend Request"),
      body: t("{from} wants to add you as a friend", { from }),
      tag: `friend-req-${fromId}`,
      data: { type: 'friend-request', fromId, from },
    });
  }

  async friendOnline({ username }) {
    if (isDndMuted()) return;
    await this.show({
      title: t("Descall"),
      body: t("{username} is now online", { username }),
      tag: `online-${username}`,
      silent: true,
      data: { type: 'friend-online', username },
    });
  }

  async newAnnouncement({ title, preview, announcementId }) {
    if (isDndMuted()) return;
    await this.show({
      title: `📢 ${title}`,
      body: preview,
      tag: `ann-${announcementId}`,
      data: { type: 'announcement', announcementId },
    });
  }
}

const notificationService = new NotificationService();

if (typeof window !== 'undefined') {
  const boot = () => {
    notificationService.init();
    document.removeEventListener('click', boot);
    document.removeEventListener('keydown', boot);
  };
  document.addEventListener('click', boot, { once: true });
  document.addEventListener('keydown', boot, { once: true });
}

export default notificationService;
