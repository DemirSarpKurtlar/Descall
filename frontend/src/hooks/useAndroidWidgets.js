/**
 * App.jsx -> Android home screen widgets and the ongoing call notification (draft B,
 * lib/androidWidgets.js has the rules, this is the React glue):
 *   - the widgets' session copy on sign-in (and when the token changes), cleared on sign-out;
 *   - a refresh request after socket events that change faces, messages or voice rooms, and
 *     when the app goes to the background (the native side keeps a 20 s floor, no polling);
 *   - the running call (room, people, who talks, mute) for the call widget and notification.
 * Widget / notification buttons come back as page actions through lib/nativeIntents.js.
 * Not Android: nothing runs.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "../config/api.js";
import { getToken } from "../lib/storage.js";
import { subscribeActiveSpeakers } from "../lib/activeSpeakers.js";
import { nativePlatform } from "../lib/nativeIntents.js";
import {
  REFRESH_DEBOUNCE_MS,
  REFRESH_EVENTS,
  callIdentity,
  clearWidgetSession,
  requestWidgetRefresh,
  setWidgetCallState,
  setWidgetSession,
  widgetCallPayload,
  widgetSessionPayload,
  widgetSessionPlan,
} from "../lib/androidWidgets.js";

const SPEAKER_THROTTLE_MS = 1000;

export function useAndroidWidgets({ me, socket, call, groupCall, serverVoice, friends, servers, groups }) {
  const enabled = useMemo(() => nativePlatform() === "android", []);

  // ---- session --------------------------------------------------------------------------------
  const sessionKeyRef = useRef("");
  const [resumeTick, setResumeTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const payload = widgetSessionPayload(me, me?.id ? getToken() : null, API_BASE_URL);
    const { plan, key } = widgetSessionPlan(sessionKeyRef.current, payload);
    sessionKeyRef.current = key;
    if (plan === "sync") setWidgetSession(payload);
    else if (plan === "clear") clearWidgetSession();
  }, [enabled, me?.id, resumeTick]);

  // ---- refresh on socket events and when the app leaves the screen ------------------------------
  useEffect(() => {
    if (!enabled || !socket?.on) return undefined;
    let timer = null;
    const ask = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        requestWidgetRefresh("socket");
      }, REFRESH_DEBOUNCE_MS);
    };
    for (const ev of REFRESH_EVENTS) socket.on(ev, ask);
    return () => {
      clearTimeout(timer);
      for (const ev of REFRESH_EVENTS) socket.off?.(ev, ask);
    };
  }, [enabled, socket]);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") requestWidgetRefresh("background");
      else setResumeTick((n) => n + 1); // a token refreshed while away reaches the widgets
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled]);

  // ---- who is talking (voice channels), at most once a second ------------------------------------
  const [speakers, setSpeakers] = useState({ scope: null, ids: [] });
  useEffect(() => {
    if (!enabled) return undefined;
    let last = 0;
    let timer = null;
    let latest = null;
    const flush = () => {
      timer = null;
      last = Date.now();
      setSpeakers((prev) => (prev.scope === latest.scope && prev.ids.join() === latest.ids.join() ? prev : latest));
    };
    const stop = subscribeActiveSpeakers((cur) => {
      latest = { scope: cur?.scope ?? null, ids: Array.isArray(cur?.ids) ? cur.ids.slice(0, 4) : [] };
      if (timer) return;
      timer = setTimeout(flush, Math.max(0, last + SPEAKER_THROTTLE_MS - Date.now()));
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [enabled]);

  // ---- the running call --------------------------------------------------------------------------
  const startRef = useRef({ id: "", at: 0 });
  const lastCallRef = useRef("");
  const groupName = useMemo(() => {
    const id = groupCall?.activeGroupId;
    if (!id || !Array.isArray(groups)) return "";
    return groups.find((g) => String(g?.id) === String(id))?.name || "";
  }, [groupCall?.activeGroupId, groups]);
  const draft = enabled
    ? widgetCallPayload({ call, groupCall, serverVoice, me, friends, servers, speakers: speakers.ids, speakerScope: speakers.scope, groupName })
    : { active: false };
  const identity = callIdentity(draft);
  if (identity !== startRef.current.id) startRef.current = { id: identity, at: identity ? Date.now() : 0 };
  const payload = draft.active && !draft.startedAt ? { ...draft, startedAt: startRef.current.at } : draft;
  const callKey = enabled ? JSON.stringify(payload) : "";
  useEffect(() => {
    if (!enabled || callKey === lastCallRef.current) return;
    lastCallRef.current = callKey;
    // The first report is sent even when idle: it clears a call left over from a crash.
    setWidgetCallState(JSON.parse(callKey));
  }, [enabled, callKey]);
}

export default useAndroidWidgets;
