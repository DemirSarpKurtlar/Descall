import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import AdaPill, { AdaMorph } from "./AdaPill.jsx";
import {
  ADA,
  adaEndedModel,
  adaFace,
  adaFromDmCall,
  adaFromGroupCall,
  adaFromServerVoice,
  adaLayout,
  adaRouteModel,
  adaVisible,
  pickAdaModel,
} from "../../lib/adaPill";
import { getCallMinimized, setCallMinimized, subscribeCallMinimized } from "../../lib/callMinimize";
import { directPath, groupPath, serverPath } from "../../lib/appRoutes";
import { subscribeActiveSpeakers } from "../../lib/activeSpeakers";
import { subscribeVoiceActivity } from "../../lib/voiceActivity";
import { speakingThreshold } from "../../lib/voiceProfile";
import { pickSpeaker } from "../../lib/nativeWidgets";
import { refreshIosAudioRoute } from "../../lib/iosAudioRoute";
import { useAdaEnv } from "../../hooks/useAdaEnv";

const NO_SPEAKERS = Object.freeze({ ids: [], speakerId: null });
const LOUD_HOLD_MS = 700;

/**
 * Who is talking, without re-rendering on every audio frame: DM / group from the
 * shared voice-activity analyser (lib/voiceActivity.js), server voice from LiveKit
 * active speakers. State changes only when the speaker or the talking set changes.
 */
function useAdaSpeakers({ enabled, kind, streams, channelId, myId }) {
  const [state, setState] = useState(NO_SPEAKERS);
  const streamsKey = streams.map((s) => `${s.id}:${s.stream?.id || ""}`).join("|");
  const streamsRef = useRef(streams);
  streamsRef.current = streams;
  useEffect(() => {
    if (!enabled || !kind) {
      setState(NO_SPEAKERS);
      return undefined;
    }
    const loudAt = new Map();
    const present = new Set(streamsRef.current.map((s) => String(s.id)));
    let speaker = null;
    const threshold = speakingThreshold();
    const recompute = () => {
      const now = performance.now();
      const ids = [];
      for (const [id, at] of loudAt) if (now - at < LOUD_HOLD_MS) ids.push(id);
      speaker = pickSpeaker(speaker, ids, myId, kind === "server" ? null : present);
      setState((prev) => {
        const sameIds = prev.ids.length === ids.length && prev.ids.every((id, i) => id === ids[i]);
        return sameIds && prev.speakerId === speaker ? prev : { ids, speakerId: speaker };
      });
    };
    const unsubs = [];
    if (kind === "server") {
      unsubs.push(
        subscribeActiveSpeakers(({ scope, ids }) => {
          if (String(scope || "") !== String(channelId || "")) return;
          const now = performance.now();
          for (const id of ids || []) if (String(id) !== String(myId)) loudAt.set(String(id), now);
          recompute();
        })
      );
    } else {
      for (const { id, stream } of streamsRef.current) {
        if (!stream) continue;
        unsubs.push(
          subscribeVoiceActivity(stream, {
            onRms: (rms) => {
              if (rms > threshold) loudAt.set(String(id), performance.now());
            },
          })
        );
      }
    }
    const timer = setInterval(recompute, 350);
    return () => {
      clearInterval(timer);
      unsubs.forEach((u) => u());
    };
  }, [enabled, kind, streamsKey, channelId, myId]);
  return state;
}

/** The other side's camera really sends video (a voice call can turn into one). */
function remoteVideoOn(call) {
  if (!call || call.remoteCameraOn === false) return false;
  try {
    return (call.remoteStream?.getVideoTracks?.() || []).some((t) => t && t.readyState !== "ended" && t.enabled !== false) && call.remoteCameraOn === true;
  } catch {
    return false;
  }
}

function onRoute(pathname, sid, cid) {
  if (!sid || !cid || !pathname) return false;
  const p = String(pathname);
  return p === serverPath(sid, cid) || decodeURIComponent(p) === `/servers/${sid}/${cid}`;
}

/**
 * Phone layout only: the minimized form of every call (native CallKit call, DM, group,
 * server voice) is the "Ada" pill. Tablets and desktop keep MiniCallCard / the return
 * bar inside CallOverlay. Mounted once by App.jsx.
 */
export default function AdaCallHost({
  call,
  groupCall,
  serverVoice,
  me,
  groups,
  servers,
  pathname,
  navigate,
  onReturnToCall,
  onCallBack,
}) {
  const env = useAdaEnv();
  const minimized = useSyncExternalStore(subscribeCallMinimized, getCallMinimized, getCallMinimized);
  const layout = useMemo(() => adaLayout({ safeTop: env.safeTop, viewportW: env.viewportW, platform: env.platform }), [env.safeTop, env.viewportW, env.platform]);
  const myId = me?.id != null ? String(me.id) : "";

  // Server voice has no start time on the client: the first moment this device saw it.
  const serverStart = useRef({ id: "", at: 0 });
  const svChannel = serverVoice?.isInVoice || serverVoice?.connecting ? String(serverVoice?.activeChannelId || "") : "";
  if (svChannel && serverStart.current.id !== svChannel) serverStart.current = { id: svChannel, at: Date.now() };
  if (!svChannel) serverStart.current = { id: "", at: 0 };

  const dmLive = Boolean(call?.mode && call.mode !== "idle" && call.mode !== "incoming");
  const kind = dmLive ? (call.native ? "" : "dm") : groupCall?.isInCall ? "group" : svChannel ? "server" : "";
  const streams = useMemo(() => {
    if (kind === "dm") return call?.peer ? [{ id: String(call.peer.id), stream: call.remoteStream || null }] : [];
    if (kind === "group") return (groupCall?.participants || []).filter((p) => String(p?.id) !== myId).map((p) => ({ id: String(p.id), stream: p.stream || null }));
    return [];
  }, [kind, call?.peer, call?.remoteStream, groupCall?.participants, myId]);

  // Pre-model visibility (speaker detection only runs while the pill can show).
  const preVisible = env.phone && (kind === "server" ? !onRoute(pathname, serverVoice?.activeServerId, svChannel) : dmLive || groupCall?.isInCall ? minimized : false);
  const speakers = useAdaSpeakers({ enabled: preVisible, kind, streams, channelId: svChannel, myId });

  const group = useMemo(
    () => (groupCall?.isInCall ? (groups || []).find((g) => String(g?.id) === String(groupCall.activeGroupId)) || null : null),
    [groups, groupCall?.isInCall, groupCall?.activeGroupId]
  );
  const server = useMemo(
    () => (svChannel ? (servers || []).find((s) => String(s?.id) === String(serverVoice?.activeServerId)) || null : null),
    [servers, svChannel, serverVoice?.activeServerId]
  );

  const model = env.phone
    ? pickAdaModel({
        dm: adaFromDmCall(call, {
          speaking: kind === "dm" && speakers.ids.length > 0,
          remoteVideo: kind === "dm" ? remoteVideoOn(call) : false,
        }),
        group: adaFromGroupCall(groupCall, { me, group, speakerId: speakers.speakerId, speakingIds: speakers.ids }),
        server: adaFromServerVoice(serverVoice, { me, server, speakerId: speakers.speakerId, speakingIds: speakers.ids, startedAt: serverStart.current.at }),
      })
    : null;
  const visible = adaVisible(model, { minimized, onVoiceRoute: model?.source === "server" && onRoute(pathname, model.serverId, model.channelId) });

  // ---- ended: the last pill on screen stays a moment with its duration and a call back ----
  const [ended, setEnded] = useState(null);
  const lastVisible = useRef(null);
  const expandingRef = useRef(false);
  const modelKey = model?.key || "";
  useEffect(() => {
    if (visible && model) {
      lastVisible.current = model.phase === "ended" ? lastVisible.current || model : model;
      if (ended) setEnded(null);
      return;
    }
    const last = lastVisible.current;
    lastVisible.current = null;
    if (!last || expandingRef.current) return;
    // The call is gone (not merely expanded / moved to its own screen).
    if (!model || model.key !== last.key) setEnded(adaEndedModel(last));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, modelKey, model?.phase]);
  useEffect(() => {
    if (!ended) return undefined;
    const timer = setTimeout(() => setEnded(null), ADA.ENDED_MS);
    return () => clearTimeout(timer);
  }, [ended]);
  useEffect(() => {
    if (model && !visible && ended) setEnded(null);
  }, [model, visible, ended]);

  // ---- full screen (morph) ----------------------------------------------------------
  const [morph, setMorph] = useState(null);
  const shown = visible ? model : ended;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const handlersRef = useRef({});
  handlersRef.current = { call, groupCall, serverVoice, navigate, onReturnToCall, onCallBack };

  const doExpand = useCallback(() => {
    const m = shownRef.current;
    const h = handlersRef.current;
    if (!m) return;
    if (m.source === "server") {
      h.navigate?.(serverPath(m.serverId, m.channelId));
      return;
    }
    setCallMinimized(false);
    if (m.source !== "native") h.onReturnToCall?.();
  }, []);

  const actions = useMemo(
    () => ({
      expand: (rect) => {
        expandingRef.current = true;
        setMorph({ rect, at: Date.now() });
      },
      toggleMute: () => {
        const m = shownRef.current;
        const h = handlersRef.current;
        if (!m) return;
        if (m.source === "group") h.groupCall?.toggleMute?.();
        else if (m.source === "server") h.serverVoice?.toggleMute?.();
        else h.call?.toggleMute?.();
      },
      end: () => {
        const m = shownRef.current;
        const h = handlersRef.current;
        if (!m) return;
        if (m.source === "group") h.groupCall?.leaveCall?.();
        else if (m.source === "server") h.serverVoice?.leave?.();
        else h.call?.endCall?.(h.call?.peer?.id);
      },
      chat: () => {
        const m = shownRef.current;
        const h = handlersRef.current;
        if (!m?.chat) return;
        if (m.chat.kind === "group") h.navigate?.(groupPath(m.chat.groupId));
        else if (m.chat.kind === "server") h.navigate?.(serverPath(m.chat.serverId));
        else if (m.chat.peer?.username) h.navigate?.(directPath(m.chat.peer));
      },
      callBack: () => {
        const m = shownRef.current;
        const h = handlersRef.current;
        const cb = m?.callBack;
        if (!cb) return;
        setEnded(null);
        if (cb.kind === "server") h.serverVoice?.join?.(cb.serverId, cb.channel);
        else h.onCallBack?.(cb.peer, cb.callType);
      },
      selectRoute: (id) => {
        const m = shownRef.current;
        const h = handlersRef.current;
        const hook = m?.source === "group" ? h.groupCall : m?.source === "server" ? h.serverVoice : h.call;
        if (hook?.iosAudioRoute?.routes?.length) hook.selectIosRoute?.(id);
        else hook?.setAudioOutput?.(id);
      },
      refreshRoute: () => void refreshIosAudioRoute(),
    }),
    []
  );

  const hook = shown?.source === "group" ? groupCall : shown?.source === "server" ? serverVoice : call;
  const route = useMemo(
    () => adaRouteModel({ ios: hook?.iosAudioRoute || null, webDevices: hook?.audioOutputDevices, webSelected: hook?.selectedAudioOutput || "" }),
    [hook?.iosAudioRoute, hook?.audioOutputDevices, hook?.selectedAudioOutput]
  );

  if (typeof document === "undefined") return null;
  // Portaled to <body>: #root moves down (html.ada-reserve) on phones without an island,
  // the pill must stay where it is.
  return createPortal(
    <>
      {shown ? <AdaPill model={shown} face={adaFace(shown)} layout={layout} route={route} actions={actions} /> : null}
      {morph ? (
        <AdaMorph
          key={morph.at}
          rect={morph.rect}
          onCovered={doExpand}
          onDone={() => {
            expandingRef.current = false;
            setMorph(null);
          }}
        />
      ) : null}
    </>,
    document.body
  );
}
