/**
 * Message drafts (messaging phase 4): unsent composer text survives a chat
 * switch, a reload and an app restart, one draft per conversation.
 *
 * Keys: "dm:<peerId>" | "group:<groupId>" | "channel:<channelId>".
 * Stored per signed-in user in one localStorage entry
 * (`descall:drafts:v1:<userId>`), so a second account on the same device
 * never sees them. Old drafts expire after DRAFT_TTL_MS; the store keeps at
 * most MAX_DRAFTS (newest win). Rows in the conversation list read the store
 * through useSyncExternalStore (subscribeDrafts / getDraftsSnapshot).
 */

export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_DRAFTS = 200;
export const MAX_DRAFT_LENGTH = 4000;
const PREFIX = "descall:drafts:v1:";

let owner = "anon";
let cache = null; // { [key]: { text, at } }
let snapshot = Object.freeze({}); // { [key]: text } (non-empty only)
const listeners = new Set();

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** "dm:<id>" / "group:<id>" / "channel:<id>", or null when nothing is open. */
export function draftKeyFor({ dmUserId = null, groupId = null, channelId = null } = {}) {
  if (dmUserId) return `dm:${dmUserId}`;
  if (groupId) return `group:${groupId}`;
  if (channelId) return `channel:${channelId}`;
  return null;
}

/** Drop expired entries and keep the newest MAX_DRAFTS. Pure. */
export function pruneDrafts(map, now = Date.now()) {
  const rows = Object.entries(map && typeof map === "object" ? map : {})
    .filter(([k, v]) => typeof k === "string" && v && typeof v.text === "string" && v.text.trim() && now - (Number(v.at) || 0) < DRAFT_TTL_MS)
    .sort((a, b) => (Number(b[1].at) || 0) - (Number(a[1].at) || 0))
    .slice(0, MAX_DRAFTS);
  return Object.fromEntries(rows.map(([k, v]) => [k, { text: v.text.slice(0, MAX_DRAFT_LENGTH), at: Number(v.at) || now }]));
}

function load() {
  if (cache) return cache;
  let parsed = {};
  try {
    const raw = storage()?.getItem(PREFIX + owner);
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  cache = pruneDrafts(parsed);
  snapshot = Object.freeze(Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, v.text])));
  return cache;
}

function persist() {
  try {
    const s = storage();
    if (!s) return;
    if (Object.keys(cache).length) s.setItem(PREFIX + owner, JSON.stringify(cache));
    else s.removeItem(PREFIX + owner);
  } catch {
    /* quota or private mode: drafts stay in memory for this session */
  }
}

function emit() {
  snapshot = Object.freeze(Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, v.text])));
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

/** Switch the store to the signed-in user (call when `me.id` is known). */
export function setDraftOwner(userId) {
  const next = userId ? String(userId) : "anon";
  if (next === owner && cache) return;
  owner = next;
  cache = null;
  load();
  emit();
}

export function readDraft(key) {
  if (!key) return "";
  return load()[key]?.text || "";
}

/** Save (or with blank text, remove) the draft of one conversation. */
export function writeDraft(key, text, now = Date.now()) {
  if (!key) return;
  const map = load();
  const value = typeof text === "string" ? text.slice(0, MAX_DRAFT_LENGTH) : "";
  const prev = map[key]?.text || "";
  if (!value.trim()) {
    if (!(key in map)) return;
    delete map[key];
  } else {
    if (prev === value) return;
    map[key] = { text: value, at: now };
    const keys = Object.keys(map);
    if (keys.length > MAX_DRAFTS) cache = pruneDrafts(map, now);
  }
  persist();
  emit();
}

export function clearDraft(key) {
  writeDraft(key, "");
}

export function subscribeDrafts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDraftsSnapshot() {
  load();
  return snapshot;
}

/** One line for the conversation list: newlines folded, trimmed, capped. */
export function draftPreview(text, max = 80) {
  const line = String(text || "").replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Test hook: forget the in-memory copy (the next read reloads storage). */
export function __resetDraftsForTest() {
  cache = null;
  owner = "anon";
  snapshot = Object.freeze({});
  listeners.clear();
}
