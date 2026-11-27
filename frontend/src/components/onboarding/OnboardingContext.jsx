/**
 * "Başla panosu" state for the whole app (growth phase 2A). App.jsx mounts one provider
 * with the few app hooks it needs (join a server quietly, open a channel, leave, open a DM);
 * the dashboard, the sidebar block, the preview panel / sheet, the friends card and the
 * "joined" banner read it with useOnboarding(). Without a provider (old accounts, tests of
 * other screens) useOnboarding() returns null and nothing changes.
 */
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  getOnboardingState,
  saveOnboardingInterests,
  getServerPreview,
  trackFirstMessage,
  sendOnboardingEvent,
  setOnboardingHidden,
  undoOnboardingJoin,
} from "../../api/onboarding";
import { joinPublicServer } from "../../api/servers";
import { sendFriendRequest } from "../../api/friends";
import { introSentence, isKnownInactive, rememberInactive, toggleInterest, undoLeft, UNDO_SECONDS } from "../../lib/onboarding";
import { useT } from "../../context/LocaleContext";
import { useMobile } from "../../hooks/useMobile";

const OnboardingContext = createContext(null);
const DirectoryDiscoverModal = lazy(() => import("../servers/DirectoryDiscoverModal"));

export function useOnboarding() {
  return useContext(OnboardingContext);
}

const STATE_POLL_MS = 60_000;
const PREVIEW_POLL_MS = 8_000;
const TRACK_POLL_MS = 6_000;
const TRACK_FOR_MS = 5 * 60_000;
const SEND_TIMEOUT_MS = 9_000;

function visible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * @param {object} props
 * @param {object} props.me
 * @param {object} props.socket                    socket.io client (on / off / emit)
 * @param {(server: object) => void} props.onServerJoined   add a joined server to the list, no navigation
 * @param {(serverId: string, channelId?: string) => void} props.onOpenChannel
 * @param {(serverId: string) => Promise<void>} props.onLeaveServer
 * @param {(user: object) => void} props.onOpenDm
 * @param {(server: object) => void} props.onJoinedFromDiscover  a server joined in Keşfet (opens it)
 * @param {object[]} props.servers                  my servers (Keşfet marks them)
 * @param {() => void} props.onRefreshServers
 * @param {object} [props.api]                     test seam: replaces the network calls
 */
export function OnboardingProvider({
  me,
  socket,
  onServerJoined,
  onOpenChannel,
  onLeaveServer,
  onOpenDm,
  onJoinedFromDiscover,
  servers = [],
  onRefreshServers,
  isMobile: isMobileProp,
  api: apiOverride,
  children,
}) {
  const t = useT();
  const mobileInfo = useMobile();
  const isMobile = typeof isMobileProp === "boolean" ? isMobileProp : Boolean(mobileInfo?.isMobile);
  const api = useMemo(
    () => ({
      getState: getOnboardingState,
      saveInterests: saveOnboardingInterests,
      preview: getServerPreview,
      track: trackFirstMessage,
      event: sendOnboardingEvent,
      hide: setOnboardingHidden,
      undo: undoOnboardingJoin,
      join: joinPublicServer,
      friend: sendFriendRequest,
      ...(apiOverride || {}),
    }),
    [apiOverride]
  );
  const meId = me?.id ? String(me.id) : null;
  const myName = me?.displayName || me?.display_name || me?.username || "";

  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error | off
  const [interests, setInterests] = useState([]);
  const [previewTarget, setPreviewTarget] = useState(null); // { id, name, iconUrl, slot, category }
  const [preview, setPreview] = useState(null);
  const [previewState, setPreviewState] = useState("idle"); // idle | loading | ready | error
  const [previewChannel, setPreviewChannel] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftEdited, setDraftEdited] = useState(false);
  const [send, setSend] = useState({ phase: "idle" }); // idle | joining | sending | sent | error | undone
  const [track, setTrack] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [toasts, setToasts] = useState([]);
  const [joinedIds, setJoinedIds] = useState(() => new Set());
  const [friendReq, setFriendReq] = useState({});
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const saveTimer = useRef(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((list) => [...list.slice(-2), { id, ...toast }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), toast.ms || 4200);
  }, []);

  // ---- state
  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!meId) return null;
      if (!quiet) setStatus((s) => (s === "ready" ? s : "loading"));
      try {
        const res = await api.getState();
        if (!res?.inWindow && res?.inWindow !== undefined) {
          const store = safeStorage();
          if (store) rememberInactive(store, meId);
        }
        setData(res);
        setInterests(Array.isArray(res?.interests) ? res.interests : []);
        setStatus(res?.inWindow === false ? "off" : "ready");
        if (res?.community?.joinedNow) onRefreshServers?.();
        for (const p of res?.newlyPaid || []) pushToast({ kind: "reward", step: p.step, amount: p.amount });
        return res;
      } catch (err) {
        setStatus((s) => (s === "ready" ? s : "error"));
        return null;
      }
    },
    [api, meId, onRefreshServers, pushToast]
  );

  useEffect(() => {
    if (!meId) return undefined;
    const store = safeStorage();
    if (store && isKnownInactive(store, meId)) {
      setStatus("off");
      return undefined;
    }
    void load();
    return undefined;
  }, [meId, load]);

  const live = status === "ready" && Boolean(data?.inWindow);
  useEffect(() => {
    if (!live) return undefined;
    const tick = () => {
      if (visible()) void load({ quiet: true });
    };
    const id = setInterval(tick, STATE_POLL_MS);
    const onVis = () => {
      if (visible()) void load({ quiet: true });
    };
    document.addEventListener?.("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener?.("visibilitychange", onVis);
    };
  }, [live, load]);

  // ---- socket: rewards and the first-hello celebration
  useEffect(() => {
    if (!socket?.on || !live) return undefined;
    const onReward = (p) => {
      if (!p?.step || p.step === "first_message") return;
      pushToast({ kind: "reward", step: p.step, amount: Number(p.amount) || 0, capped: p.capped || null });
      void load({ quiet: true });
    };
    const onHello = (p) => {
      setSend((s) => (s.phase === "sent" ? { ...s, rewarded: true, rewardAmount: Number(p?.amount) || 0, badge: p?.badge || null } : s));
      pushToast({ kind: "badge", amount: Number(p?.amount) || 0, ms: 6000 });
      void load({ quiet: true });
    };
    socket.on("onboarding:reward", onReward);
    socket.on("onboarding:first-hello", onHello);
    return () => {
      socket.off?.("onboarding:reward", onReward);
      socket.off?.("onboarding:first-hello", onHello);
    };
  }, [socket, live, load, pushToast]);

  // ---- interests (optimistic, saved after a short pause)
  const chooseInterest = useCallback(
    (id) => {
      setInterests((prev) => {
        const next = toggleInterest(prev, id);
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          try {
            const res = await api.saveInterests(next);
            if (res?.paid) pushToast({ kind: "reward", step: res.paid.step, amount: res.paid.amount });
            void load({ quiet: true });
          } catch {
            pushToast({ kind: "error", text: t("onb.err.save") });
          }
        }, 450);
        return next;
      });
    },
    [api, load, pushToast, t]
  );
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // ---- preview
  const openPreview = useCallback(
    (target, { slot = "card", text = null } = {}) => {
      if (!target?.id) return;
      setPreviewTarget({ ...target, slot });
      setPreviewChannel(null);
      setPreviewState("loading");
      setPreview(null);
      if (sendRef.current.phase !== "sent") setSend({ phase: "idle" });
      if (text) {
        setDraft(text);
        setDraftEdited(true);
      } else {
        setDraftEdited(false);
      }
    },
    []
  );
  const closePreview = useCallback(() => {
    setPreviewTarget(null);
    setPreview(null);
    setPreviewState("idle");
  }, []);

  const previewId = previewTarget?.id || null;
  useEffect(() => {
    if (!previewId) return undefined;
    let alive = true;
    const fetchIt = async (first) => {
      try {
        const res = await api.preview(previewId, previewChannel);
        if (!alive) return;
        setPreview(res);
        setPreviewState("ready");
      } catch (err) {
        if (!alive) return;
        if (first) setPreviewState("error");
      }
    };
    void fetchIt(true);
    const id = setInterval(() => {
      if (visible()) void fetchIt(false);
    }, PREVIEW_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [api, previewId, previewChannel]);

  // Ready sentence follows the previewed server until the user edits it.
  useEffect(() => {
    if (!previewTarget || draftEdited) return;
    setDraft(introSentence(t, { name: myName, category: previewTarget.category, interests }));
  }, [previewTarget, draftEdited, interests, myName, t]);

  const editDraft = useCallback((text) => {
    setDraft(String(text || "").slice(0, 300));
    setDraftEdited(true);
  }, []);

  // ---- join and send
  const emitMessage = useCallback(
    (serverId, channelId, content) =>
      new Promise((resolve, reject) => {
        if (!socket?.emit || socket.connected === false) {
          reject(Object.assign(new Error("offline"), { code: "OFFLINE" }));
          return;
        }
        const tempId = `onb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let done = false;
        const finish = (fn, v) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          socket.off?.("server:channel:message", onMsg);
          socket.off?.("server:channel:message:error", onErr);
          fn(v);
        };
        const onMsg = (p) => {
          if (p?.tempId === tempId && p?.message?.id) finish(resolve, p.message);
        };
        const onErr = (p) => {
          if (p?.tempId === tempId) finish(reject, Object.assign(new Error(p?.message || "send failed"), { code: p?.code || "SEND_FAILED" }));
        };
        const timer = setTimeout(() => finish(reject, Object.assign(new Error("timeout"), { code: "TIMEOUT" })), SEND_TIMEOUT_MS);
        socket.on("server:channel:message", onMsg);
        socket.on("server:channel:message:error", onErr);
        socket.emit("server:channel:message", { serverId, channelId, tempId, content });
      }),
    [socket]
  );

  const join = useCallback(
    async ({ withText }) => {
      const target = previewTarget;
      if (!target?.id || ["joining", "sending"].includes(sendRef.current.phase)) return;
      const serverId = String(target.id);
      const text = String(withText || "").trim();
      const slot = target.slot || "card";
      setSend({ phase: "joining", serverId });
      void api.event("onboarding_joined", { server: serverId, slot, interest: interests.join(",") });
      let server = null;
      const alreadyMember = (data?.myServers || []).some((s) => String(s.id) === serverId) || joinedIds.has(serverId);
      // What this send can still earn: the join step (once) and the first message (once).
      const joinStep = (data?.checklist?.items || []).find((i) => i.id === "join");
      const joinBonus = !alreadyMember && joinStep && !joinStep.done ? joinStep.reward : 0;
      const helloBefore = Boolean(data?.firstHello?.at);
      try {
        if (!alreadyMember) {
          const res = await api.join(serverId);
          server = res?.server || null;
          if (server) onServerJoined?.(server);
          setJoinedIds((prev) => new Set(prev).add(serverId));
        }
      } catch (err) {
        setSend({ phase: "error", serverId, code: err?.code || null, text: err?.message || "" });
        return;
      }
      const channel = preview?.introChannel || null;
      if (!text || !channel) {
        setSend({ phase: "sent", serverId, joinedOnly: true, alreadyMember, server, startedAt: Date.now(), name: target.name, channelId: channel?.id || null, joinBonus, helloBefore });
        void load({ quiet: true });
        return;
      }
      setSend({ phase: "sending", serverId, server, alreadyMember });
      try {
        const message = await emitMessage(serverId, channel.id, text);
        const next = {
          phase: "sent",
          serverId,
          server,
          alreadyMember,
          channelId: channel.id,
          channelName: channel.name,
          messageId: String(message.id),
          text,
          startedAt: Date.now(),
          name: target.name,
          joinBonus,
          helloBefore,
        };
        setSend(next);
        // Follow the conversation where the message went (the preview polls it live).
        setPreviewChannel(channel.id);
        setTrack({ replies: 0, reactions: 0, repliers: [] });
        void load({ quiet: true });
        if (isMobile) onOpenChannel?.(serverId, channel.id);
      } catch (err) {
        setSend({ phase: "error", serverId, server, alreadyMember, code: err?.code || null, text: err?.message || "" });
      }
    },
    [api, data, emitMessage, interests, isMobile, joinedIds, load, onOpenChannel, onServerJoined, preview, previewTarget]
  );

  // countdown + tracking after a send
  useEffect(() => {
    if (send.phase !== "sent") return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [send.phase]);
  useEffect(() => {
    if (send.phase !== "sent" || !send.messageId) return undefined;
    let alive = true;
    const poll = async () => {
      if (!visible()) return;
      if (Date.now() - send.startedAt > TRACK_FOR_MS) return;
      try {
        const r = await api.track({ serverId: send.serverId, channelId: send.channelId, messageId: send.messageId });
        if (alive && r) setTrack(r);
      } catch {
        /* keep the last numbers */
      }
    };
    const first = setTimeout(poll, 2500);
    const id = setInterval(poll, TRACK_POLL_MS);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [api, send.phase, send.messageId, send.serverId, send.channelId, send.startedAt]);

  const undoSecondsLeft = send.phase === "sent" ? undoLeft(send.startedAt, now, UNDO_SECONDS) : 0;

  const undo = useCallback(async () => {
    const s = sendRef.current;
    if (s.phase !== "sent" || undoLeft(s.startedAt, Date.now(), UNDO_SECONDS) <= 0) return false;
    setSend({ ...s, phase: "undoing" });
    try {
      if (s.messageId && socket?.emit) socket.emit("server:channel:message:delete", { serverId: s.serverId, channelId: s.channelId, messageId: s.messageId });
      await api.undo({ messageId: s.messageId || null, serverId: s.serverId });
      if (!s.alreadyMember) await onLeaveServer?.(s.serverId);
      setJoinedIds((prev) => {
        const n = new Set(prev);
        n.delete(String(s.serverId));
        return n;
      });
      setSend({ phase: "undone", serverId: s.serverId, name: s.name });
      setTrack(null);
      void load({ quiet: true });
      return true;
    } catch {
      setSend({ ...s, phase: "sent" });
      pushToast({ kind: "error", text: t("onb.err.undo") });
      return false;
    }
  }, [api, load, onLeaveServer, pushToast, socket, t]);

  const dismissSend = useCallback(() => setSend({ phase: "idle" }), []);

  // ---- hide / reopen
  const setHidden = useCallback(
    async (hidden) => {
      setData((d) => (d ? { ...d, hidden, active: hidden ? false : d.active } : d));
      try {
        await api.hide(hidden);
      } finally {
        void load({ quiet: true });
      }
    },
    [api, load]
  );

  // ---- friends
  const addFriend = useCallback(
    async (user) => {
      if (!user?.username) return;
      setFriendReq((m) => ({ ...m, [user.id]: "sending" }));
      try {
        await api.friend(user.username);
        setFriendReq((m) => ({ ...m, [user.id]: "requested" }));
      } catch (err) {
        setFriendReq((m) => ({ ...m, [user.id]: "error" }));
        pushToast({ kind: "error", text: err?.message || t("onb.err.friend") });
      }
    },
    [api, pushToast, t]
  );

  const greet = useCallback(
    (user, text) =>
      new Promise((resolve) => {
        if (!user?.id || !socket?.emit || socket.connected === false) {
          pushToast({ kind: "error", text: t("onb.preview.offline") });
          resolve(false);
          return;
        }
        socket.emit("dm:send", { toUserId: user.id, text: String(text || "").trim().slice(0, 300) });
        void api.event("onboarding_greeted_inviter", { slot: "invite" });
        resolve(true);
      }),
    [api, pushToast, socket, t]
  );

  const value = useMemo(
    () => ({
      data,
      status,
      active: status === "ready" && Boolean(data?.active),
      inWindow: Boolean(data?.inWindow),
      hidden: Boolean(data?.hidden),
      interests,
      chooseInterest,
      refresh: load,
      previewTarget,
      preview,
      previewState,
      previewChannel,
      setPreviewChannel,
      openPreview,
      closePreview,
      draft,
      editDraft,
      draftEdited,
      send,
      track,
      undoSecondsLeft,
      joinAndSend: () => join({ withText: draft }),
      joinOnly: () => join({ withText: "" }),
      undo,
      dismissSend,
      setHidden,
      addFriend,
      friendReq,
      greet,
      toasts,
      pushToast,
      event: api.event,
      openChannel: onOpenChannel,
      openDm: onOpenDm,
      openDiscover: () => setDiscoverOpen(true),
      leaveServer: onLeaveServer,
      me,
      myName,
      isMobile,
    }),
    [
      data, status, interests, chooseInterest, load, previewTarget, preview, previewState, previewChannel, openPreview, closePreview,
      draft, editDraft, draftEdited, send, track, undoSecondsLeft, join, undo, dismissSend, setHidden, addFriend, friendReq, greet,
      toasts, pushToast, api, onOpenChannel, onOpenDm, onLeaveServer, me, myName, isMobile,
    ]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {discoverOpen ? (
        <Suspense fallback={null}>
          <DirectoryDiscoverModal
            myServers={servers}
            onClose={() => setDiscoverOpen(false)}
            onJoined={(server) => {
              setDiscoverOpen(false);
              onJoinedFromDiscover?.(server);
              void load({ quiet: true });
            }}
          />
        </Suspense>
      ) : null}
    </OnboardingContext.Provider>
  );
}

export default OnboardingContext;
