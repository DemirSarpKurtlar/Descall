import { io } from "socket.io-client";
import { SOCKET_URL } from "./config/api";
import { getDmMessages } from "./api/dmPrefs";

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
  const { transports = ["polling", "websocket"] } = options;

  const opts = {
    auth: { token },
    autoConnect: false,
    transports,
    withCredentials: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 20000,
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
  // App loads servers/groups inside the `connected` handler. Don't wait for the
  // live socket — fire that handler as soon as listeners are registered.
  setTimeout(() => {
    if (typeof socket.emitEvent === "function") {
      socket.emitEvent(["connected", {}]);
    }
  }, 0);
  return socket;
}
