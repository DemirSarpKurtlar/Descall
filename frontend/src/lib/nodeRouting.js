/**
 * Hybrid server routing on the client (HYBRID-CONTRACT.md "Client").
 *
 * The backend runs on Render (primary) and, part of the day, also on the owner's PC
 * (secondary, https://pc.descall.com). This module owns the API / Socket.IO base the app
 * uses right now:
 *  - default = today's base (config/api.js: VITE_API_BASE_URL / Electron / Tauri / native);
 *  - boot asks the primary GET /api/node/assign (1.5 s timeout, fallback: the default) and
 *    keeps the answer for the tab (sessionStorage);
 *  - `node:move` (drain, rebalance, schedule, game): wait 0..jitterMs, ask assign again,
 *    switch REST + socket to the new node; the old node closes what is left;
 *  - a socket connect_error (or a server close) while on a secondary node falls back to
 *    the primary at once, and REST follows.
 * Every REST helper reads apiBase() and socket.js creates sockets on socketBase(), in the
 * web app, Electron, Tauri, iOS and Android alike. The Cloudflare edge realtime path
 * (lib/edgeRealtime.js) is separate and untouched: edge sockets are never routed here.
 * Only the primary's origin and the origins in config/nodeOrigins.js are accepted, so a
 * bad assign answer can never point the app anywhere else.
 */
import { API_BASE_URL, SOCKET_URL } from "../config/api.js";
import { NODE_ORIGINS } from "../config/nodeOrigins.js";

export const ASSIGN_TIMEOUT_MS = 1500;
export const DEFAULT_JITTER_MS = 3000;
export const MAX_JITTER_MS = 15000;
const STORE_KEY = "descall.node.v1";
const SID_KEY = "descall.node.sid";

function clean(u) {
  return String(u || "").trim().replace(/\/+$/, "");
}

function originOf(u) {
  try {
    return new URL(u).origin.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalOrigin(origin) {
  try {
    const h = new URL(origin).hostname;
    return h === "localhost" || h === "127.0.0.1";
  } catch {
    return false;
  }
}

function randomSid(random) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 22; i++) s += abc[Math.floor(random() * abc.length) % abc.length];
  return s;
}

function sessionStore() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) return window.sessionStorage;
  } catch {
    /* storage blocked */
  }
  return null;
}

/**
 * @param {object} [o]
 * @param {string} [o.primaryApi]     default REST base (config/api.js API_BASE_URL)
 * @param {string} [o.primarySocket]  default Socket.IO origin (config/api.js SOCKET_URL)
 * @param {string[]} [o.nodeOrigins]  secondary origins the app may be sent to
 * @param {Storage|null} [o.storage]  per-tab storage (sessionStorage)
 * @param {Function} [o.fetchImpl]
 */
export function createNodeRouting(o = {}) {
  const primary = { nodeId: null, api: clean(o.primaryApi ?? API_BASE_URL), socket: clean(o.primarySocket ?? SOCKET_URL) };
  const storage = o.storage === undefined ? sessionStore() : o.storage;
  const fetchImpl = o.fetchImpl || ((...a) => fetch(...a));
  const random = o.random || Math.random;
  const now = o.now || (() => Date.now());
  const setT = o.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const clearT = o.clearTimeout || ((id) => clearTimeout(id));
  const timeoutMs = o.timeoutMs ?? ASSIGN_TIMEOUT_MS;
  const log = o.log || ((...a) => console.info("[node-routing]", ...a));

  const allowed = new Set([originOf(primary.api), originOf(primary.socket), ...(o.nodeOrigins || NODE_ORIGINS).map(originOf)].filter(Boolean));
  const localDev = isLocalOrigin(primary.api);
  let current = { ...primary };
  let ready = null; // boot assign promise
  let settled = false;
  const listeners = new Set();
  const sockets = new Set();

  function read(key) {
    try {
      return storage ? storage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  function write(key, value) {
    try {
      if (!storage) return;
      if (value == null) storage.removeItem(key);
      else storage.setItem(key, value);
    } catch {
      /* quota / private mode */
    }
  }

  function sid() {
    let s = read(SID_KEY);
    if (!s || !/^[A-Za-z0-9_-]{8,64}$/.test(s)) {
      s = randomSid(random);
      write(SID_KEY, s);
    }
    return s;
  }

  /** Only the primary origin, the known node origins (and localhost in a local dev run). */
  function isAllowedNodeUrl(u) {
    const origin = originOf(u);
    if (!origin || !/^https?:/.test(origin)) return false;
    if (allowed.has(origin)) return true;
    return localDev && isLocalOrigin(origin);
  }

  function isPrimary(entry = current) {
    return clean(entry.api) === primary.api && clean(entry.socket) === primary.socket;
  }

  function set(next, why) {
    const prev = current;
    current = { nodeId: next.nodeId || null, api: clean(next.api), socket: clean(next.socket || next.api) };
    if (isPrimary(current)) write(STORE_KEY, null);
    else write(STORE_KEY, JSON.stringify({ ...current, at: now(), ttlSec: next.ttlSec || 600 }));
    if (prev.api !== current.api || prev.socket !== current.socket) {
      log(`${why}: ${current.nodeId || "primary"} ${current.api}`);
      for (const fn of listeners) {
        try {
          fn({ ...current }, { ...prev }, why);
        } catch {
          /* listener errors stay local */
        }
      }
    }
  }

  function fallbackToPrimary(why = "fallback") {
    if (!isPrimary()) set({ ...primary, nodeId: primary.nodeId }, why);
  }

  // A tab that already picked a node keeps it until boot assign confirms or replaces it.
  (() => {
    const raw = read(STORE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      const fresh = saved && now() - Number(saved.at || 0) < Math.max(60, Number(saved.ttlSec) || 600) * 1000;
      if (fresh && isAllowedNodeUrl(saved.api) && isAllowedNodeUrl(saved.socket || saved.api)) {
        current = { nodeId: saved.nodeId || null, api: clean(saved.api), socket: clean(saved.socket || saved.api) };
      } else write(STORE_KEY, null);
    } catch {
      write(STORE_KEY, null);
    }
  })();

  /** GET /api/node/assign on the primary. Resolves the answer or null (timeout / error). */
  async function assign({ prev } = {}) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer = null;
    const timeout = new Promise((resolve) => {
      timer = setT(() => {
        try {
          ctrl?.abort();
        } catch {
          /* already done */
        }
        resolve(null);
      }, timeoutMs);
    });
    const qs = new URLSearchParams({ sid: sid() });
    if (prev) qs.set("prev", prev);
    const call = (async () => {
      try {
        const res = await fetchImpl(`${primary.api}/api/node/assign?${qs}`, { method: "GET", cache: "no-store", credentials: "omit", ...(ctrl ? { signal: ctrl.signal } : {}) });
        if (!res || !res.ok) return null;
        const body = await res.json();
        return body && typeof body === "object" ? body : null;
      } catch {
        return null;
      }
    })();
    try {
      return await Promise.race([call, timeout]);
    } finally {
      clearT(timer);
    }
  }

  function apply(answer, why) {
    const url = clean(answer && answer.url);
    const socketUrl = clean((answer && answer.socketUrl) || url);
    if (!url || !isAllowedNodeUrl(url) || !isAllowedNodeUrl(socketUrl)) {
      // Single-node backend (no public URL), old backend or an unknown origin: the default.
      fallbackToPrimary(why);
      return false;
    }
    if (originOf(url) === originOf(primary.api)) {
      primary.nodeId = answer.nodeId || primary.nodeId;
      fallbackToPrimary(why);
      if (!current.nodeId) current.nodeId = primary.nodeId;
      return true;
    }
    set({ nodeId: answer.nodeId, api: url, socket: socketUrl, ttlSec: answer.ttlSec }, why);
    return true;
  }

  /** Boot: ask once (max 1.5 s); afterwards ready() resolves at once. */
  function init() {
    if (ready) return ready;
    ready = (async () => {
      const answer = await assign({ prev: current.nodeId || undefined });
      if (answer) apply(answer, "assign");
      else fallbackToPrimary("assign-timeout");
      settled = true;
      return { ...current };
    })();
    return ready;
  }

  function whenReady() {
    return ready || init();
  }

  /** Reconnect one Socket.IO client to `url` (same socket object, listeners kept). */
  function switchSocket(socket, url) {
    if (!socket || !socket.io) return;
    if (clean(socket.io.uri) === clean(url)) return;
    socket.io.uri = url;
    socket.nodeMoving = true;
    const wasUp = socket.connected || socket.active;
    if (wasUp) {
      socket.disconnect();
      socket.connect();
    }
    socket.nodeMoving = false;
  }

  /** node:move from the server: jitter, assign again, switch REST + socket. */
  async function handleMove(payload = {}, socket = null) {
    const leaving = { ...current };
    const jitter = Math.min(MAX_JITTER_MS, Math.max(0, Number(payload.jitterMs ?? DEFAULT_JITTER_MS) || 0));
    await new Promise((r) => setT(r, Math.floor(random() * jitter)));
    const answer = await assign();
    let ok = false;
    if (answer && clean(answer.url) && clean(answer.url) !== leaving.api) ok = apply(answer, `move:${payload.reason || "drain"}`);
    if (!ok) {
      const to = clean(payload.toUrl);
      if (to && isAllowedNodeUrl(to) && to !== leaving.api) {
        if (originOf(to) === originOf(primary.api)) fallbackToPrimary(`move:${payload.reason || "drain"}`);
        else set({ nodeId: null, api: to, socket: to }, `move:${payload.reason || "drain"}`);
      } else fallbackToPrimary(`move:${payload.reason || "drain"}`);
    }
    const targets = socket ? [socket] : [...sockets];
    for (const s of targets) switchSocket(s, current.socket);
    return { ...current };
  }

  /**
   * Wire one Socket.IO client: the first connect waits for the boot assign, node:move is
   * followed, and a failure on a secondary node falls back to the primary.
   */
  function attach(socket) {
    if (!socket || socket.edge || socket.__nodeRouting) return socket;
    socket.__nodeRouting = true;
    sockets.add(socket);
    const origConnect = socket.connect.bind(socket);
    let gated = !settled;
    const follow = () => {
      if (socket.io && current.socket && clean(socket.io.uri) !== current.socket) socket.io.uri = current.socket;
    };
    const gatedConnect = function connectAfterAssign() {
      if (!gated) {
        follow();
        return origConnect();
      }
      gated = false;
      whenReady().then(() => {
        follow();
        origConnect();
      });
      return socket;
    };
    socket.connect = gatedConnect;
    socket.open = gatedConnect;

    socket.on("node:move", (payload) => {
      handleMove(payload || {}, socket).catch(() => {});
    });
    const toPrimary = (why) => {
      if (isPrimary() && clean(socket.io?.uri) === primary.socket) return;
      fallbackToPrimary(why);
      if (socket.io) socket.io.uri = primary.socket;
    };
    socket.on("connect_error", () => {
      if (isPrimary() && clean(socket.io?.uri) === primary.socket) return;
      toPrimary("connect_error");
      // A transport failure keeps the manager reconnecting (now to the primary). A refusal by
      // the node itself ("node draining") leaves the socket inactive: reconnect right away.
      if (!socket.active) socket.connect();
    });
    socket.on("disconnect", (reason) => {
      // The secondary closed us (end of a drain, shutdown): the next connect goes to Render.
      if (reason === "io server disconnect" && !isPrimary()) toPrimary("server-close");
    });
    const origDisconnect = socket.disconnect.bind(socket);
    socket.disconnect = socket.close = function disconnectAndForget() {
      if (!socket.nodeMoving) sockets.delete(socket);
      return origDisconnect();
    };
    return socket;
  }

  return {
    apiBase: () => current.api,
    socketBase: () => current.socket,
    primaryApiBase: () => primary.api,
    primarySocketBase: () => primary.socket,
    current: () => ({ ...current }),
    isOnSecondary: () => !isPrimary(),
    isAllowedNodeUrl,
    init,
    whenReady,
    assign,
    apply,
    handleMove,
    attach,
    fallbackToPrimary,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const routing = createNodeRouting();

/** REST base for every helper (`${apiBase()}/api/...`). */
export const apiBase = () => routing.apiBase();
/** Socket.IO origin for socket.js. */
export const socketBase = () => routing.socketBase();
export const primaryApiBase = () => routing.primaryApiBase();
export const currentNode = () => routing.current();
export const isOnSecondaryNode = () => routing.isOnSecondary();
/** Boot: GET /api/node/assign with a 1.5 s timeout (called from main.jsx). */
export const initNodeRouting = () => routing.init();
export const attachNodeRouting = (socket) => routing.attach(socket);
export const onNodeChange = (fn) => routing.onChange(fn);
export const fallbackToPrimaryNode = (why) => routing.fallbackToPrimary(why);

/**
 * REST failover: a transport failure (fetch threw, never an HTTP status) while this tab is
 * on a secondary node moves REST to the primary, so the read retry loop's next try (and
 * every later call) goes to Render. Rethrows the error unchanged.
 */
export function failoverOnTransportError(err) {
  const transport = err?.name === "TypeError" || /load failed|failed to fetch|networkerror/i.test(String(err?.message || ""));
  if (transport && routing.isOnSecondary()) routing.fallbackToPrimary("rest");
  throw err;
}
