/**
 * App.jsx -> desktop tray panel (draft B). Publishes the profile / status / badge part of
 * the tray state, the voice fallback (call state from desktopBus while the bottom-left
 * panel is not mounted), the mute shortcut hints and the theme, and registers the app
 * actions the panel can ask for, each through the app's existing code:
 *   status -> setStatus (App.handleStatusChange: status:set to the server, other clients
 *   follow), openDms -> /direct, openRequests -> /friends (pending requests on top),
 *   openSettings -> /settings, mute / deafen -> the call's own toggles.
 * Only desktop shells have electronAPI.setTrayState; everywhere else this does nothing.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { resolveDisplayName } from "../lib/userProfile.js";
import { isMacPlatform } from "../lib/shortcuts.js";
import { acceleratorLabel, publishTray, readDocumentLook, setTrayHandler, startDesktopTray } from "../lib/desktopTray.js";
import { callSlot, runCallAction } from "../premium/desktop/desktopBus.js";
import { getFeatureSettings, onFeatureSettings } from "../premium/featureSettings.js";
import { getPremiumState, subscribePremium } from "../premium/premiumStore.js";
import { overlayAvatarUrl } from "./useElectronOverlay.js";

const enabled = typeof window !== "undefined" && typeof window.electronAPI?.setTrayState === "function";
const noopSubscribe = () => () => {};

function total(map) {
  let n = 0;
  for (const v of Object.values(map || {})) n += Math.max(0, Number(v) || 0);
  return n;
}

/** Descall+ global mute hotkeys while that feature is on, else null. */
function useGlobalMuteBindings() {
  const premium = useSyncExternalStore(enabled ? subscribePremium : noopSubscribe, getPremiumState, getPremiumState);
  const entitled = enabled && Array.isArray(premium?.features) && premium.features.includes("global_mute");
  const [settings, setSettings] = useState(null);
  const [bindings, setBindings] = useState(null);
  useEffect(() => {
    if (!entitled) {
      setSettings(null);
      return undefined;
    }
    let live = true;
    getFeatureSettings("global_mute").then((v) => { if (live) setSettings(v || {}); }).catch(() => {});
    const off = onFeatureSettings((k, v) => { if (k === "global_mute" && live) setSettings(v || {}); });
    return () => { live = false; off(); };
  }, [entitled]);
  const on = Boolean(entitled && settings?.enabled);
  const deafenOn = on && settings?.deafen !== false;
  useEffect(() => {
    if (!on) {
      setBindings(null);
      return undefined;
    }
    let live = true;
    window.descallPremium?.invoke?.("premium:global_mute:status")
      .then((r) => { if (live) setBindings(r?.hotkeys?.bindings || {}); })
      .catch(() => {});
    return () => { live = false; };
  }, [on, deafenOn]);
  return on && bindings ? { mute: bindings.toggle_mute ?? "CommandOrControl+Alt+M", deafen: deafenOn ? bindings.toggle_deafen ?? "CommandOrControl+Alt+D" : "" } : null;
}

export function useDesktopTray({ me, myStatus, dmUnread, groupUnread, friendRequests, navigate, setStatus }) {
  useEffect(() => (enabled ? startDesktopTray() : undefined), []);

  // Profile, status and the badges the app already shows (rail: DMs + groups, requests).
  const name = me ? resolveDisplayName(me) || me.username || "" : "";
  const avatarUrl = me ? overlayAvatarUrl(me) : "";
  const statusText = String(me?.customStatus || me?.custom_status || "").trim();
  const unreadMessages = useMemo(() => total(dmUnread) + total(groupUnread), [dmUnread, groupUnread]);
  const requests = Array.isArray(friendRequests) ? friendRequests.length : 0;
  const signedIn = Boolean(me?.id);
  useEffect(() => {
    if (!enabled) return;
    publishTray("app", { signedIn, name, avatarUrl, status: myStatus, statusText, unreadMessages, friendRequests: requests });
  }, [signedIn, name, avatarUrl, myStatus, statusText, unreadMessages, requests]);

  // Voice fallback: the active call as useElectronOverlay publishes it.
  const call = useSyncExternalStore(enabled ? callSlot.subscribe : noopSubscribe, callSlot.get, callSlot.get);
  useEffect(() => {
    if (enabled) publishTray("call", call);
  }, [call]);

  // Shortcut hints: Descall+ global mute keys when they are on, else the app's own
  // Ctrl/Cmd+Shift+M and Ctrl/Cmd+Shift+D (lib/userVoicePanel.js matchVoiceShortcut).
  const global = useGlobalMuteBindings();
  useEffect(() => {
    if (!enabled) return;
    const mac = isMacPlatform();
    const mod = mac ? "Cmd" : "Ctrl";
    publishTray("hints", {
      mute: global?.mute ? acceleratorLabel(global.mute, { mac }) : `${mod}+Shift+M`,
      deafen: global?.deafen ? acceleratorLabel(global.deafen, { mac }) : `${mod}+Shift+D`,
    });
  }, [global?.mute, global?.deafen]);

  // Theme (light / dark, accent) and language follow the document.
  useEffect(() => {
    if (!enabled || typeof MutationObserver === "undefined") return undefined;
    let t = null;
    const read = () => {
      t = null;
      publishTray("look", readDocumentLook());
    };
    read();
    const obs = new MutationObserver(() => {
      if (!t) t = setTimeout(read, 250);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme", "lang"] });
    return () => {
      obs.disconnect();
      if (t) clearTimeout(t);
    };
  }, []);

  // Actions, run with the app's existing code (latest callbacks through a ref: App.jsx
  // makes a new handleStatusChange on every render).
  const latest = useRef({ navigate, setStatus });
  latest.current = { navigate, setStatus };
  useEffect(() => {
    if (!enabled) return undefined;
    const go = (path) => latest.current.navigate?.(path);
    const offs = [
      setTrayHandler("status", (s) => latest.current.setStatus?.(s)),
      setTrayHandler("openDms", () => go("/direct")),
      setTrayHandler("openRequests", () => go("/friends")),
      setTrayHandler("openSettings", () => go("/settings")),
      // The bottom-left panel registers the real toggles (they also work without a call).
      setTrayHandler("mute", () => runCallAction("mute"), { fallback: true }),
      setTrayHandler("deafen", () => runCallAction("deafen"), { fallback: true }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
}

export default useDesktopTray;
