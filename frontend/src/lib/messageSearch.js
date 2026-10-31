import { authedRequest } from "../api/authedHttp";

/**
 * Mesaj araması (3.7.7): GET /api/search/messages for the open conversation
 * (backend/routes/search.js). `conversationKey` is ChatPanel's
 * { kind: "dm", withUserId } | { kind: "group", groupId } | { kind: "server", serverId, channelId }.
 */
export const SEARCH_MIN = 2;

export function searchParams(conversationKey, q, { before = null, from = null, limit = 25 } = {}) {
  const k = conversationKey || {};
  const p = new URLSearchParams();
  if (k.kind === "dm" && k.withUserId) {
    p.set("kind", "dm");
    p.set("peerId", k.withUserId);
  } else if (k.kind === "group" && k.groupId) {
    p.set("kind", "group");
    p.set("groupId", k.groupId);
  } else if (k.kind === "server" && k.serverId && k.channelId) {
    p.set("kind", "channel");
    p.set("serverId", k.serverId);
    p.set("channelId", k.channelId);
  } else {
    return null;
  }
  p.set("q", String(q || "").trim());
  p.set("limit", String(limit));
  if (before) p.set("before", before);
  if (from) p.set("from", from);
  return p;
}

export function searchMessages(conversationKey, q, opts = {}) {
  const p = searchParams(conversationKey, q, opts);
  if (!p) return Promise.resolve({ results: [], nextBefore: null });
  return authedRequest(`/api/search/messages?${p.toString()}`, { signal: opts.signal });
}

/** Split a snippet into [before, match, after] for highlighting. */
export function snippetParts(snippet) {
  const text = String(snippet?.text || "");
  const s = Number(snippet?.start);
  const e = Number(snippet?.end);
  if (!(s >= 0 && e > s && e <= text.length)) return [text, "", ""];
  return [text.slice(0, s), text.slice(s, e), text.slice(e)];
}

/** Scroll to a loaded message and flash it. False when it is not on screen. */
export function jumpToLoadedMessage(id, root = typeof document !== "undefined" ? document : null) {
  if (!root || !id) return false;
  const safe = String(id).replace(/["\\]/g, "\\$&");
  const el = root.querySelector(`[data-message-id="${safe}"]`);
  if (!el) return false;
  try {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    el.scrollIntoView();
  }
  el.classList.remove("is-search-hit");
  // restart the flash
  void el.offsetWidth;
  el.classList.add("is-search-hit");
  setTimeout(() => el.classList.remove("is-search-hit"), 2200);
  return true;
}

/** The hit with up to 5 messages on each side (GET /api/search/context). */
export function messageContext(conversationKey, id) {
  const p = searchParams(conversationKey, "", {});
  if (!p) return Promise.resolve({ messages: [] });
  p.delete("q");
  p.delete("limit");
  p.set("id", id);
  return authedRequest(`/api/search/context?${p.toString()}`);
}
