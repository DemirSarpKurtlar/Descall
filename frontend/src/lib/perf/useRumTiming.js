/**
 * React glue for lib/perf/rum.js (Yönetici Paneli › Performans).
 *
 *   useMessageListTiming(id, type, loading)  MessageList: route "app/kanal" | "app/dm" | "app/grup"
 *                                            while it shows, and "msglist" = time from the
 *                                            conversation opening (intent, else the first render
 *                                            that saw it) to the first painted list
 *   useRumView(view, active)                 any other screen (Market, Keşfet, Ayarlar, voice room)
 */
import { useEffect, useRef } from "react";
import { currentRumView, rumDone, setRumView } from "./rum.js";

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

export const VIEW_OF_CONVERSATION = Object.freeze({ server: "app/kanal", dm: "app/dm", group: "app/grup" });

export function useMessageListTiming(conversationId, conversationType, loading) {
  const view = VIEW_OF_CONVERSATION[conversationType] || "app/dm";
  const ref = useRef({ id: null, start: 0, done: false });
  if (ref.current.id !== conversationId) ref.current = { id: conversationId, start: now(), done: !conversationId };

  useEffect(() => {
    setRumView(view);
    return () => setRumView("app");
  }, [view]);

  useEffect(() => {
    const t = ref.current;
    if (t.done || loading || !conversationId) return undefined;
    let raf = 0;
    const fire = () => {
      if (t.done || ref.current !== t) return;
      t.done = true;
      rumDone("msglist", { key: conversationId, route: view, kind: conversationType, fallbackStart: t.start });
    };
    try {
      raf = requestAnimationFrame(fire);
    } catch {
      fire();
    }
    return () => {
      try {
        cancelAnimationFrame(raf);
      } catch {
        /* ignore */
      }
    };
  }, [conversationId, conversationType, loading, view]);
}

/** Mark `view` as the screen on show while `active` is true. */
export function useRumView(view, active = true) {
  useEffect(() => {
    if (!active || !view) return undefined;
    // An overlay (Ayarlar over a chat) hands the route back to what was under it.
    const before = currentRumView();
    setRumView(view);
    return () => setRumView(before && before !== view ? before : "app");
  }, [view, active]);
}
