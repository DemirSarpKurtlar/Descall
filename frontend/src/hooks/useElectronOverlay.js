import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasDesktopBridge } from "../lib/desktopShell.js";
import { resolveAvatarUrl, resolveDisplayName } from "../lib/userProfile.js";
import { t } from "../i18n/runtime.js";
import { auxCoversOverlay, auxSlot, callSlot, publishCallState, setCallActionHandler } from "../premium/desktop/desktopBus.js";

const isElectron = hasDesktopBridge();

/** Theme accent as "r, g, b" (desktop Liquid Glass token), or "" when unset. */
export function readOverlayBrandRgb(doc = typeof document !== "undefined" ? document : null) {
  try {
    const v = getComputedStyle(doc.documentElement).getPropertyValue("--g-brand-rgb").trim();
    return /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(v) ? v : "";
  } catch {
    return "";
  }
}

/** Only absolute https / data:image avatars can load in the overlay's file:// page. */
export function overlayAvatarUrl(user) {
  const url = resolveAvatarUrl(user);
  return url && /^(https:\/\/|data:image\/)/i.test(url) ? url : "";
}

function overlayLang() {
  try {
    const l = (document.documentElement.lang || navigator.language || "tr").toLowerCase();
    return l.startsWith("en") ? "en" : "tr";
  } catch {
    return "tr";
  }
}

/**
 * Descall itself is in front: its window is visible and has the focus. The call card is a
 * stand-in for when Descall is NOT in front (another app, a game, minimized, in the tray).
 */
export function readAppInFront(doc = typeof document !== "undefined" ? document : null) {
  try {
    if (!doc) return false;
    if (doc.visibilityState === "hidden") return false;
    return typeof doc.hasFocus === "function" ? Boolean(doc.hasFocus()) : false;
  } catch {
    return false;
  }
}

/**
 * Whether the always-on-top call card may be on screen. Feedback 2026-11-22 (DemirBey,
 * Windows 4.1.0, "neden ekranımda kocaman arama işareti çıkıyor?", every DM call): the card
 * was shown for every call even while Descall was in front, on top of the app itself. It
 * sits in the top-right corner, so on a maximized window it covered Descall's own window
 * buttons and the call screen's top-right controls, and it could only go away by ending
 * the call. It now shows only while Descall is not in front.
 */
export function overlayShouldShow({ active = false, auxCovers = false, appInFront = false } = {}) {
  return Boolean(active) && !auxCovers && !appInFront;
}

/** Blur -> show waits this long, so a focus bounce (native dialog, picker) does not flash it. */
export const OVERLAY_SHOW_DELAY_MS = 300;

/** Tracks readAppInFront(): true at once on focus, false after a short delay on blur / hide. */
function useAppInFront(enabled) {
  const [inFront, setInFront] = useState(() => (enabled ? readAppInFront() : false));
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    let timer = null;
    const sync = () => {
      if (timer) window.clearTimeout(timer);
      timer = null;
      if (readAppInFront()) {
        setInFront(true);
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        setInFront(readAppInFront());
      }, OVERLAY_SHOW_DELAY_MS);
    };
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [enabled]);
  return inFront;
}

/** Mute/unmute every `<audio>` element currently in the document. */
function applyAudioMute(mutedEls, shouldMute) {
  document.querySelectorAll("audio").forEach((el) => {
    if (shouldMute) {
      if (!el.muted) mutedEls.add(el);
      el.muted = true;
    } else if (mutedEls.has(el)) {
      el.muted = false;
    }
  });
  if (!shouldMute) mutedEls.clear();
}

/**
 * Drives the Electron always-on-top voice overlay (mini HUD) from whichever
 * voice surface is currently active, DM call, group hangout, or server
 * voice channel, and relays overlay button clicks back into the existing
 * mute/leave handlers for that surface. No-ops entirely outside Electron.
 *
 * "Deafen" has no server-side concept yet, so it's implemented locally by
 * muting every WebRTC `<audio>` sink in the document (mirrors the forced
 * deafen behavior already used for server voice moderation).
 */
export function useElectronOverlay({ call, groupCall, serverVoice } = {}) {
  const deafenedRef = useRef(false);
  const autoMutedByDeafenRef = useRef(false);
  const mutedAudioElsRef = useRef(new Set());
  const audioObserverRef = useRef(null);
  const ctxRef = useRef(null);

  const dmActive = call?.mode === "active" || call?.mode === "outgoing";
  const groupActive = Boolean(groupCall?.isInCall);
  const serverActive = Boolean(serverVoice?.isInVoice);
  const active = dmActive || groupActive || serverActive;

  const title = dmActive
    ? `${resolveDisplayName(call?.peer) || call?.peer?.username || t("callui.overlay.call")}`
    : groupActive
    ? t("callui.overlay.groupCall")
    : serverActive
    ? serverVoice?.channelName || t("callui.overlay.voiceChannel")
    : "";

  const muted = dmActive
    ? Boolean(call?.muted)
    : groupActive
    ? Boolean(groupCall?.isMuted)
    : serverActive
    ? Boolean(serverVoice?.muted)
    : false;

  const deafened = dmActive
    ? Boolean(call?.deafened)
    : groupActive
    ? Boolean(groupCall?.deafened)
    : serverActive
    ? Boolean(serverVoice?.deafened)
    : false;

  const kind = dmActive ? "dm" : groupActive ? "group" : serverActive ? "server" : "";
  const pending = dmActive && call?.mode === "outgoing";
  const avatarUrl = dmActive ? overlayAvatarUrl(call?.peer) : "";
  // Call duration for the overlay's status line: starts when the session goes live.
  const sinceRef = useRef({ key: "", at: 0 });
  const liveKey = active && !pending ? `${kind}:${dmActive ? call?.peer?.id || "" : title}` : "";
  if (sinceRef.current.key !== liveKey) sinceRef.current = { key: liveKey, at: liveKey ? Date.now() : 0 };
  const since = sinceRef.current.at;

  const toggleMute = dmActive ? call?.toggleMute : groupActive ? groupCall?.toggleMute : serverActive ? serverVoice?.toggleMute : null;
  const toggleDeafen = dmActive ? call?.toggleDeafen : groupActive ? groupCall?.toggleDeafen : serverActive ? serverVoice?.toggleDeafen : null;

  const leave = useCallback(() => {
    if (dmActive) call?.endCall?.(call?.peer?.id);
    else if (groupActive) groupCall?.leaveCall?.();
    else if (serverActive) serverVoice?.leave?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmActive, groupActive, serverActive, call?.peer?.id, call?.endCall, groupCall?.leaveCall, serverVoice?.leave]);

  // Keep the latest handlers reachable from the stable IPC listener below.
  useEffect(() => {
    ctxRef.current = { active, muted, toggleMute, toggleDeafen, leave };
  }, [active, muted, toggleMute, toggleDeafen, leave]);

  const applyDeafen = useCallback((next) => {
    deafenedRef.current = next;
    applyAudioMute(mutedAudioElsRef.current, next);

    if (audioObserverRef.current) {
      audioObserverRef.current.disconnect();
      audioObserverRef.current = null;
    }
    if (next && typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== 1) return;
            const audioEls = node.tagName === "AUDIO" ? [node] : Array.from(node.querySelectorAll?.("audio") || []);
            audioEls.forEach((el) => {
              el.muted = true;
              mutedAudioElsRef.current.add(el);
            });
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      audioObserverRef.current = observer;
    }
  }, []);

  const handleOverlayAction = useCallback(
    (action) => {
      const ctx = ctxRef.current;
      if (!ctx?.active) return;
      if (action === "mute") {
        ctx.toggleMute?.();
      } else if (action === "leave") {
        ctx.leave?.();
      } else if (action === "deafen") {
        if (ctx.toggleDeafen) {
          ctx.toggleDeafen();
          return;
        }
        const next = !deafenedRef.current;
        if (next && !ctx.muted) {
          autoMutedByDeafenRef.current = true;
          ctx.toggleMute?.();
        } else if (!next && autoMutedByDeafenRef.current) {
          autoMutedByDeafenRef.current = false;
          ctx.toggleMute?.();
        }
        applyDeafen(next);
        window.electronAPI?.overlayUpdate?.({ deafened: next });
        publishCallState({ ...callSlot.get(), deafened: next });
      }
    },
    [applyDeafen]
  );

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onOverlayAction) return undefined;
    return window.electronAPI.onOverlayAction(handleOverlayAction);
  }, [handleOverlayAction]);

  // Descall+ mini mode / call window / tray / taskbar run the same actions.
  useEffect(() => {
    if (!isElectron) return undefined;
    setCallActionHandler(handleOverlayAction);
    return () => setCallActionHandler(null);
  }, [handleOverlayAction]);
  // While a Descall+ window shows the call, the classic overlay card stays hidden.
  const auxState = useSyncExternalStore(auxSlot.subscribe, auxSlot.get, auxSlot.get);
  const appInFront = useAppInFront(isElectron && active);

  useEffect(() => {
    if (!isElectron) return undefined;
    return () => {
      audioObserverRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    if (!active) {
      if (deafenedRef.current) {
        applyDeafen(false);
        autoMutedByDeafenRef.current = false;
      }
      window.electronAPI?.overlayHide?.();
      publishCallState(null);
      return;
    }
    publishCallState({ active: true, title, muted, deafened: deafened || deafenedRef.current, pending, kind, since, avatarUrl });
    if (!overlayShouldShow({ active, auxCovers: auxCoversOverlay(), appInFront })) {
      window.electronAPI?.overlayHide?.();
      return;
    }
    window.electronAPI?.overlayShow?.({
      title,
      muted,
      deafened: deafened || deafenedRef.current,
      connected: true,
      pending,
      kind,
      since,
      avatarUrl,
      brandRgb: readOverlayBrandRgb(),
      lang: overlayLang(),
    });
  }, [active, title, muted, deafened, applyDeafen, pending, kind, since, avatarUrl, auxState, appInFront]);

  // Equipping another theme mid-call re-tints the overlay.
  useEffect(() => {
    if (!isElectron || !active || typeof MutationObserver === "undefined") return undefined;
    let last = readOverlayBrandRgb();
    const obs = new MutationObserver(() => {
      const next = readOverlayBrandRgb();
      if (next && next !== last) {
        last = next;
        window.electronAPI?.overlayUpdate?.({ brandRgb: next });
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    return () => obs.disconnect();
  }, [active]);
}

export default useElectronOverlay;
