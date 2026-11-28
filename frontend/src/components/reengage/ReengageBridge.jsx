import { useEffect, useRef } from "react";
import notificationService from "../../lib/notificationService";
import { putPref } from "../../lib/notifyPrefs";
import { reportOpened } from "../../api/reengage";

const RG_EVENTS = [
  "winback:suggestion",
  "winback:called",
  "winback:returned",
  "winback:rewarded",
  "streaks:task",
  "streaks:day",
  "streaks:nudged",
  "streaks:changed",
];

/**
 * Growth 3B glue mounted once in App: desktop cards with faces for "in voice" (Electron,
 * Tauri, idle tabs), live socket events re-sent as window events, "opened" tracking of
 * tapped re-engagement pushes, and the Katıl / Sessiz katıl buttons (join voice, muted
 * for the quiet one) from a push, also when the push opened the app (?rgAction=...).
 */
export default function ReengageBridge({ socket, serverVoice }) {
  const voiceRef = useRef(serverVoice);
  voiceRef.current = serverVoice;
  const socketRef = useRef(socket);
  socketRef.current = socket;

  // Join a voice channel from a notification button; quiet = microphone off.
  const joinVoice = useRef(async (data, quiet) => {
    const sv = voiceRef.current;
    if (!sv || !data?.serverId || !data?.channelId) return;
    const channel = { id: data.channelId, name: data.channelName || "voice", type: "voice" };
    for (let i = 0; i < 20 && !socketRef.current?.connected; i += 1) await new Promise((r) => setTimeout(r, 250));
    try {
      await sv.join(data.serverId, channel);
      if (quiet) {
        for (let i = 0; i < 40; i += 1) {
          const cur = voiceRef.current;
          if (cur?.activeChannelId === data.channelId && !cur.connecting) {
            if (!cur.muted) cur.toggleMute?.();
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    } catch {
      /* the channel view shows the join error */
    }
  });

  useEffect(() => {
    if (!socket?.on) return undefined;
    const onNotify = (p = {}) => {
      notificationService.show({
        title: p.title || "Descall",
        body: p.body || "",
        tag: p.tag || "rg",
        data: { ...(p.data || {}), type: p.type || p.data?.type },
        avatarUrl: p.avatarUrl || null,
      });
    };
    const onCenter = (p = {}) => {
      if (p.dmPref) putPref(p.dmPref);
      window.dispatchEvent(new CustomEvent("descall:notify-center-changed", { detail: p }));
    };
    const relays = RG_EVENTS.map((event) => {
      const fn = (payload) => {
        window.dispatchEvent(new CustomEvent("descall:rg", { detail: { event, payload } }));
        if (event.startsWith("streaks:")) window.dispatchEvent(new CustomEvent("descall:streaks-changed"));
      };
      socket.on(event, fn);
      return [event, fn];
    });
    const onBalance = (p = {}) => {
      if (p.reason === "reengage_task" || p.reason === "winback_call" || p.reason === "winback_gift") window.dispatchEvent(new CustomEvent("descall:streaks-changed"));
    };
    socket.on("reengage:notify", onNotify);
    socket.on("notify-center:changed", onCenter);
    socket.on("descoin:balance", onBalance);
    return () => {
      socket.off?.("reengage:notify", onNotify);
      socket.off?.("notify-center:changed", onCenter);
      socket.off?.("descoin:balance", onBalance);
      for (const [event, fn] of relays) socket.off?.(event, fn);
    };
  }, [socket]);

  // A tapped push (web service worker, iOS, Electron): opened tracking + the buttons.
  useEffect(() => {
    const onClick = (event) => {
      const d = event?.detail?.data && typeof event.detail.data === "object" ? event.detail.data : event?.detail || {};
      if (d.rgKind) void reportOpened(String(d.rgKind));
      if (d.type === "friend-voice" && (d.action === "rg_join" || d.action === "rg_quiet")) {
        // App.jsx opens the channel first; join right after.
        window.setTimeout(() => void joinVoice.current(d, d.action === "rg_quiet"), 300);
      }
    };
    window.addEventListener("descall:notification-click", onClick);
    return () => window.removeEventListener("descall:notification-click", onClick);
  }, []);

  // The push opened the app (no window was open): ?rgAction=rg_join&rgKind=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const action = params.get("rgAction");
    const kind = params.get("rgKind");
    if (!action && !kind) return;
    if (kind) void reportOpened(kind);
    params.delete("rgAction");
    params.delete("rgKind");
    const rest = params.toString();
    try {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    } catch {
      /* keep the URL */
    }
    const m = window.location.pathname.match(/^\/servers\/([^/]+)\/([^/?#]+)/);
    if (m && (action === "rg_join" || action === "rg_quiet")) {
      window.setTimeout(() => void joinVoice.current({ serverId: decodeURIComponent(m[1]), channelId: decodeURIComponent(m[2]) }, action === "rg_quiet"), 1500);
    }
  }, []);

  return null;
}
