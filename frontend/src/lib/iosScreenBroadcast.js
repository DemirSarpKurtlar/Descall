/**
 * Native iOS whole-screen sharing bridge (plugin "DescallScreenBroadcast",
 * frontend/ios/App/App/DescallScreenBroadcastPlugin.swift, docs/ios-screen-share.md).
 *
 * Tapping Share Screen in a server voice channel: the web app mints a screen
 * companion token, the plugin connects a native LiveKit room as
 * `<userId>:screen` and shows the system broadcast picker preselected to the
 * Descall extension. The extension (DescallBroadcast, LKSampleHandler) hands
 * frames to the app through the App Group, the native room publishes them.
 *
 * Inert on web, Electron, Android and on iOS builds without the plugin (the
 * Share Screen button stays hidden there, as before).
 */
import { useSyncExternalStore } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { screenShareCapability } from "./iosScreenBroadcastModel.js";

const PLUGIN_NAME = "DescallScreenBroadcast";

export const screenBroadcastPlugin = registerPlugin(PLUGIN_NAME);

function nativeIos() {
  try {
    return typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

function pluginAvailable() {
  try {
    return nativeIos() && Capacitor.isPluginAvailable(PLUGIN_NAME);
  } catch {
    return false;
  }
}

function hasDisplayMedia() {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

let status = null;
let statusPromise = null;
const subscribers = new Set();

function notify() {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

/** Native status: { available, reason, broadcasting, phase }. Cached; refresh() re-reads it. */
export function refreshBroadcastStatus() {
  if (!pluginAvailable()) return Promise.resolve(null);
  if (!statusPromise) {
    statusPromise = screenBroadcastPlugin
      .getStatus()
      .then((next) => {
        status = next || { available: false, reason: "unknown" };
        notify();
        return status;
      })
      .catch((err) => {
        console.warn("[ScreenBroadcast] getStatus failed:", err?.message || err);
        status = { available: false, reason: "status-failed" };
        notify();
        return status;
      })
      .finally(() => {
        statusPromise = null;
      });
  }
  return statusPromise;
}

if (pluginAvailable()) void refreshBroadcastStatus();

export function currentScreenShareCapability() {
  return screenShareCapability({
    nativeIos: nativeIos(),
    hasDisplayMedia: hasDisplayMedia(),
    pluginAvailable: pluginAvailable(),
    status,
  });
}

/** True when Share Screen goes through the native broadcast picker. */
export function nativeBroadcastSupported() {
  return currentScreenShareCapability() === "broadcast";
}

function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** "web" | "broadcast" | "none", re-rendering once the native status arrives. */
export function useScreenShareCapability() {
  return useSyncExternalStore(subscribe, currentScreenShareCapability, currentScreenShareCapability);
}

/** Native state events: { phase, broadcasting, reason, at }. Returns an unsubscribe. */
export function onBroadcastState(handler) {
  if (!pluginAvailable()) return () => {};
  let handle = null;
  let removed = false;
  Promise.resolve(screenBroadcastPlugin.addListener("state", (data) => handler?.(data || {})))
    .then((h) => {
      handle = h;
      if (removed) handle?.remove?.();
    })
    .catch(() => {});
  return () => {
    removed = true;
    handle?.remove?.();
  };
}

/**
 * Connect the companion room and (unless a broadcast already runs) show the picker.
 * `anchor` = the Share Screen button rect (iPad: the picker popover points at it).
 */
export function startNativeBroadcast({ url, token, anchor = null, showPicker = true, maxHeight = 1080, fps = 15 } = {}) {
  if (!pluginAvailable()) return Promise.reject(new Error("unavailable"));
  return screenBroadcastPlugin.start({ url, token, anchor, showPicker, maxHeight, fps });
}

/** Ask the extension to finish and leave the companion room. Safe to call any time. */
export function stopNativeBroadcast(reason = "stopped") {
  if (!pluginAvailable()) return Promise.resolve();
  return screenBroadcastPlugin.stop({ reason }).catch((err) => {
    console.warn("[ScreenBroadcast] stop failed:", err?.message || err);
  });
}
