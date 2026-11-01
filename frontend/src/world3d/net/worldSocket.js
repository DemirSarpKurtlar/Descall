/**
 * /world namespace client. A separate connection straight to the Render backend
 * (never through the Cloudflare edge hub: 10 Hz movement would burn its quota),
 * opened only while the world view is open.
 */
import { io } from "socket.io-client";

export function connectWorld({ url, token, app = "web", path = "/socket.io" } = {}) {
  const socket = io(`${url.replace(/\/$/, "")}/world`, {
    auth: { token, app },
    path,
    transports: ["websocket"],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 15000,
  });

  function join(kind, id) {
    return new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => {
        if (!done) resolve({ ok: false, error: "timeout" });
      }, 10000);
      socket.emit("world:join", { kind, id: String(id) }, (res) => {
        done = true;
        clearTimeout(t);
        resolve(res || { ok: false, error: "no_reply" });
      });
    });
  }

  function sendSnapshot(snap) {
    if (socket.connected) socket.volatile.emit("world:snap", snap);
  }

  function sendChat(text) {
    return new Promise((resolve) => socket.emit("world:chat", { text }, (res) => resolve(res || { ok: false })));
  }

  function close() {
    try {
      socket.emit("world:leave");
    } catch {
      /* closing anyway */
    }
    socket.close();
  }

  return { socket, join, sendSnapshot, sendChat, close };
}

export function appPlatform() {
  if (typeof window === "undefined") return "web";
  if (window.electronAPI?.isElectron || /Electron/i.test(navigator.userAgent || "")) return "electron";
  return "web";
}
