/**
 * Notification rule engine for focus_mode, notification_profiles and
 * smart_game_notifications. Pure: the caller passes the notification, the
 * user's settings and the current situation; decide() says what to do.
 *
 * Categories (from the notification's data.type):
 *   call      incoming DM / group call            (urgent, never hidden by Descall+ rules)
 *   dm        direct message (also missed call)
 *   mention   @mention anywhere
 *   group     group message
 *   server    server channel message
 *   social    friend request / online / message request
 *   system    announcements and everything else
 */

export const CATEGORIES = Object.freeze(["call", "dm", "mention", "group", "server", "social", "system"]);
export const ACTIVITIES = Object.freeze(["default", "gaming", "working"]);
export const STYLES = Object.freeze(["capsule", "toast"]);

export function categoryOf(data = {}) {
  const type = String(data?.type || "");
  if (type === "call" || type === "group-call") return "call";
  if (type === "dm" || type === "missed-call") return "dm";
  if (type === "mention" || type === "group-mention") return "mention";
  if (type === "group") return "group";
  if (type === "server-message" || type === "server-owner") return "server";
  if (type === "friend-request" || type === "friend-online" || type === "message-request") return "social";
  return "system";
}

/** A rule for one category: { show, sound }. */
function rule(show, sound) {
  return Object.freeze({ show, sound });
}

/** Default profiles. style: how a shown notification looks on desktop. */
export const DEFAULT_PROFILES = Object.freeze({
  default: Object.freeze({
    style: "capsule",
    rules: Object.freeze({ call: rule(true, true), dm: rule(true, true), mention: rule(true, true), group: rule(true, true), server: rule(true, true), social: rule(true, false), system: rule(true, false) }),
  }),
  gaming: Object.freeze({
    style: "capsule",
    rules: Object.freeze({ call: rule(true, true), dm: rule(true, false), mention: rule(true, false), group: rule(false, false), server: rule(false, false), social: rule(false, false), system: rule(false, false) }),
  }),
  working: Object.freeze({
    style: "toast",
    rules: Object.freeze({ call: rule(true, true), dm: rule(true, true), mention: rule(true, true), group: rule(true, false), server: rule(false, false), social: rule(false, false), system: rule(true, false) }),
  }),
});

/** Merge the user's stored profile over the default one, field by field. */
export function resolveProfile(activity, stored = {}) {
  const id = ACTIVITIES.includes(activity) ? activity : "default";
  const base = DEFAULT_PROFILES[id];
  const user = stored && typeof stored === "object" ? stored[id] || {} : {};
  const rules = {};
  for (const cat of CATEGORIES) {
    const u = user.rules?.[cat] || {};
    rules[cat] = {
      show: typeof u.show === "boolean" ? u.show : base.rules[cat].show,
      sound: typeof u.sound === "boolean" ? u.sound : base.rules[cat].sound,
    };
  }
  // Calls are never hidden by a profile (they ring in the app anyway).
  rules.call.show = true;
  return { id, style: STYLES.includes(user.style) ? user.style : base.style, rules };
}

/**
 * Current activity for profile selection.
 *   mode: 'auto' | 'default' | 'gaming' | 'working'
 *   gameActive: a game is detected (activity scan)
 *   schedule: { workingDays:[0..6], start:'09:00', end:'18:00' } | null
 */
export function currentActivity({ mode = "auto", gameActive = false, schedule = null, now = new Date() } = {}) {
  if (mode !== "auto") return ACTIVITIES.includes(mode) ? mode : "default";
  if (gameActive) return "gaming";
  if (schedule && inSchedule(schedule, now)) return "working";
  return "default";
}

function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Local-time schedule check; supports windows that cross midnight. */
export function inSchedule(schedule, now = new Date()) {
  const days = Array.isArray(schedule?.workingDays) ? schedule.workingDays : [1, 2, 3, 4, 5];
  const start = minutesOf(schedule?.start);
  const end = minutesOf(schedule?.end);
  if (start == null || end == null || start === end) return false;
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (start < end) return days.includes(day) && mins >= start && mins < end;
  // Overnight: the part after midnight belongs to the previous day.
  if (mins >= start) return days.includes(day);
  return days.includes((day + 6) % 7) && mins < end;
}

/** Focus mode: active until `until` (ms epoch). */
export function focusActive(focus = {}, nowMs = Date.now()) {
  return Boolean(focus && Number(focus.until) > nowMs);
}

/**
 * The decision for one notification.
 * ctx = {
 *   data, requireInteraction, nowMs,
 *   features: { focus_mode, notification_profiles, smart_game_notifications } (entitled and on),
 *   focus: { until, allowCalls (default true), allowDms },
 *   profiles: stored profile overrides, profileMode,
 *   schedule, gameActive (a game / fullscreen app is in front), appFocused
 * }
 * Returns { show, sound, style, defer, reason, category }.
 *   defer: keep it for the summary after the game (smart game notifications)
 */
export function decide(ctx = {}) {
  const category = categoryOf(ctx.data);
  const urgent = category === "call" || Boolean(ctx.requireInteraction);
  const f = ctx.features || {};
  const nowMs = Number(ctx.nowMs) || Date.now();
  let out = { show: true, sound: true, style: "capsule", defer: false, reason: "default", category };

  if (f.notification_profiles) {
    const activity = currentActivity({ mode: ctx.profileMode || "auto", gameActive: Boolean(ctx.gameActive), schedule: ctx.schedule || null, now: new Date(nowMs) });
    const profile = resolveProfile(activity, ctx.profiles);
    const r = profile.rules[category];
    out = { ...out, show: r.show, sound: r.sound, style: profile.style, reason: `profile:${profile.id}` };
  }

  if (f.focus_mode && focusActive(ctx.focus, nowMs)) {
    const allowCalls = ctx.focus?.allowCalls !== false;
    const allowDms = Boolean(ctx.focus?.allowDms);
    const pass = (category === "call" && allowCalls) || (category === "dm" && allowDms);
    if (!pass) return { ...out, show: false, sound: false, defer: false, reason: "focus" };
    out = { ...out, sound: false, reason: "focus-allowed" };
  }

  if (f.smart_game_notifications && ctx.gameActive && !ctx.appFocused && !urgent) {
    // A game is in front: hold non-urgent ones for a summary afterwards.
    if (out.show) return { ...out, show: false, sound: false, defer: true, reason: "game-deferred" };
  }

  if (urgent) out = { ...out, show: true };
  return out;
}

/** Summary text parts for deferred notifications: { count, people:[names] }. */
export function summarizeDeferred(items = []) {
  const people = [];
  for (const it of items) {
    const name = String(it?.from || it?.title || "").trim();
    if (name && !people.includes(name)) people.push(name);
  }
  return { count: items.length, people: people.slice(0, 3), more: Math.max(0, people.length - 3) };
}
