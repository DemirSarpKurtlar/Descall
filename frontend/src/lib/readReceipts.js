/**
 * "Görüldü" read receipts, client side (messaging phase 4).
 *
 * DM: my newest message shows "Görüldü" once the other person has read it
 * (readAt from history / dm:peer_read). Group: "Görüldü: Ayşe, Mert" from
 * the members' read positions (GET /api/read-receipts/groups/:id and the
 * group:read socket event). Turning receipts off (Settings › Gizlilik) hides
 * them both ways; the server enforces it (backend/lib/readReceipts.js), the
 * client only mirrors it so the label goes away at once.
 */

const SETTING_KEY = "descall:read-receipts";
const listeners = new Set();

export function readReceiptsSetting() {
  try {
    return localStorage.getItem(SETTING_KEY) !== "0";
  } catch {
    return true;
  }
}

export function storeReceiptsSetting(on) {
  try {
    localStorage.setItem(SETTING_KEY, on ? "1" : "0");
  } catch { /* ignore */ }
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function subscribeReceiptsSetting(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const timeOf = (m) => {
  const t = Date.parse(m?.timestamp || m?.created_at || "");
  return Number.isFinite(t) ? t : 0;
};
const senderOf = (m) => String(m?.from?.id || m?.sender?.id || m?.sender_id || m?.senderId || "");

/** My newest delivered message (not an unsent optimistic row, not a system row). */
export function lastOwnMessage(messages, myId) {
  if (!myId || !Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || m.type === "call_summary" || m.type === "member_removed" || m.type === "member_left" || m.isGameMessage) continue;
    if (senderOf(m) !== String(myId)) continue;
    if (m.sending || String(m.id || "").startsWith("temp-")) return null;
    return m;
  }
  return null;
}

/** { id, at } for the DM "Görüldü" line, or null. Only my newest message carries it. */
export function dmSeen(messages, myId) {
  const own = lastOwnMessage(messages, myId);
  if (!own?.readAt) return null;
  return { id: own.id, at: own.readAt };
}

/** Members (not me) whose read position is at or after my newest message. */
export function groupSeenBy({ messages, myId, reads = [], members = [] }) {
  const own = lastOwnMessage(messages, myId);
  if (!own) return null;
  const sent = timeOf(own);
  const byId = new Map((members || []).map((u) => [String(u.id || u.userId), u]));
  const names = [];
  for (const r of reads || []) {
    if (!r?.userId || String(r.userId) === String(myId)) continue;
    const at = Date.parse(r.at || "");
    if (!Number.isFinite(at) || at < sent) continue;
    const u = byId.get(String(r.userId));
    if (!u) continue; // left the group
    names.push(u.displayName || u.display_name || u.username || "");
  }
  if (!names.length) return null;
  const others = (members || []).filter((u) => String(u.id || u.userId) !== String(myId)).length;
  return { id: own.id, names: names.filter(Boolean), everyone: others > 0 && names.length >= others };
}

/** "Ayşe, Mert" or "Ayşe, Mert +2" (at most `max` names). */
export function namesSummary(names, max = 2) {
  const list = (names || []).filter(Boolean);
  if (list.length <= max) return { shown: list.join(", "), more: 0 };
  return { shown: list.slice(0, max).join(", "), more: list.length - max };
}

export const GROUP_MARK_READ_MS = 2500;
