/**
 * Game status + game session history data. Server: /api/premium/gaming/* (entitlement
 * checked there, rows from user_activity_log). Local: sessions this device saw end, kept
 * so the history works offline and before the server has the row.
 */
import { authedRequest } from "../../api/authedHttp.js";
import { readLocal, writeLocal } from "./bridge.js";

const LOCAL = "gameSessions";
const LOCAL_CAP = 500;
const EMPTY = [];

export function localSessions() {
  return readLocal(LOCAL, EMPTY);
}

/** Pure: track the current game; returns { state, ended } when a session closes. */
export function stepGame(state, game, nowMs = Date.now()) {
  const cur = state?.game || null;
  const next = game || null;
  if (cur === next) return { state: state || { game: null, since: 0 }, ended: null, started: null };
  const ended = cur ? { game: cur, started_at: new Date(state.since).toISOString(), ended_at: new Date(nowMs).toISOString(), duration_sec: Math.round((nowMs - state.since) / 1000) } : null;
  return { state: { game: next, since: next ? nowMs : 0 }, ended, started: next };
}

export function recordLocalSession(s) {
  if (!s || !s.game || s.duration_sec < 60) return;
  writeLocal(LOCAL, [{ ...s, source: "local" }, ...localSessions()].slice(0, LOCAL_CAP));
}

export async function fetchGameSessions({ days = 30, from, to } = {}) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - days * 86_400_000);
  const q = `from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}&limit=1000`;
  try {
    const body = await authedRequest(`/api/premium/gaming/sessions?${q}`);
    return { sessions: Array.isArray(body?.sessions) ? body.sessions : [], stats: body?.stats || null, ok: true };
  } catch (err) {
    return { sessions: [], stats: null, ok: false, error: err?.status || "network" };
  }
}

/** Server sessions plus local ones the server does not have yet (same game, start within 2 min). */
export function mergeSessions(server = [], local = []) {
  const out = [...server];
  for (const l of local) {
    const t = Date.parse(l.started_at);
    if (!out.some((s) => s.game === l.game && Math.abs(Date.parse(s.started_at) - t) < 120_000)) out.push(l);
  }
  return out.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

export function totalsByGame(sessions) {
  const by = new Map();
  for (const s of sessions) {
    const cur = by.get(s.game) || { game: s.game, totalSec: 0, count: 0 };
    cur.totalSec += Number(s.duration_sec) || 0;
    cur.count += 1;
    by.set(s.game, cur);
  }
  return [...by.values()].sort((a, b) => b.totalSec - a.totalSec);
}

const statusCache = new Map();
export async function fetchGameStatus(userId) {
  if (!userId) return null;
  const hit = statusCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  let value = null;
  try {
    const body = await authedRequest(`/api/premium/gaming/status/${encodeURIComponent(userId)}`);
    value = body?.status || null;
  } catch {
    value = null;
  }
  statusCache.set(userId, { at: Date.now(), value });
  return value;
}

export async function fetchGamePrefs() {
  try { return await authedRequest("/api/premium/gaming/prefs"); } catch { return null; }
}

export async function saveGamePrefs(gameCard) {
  return authedRequest("/api/premium/gaming/prefs", { method: "PUT", body: { game_card: gameCard } });
}
