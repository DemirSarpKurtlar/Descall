/**
 * Send a file to a chat through the existing paths: POST /api/media/upload (purpose
 * "message", the same request the composer makes) and then the normal socket send
 * (dm:send, group:message, server:channel:message). The server applies the usual size cap,
 * permissions and moderation. Used by instant clips and the quick file drop.
 *
 * Target ids: "dm:<userId>", "group:<groupId>", "channel:<serverId>:<channelId>".
 */
import { API_BASE_URL } from "../../config/api";
import { getToken } from "../../lib/storage";

export function parseTarget(id) {
  const s = String(id || "");
  let m = /^dm:([\w-]+)$/.exec(s);
  if (m) return { kind: "dm", userId: m[1] };
  m = /^group:([\w-]+)$/.exec(s);
  if (m) return { kind: "group", groupId: m[1] };
  m = /^channel:([\w-]+):([\w-]+)$/.exec(s);
  if (m) return { kind: "channel", serverId: m[1], channelId: m[2] };
  return null;
}

/** Recent chats for a picker: DMs and groups first (most recent), then text channels. */
export function recentTargets({ dms = [], groups = [], channels = [] } = {}, limit = 10) {
  const out = [];
  for (const d of dms) {
    const u = d?.user || d;
    if (u?.id) out.push({ id: `dm:${u.id}`, label: u.displayName || u.display_name || u.username || "", kind: "dm" });
  }
  for (const g of groups) if (g?.id) out.push({ id: `group:${g.id}`, label: g.name || "", kind: "group" });
  for (const c of channels) if (c?.serverId && c?.id) out.push({ id: `channel:${c.serverId}:${c.id}`, label: c.label || c.name || "", kind: "channel" });
  return out.filter((t) => t.label).slice(0, limit);
}

export async function uploadMedia(file) {
  const form = new FormData();
  form.append("purpose", "message");
  form.append("file", file, file.name);
  const res = await fetch(`${API_BASE_URL}/api/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Upload `file` and post it to `targetId` over `socket`. Resolves the upload result. */
export async function sendFileTo(socket, targetId, file, caption = "") {
  const target = parseTarget(targetId);
  if (!target || !socket) throw new Error("target");
  const up = await uploadMedia(file);
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const media = {
    mediaUrl: up.url,
    mediaType: up.mediaType,
    mimeType: up.mimeType || file.type,
    size: up.size || file.size,
    originalName: up.originalName || file.name,
  };
  if (target.kind === "dm") socket.emit("dm:send", { toUserId: target.userId, tempId, text: caption, ...media });
  else if (target.kind === "group") socket.emit("group:message", { groupId: target.groupId, tempId, content: caption, mediaUrl: media.mediaUrl, mediaType: media.mediaType });
  else socket.emit("server:channel:message", { serverId: target.serverId, channelId: target.channelId, tempId, content: caption, mediaUrl: media.mediaUrl, mediaType: media.mediaType });
  return up;
}
