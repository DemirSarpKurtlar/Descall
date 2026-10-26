/* Timed server mute (mockups 19/24: "1 saat · 8 saat · Süresiz").
 * The backend knows one per-server level (all | mentions | muted). A mute keeps
 * @mention pushes (level "mentions"), hides the server's unread badges on this device
 * and remembers the level to restore when it ends. Stored per device in localStorage. */
const KEY = "descall.serverMutes.v1";
const EVT = "descall:server-mutes";

function readAll() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
function writeAll(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    /* private mode */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* ssr */
  }
}

/** { until: ms | null (forever), prevLevel } or null. Expired entries read as null. */
export function getServerMute(serverId, now = Date.now()) {
  if (!serverId) return null;
  const m = readAll()[String(serverId)];
  if (!m) return null;
  if (m.until != null && Number(m.until) <= now) return null;
  return m;
}
export function isServerMuted(serverId, now) {
  return Boolean(getServerMute(serverId, now));
}
export function setServerMute(serverId, { durationMs = null, prevLevel = "all", now = Date.now() } = {}) {
  const all = readAll();
  const prev = all[String(serverId)];
  all[String(serverId)] = {
    until: durationMs == null ? null : now + durationMs,
    // Re-muting keeps the level from before the first mute.
    prevLevel: prev?.prevLevel || (prevLevel === "mentions" || prevLevel === "muted" ? prevLevel : "all"),
  };
  writeAll(all);
  return all[String(serverId)];
}
export function clearServerMute(serverId) {
  const all = readAll();
  const m = all[String(serverId)] || null;
  delete all[String(serverId)];
  writeAll(all);
  return m;
}
/** Entries whose time ran out: [{ serverId, prevLevel }]. Caller restores + clears. */
export function expiredServerMutes(now = Date.now()) {
  const out = [];
  for (const [serverId, m] of Object.entries(readAll())) {
    if (m && m.until != null && Number(m.until) <= now) out.push({ serverId, prevLevel: m.prevLevel || "all" });
  }
  return out;
}
export function subscribeServerMutes(cb) {
  const onStorage = (e) => { if (!e || e.key === KEY) cb(); };
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
export const MUTE_DURATIONS = { h1: 3600_000, h8: 8 * 3600_000, h24: 24 * 3600_000, forever: null };
export const __test = { KEY };
