import { io } from "socket.io-client";
import { SOCKET_URL } from "./config/api";
import { getDmMessages } from "./api/dmPrefs";
import { Capacitor } from "@capacitor/core";
import { isNativeIOS } from "./lib/platform";
import { installSocketResumeWatchdog } from "./lib/socketResume";

function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isElectronRuntime() {
  if (typeof window === "undefined") return false;
  if (window.electronAPI && window.electronAPI.isElectron) return true;
  if (typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent || "")) {
    return true;
  }
  return false;
}

function isLocalVite() {
  if (typeof window === "undefined") return false;
  if (isElectronRuntime()) return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function pullDmHistory(socket, withUserId) {
  if (!withUserId || typeof socket.emitEvent !== "function") return;
  getDmMessages(withUserId)
    .then((data) => {
      const messages = data?.messages;
      if (!Array.isArray(messages)) return;
      socket.emitEvent(["dm:history", { withUserId, messages }]);
    })
    .catch(() => {});
}

export function createSocket(token, options = {}) {
  const local = isLocalVite();
  const native = isNativeApp();
  // Native shells: WebSocket first. One handshake instead of polling + upgrade,
  // and it never reuses a pooled keep-alive HTTP connection that died while
  // the phone was locked (that stalled reconnects for a full 20 s timeout).
  // tryAllTransports falls back to polling if WebSocket can't open.
  const {
    transports = native ? ["websocket", "polling"] : ["polling", "websocket"],
  } = options;

  const opts = {
    auth: isNativeIOS() ? { token, platform: "ios" } : { token },
    autoConnect: false,
    transports,
    withCredentials: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    // Was 30 s: after a long outage a client could sit idle for up to 30 s
    // even though the server was already back.
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    timeout: 20000,
    tryAllTransports: true,
  };
  // Render (and local Express) mount Socket.IO at /socket.io.
  // Do not use /api/socket.io — that was the Vercel Fluid rewrite.
  if (!local) {
    opts.path = "/socket.io";
  }

  const socket = io(SOCKET_URL, opts);
  const origEmit = socket.emit;
  socket.emit = function patchedEmit(event, ...args) {
    const ret = origEmit.apply(this, [event, ...args]);
    if (event === "dm:set_active" || event === "dm:history") {
      const withUserId = args[0] && args[0].withUserId;
      if (withUserId) pullDmHistory(this, withUserId);
    }
    return ret;
  };
  // Foreground watchdog: reconnect at once (no backoff) when the app comes
  // back with a dead / zombie socket. Dispose via socket.resumeWatchdog.
  socket.resumeWatchdog = installSocketResumeWatchdog(socket);
  // App loads servers/groups inside the `connected` handler. Don't wait for the
  // live socket — fire that handler as soon as listeners are registered.
  setTimeout(() => {
    if (typeof socket.emitEvent === "function") {
      socket.emitEvent(["connected", {}]);
    }
  }, 0);
  return socket;
}
