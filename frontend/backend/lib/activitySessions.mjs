/**
 * Activity session grouping.
 *
 * Fragmented play (process scanner dropping a game for a few seconds) is
 * stored as many user_activity_log rows. Those rows are never deleted to
 * "merge" them — reads group them, and a new POST extends the latest
 * matching row when the gap is still inside the window.
 */

export const SESSION_GAP_MS = 5 * 60 * 1000;
export const MIN_SESSION_SEC = 30;

export function sessionKey(row) {
  if (!row) return "";
  const manual = row.is_manual ? "1" : "0";
  const type = String(row.app_type || "app").trim().toLowerCase();
  const name = String(row.app_name || row.display_name || "").trim().toLowerCase();
  return `${manual}|${type}|${name}`;
}

function toMs(value) {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : NaN;
}

export function sessionEndMs(row) {
  const end = toMs(row?.ended_at);
  if (Number.isFinite(end)) return end;
  const start = toMs(row?.started_at);
  const dur = Number(row?.duration_sec);
  if (Number.isFinite(start) && Number.isFinite(dur) && dur > 0) return start + dur * 1000;
  return start;
}

export function sessionsCanMerge(prev, next, gapMs = SESSION_GAP_MS) {
  if (!prev || !next) return false;
  if (sessionKey(prev) !== sessionKey(next)) return false;
  const prevStart = toMs(prev.started_at);
  const nextStart = toMs(next.started_at);
  if (!Number.isFinite(prevStart) || !Number.isFinite(nextStart)) return false;
  const earlier = prevStart <= nextStart ? prev : next;
  const later = earlier === prev ? next : prev;
  const earlierEnd = sessionEndMs(earlier);
  const laterStart = toMs(later.started_at);
  if (!Number.isFinite(earlierEnd) || !Number.isFinite(laterStart)) return false;
  return laterStart - earlierEnd <= gapMs;
}

export function mergeSessionFields(prev, next) {
  const prevStart = toMs(prev.started_at);
  const nextStart = toMs(next.started_at);
  const earlier = !Number.isFinite(nextStart) || prevStart <= nextStart ? prev : next;
  const later = earlier === prev ? next : prev;
  const ends = [sessionEndMs(prev), sessionEndMs(next)].filter(Number.isFinite);
  const latestEnd = ends.length ? Math.max(...ends) : NaN;
  return {
    ...earlier,
    app_name: earlier.app_name || later.app_name,
    app_type: earlier.app_type || later.app_type,
    display_name: earlier.display_name || later.display_name,
    started_at: earlier.started_at,
    ended_at: Number.isFinite(latestEnd) ? new Date(latestEnd).toISOString() : (later.ended_at || earlier.ended_at),
    duration_sec: (Number(prev.duration_sec) || 0) + (Number(next.duration_sec) || 0),
    is_manual: !!(prev.is_manual || next.is_manual),
    segment_count: (Number(prev.segment_count) || 1) + (Number(next.segment_count) || 1),
  };
}

/**
 * Group same-game rows whose gap (or overlap) is <= gapMs.
 * Duration is the sum of the recorded segments. The range is the earliest
 * start through the latest end. Other games in between do not block a merge.
 * Grouping an already-grouped list is idempotent.
 */
export function groupActivitySessions(rows, gapMs = SESSION_GAP_MS) {
  const buckets = new Map();
  for (const row of rows || []) {
    if (!row) continue;
    const key = sessionKey(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  const merged = [];
  for (const group of buckets.values()) {
    const sorted = [...group].sort((a, b) => toMs(a.started_at) - toMs(b.started_at));
    let acc = null;
    for (const row of sorted) {
      const next = { ...row, segment_count: Number(row.segment_count) || 1 };
      if (!acc) {
        acc = next;
        continue;
      }
      if (sessionsCanMerge(acc, next, gapMs)) acc = mergeSessionFields(acc, next);
      else {
        merged.push(acc);
        acc = next;
      }
    }
    if (acc) merged.push(acc);
  }

  merged.sort((a, b) => toMs(b.started_at) - toMs(a.started_at));
  return merged;
}

/** Newest same-game row a new session should extend, or null to insert. */
export function findExtendTarget(existingRows, incoming, gapMs = SESSION_GAP_MS) {
  const key = sessionKey(incoming);
  const candidates = (existingRows || []).filter((row) => sessionKey(row) === key);
  candidates.sort((a, b) => sessionEndMs(b) - sessionEndMs(a));
  for (const row of candidates) {
    if (sessionsCanMerge(row, incoming, gapMs)) return row;
  }
  return null;
}

export function playingName(label) {
  const match = /^Playing\s+(.+)$/.exec(String(label || "").trim());
  return match ? match[1] : null;
}

export function formatActivityRange(startedAt, endedAt, locale = "en", timeZone) {
  const start = new Date(startedAt);
  if (!Number.isFinite(start.getTime())) return "";
  const end = endedAt ? new Date(endedAt) : null;
  const loc = locale === "tr" ? "tr-TR" : "en-US";
  const tz = timeZone ? { timeZone } : {};
  const timeFmt = new Intl.DateTimeFormat(loc, { hour: "2-digit", minute: "2-digit", ...tz });
  const time = (d) => timeFmt.format(d);
  if (!end || !Number.isFinite(end.getTime())) return time(start);
  const dayKey = (d) => new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", ...tz,
  }).format(d);
  if (dayKey(start) === dayKey(end) && time(start) === time(end)) return time(start);
  if (dayKey(start) === dayKey(end)) return `${time(start)}–${time(end)}`;
  const dayFmt = new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", ...tz });
  return `${dayFmt.format(start)} ${time(start)}–${dayFmt.format(end)} ${time(end)}`;
}

function makeLog(session, endedAtMs) {
  const playedMs = session.segmentStartMs != null
    ? session.playedMs + Math.max(0, endedAtMs - session.segmentStartMs)
    : session.playedMs;
  return {
    appName: session.appName,
    startedAt: new Date(session.startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    durationSec: Math.round(playedMs / 1000),
    meta: session.meta || null,
  };
}

export function shouldLogSession(log) {
  return !!log && Number(log.durationSec) >= MIN_SESSION_SEC;
}

/**
 * Electron scan step. A dropped detection clears presence immediately but
 * does not log until the gap exceeds SESSION_GAP_MS or another app starts.
 * Coming back to the same app inside the window resumes the original start.
 */
export function stepActivityScan(state, tick) {
  const nowMs = tick.nowMs;
  const name = tick.appName || null;
  let active = state?.active || null;
  let paused = state?.paused || null;
  let log = null;

  if (paused) {
    const gap = nowMs - paused.pausedAtMs;
    if (name && name === paused.appName && gap <= SESSION_GAP_MS) {
      active = {
        appName: paused.appName,
        startedAtMs: paused.startedAtMs,
        segmentStartMs: nowMs,
        playedMs: paused.playedMs,
        meta: paused.meta || null,
      };
      return {
        state: { active, paused: null },
        emit: "update",
        log: null,
        startedAt: new Date(active.startedAtMs).toISOString(),
      };
    }
    if (!name && gap <= SESSION_GAP_MS) {
      return { state: { active: null, paused }, emit: null, log: null };
    }
    log = makeLog(paused, paused.pausedAtMs);
    paused = null;
  }

  if (active && name === active.appName) {
    return { state: { active, paused: null }, emit: null, log };
  }

  if (active && !name) {
    paused = {
      appName: active.appName,
      startedAtMs: active.startedAtMs,
      pausedAtMs: nowMs,
      playedMs: active.playedMs + Math.max(0, nowMs - active.segmentStartMs),
      meta: active.meta || null,
    };
    return { state: { active: null, paused }, emit: "clear", log };
  }

  if (active && name && name !== active.appName) {
    log = makeLog(active, nowMs);
    active = {
      appName: name,
      startedAtMs: nowMs,
      segmentStartMs: nowMs,
      playedMs: 0,
      meta: tick.meta || null,
    };
    return {
      state: { active, paused: null },
      emit: "update",
      log,
      startedAt: new Date(nowMs).toISOString(),
    };
  }

  if (!active && name) {
    active = {
      appName: name,
      startedAtMs: nowMs,
      segmentStartMs: nowMs,
      playedMs: 0,
      meta: tick.meta || null,
    };
    return {
      state: { active, paused: null },
      emit: "update",
      log,
      startedAt: new Date(nowMs).toISOString(),
    };
  }

  return { state: { active: null, paused: null }, emit: null, log };
}

/** Close an open or paused session (quit, manual status, unload). */
export function closeActivityScan(state, nowMs) {
  const active = state?.active;
  const paused = state?.paused;
  if (paused) return { log: makeLog(paused, paused.pausedAtMs) };
  if (active) return { log: makeLog(active, nowMs) };
  return { log: null };
}
