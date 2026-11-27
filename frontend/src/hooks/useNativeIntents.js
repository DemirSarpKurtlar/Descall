/**
 * App.jsx -> Siri / Shortcuts / Spotlight (iOS), launcher shortcuts (Android) and the
 * Windows jump list (lib/nativeIntents.js has the rules, this is the React glue):
 *   - the signed-in profile for the iOS shared session; sign-out clears it (and Android
 *     shortcuts, Siri donations);
 *   - the live call state, so "Hey Siri, mute Descall" knows whether a call is running;
 *   - the actions the shells hand over (mute, deafen, leave, join voice, status, open),
 *     each run with the app's existing handlers;
 *   - recent DMs for Android dynamic shortcuts and the Windows jump list;
 *   - donations, so Siri suggests opening a chat / joining a voice channel the user uses.
 * Web without a shell: every effect is a no-op.
 */
import { useEffect, useMemo, useRef } from "react";
import { API_BASE_URL } from "../config/api.js";
import { isBlockedByMe } from "../lib/blockedUsers.js";
import {
  callStatePayload,
  clearNativeSession,
  donateIntent,
  nativePlatform,
  profilePayload,
  publishRecentShortcuts,
  recentConversations,
  reportNativeCallState,
  runIntentAction,
  sessionSyncPlan,
  setRecentShortcuts,
  startNativeIntents,
  syncNativeSession,
} from "../lib/nativeIntents.js";
import { jumpListPayload } from "../lib/jumpList.js";

const READY_WAIT_MS = 15000;
const READY_POLL_MS = 250;
const JOIN_CONFIRM_MS = 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useNativeIntents({
  me,
  call,
  groupCall,
  serverVoice,
  socket,
  navigate,
  setStatus,
  myStatus,
  friends,
  dmLastActivity,
  locale,
  pathname,
  t,
}) {
  const platform = useMemo(() => nativePlatform(), []);
  const jumpListApi = typeof window !== "undefined" && typeof window.electronAPI?.setJumpList === "function" ? window.electronAPI : null;
  const enabled = Boolean(platform || jumpListApi);

  // Latest values for the long-lived action listener.
  const ctxRef = useRef({});
  const voiceRef = useRef({ call, groupCall, serverVoice });
  voiceRef.current = { call, groupCall, serverVoice };
  const liveRef = useRef({ me, socket, navigate, setStatus, myStatus });
  liveRef.current = { me, socket, navigate, setStatus, myStatus };
  const friendsRef = useRef(friends);
  friendsRef.current = friends;

  // ---- session (sign-in, profile change, sign-out) --------------------------------------
  const lastSessionRef = useRef(null);
  const sessionPayload = useMemo(
    () => (platform ? profilePayload(me, { apiBase: API_BASE_URL, locale }) : null),
    [platform, me?.id, me?.username, me?.displayName, me?.display_name, me?.avatarUrl, me?.avatar_url, locale]
  );
  useEffect(() => {
    if (!platform) return;
    const plan = sessionSyncPlan(lastSessionRef.current, sessionPayload);
    const prev = lastSessionRef.current;
    lastSessionRef.current = sessionPayload;
    if (plan === "sync") syncNativeSession(sessionPayload);
    else if (plan === "clear" && prev) {
      clearNativeSession();
      publishRecentShortcuts([]);
    }
  }, [platform, sessionPayload]);

  // ---- call state (iOS: Siri mute / deafen / leave) --------------------------------------
  const callPayload = callStatePayload({ call, groupCall, serverVoice });
  const callKey = JSON.stringify(callPayload);
  useEffect(() => {
    if (platform !== "ios") return;
    reportNativeCallState(JSON.parse(callKey));
  }, [platform, callKey]);

  // ---- actions from the shell -------------------------------------------------------------
  ctxRef.current = {
    getVoice: () => voiceRef.current,
    getStatus: () => liveRef.current.myStatus,
    navigate: (path) => liveRef.current.navigate?.(path),
    setStatus: (s) => liveRef.current.setStatus?.(s),
    onNewMessage: () => {
      try {
        window.dispatchEvent(new CustomEvent("descall:new-message"));
      } catch {
        /* ignore */
      }
    },
    callAction: (type, voice) => {
      const { call: c, groupCall: g, serverVoice: s } = voice || {};
      const state = callStatePayload(voice);
      const target = state.kind === "dm" ? c : state.kind === "group" ? g : s;
      if (!target) return false;
      if (type === "toggleMute") return target.toggleMute ? (target.toggleMute(), true) : false;
      if (type === "toggleDeafen") return target.toggleDeafen ? (target.toggleDeafen(), true) : false;
      if (type === "leave") {
        if (state.kind === "dm") return c?.endCall ? (c.endCall(c?.peer?.id), true) : false;
        if (state.kind === "group") return g?.leaveCall ? (g.leaveCall(), true) : false;
        return s?.leave ? (s.leave(), true) : false;
      }
      return false;
    },
    // Widgets draft B: a favourite's "call" shortcut (DescallCallFriendIntent, cold start too).
    callFriend: async ({ userId, username, video }) => {
      const until = Date.now() + READY_WAIT_MS;
      while (Date.now() < until && !(liveRef.current.me?.id && liveRef.current.socket?.connected)) {
        await sleep(READY_POLL_MS);
      }
      if (!liveRef.current.me?.id) return { ok: false, error: "signed_out" };
      const friend = (friendsRef.current || []).find((f) => String(f?.id) === String(userId))
        || (username ? (friendsRef.current || []).find((f) => f?.username === username) : null);
      if (!friend) return { ok: false, error: "not_friend" };
      const c = voiceRef.current.call;
      if (typeof c?.startCall !== "function") return { ok: false, error: "not_ready" };
      liveRef.current.navigate?.(`/direct/${encodeURIComponent(friend.username || "")}`);
      await c.startCall(friend, video ? "video" : "voice");
      return { ok: true };
    },
    joinVoice: async ({ serverId, channelId, channelName, type }) => {
      liveRef.current.navigate?.(`/servers/${encodeURIComponent(serverId)}/${encodeURIComponent(channelId)}`);
      // Cold start from Siri: wait for the session and the socket.
      const until = Date.now() + READY_WAIT_MS;
      while (Date.now() < until && !(liveRef.current.me?.id && liveRef.current.socket?.connected)) {
        await sleep(READY_POLL_MS);
      }
      if (!liveRef.current.me?.id) return { ok: false, error: "signed_out" };
      if (!liveRef.current.socket?.connected) return { ok: false, error: "not_ready" };
      const sv = voiceRef.current.serverVoice;
      if (sv?.activeChannelId === channelId) return { ok: true };
      if (typeof sv?.join !== "function") return { ok: false, error: "not_ready" };
      await sv.join(serverId, { id: channelId, name: channelName || "", type });
      const confirmUntil = Date.now() + JOIN_CONFIRM_MS;
      while (Date.now() < confirmUntil) {
        const cur = voiceRef.current.serverVoice;
        if (cur?.activeChannelId === channelId) return { ok: true };
        if (cur?.error) return { ok: false, error: /mikrofon|microphone|permission|izin/i.test(String(cur.error)) ? "mic_denied" : "failed" };
        if (!cur?.connecting && !cur?.activeChannelId) break;
        await sleep(READY_POLL_MS);
      }
      const end = voiceRef.current.serverVoice;
      return end?.activeChannelId === channelId ? { ok: true } : { ok: false, error: "failed" };
    },
  };

  useEffect(() => {
    if (!platform) return undefined;
    const stops = [startNativeIntents(ctxRef, { platform })];
    // Android home screen widgets and the call notification (lib/androidWidgets.js): mute,
    // sound, leave, open a chat, join a room. Same actions, same handlers.
    if (platform === "android") stops.push(startNativeIntents(ctxRef, { platform, pluginName: "DescallWidgets" }));
    return () => stops.forEach((stop) => stop());
  }, [platform]);

  // Windows jump list tasks (electron/jumpList.cjs parseJumpTask): a running app gets them as
  // an event, a cold start keeps one until the page takes it.
  useEffect(() => {
    if (!jumpListApi || typeof jumpListApi.onJumpListAction !== "function") return undefined;
    const run = (msg) => {
      const action = msg?.action;
      if (action === "status") {
        runIntentAction({ type: "setStatus", payload: { status: msg.arg } }, ctxRef.current);
      } else if (action === "newMessage") {
        runIntentAction({ type: "newMessage" }, ctxRef.current);
      } else if (action === "friends") {
        runIntentAction({ type: "openFriends" }, ctxRef.current);
      } else if (action === "open") {
        runIntentAction({ type: "openPath", payload: { path: msg.path } }, ctxRef.current);
      }
    };
    const off = jumpListApi.onJumpListAction(run);
    Promise.resolve()
      .then(() => jumpListApi.takeJumpListAction?.())
      .then((msg) => {
        if (msg) run(msg);
      })
      .catch(() => {});
    return off;
  }, [jumpListApi]);

  // ---- recent DMs: Android dynamic shortcuts, Windows jump list, Settings list ------------
  const recent = useMemo(
    () => (me?.id && enabled ? recentConversations(friends, dmLastActivity, { blocked: isBlockedByMe }) : []),
    [me?.id, enabled, friends, dmLastActivity]
  );
  const recentKey = JSON.stringify(recent);
  const labels = useMemo(
    () => ({
      newMessage: t("vsc.newMessage"),
      friends: t("vsc.friends"),
      dnd: t("vsc.dnd"),
      online: t("vsc.statusOnline"),
      idle: t("vsc.statusIdle"),
      invisible: t("vsc.statusInvisible"),
      recent: t("vsc.recentTitle"),
      tasks: t("vsc.jumpTasks"),
      status: t("vsc.jumpStatus"),
      // The shell fills {name} per conversation.
      openChat: t("vsc.openChatWith", { name: "{name}" }),
    }),
    [t]
  );
  const labelsKey = JSON.stringify(labels);
  useEffect(() => {
    if (!enabled) return undefined;
    const items = JSON.parse(recentKey);
    publishRecentShortcuts(items);
    // Debounced: a burst of messages reorders the list many times a second.
    const timer = setTimeout(() => {
      const lbl = JSON.parse(labelsKey);
      if (platform === "android") setRecentShortcuts(items, lbl);
      if (jumpListApi) {
        try {
          jumpListApi.setJumpList(jumpListPayload({ signedIn: Boolean(liveRef.current.me?.id), recent: items, labels: lbl }));
        } catch {
          /* shell without a jump list */
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [enabled, platform, jumpListApi, recentKey, labelsKey]);

  // ---- donations (Siri suggestions, iOS 17+) -----------------------------------------------
  const donatedRef = useRef(new Set());
  const once = (key, fn) => {
    if (donatedRef.current.has(key)) return;
    donatedRef.current.add(key);
    fn();
  };
  useEffect(() => {
    if (platform !== "ios" || !me?.id) return;
    const m = /^\/direct\/([^/]+)\/?$/.exec(pathname || "");
    if (!m) return;
    let username = "";
    try {
      username = decodeURIComponent(m[1]);
    } catch {
      return;
    }
    const f = (friends || []).find((x) => x?.username === username);
    if (!f?.id) return;
    once(`dm:${f.id}`, () => donateIntent("openFriend", { id: String(f.id), username, name: f.displayName || f.username }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, me?.id, pathname, friends]);

  const activeChannelId = serverVoice?.activeChannelId || null;
  useEffect(() => {
    if (platform !== "ios" || !activeChannelId) return;
    const sv = voiceRef.current.serverVoice;
    if (!sv?.activeServerId) return;
    once(`voice:${activeChannelId}`, () =>
      donateIntent("joinVoice", {
        serverId: String(sv.activeServerId),
        channelId: String(activeChannelId),
        channelName: sv.channelName || "",
        type: sv.channelType === "stage" ? "stage" : "voice",
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, activeChannelId]);

  // Sign-out forgets what was donated this session.
  useEffect(() => {
    if (!me?.id) donatedRef.current = new Set();
  }, [me?.id]);
}

export default useNativeIntents;
