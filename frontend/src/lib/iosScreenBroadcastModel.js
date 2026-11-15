/**
 * Pure state for iOS whole-screen sharing (ReplayKit broadcast extension +
 * native LiveKit screen companion, docs/ios-screen-share.md). No Capacitor,
 * no React: lib/iosScreenBroadcast.js is the bridge, useServerVoice.js the owner.
 *
 * Share phases shown in the voice dock:
 *   idle      nothing shared
 *   preparing token + native room connecting
 *   picker    the system broadcast sheet is up, waiting for "Start Broadcast"
 *   live      the whole screen is published
 *   stopping  stop requested, waiting for the broadcast to end
 */

export const SHARE_PHASES = Object.freeze(["idle", "preparing", "picker", "live", "stopping"]);

/** Native plugin phase -> dock phase. */
const NATIVE_TO_SHARE = Object.freeze({
  idle: "idle",
  connecting: "preparing",
  waiting: "picker",
  live: "live",
  stopping: "stopping",
  ended: "idle",
  error: "idle",
});

export const INITIAL_SHARE_STATE = Object.freeze({ phase: "idle", error: null, startedAt: null, reason: null });

/**
 * Which capture path a Share Screen tap uses.
 *   "web"        getDisplayMedia / Electron (desktop, Android, iPad Safari 17+ web)
 *   "broadcast"  native iOS app with the DescallScreenBroadcast plugin and the extension embedded
 *   "none"       native iOS app without it (older build, or the extension was not shipped): hide the button
 */
export function screenShareCapability({ nativeIos = false, hasDisplayMedia = false, pluginAvailable = false, status = null } = {}) {
  if (!nativeIos) return hasDisplayMedia ? "web" : "none";
  if (pluginAvailable && status && status.available === true) return "broadcast";
  // A future WKWebView with getDisplayMedia still works without the plugin.
  return hasDisplayMedia ? "web" : "none";
}

/** Why the broadcast path is not available (for logs / the docs troubleshooting table). */
export function broadcastUnavailableReason({ nativeIos = false, pluginAvailable = false, status = null } = {}) {
  if (!nativeIos) return "not-ios";
  if (!pluginAvailable) return "old-build";
  if (!status) return "unknown";
  if (status.available === true) return null;
  return status.reason || "no-extension";
}

export function nextShareState(state = INITIAL_SHARE_STATE, event = {}) {
  const prev = state || INITIAL_SHARE_STATE;
  switch (event.type) {
    case "request":
      if (prev.phase !== "idle") return prev;
      return { phase: "preparing", error: null, startedAt: null, reason: null };
    case "stop":
      if (prev.phase === "idle") return prev;
      return { ...prev, phase: "stopping" };
    case "fail":
      return { phase: "idle", error: event.error || "iosShare.errGeneric", startedAt: null, reason: event.reason || null };
    case "reset":
      return INITIAL_SHARE_STATE;
    case "native": {
      const phase = NATIVE_TO_SHARE[event.phase];
      if (!phase) return prev;
      // Stop was asked: only the end of the broadcast moves on from here.
      if (prev.phase === "stopping" && phase !== "idle" && phase !== "stopping") return prev;
      if (phase === "live") {
        return {
          phase: "live",
          error: null,
          startedAt: prev.phase === "live" && prev.startedAt ? prev.startedAt : Number(event.at) || Date.now(),
          reason: null,
        };
      }
      if (phase === "idle") {
        const error = event.phase === "error" ? nativeErrorKey(event.reason) : null;
        return { phase: "idle", error, startedAt: null, reason: event.reason || null };
      }
      // A late "connecting" / "waiting" never pulls a live share back.
      if (prev.phase === "live" && (phase === "preparing" || phase === "picker")) return prev;
      return { ...prev, phase, error: null };
    }
    default:
      return prev;
  }
}

/**
 * "started" / "stopped" when the published share appears or goes away.
 * A share counts as published from "live" until it is idle again (stopping
 * still publishes); a cancelled picker never published anything.
 */
export function shareTransition(prev, next) {
  const published = (st) => Boolean(st && st.startedAt && (st.phase === "live" || st.phase === "stopping"));
  const was = published(prev);
  const is = published(next);
  if (!was && is) return "started";
  if (was && !is) return "stopped";
  return null;
}

/** Token endpoint error code -> i18n key. */
export function tokenErrorKey(code) {
  switch (code) {
    case "NOT_IN_CHANNEL":
      return "iosShare.errNotInChannel";
    case "MISSING_PERMISSION":
      return "iosShare.errPermission";
    case "RATE_LIMITED":
      return "iosShare.errRateLimited";
    case "SFU_REQUIRED":
      return "iosShare.errNeedsSfu";
    default:
      return "iosShare.errGeneric";
  }
}

/** Native failure reason -> i18n key (null = end quietly). */
export function nativeErrorKey(reason) {
  switch (reason) {
    case "picker-timeout":
    case "user-stopped":
    case "stopped":
      return null;
    case "no-extension":
      return "iosShare.errUnavailable";
    case "connect-failed":
    case "room-disconnected":
    case "publish-failed":
      return "iosShare.errConnection";
    default:
      return reason ? "iosShare.errGeneric" : null;
  }
}

/** Element rect (CSS px = points in the WKWebView) -> picker anchor, iPad popover source. */
export function anchorFromRect(rect) {
  if (!rect) return null;
  const x = Number(rect.left ?? rect.x);
  const y = Number(rect.top ?? rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/** mm:ss (or h:mm:ss) since the share went live, for the dock chip. */
export function formatShareElapsed(startedAt, now = Date.now()) {
  if (!startedAt) return "0:00";
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
