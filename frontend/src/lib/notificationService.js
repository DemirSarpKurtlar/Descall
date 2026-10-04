import { t } from '../i18n/runtime';
import { isChannelMuted } from './serverChannelMutes';
import { brandIconUrl } from "../components/brand/brandIconUrl";

const COOLDOWN_MS = 800;
const CALL_TAG = 'descall-incoming-call';

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
    // tags currently executing the async show() path
    this._pendingByTag = new Set();
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

  async show({ title, body, tag = 'descall', requireInteraction = false, silent = false, data = {}, avatarUrl = null }) {
    if (!this.initialized) {
      this.pendingNotifications.push({ title, body, tag, requireInteraction, silent, data, avatarUrl });
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
      // Rate limit per tag — skip non-call repeats of the same chat during cooldown
      const now = Date.now();
      const lastForTag = this._lastByTag.get(tag) || 0;
      if (!requireInteraction && now - lastForTag < COOLDOWN_MS) return;

      // Skip if window is focused (user can already see the message)
      const windowActive = await this._isWindowActive();
      if (windowActive && !requireInteraction) return;

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
      const n = new Notification(title, {
        body,
        tag,
        requireInteraction,
        silent,
        icon: brandIconUrl(),
        badge: brandIconUrl(),
        data,
      });
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

  async incomingCall({ from, type = 'voice' }) {
    // Live calls still notify during DND so you don't miss them
    if (readUserSettings().callNotifications === false) return;
    await this.show({
      title: `📞 ${t("{from} is calling", { from })}`,
      body: type === 'video' ? t("Video call") : t("Voice call"),
      tag: CALL_TAG,
      requireInteraction: true,
      data: { type: 'call', from, callType: type },
    });
  }

  async groupCall({ groupName, from }) {
    if (readUserSettings().callNotifications === false) return;
    await this.show({
      title: `📞 ${t("{groupName} — Group Call", { groupName })}`,
      body: t("{from} started a group call", { from }),
      tag: `group-call-${groupName}`,
      requireInteraction: true,
      data: { type: 'group-call', groupName, from },
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
