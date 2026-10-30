import { getDeviceId } from "./lib/deviceId";
import { io } from "socket.io-client";
import { SOCKET_URL } from "./config/api";
import { getDmMessages } from "./api/dm";
import { shouldPullDmHistory } from "./lib/dmHistoryFetch";
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

function appPlatform() {
  if (isElectronRuntime()) return "electron";
  try {
    if (Capacitor.getPlatform() === "android") return "android";
    if (Capacitor.getPlatform() === "ios") return "ios";
  } catch {
    /* web */
  }
  return "web";
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

// 2.11.7 boot diet: hash of the friend list this page already shows, per token
// (a new login = new token = full list). App.jsx sets it from `boot:hash`.
const bootHashByToken = new Map();
export function rememberBootFriendsHash(token, hash) {
  bootHashByToken.clear();
  if (token && typeof hash === "string" && hash) bootHashByToken.set(token, hash);
}
export function forgetBootHashes() {
  bootHashByToken.clear();
}

export function createSocket(token, options = {}) {
  // Dev visual harness only. Vite replaces import.meta.env.DEV with false in
  // production builds, so this branch (and any call into the page hook) is
  // removed from the shipped bundle.
  if (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    typeof window.__DESCALL_GLASS_QA_SOCKET__ === "function"
  ) {
    return window.__DESCALL_GLASS_QA_SOCKET__(token, options);
  }
  const local = isLocalVite();
  const native = isNativeApp();
  const edgeUrl = typeof options.edgeUrl === "string" && options.edgeUrl ? options.edgeUrl : null;
  // Native shells: WebSocket first. One handshake instead of polling + upgrade,
  // and it never reuses a pooled keep-alive HTTP connection that died while
  // the phone was locked (that stalled reconnects for a full 20 s timeout).
  // tryAllTransports falls back to polling if WebSocket can't open.
  const {
    transports = edgeUrl ? ["websocket"] : native ? ["websocket", "polling"] : ["polling", "websocket"],
  } = options;

  const opts = {
    // presence: 2 = this build merges `presence:delta` (2.11.4, scoped roster).
    // app = platform for the edge rollout (2.11.6).
    // Function form: re-read on every (re)connect so the boot-diet hash is current.
    auth: (cb) => {
      // device: install id for Erişim yasakları (3.5.0, lib/deviceId.js).
      const base = isNativeIOS()
        ? { token, platform: "ios", presence: 2, app: "ios", device: getDeviceId() }
        : { token, presence: 2, app: appPlatform(), device: getDeviceId() };
      const bootFriends = bootHashByToken.get(token);
      cb(bootFriends ? { ...base, bootFriends } : base);
    },
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
    tryAllTransports: !edgeUrl,
  };
  if (edgeUrl) {
    // Cloudflare Hub (2.11.6): WebSocket only; the token rides in the
    // subprotocol so the Worker can check it before the Hub is involved.
    opts.protocols = ["descall.v1", `jwt.${token}`];
    // A few quick tries; App.jsx falls back to Render after two failures.
    opts.reconnectionDelayMax = 5000;
  }
  // Render (and local Express) mount Socket.IO at /socket.io.
  // Do not use /api/socket.io, that was the Vercel Fluid rewrite.
  if (!local) {
    opts.path = "/socket.io";
  }

  const socket = io(edgeUrl || SOCKET_URL, opts);
  socket.edge = Boolean(edgeUrl);
  const origEmit = socket.emit;
  socket.emit = function patchedEmit(event, ...args) {
    const ret = origEmit.apply(this, [event, ...args]);
    if (shouldPullDmHistory(event, socket.connected)) {
      const withUserId = args[0] && args[0].withUserId;
      if (withUserId) pullDmHistory(this, withUserId);
    }
    return ret;
  };
  // Foreground watchdog: reconnect at once (no backoff) when the app comes
  // back with a dead / zombie socket. Dispose via socket.resumeWatchdog.
  socket.resumeWatchdog = installSocketResumeWatchdog(socket);
  // App loads servers/groups inside the `connected` handler. Don't wait for the
  // live socket, fire that handler as soon as listeners are registered.
  setTimeout(() => {
    if (typeof socket.emitEvent === "function") {
      socket.emitEvent(["connected", {}]);
    }
  }, 0);
  return socket;
}
