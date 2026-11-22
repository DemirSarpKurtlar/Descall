/**
 * Duyurular for members (remake Nov 2026): one store for the window, the
 * unread badges and the in-app toast.
 *
 *  - GET /api/announcements/feed: filtered for this person on the server
 *    (audience, language version with English fallback, platform, expiry)
 *  - real time: announcement:new / :updated / :changed / :removed (and the old
 *    :deleted) refresh the list; important and urgent ones raise a toast;
 *    announcement:test is the admin's "send to me first"
 *  - seen (shown on screen), read (stayed in view in the window) and click
 *    marks are batched; they only feed the admin counts
 *  - CTA: app paths open inside the app, https opens a new tab
 */

import { getToken } from "./storage.js";
import { apiBase as routedApiBase } from "./nodeRouting.js";
import { isDesktopRuntime } from "./desktopShell.js";

const LANGS = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

const listeners = new Set();
let state = { items: [], unread: 0, loaded: false, loading: false, error: "", toasts: [], lang: null };
let cfg = { apiBase: null, token: null, lang: null, platform: null, fetch: null };
let refreshTimer = null;
let inflight = null;
let navigator = null;
let detach = null;
let loadedAt = 0;
const pending = { seen: new Set(), read: new Set(), timer: null };
const toastSeen = new Set();

function emit() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* listener errors stay local */
    }
  }
}

function set(patch) {
  state = { ...state, ...patch };
  emit();
}

export function subscribeAnnouncements(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAnnouncementsState() {
  return state;
}

export function normLang(raw) {
  const s = String(raw || "").trim().replace("_", "-");
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "pt-br" || lower === "pt") return "pt-BR";
  const two = lower.slice(0, 2);
  return LANGS.includes(two) ? two : null;
}

export function detectPlatform(win = typeof window !== "undefined" ? window : null) {
  if (!win) return "web";
  try {
    if (isDesktopRuntime(win, win.navigator?.userAgent || "")) return "desktop";
    const cap = win.Capacitor?.getPlatform?.();
    if (cap === "ios") return "ios";
    if (cap === "android") return "android";
  } catch {
    /* web */
  }
  return "web";
}

function storedLang() {
  try {
    return normLang(window.localStorage?.getItem("descall_language") || document.documentElement.lang);
  } catch {
    return null;
  }
}

export function configureAnnouncements(next = {}) {
  const before = cfg.lang;
  cfg = { ...cfg, ...next };
  if (next.lang !== undefined && normLang(next.lang) !== normLang(before) && state.loaded) scheduleRefresh(50);
}

function apiBase() {
  return (cfg.apiBase || routedApiBase() || "").replace(/\/$/, "");
}

function token() {
  return cfg.token ?? getToken();
}

function doFetch(...a) {
  return (cfg.fetch || fetch)(...a);
}

/** Unread = shown in the list but not read yet. */
export function unreadOf(items) {
  return (items || []).filter((a) => !a.read).length;
}

/** Pinned first in the admin's order, then the newest (the server already sorts; kept for local edits). */
export function sortItems(items) {
  return [...(items || [])].sort((a, b) => {
    if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1;
    if (a.pinned && b.pinned) return (Number(a.pinOrder) || 999) - (Number(b.pinOrder) || 999);
    return (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0);
  });
}

/** Expired ones disappear right away, even before the server says so. */
export function visibleItems(items, now = Date.now()) {
  return (items || []).filter((a) => !a.endsAt || Date.parse(a.endsAt) > now);
}

export async function refreshAnnouncements() {
  const tk = token();
  if (!tk) return state;
  if (inflight) return inflight;
  const lang = normLang(cfg.lang) || storedLang() || "en";
  const platform = cfg.platform || detectPlatform();
  set({ loading: true });
  inflight = (async () => {
    try {
      const res = await doFetch(`${apiBase()}/api/announcements/feed?lang=${encodeURIComponent(lang)}&platform=${encodeURIComponent(platform)}`, {
        headers: { Authorization: `Bearer ${tk}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const items = sortItems(visibleItems(Array.isArray(data.announcements) ? data.announcements : []));
      loadedAt = Date.now();
      set({ items, unread: unreadOf(items), loaded: true, loading: false, error: "", lang: data.lang || lang });
    } catch (err) {
      set({ loading: false, error: err?.message || "error", loaded: state.loaded });
    } finally {
      inflight = null;
    }
    return state;
  })();
  return inflight;
}

function scheduleRefresh(delay = 400) {
  if (refreshTimer) clearTimeout(refreshTimer);
  // Spread the reloads of many open apps after one publish.
  const jitter = Math.round(Math.random() * 900);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshAnnouncements();
  }, delay + jitter);
}

/* ---------------- toasts ---------------- */

export function pushToast(item) {
  if (!item?.id || toastSeen.has(item.id)) return;
  toastSeen.add(item.id);
  set({ toasts: [...state.toasts.filter((t) => t.id !== item.id), { ...item, at: Date.now() }].slice(-3) });
}

export function dismissToast(id) {
  set({ toasts: state.toasts.filter((t) => t.id !== id) });
}

/* ---------------- marks ---------------- */

function flush() {
  pending.timer = null;
  const tk = token();
  if (!tk) return;
  const lang = normLang(cfg.lang) || storedLang() || "en";
  const platform = cfg.platform || detectPlatform();
  const send = (path, ids) => {
    if (!ids.length) return;
    doFetch(`${apiBase()}/api/announcements/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids, lang, platform }),
    }).catch(() => {});
  };
  const real = (id) => !String(id).startsWith("test-");
  send("seen", [...pending.seen].filter(real));
  send("read", [...pending.read].filter(real));
  pending.seen.clear();
  pending.read.clear();
}

function queue(kind, ids) {
  for (const id of ids || []) if (id) pending[kind].add(String(id));
  if (!pending.timer) pending.timer = setTimeout(flush, 800);
}

export function markSeen(ids) {
  const fresh = (ids || []).filter((id) => state.items.some((a) => a.id === id && !a.seen));
  if (!fresh.length) return;
  set({ items: state.items.map((a) => (fresh.includes(a.id) ? { ...a, seen: true } : a)) });
  queue("seen", fresh);
}

export function markRead(ids) {
  const fresh = (ids || []).filter((id) => state.items.some((a) => a.id === id && !a.read));
  if (!fresh.length) return;
  const items = state.items.map((a) => (fresh.includes(a.id) ? { ...a, seen: true, read: true } : a));
  set({ items, unread: unreadOf(items) });
  queue("read", fresh);
}

/* ---------------- CTA ---------------- */

export function setAnnouncementNavigator(fn) {
  navigator = typeof fn === "function" ? fn : null;
}

/** Kind of a button link: app path, own site, external. */
export function ctaKind(url) {
  const s = String(url || "").trim();
  if (!s) return "none";
  if (s.startsWith("/") && !s.startsWith("//")) return "app";
  if (/^https:\/\/([a-z0-9-]+\.)*descall\.com(\/|$|\?)/i.test(s)) return "own";
  if (/^https:\/\//i.test(s)) return "external";
  return "none";
}

export function openAnnouncementCta(item, win = typeof window !== "undefined" ? window : null) {
  const url = String(item?.ctaUrl || "").trim();
  if (!url || !win) return false;
  if (item?.id && !String(item.id).startsWith("test-")) {
    const tk = token();
    if (tk) doFetch(`${apiBase()}/api/announcements/${encodeURIComponent(item.id)}/click`, { method: "POST", headers: { Authorization: `Bearer ${tk}` } }).catch(() => {});
    set({ items: state.items.map((a) => (a.id === item.id ? { ...a, clicked: true, seen: true } : a)) });
  }
  const kind = ctaKind(url);
  if (kind === "app") {
    const [path, query = ""] = url.split("?");
    if (path === "/feedback") {
      const type = new URLSearchParams(query).get("type") || "suggestion";
      win.dispatchEvent(new CustomEvent("descall:open-feedback", { detail: { type, source: "announcement", tab: "new" } }));
      return true;
    }
    if (navigator && /^\/(settings|servers|friends|activity|direct|groups|calls)(\/|$)/.test(path)) {
      navigator(url);
      return true;
    }
    win.location.assign(url);
    return true;
  }
  if (kind === "own" || kind === "external") {
    win.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

/* ---------------- socket ---------------- */

export function attachAnnouncementsSocket(socket) {
  if (detach) detach();
  if (!socket || typeof socket.on !== "function") return () => {};
  const onNew = (p = {}) => {
    if (p?.toast && p?.id) pushToast(p);
    scheduleRefresh(0);
  };
  const onChange = () => scheduleRefresh(200);
  const onRemoved = (p = {}) => {
    if (p?.id) {
      const items = state.items.filter((a) => a.id !== p.id);
      set({ items, unread: unreadOf(items), toasts: state.toasts.filter((t) => t.id !== p.id) });
    }
    scheduleRefresh(600);
  };
  const onTest = (p = {}) => {
    if (p?.id) {
      toastSeen.delete(p.id);
      pushToast({ ...p, test: true });
    }
  };
  // The attach below already loads the feed; the socket's first connect comes
  // a moment later at app open and loaded it a second time. Skip that one when
  // the feed is fresh; every later reconnect reloads (events may have been missed).
  let firstConnect = true;
  const onConnect = () => {
    const first = firstConnect;
    firstConnect = false;
    if (first && (inflight || (state.loaded && Date.now() - loadedAt < 15000))) return;
    scheduleRefresh(1500);
  };
  socket.on("announcement:new", onNew);
  socket.on("announcement:updated", onChange);
  socket.on("announcement:changed", onChange);
  socket.on("announcement:removed", onRemoved);
  socket.on("announcement:deleted", onRemoved);
  socket.on("announcement:test", onTest);
  socket.on("connect", onConnect);
  refreshAnnouncements();
  detach = () => {
    try {
      socket.off?.("announcement:new", onNew);
      socket.off?.("announcement:updated", onChange);
      socket.off?.("announcement:changed", onChange);
      socket.off?.("announcement:removed", onRemoved);
      socket.off?.("announcement:deleted", onRemoved);
      socket.off?.("announcement:test", onTest);
      socket.off?.("connect", onConnect);
    } catch {
      /* socket gone */
    }
    detach = null;
  };
  return detach;
}

/** Tests only. */
export function __resetAnnouncements() {
  state = { items: [], unread: 0, loaded: false, loading: false, error: "", toasts: [], lang: null };
  cfg = { apiBase: null, token: null, lang: null, platform: null, fetch: null };
  toastSeen.clear();
  pending.seen.clear();
  pending.read.clear();
  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = null;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  inflight = null;
  navigator = null;
  if (detach) detach();
}
