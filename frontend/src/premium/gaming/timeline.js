/**
 * Activity timeline builder (Ultra, pure). Merges, for one local day:
 *  - calls from GET /api/calls ({ kind, startedAt, endedAt, durationSeconds, peer, group })
 *  - game sessions from the server (user_activity_log rows, app_type "game") and the local log
 *  - key local events ({ at, kind, label }: profile switch, clip saved, automation fired)
 * Items are clipped to the day, game sessions from both sources are de-duplicated and
 * back-to-back pieces of the same game are joined.
 */

const DAY_MS = 86_400_000;
const JOIN_GAP_MS = 5 * 60_000;

function ms(v) {
  if (v == null || v === "") return NaN;
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Local-day bounds [start, end) for a "YYYY-MM-DD" string (or a Date). */
export function dayBounds(day) {
  let d;
  if (day instanceof Date) d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  else {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
    const now = new Date();
    d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const start = d.getTime();
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return { start, end: next || start + DAY_MS };
}

export function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function span(startV, endV, durationSec) {
  const s = ms(startV);
  let e = ms(endV);
  if (!Number.isFinite(e) && Number.isFinite(s) && Number(durationSec) > 0) e = s + Number(durationSec) * 1000;
  if (!Number.isFinite(s)) return null;
  if (!Number.isFinite(e) || e < s) e = s;
  return { s, e };
}

function clip(item, bounds) {
  const s = Math.max(item.start, bounds.start);
  const e = Math.min(item.end, bounds.end);
  if (e < s || item.end < bounds.start || item.start >= bounds.end) return null;
  return { ...item, start: s, end: e, durationSec: Math.round((e - s) / 1000) };
}

function gameName(row) {
  return String(row.game || row.app_name || row.appName || row.name || "").trim();
}

/** Join game sessions: same game, overlapping or within JOIN_GAP_MS. */
export function mergeGameSessions(rows) {
  const list = (rows || [])
    .map((r) => {
      const sp = span(r.started_at ?? r.startedAt ?? r.start, r.ended_at ?? r.endedAt ?? r.end, r.duration_sec ?? r.durationSec);
      const game = gameName(r);
      return sp && game ? { game, start: sp.s, end: sp.e } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const g of list) {
    const prev = [...out].reverse().find((x) => x.game.toLowerCase() === g.game.toLowerCase());
    if (prev && g.start <= prev.end + JOIN_GAP_MS) {
      prev.end = Math.max(prev.end, g.end);
      continue;
    }
    out.push({ ...g });
  }
  return out;
}

/**
 * buildTimeline({ day, calls, games, events, labels }) ->
 *   { day, start, end, items: [{ kind, start, end, durationSec, label, sub }], summary }
 * labels: { dmCall(name), groupCall(name), unknown } optional formatters for call titles.
 */
export function buildTimeline({ day, calls = [], games = [], events = [], labels = {} } = {}) {
  const bounds = dayBounds(day);
  const items = [];

  for (const c of calls) {
    const sp = span(c.startedAt ?? c.started_at, c.endedAt ?? c.ended_at, c.durationSeconds ?? c.duration_seconds);
    if (!sp || sp.e === sp.s) continue; // missed / declined calls have no time on the line
    const name = c.kind === "group" ? (c.group?.name || c.name || "") : (c.peer?.displayName || c.peer?.username || "");
    const label = c.kind === "group" ? (labels.groupCall ? labels.groupCall(name) : name) : (labels.dmCall ? labels.dmCall(name) : name);
    const it = clip({ kind: "call", start: sp.s, end: sp.e, label: label || labels.unknown || "", sub: c.callType || "" }, bounds);
    if (it) items.push(it);
  }

  for (const g of mergeGameSessions(games)) {
    const it = clip({ kind: "game", start: g.start, end: g.end, label: g.game, sub: "" }, bounds);
    if (it) items.push(it);
  }

  for (const ev of events) {
    const at = ms(ev.at);
    if (!Number.isFinite(at) || at < bounds.start || at >= bounds.end) continue;
    items.push({ kind: "event", start: at, end: at, durationSec: 0, label: String(ev.label || ""), sub: String(ev.kind || "") });
  }

  items.sort((a, b) => a.start - b.start || (a.kind === "event") - (b.kind === "event"));
  const sum = (k) => items.filter((i) => i.kind === k).reduce((n, i) => n + i.durationSec, 0);
  return {
    day: dayKey(new Date(bounds.start)),
    start: bounds.start,
    end: bounds.end,
    items,
    summary: { gameSec: sum("game"), callSec: sum("call"), calls: items.filter((i) => i.kind === "call").length, games: items.filter((i) => i.kind === "game").length, events: items.filter((i) => i.kind === "event").length },
  };
}
