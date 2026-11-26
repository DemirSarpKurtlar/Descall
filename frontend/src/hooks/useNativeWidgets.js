/**
 * App.jsx -> home / lock screen widgets and the Live Activity (widgets draft B "Yuzler",
 * lib/nativeWidgets.js has the rules, this is the React glue):
 *   - the favourite faces and widget preferences (Settings > Siri ve Kisayollar, or suggested
 *     from the friends online until the user picks) go to the shell with names and avatars;
 *   - widget timelines reload when what they show changed (presence, unread counts, voice
 *     channels, the call), coalesced so a busy evening does not hammer the extension;
 *   - the running call becomes a Live Activity: Dynamic Island, lock screen card, StandBy,
 *     with the face of whoever is speaking (server voice: LiveKit active speakers; DM: audio
 *     levels; group: the participants' speaking flag);
 *   - "friend:wave" (a friend waved from their widget) shows an in-app toast.
 * Web, Electron and Tauri: every effect is a no-op, the toast still shows.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { subscribeActiveSpeakers } from "../lib/activeSpeakers.js";
import { callStatePayload } from "../lib/nativeIntents.js";
import {
  SPEAKER_SPACING_MS,
  callActivityChange,
  callActivityPayload,
  clearNativeWidgets,
  clearWidgetSettings,
  createReloadScheduler,
  favoritePeople,
  getWidgetSettings,
  kindsForEvent,
  normalizeFavorites,
  pickSpeaker,
  pushFavorites,
  reloadWidgets,
  sendCallActivity,
  subscribeWidgetSettings,
  suggestedFavorites,
  widgetsAvailable,
} from "../lib/nativeWidgets.js";

const DM_LEVEL_POLL_MS = 400;
const DM_SPEAKING_LEVEL = 0.06;
const PUSH_DEBOUNCE_MS = 700;

function presenceKey(friends) {
  return (Array.isArray(friends) ? friends : [])
    .map((f) => `${f?.id}:${f?.status || ""}:${f?.customStatus || f?.custom_status || ""}`)
    .sort()
    .join("|");
}

function countKey(map) {
  let n = 0;
  for (const v of Object.values(map || {})) n += Math.max(0, Number(v) || 0);
  return `${Object.keys(map || {}).length}:${n}`;
}

export function useNativeWidgets({
  me,
  friends,
  call,
  groupCall,
  serverVoice,
  socket,
  servers,
  groups,
  dmUnread,
  groupUnread,
  toast,
  onOpenDm,
  t,
}) {
  const enabled = useMemo(() => widgetsAvailable(), []);
  const settings = useSyncExternalStore(subscribeWidgetSettings, getWidgetSettings, getWidgetSettings);

  // ---- favourites + preferences -> shell --------------------------------------------------
  const friendIds = useMemo(() => (friends || []).map((f) => String(f?.id || "")).filter(Boolean), [friends]);
  const favorites = useMemo(() => {
    if (settings.picked) return normalizeFavorites(settings.favorites, friendIds.length ? friendIds : null);
    return suggestedFavorites(friends);
  }, [settings, friendIds, friends]);
  const people = useMemo(() => favoritePeople(favorites, friends), [favorites, friends]);
  const favKey = JSON.stringify({ favorites, people, prefs: settings.prefs });
  useEffect(() => {
    if (!enabled || !me?.id || (!friends?.length && !settings.picked)) return undefined;
    const timer = setTimeout(() => {
      const v = JSON.parse(favKey);
      pushFavorites({ favorites: v.favorites, people: v.people, prefs: v.prefs });
    }, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, me?.id, favKey, friends?.length, settings.picked]);

  // Sign-out: the next account must not see these faces (device and this browser).
  const hadUserRef = useRef(false);
  useEffect(() => {
    if (me?.id) {
      hadUserRef.current = true;
      return;
    }
    if (!hadUserRef.current) return;
    hadUserRef.current = false;
    clearWidgetSettings();
    if (enabled) clearNativeWidgets();
  }, [enabled, me?.id]);

  // ---- timeline reloads ---------------------------------------------------------------------
  const schedulerRef = useRef(null);
  if (!schedulerRef.current && enabled) schedulerRef.current = createReloadScheduler({ send: (kinds) => reloadWidgets(kinds) });
  const request = (name) => schedulerRef.current?.request(kindsForEvent(name));
  useEffect(() => () => schedulerRef.current?.cancel(), []);

  const pKey = presenceKey(friends);
  const firstRef = useRef({ p: true, u: true, v: true });
  useEffect(() => {
    if (!enabled || !me?.id) return;
    if (firstRef.current.p) {
      firstRef.current.p = false;
      return;
    }
    request("activity");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, me?.id, pKey]);

  const uKey = `${countKey(dmUnread)}/${countKey(groupUnread)}`;
  useEffect(() => {
    if (!enabled || !me?.id) return;
    if (firstRef.current.u) {
      firstRef.current.u = false;
      return;
    }
    request("unread");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, me?.id, uKey]);

  const vKey = useMemo(() => {
    const states = serverVoice?.voiceStatesByServer || {};
    let n = 0;
    for (const s of Object.values(states)) for (const list of Object.values(s || {})) n += Array.isArray(list) ? list.length : 0;
    return `${Object.keys(states).length}:${n}`;
  }, [serverVoice?.voiceStatesByServer]);
  useEffect(() => {
    if (!enabled || !me?.id) return;
    if (firstRef.current.v) {
      firstRef.current.v = false;
      return;
    }
    request("voice");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, me?.id, vKey]);

  // Back from the background: everything may be stale; sign-in: first paint with real data.
  useEffect(() => {
    if (!enabled || !me?.id) return undefined;
    request("signin");
    const onVis = () => {
      if (document.visibilityState === "visible") request("resume");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, me?.id]);

  // ---- live call ------------------------------------------------------------------------------
  const state = callStatePayload({ call, groupCall, serverVoice });
  const myId = String(me?.id || "");
  const voiceKind = state.active ? state.kind : "";
  const callIdentity = !state.active
    ? ""
    : state.kind === "dm"
      ? `dm:${call?.peer?.id || ""}`
      : state.kind === "group"
        ? `group:${groupCall?.activeGroupId || ""}`
        : `server:${serverVoice?.activeChannelId || ""}`;

  // Server voice has no start time on the client: the first moment this device saw it.
  const startRef = useRef({ id: "", at: 0 });
  if (callIdentity && startRef.current.id !== callIdentity) startRef.current = { id: callIdentity, at: Date.now() };
  if (!callIdentity) startRef.current = { id: "", at: 0 };

  const peopleInCall = useMemo(() => {
    if (voiceKind === "dm") return call?.peer ? [call.peer] : [];
    if (voiceKind === "group") return (groupCall?.participants || []).filter((p) => String(p?.id) !== myId);
    if (voiceKind === "server") return (serverVoice?.participants || []).filter((p) => String(p?.id) !== myId);
    return [];
  }, [voiceKind, call?.peer, groupCall?.participants, serverVoice?.participants, myId]);

  // Who is speaking lives outside React state: a talking room must not re-render the app.
  // Render computes the call's base (title, faces, mute); speaker changes only re-send.
  const activeRef = useRef([]);
  const speakerRef = useRef(null);
  const baseRef = useRef(null);
  const sentRef = useRef(null);
  const speakerTimerRef = useRef(null);
  const lastSpeakerSendRef = useRef(0);

  const serverName = useMemo(() => {
    if (voiceKind !== "server") return "";
    const s = (servers || []).find((x) => String(x?.id) === String(serverVoice?.activeServerId || ""));
    return s?.name || "";
  }, [voiceKind, servers, serverVoice?.activeServerId]);
  const groupName = useMemo(() => {
    if (voiceKind !== "group") return "";
    const g = (groups || []).find((x) => String(x?.id) === String(groupCall?.activeGroupId || ""));
    return g?.name || "";
  }, [voiceKind, groups, groupCall?.activeGroupId]);

  const startedAt =
    voiceKind === "dm"
      ? Number(call?.durationStartedAt) || startRef.current.at
      : voiceKind === "group"
        ? Number(groupCall?.durationStartedAt) || startRef.current.at
        : startRef.current.at;

  const base = {
    state:
      voiceKind === "group" && !state.title
        ? { ...state, title: groupName }
        : voiceKind === "server" && !state.title
          ? { ...state, title: serverVoice?.channelName || "" }
          : state,
    people: peopleInCall.map((p) => ({
      id: p?.id,
      username: p?.username,
      displayName: p?.displayName || p?.display_name,
      avatarUrl: p?.avatarUrl || p?.avatar_url,
      isScreenSharing: Boolean(p?.isScreenSharing || p?.screenSharing),
    })),
    me: me ? { id: me.id, username: me.username, displayName: me.displayName || me.display_name, avatarUrl: me.avatarUrl || me.avatar_url } : null,
    startedAt,
    subtitle: voiceKind === "server" ? serverName : voiceKind === "group" ? groupName : "",
    link:
      voiceKind === "server"
        ? { serverId: serverVoice?.activeServerId, channelId: serverVoice?.activeChannelId }
        : voiceKind === "group"
          ? { groupId: groupCall?.activeGroupId }
          : { username: call?.peer?.username },
    speaking: voiceKind === "group" ? (groupCall?.participants || []).filter((p) => p?.isSpeaking || p?.speaking).map((p) => String(p.id)) : null,
  };
  const baseKey = JSON.stringify(base);

  /** Recompute with the current speaker and send what changed (speaker changes spaced out). */
  const emitRef = useRef(() => {});
  emitRef.current = () => {
    const b = baseRef.current;
    if (!b) return;
    const present = new Set((b.people || []).map((p) => String(p?.id || "")));
    if (Array.isArray(b.speaking)) activeRef.current = b.speaking;
    speakerRef.current = b.state?.active ? pickSpeaker(speakerRef.current, activeRef.current, myId, present) : null;
    const next = callActivityPayload({ ...b, speakerId: speakerRef.current });
    const change = callActivityChange(sentRef.current, next);
    if (change === "none") return;
    const send = () => {
      speakerTimerRef.current = null;
      lastSpeakerSendRef.current = Date.now();
      const b2 = baseRef.current;
      const latest = b2 ? callActivityPayload({ ...b2, speakerId: speakerRef.current }) : { active: false };
      const wasActive = Boolean(sentRef.current?.active);
      sentRef.current = latest;
      sendCallActivity(latest);
      if (wasActive !== Boolean(latest.active)) request("call");
    };
    if (change === "state") {
      if (speakerTimerRef.current) clearTimeout(speakerTimerRef.current);
      send();
      return;
    }
    if (speakerTimerRef.current) return;
    const wait = Math.max(0, SPEAKER_SPACING_MS - (Date.now() - lastSpeakerSendRef.current));
    speakerTimerRef.current = setTimeout(send, wait);
  };

  useEffect(() => {
    if (!enabled) return;
    const b = JSON.parse(baseKey);
    baseRef.current = b;
    if (!b.state?.active) {
      activeRef.current = [];
      speakerRef.current = null;
    }
    emitRef.current();
  }, [enabled, baseKey]);

  useEffect(() => {
    if (!enabled || voiceKind !== "server") return undefined;
    const channel = String(serverVoice?.activeChannelId || "");
    return subscribeActiveSpeakers(({ scope, ids }) => {
      if (String(scope || "") !== channel) return;
      activeRef.current = ids || [];
      emitRef.current();
    });
  }, [enabled, voiceKind, serverVoice?.activeChannelId]);

  const callRef = useRef(call);
  callRef.current = call;
  useEffect(() => {
    if (!enabled || voiceKind !== "dm") return undefined;
    const timer = setInterval(() => {
      const c = callRef.current;
      const peerId = String(c?.peer?.id || "");
      let remote = 0;
      let local = 0;
      try {
        remote = Number(c?.getRemoteAudioLevel?.()) || 0;
        local = c?.muted ? 0 : Number(c?.getLocalAudioLevel?.()) || 0;
      } catch {
        /* levels are optional */
      }
      const next = [];
      if (remote >= DM_SPEAKING_LEVEL && peerId) next.push(peerId);
      if (local >= DM_SPEAKING_LEVEL && myId) next.push(myId);
      if (local > remote) next.reverse();
      if (next.join() !== activeRef.current.join()) {
        activeRef.current = next;
        emitRef.current();
      }
    }, DM_LEVEL_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, voiceKind, myId]);

  useEffect(
    () => () => {
      if (speakerTimerRef.current) clearTimeout(speakerTimerRef.current);
    },
    []
  );

  // ---- a friend waved (from their widget) ---------------------------------------------------
  const liveRef = useRef({ friends, toast, onOpenDm, t });
  liveRef.current = { friends, toast, onOpenDm, t };
  useEffect(() => {
    if (!socket?.on) return undefined;
    const onWave = (evt = {}) => {
      const from = evt?.from || {};
      if (!from.id) return;
      const { friends: list, toast: show, onOpenDm: open, t: tr } = liveRef.current;
      const friend = (list || []).find((f) => String(f?.id) === String(from.id)) || {
        id: from.id,
        username: from.username || "",
        displayName: from.name || from.username || "",
        avatarUrl: from.avatarUrl || null,
      };
      const name = friend.displayName || friend.display_name || friend.username || from.name || "";
      show?.(name, "presence", {
        user: friend,
        name,
        subtitle: tr("widgets.wave.received"),
        dismissLabel: tr("Close"),
        onOpen: () => open?.(friend),
      });
    };
    socket.on("friend:wave", onWave);
    return () => socket.off?.("friend:wave", onWave);
  }, [socket]);
}

export default useNativeWidgets;
