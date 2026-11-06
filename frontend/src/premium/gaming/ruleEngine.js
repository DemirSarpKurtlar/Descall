/**
 * Desktop automations rule engine (Ultra). Pure: evaluate(rules, event, state) returns the
 * actions to run and the next state. Only the fixed trigger and action lists below exist;
 * there is no way to run a script, a shell command or a URL.
 *
 * Triggers: game_started, game_stopped (optional game name filter), call_joined, call_left,
 * time_window (from / to "HH:MM", optional weekdays 0-6, overnight allowed), idle (minutes).
 * Actions: switch_profile, focus (on / off), set_status, open_hud.
 */

export const TRIGGERS = ["game_started", "game_stopped", "call_joined", "call_left", "time_window", "idle"];
export const ACTIONS = ["switch_profile", "focus", "set_status", "open_hud"];
export const STATUSES = ["online", "idle", "dnd", "invisible"];
export const HUDS = ["voice_hud", "gaming_hud"];
export const MAX_RULES = 20;
export const COOLDOWN_MS = 30_000;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(hhmm) {
  const m = HHMM.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** True when `now` (Date) is inside [from, to) local time; overnight windows wrap. */
export function inTimeWindow(now, from, to, days) {
  const a = minutesOf(from);
  const b = minutesOf(to);
  if (a == null || b == null || a === b) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();
  const okDays = Array.isArray(days) && days.length ? days.map(Number) : null;
  if (a < b) return cur >= a && cur < b && (!okDays || okDays.includes(day));
  // Overnight: the part after midnight belongs to the previous day's window.
  if (cur >= a) return !okDays || okDays.includes(day);
  if (cur < b) return !okDays || okDays.includes((day + 6) % 7);
  return false;
}

function normAction(a) {
  if (!a || !ACTIONS.includes(a.type)) return null;
  if (a.type === "switch_profile") return a.profileId ? { type: a.type, profileId: String(a.profileId).slice(0, 40) } : null;
  if (a.type === "focus") return { type: a.type, on: a.on !== false };
  if (a.type === "set_status") return STATUSES.includes(a.status) ? { type: a.type, status: a.status } : null;
  if (a.type === "open_hud") return HUDS.includes(a.hud) ? { type: a.type, hud: a.hud } : null;
  return null;
}

/** Clean a rule list from storage or the editor; invalid rules and actions are dropped. */
export function normalizeRules(list) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || !r.trigger || !TRIGGERS.includes(r.trigger.type)) continue;
    const t = r.trigger;
    const trigger = { type: t.type };
    if ((t.type === "game_started" || t.type === "game_stopped") && t.game) trigger.game = String(t.game).slice(0, 80);
    if (t.type === "time_window") {
      if (minutesOf(t.from) == null || minutesOf(t.to) == null) continue;
      trigger.from = t.from;
      trigger.to = t.to;
      if (Array.isArray(t.days) && t.days.length) trigger.days = [...new Set(t.days.map(Number).filter((d) => d >= 0 && d <= 6))];
    }
    if (t.type === "idle") {
      const mins = t.minutes == null || t.minutes === "" ? NaN : Number(t.minutes);
      trigger.minutes = Math.min(240, Math.max(1, Math.round(Number.isFinite(mins) ? mins : 10)));
    }
    const actions = (Array.isArray(r.actions) ? r.actions : []).map(normAction).filter(Boolean).slice(0, 5);
    if (!actions.length) continue;
    out.push({
      id: String(r.id || `r${out.length}`).slice(0, 40),
      name: String(r.name || "").slice(0, 60),
      enabled: r.enabled !== false,
      trigger,
      actions,
    });
    if (out.length >= MAX_RULES) break;
  }
  return out;
}

function gameMatches(filter, game) {
  if (!filter) return true;
  return String(game || "").toLowerCase().includes(String(filter).toLowerCase());
}

/** Smallest idle threshold (seconds) any enabled idle rule needs, 0 when none. */
export function idleThresholdSec(rules) {
  const mins = normalizeRules(rules).filter((r) => r.enabled && r.trigger.type === "idle").map((r) => r.trigger.minutes);
  return mins.length ? Math.min(...mins) * 60 : 0;
}

export function emptyState() {
  return { lastFired: {}, inWindow: {} };
}

/**
 * event: { type: "game_started" | "game_stopped", game } | { type: "call_joined" | "call_left" }
 *        | { type: "tick", now: Date } | { type: "idle", idle: boolean, seconds }
 * Returns { fired: [{ ruleId, ruleName, action }], state }.
 */
export function evaluate(rules, event, state = emptyState(), nowMs = Date.now()) {
  const next = { lastFired: { ...(state.lastFired || {}) }, inWindow: { ...(state.inWindow || {}) } };
  const fired = [];
  if (!event || !event.type) return { fired, state: next };
  for (const rule of normalizeRules(rules)) {
    if (!rule.enabled) continue;
    const t = rule.trigger;
    let hit = false;
    if (t.type === "time_window") {
      if (event.type !== "tick") continue;
      const inside = inTimeWindow(event.now || new Date(nowMs), t.from, t.to, t.days);
      hit = inside && !next.inWindow[rule.id];
      next.inWindow[rule.id] = inside;
    } else if (t.type === "idle") {
      hit = event.type === "idle" && event.idle === true && (event.seconds == null || event.seconds >= t.minutes * 60 - 15);
    } else if (t.type === event.type) {
      hit = t.type === "game_started" || t.type === "game_stopped" ? gameMatches(t.game, event.game) : true;
    }
    if (!hit) continue;
    const last = next.lastFired[rule.id];
    if (last != null && nowMs - last < COOLDOWN_MS) continue;
    next.lastFired[rule.id] = nowMs;
    for (const action of rule.actions) fired.push({ ruleId: rule.id, ruleName: rule.name, action });
  }
  return { fired, state: next };
}
