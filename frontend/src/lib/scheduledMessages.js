/**
 * Scheduled sending, client side (messaging phase 4). Server:
 * /api/scheduled-messages (backend/lib/scheduledMessages.js) stores and sends
 * them, also while the app is closed. Here: the time presets, my pending
 * list (store + scheduled:update), and the events that open the sheet.
 *
 * Conversation: { convType: "dm"|"group"|"channel", convId, name }.
 */

export const OPEN_SCHEDULE_EVENT = "descall:schedule";
export const SCHEDULE_SENT_EVENT = "descall:schedule-sent";
export const MIN_LEAD_MS = 60 * 1000;

let items = []; // pending, sorted by sendAt
const listeners = new Set();
const emit = () => {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
};

export function subscribeScheduled(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getScheduledSnapshot() {
  return items;
}
export function setScheduled(list) {
  items = (Array.isArray(list) ? list : []).filter((x) => x?.status === "pending").sort((a, b) => Date.parse(a.sendAt) - Date.parse(b.sendAt));
  emit();
}
/** Apply one server item (create / edit / cancel / sent / failed). */
export function applyScheduled(item) {
  if (!item?.id) return;
  const rest = items.filter((x) => x.id !== item.id);
  setScheduled(item.status === "pending" ? [...rest, item] : rest);
}
export function pendingFor(list, convType, convId) {
  return (list || []).filter((x) => x.convType === convType && String(x.convId) === String(convId));
}

/** The chat the composer is in, as a schedule target. */
export function scheduleTarget({ activeDmUser, activeGroup, activeChannel, activeServer } = {}) {
  if (activeDmUser?.id) return { convType: "dm", convId: activeDmUser.id, name: activeDmUser.displayName || activeDmUser.display_name || activeDmUser.username || "" };
  if (activeGroup?.id) return { convType: "group", convId: activeGroup.id, name: activeGroup.name || "" };
  if (activeChannel?.id) return { convType: "channel", convId: activeChannel.id, serverId: activeServer?.id || activeChannel.serverId || null, name: activeChannel.name ? `#${activeChannel.name}` : "" };
  return null;
}

/**
 * Preset times, local clock: in 1 hour, tonight 21:00 (when still ahead),
 * tomorrow 09:00, next Monday 09:00.
 */
export function schedulePresets(now = new Date()) {
  const at = (d, h, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
  const out = [{ id: "1h", label: "msg4.schedule.in1h", at: new Date(now.getTime() + 60 * 60 * 1000) }];
  const tonight = at(now, 21);
  if (tonight.getTime() - now.getTime() > 30 * 60 * 1000) out.push({ id: "tonight", label: "msg4.schedule.tonight", at: tonight });
  const tomorrow = at(new Date(now.getTime() + 24 * 60 * 60 * 1000), 9);
  out.push({ id: "tomorrow", label: "msg4.schedule.tomorrow", at: tomorrow });
  const monday = new Date(now);
  monday.setDate(now.getDate() + (((8 - now.getDay()) % 7) || 7));
  const mon9 = at(monday, 9);
  if (mon9.toDateString() !== tomorrow.toDateString()) out.push({ id: "monday", label: "msg4.schedule.monday", at: mon9 });
  return out;
}

/** "YYYY-MM-DDTHH:mm" for an <input type="datetime-local"> in local time. */
export function toLocalInput(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(value) {
  const t = new Date(String(value || "")).getTime();
  return Number.isFinite(t) ? new Date(t) : null;
}

/** A time the server will take (at least a minute ahead). */
export function validSendAt(date, now = Date.now()) {
  const t = date instanceof Date ? date.getTime() : Date.parse(String(date || ""));
  return Number.isFinite(t) && t >= now + MIN_LEAD_MS - 1000;
}

export function openScheduleSheet(detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_SCHEDULE_EVENT, { detail }));
}
