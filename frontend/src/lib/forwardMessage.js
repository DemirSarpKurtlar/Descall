/**
 * Forwarding (messaging phase 4): "İlet" in the message menu sends a copy of
 * a message to up to FORWARD_MAX_TARGETS chats through the normal send events
 * with `forwarded: true`. The server stores the mark in reply_to
 * ({ forwarded: true }, backend/lib/forwardedMessage.js) and never the
 * original author; bubbles show "İletildi".
 */

export const FORWARD_MAX_TARGETS = 5;
/** Gap between sends: the DM rate limit is 200 ms per sender. */
export const FORWARD_STAGGER_MS = 260;
export const OPEN_FORWARD_EVENT = "descall:forward-message";

const NOT_FORWARDABLE_TYPES = new Set(["call_summary", "active_call", "member_removed", "member_left"]);
const NOT_FORWARDABLE_MEDIA = new Set(["poll_v2", "poll_end", "app_card"]);

/** The forward mark the server stores in reply_to (never a real quote: no id). */
export function isForwardedMeta(meta) {
  return Boolean(meta && typeof meta === "object" && meta.forwarded === true && !meta.id);
}

export function isForwardedMessage(message) {
  return isForwardedMeta(message?.replyTo || message?.reply_to);
}

/** Text, a photo / file / GIF or a voice note can be forwarded; cards, polls and system rows cannot. */
export function canForward(message) {
  if (!message || typeof message !== "object") return false;
  const id = String(message.id || "");
  if (!id || id.startsWith("temp-") || message.sending) return false;
  if (NOT_FORWARDABLE_TYPES.has(message.type) || message.isGameMessage || message.poll || message.embed) return false;
  const mediaType = String(message.mediaType || message.media_type || "");
  if (NOT_FORWARDABLE_MEDIA.has(mediaType)) return false;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  return Boolean(text || message.mediaUrl || message.media_url);
}

/** What is copied: the content only (never reactions, reply quote or author). */
export function forwardPayload(message) {
  const mediaUrl = message.mediaUrl || message.media_url || null;
  const mediaType = message.mediaType || message.media_type || null;
  const out = { text: typeof message.text === "string" ? message.text : "" };
  if (mediaUrl) {
    out.mediaUrl = mediaUrl;
    out.mediaType = mediaType;
    if (message.mimeType || message.mime_type) out.mimeType = message.mimeType || message.mime_type;
    if (message.size ?? message.file_size) out.size = message.size ?? message.file_size;
    if (message.originalName || message.original_name) out.originalName = message.originalName || message.original_name;
    if (message.duration != null) out.duration = message.duration;
  }
  return out;
}

const VOICE_PREFIX = "__voice__:";

/**
 * [event, payload] for one target. Targets: { kind: "dm", id } |
 * { kind: "group", id } | { kind: "channel", id, serverId }.
 */
export function forwardEmit(target, payload, tempId) {
  const isVoice = payload.mediaType === "voice" || payload.mediaType === "audio";
  const content = isVoice ? `${VOICE_PREFIX}${Math.max(1, Math.round(Number(payload.duration) || 1))}` : payload.text || "";
  const media = payload.mediaUrl
    ? { mediaUrl: payload.mediaUrl, mediaType: isVoice ? "voice" : payload.mediaType, duration: payload.duration }
    : {};
  if (target.kind === "dm") {
    return ["dm:send", {
      toUserId: target.id,
      tempId,
      text: content,
      ...media,
      ...(payload.mediaUrl ? { mimeType: payload.mimeType, size: payload.size, originalName: payload.originalName } : {}),
      forwarded: true,
    }];
  }
  if (target.kind === "group") {
    return ["group:message", { groupId: target.id, tempId, content, ...media, forwarded: true }];
  }
  if (target.kind === "channel") {
    return ["server:channel:message", { serverId: target.serverId, channelId: target.id, tempId, content, ...media, forwarded: true }];
  }
  return null;
}

/** A note typed in the sheet goes as a normal message after the forward. */
export function noteEmit(target, note, tempId) {
  const text = String(note || "").trim().slice(0, 2000);
  if (!text) return null;
  if (target.kind === "dm") return ["dm:send", { toUserId: target.id, tempId, text }];
  if (target.kind === "group") return ["group:message", { groupId: target.id, tempId, content: text }];
  if (target.kind === "channel") return ["server:channel:message", { serverId: target.serverId, channelId: target.id, tempId, content: text }];
  return null;
}

/** Every emit for a forward, in send order. */
export function planForward(targets, message, note = "", makeId = defaultTempId) {
  const payload = forwardPayload(message);
  const out = [];
  for (const target of (targets || []).slice(0, FORWARD_MAX_TARGETS)) {
    const a = forwardEmit(target, payload, makeId("fwd"));
    if (a) out.push(a);
    const b = noteEmit(target, note, makeId("fwdnote"));
    if (b) out.push(b);
  }
  return out;
}

function defaultTempId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Sends a plan with a small gap (rate limits); resolves with the number of emits. */
export function runForwardPlan(emit, plan, { stagger = FORWARD_STAGGER_MS, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  return plan.reduce(
    (p, [event, data], i) => p.then(async () => {
      if (i > 0) await wait(stagger);
      emit(event, data);
      return i + 1;
    }),
    Promise.resolve(0),
  );
}

/** Ask the app shell to open the forward sheet for `message`. */
export function openForwardSheet(message) {
  if (typeof window === "undefined" || !canForward(message)) return;
  window.dispatchEvent(new CustomEvent(OPEN_FORWARD_EVENT, { detail: { message } }));
}

/** Search and order the targets shown in the sheet. */
export function forwardTargets({ friends = [], groups = [], channels = [], query = "", fold = (s) => String(s || "").toLocaleLowerCase("tr") } = {}) {
  const q = fold(query).trim();
  const hit = (...vals) => !q || vals.some((v) => v && fold(v).includes(q));
  const out = [];
  for (const f of friends) {
    if (!f?.id) continue;
    const name = f.displayName || f.display_name || f.username || "";
    if (hit(name, f.username)) out.push({ kind: "dm", id: f.id, key: `dm:${f.id}`, name, sub: f.username ? `@${f.username}` : "", user: f });
  }
  for (const g of groups) {
    if (!g?.id || g.removed) continue;
    if (hit(g.name)) out.push({ kind: "group", id: g.id, key: `group:${g.id}`, name: g.name || "", sub: "", group: g });
  }
  for (const c of channels) {
    if (!c?.id) continue;
    if (hit(c.name, c.serverName)) out.push({ kind: "channel", id: c.id, serverId: c.serverId, key: `channel:${c.id}`, name: `#${c.name}`, sub: c.serverName || "" });
  }
  return out;
}
