"use strict";

/**
 * Maintenance windows: DB access, audit log, realtime fan-out and the ticker
 * that announces status changes (scheduled → active → completed) to every
 * socket via `maintenance:state`, plus `maintenance:ended` when a window ends.
 */

const m = require("./maintenance");

const TABLE = "maintenance_windows";
const AUDIT = "maintenance_audit";

function createMaintenanceService({ supabase, getIo = () => null, now = () => Date.now(), log = console } = {}) {
  let rows = [];
  let loaded = false;
  let lastPublic = null;
  let timer = null;
  const notified = new Set();

  async function reload() {
    const { data, error } = await supabase.from(TABLE).select("*").order("starts_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message || "maintenance load failed");
    rows = data || [];
    loaded = true;
    return rows;
  }

  async function ensure() {
    if (!loaded) await reload();
    return rows;
  }

  function publicState() {
    return m.publicView(m.currentWindow(rows, now()), now());
  }

  function emitState(force = false) {
    const pub = publicState();
    const key = JSON.stringify(pub);
    if (!force && key === lastPublic) return pub;
    lastPublic = key;
    const io = getIo();
    if (io) io.emit("maintenance:state", { maintenance: pub, serverTime: new Date(now()).toISOString() });
    return pub;
  }

  async function audit(windowId, actor, action, details = {}) {
    const row = {
      window_id: windowId,
      action,
      actor_id: actor?.id || null,
      actor_username: actor?.username || null,
      details,
      created_at: new Date(now()).toISOString(),
    };
    const { error } = await supabase.from(AUDIT).insert(row);
    if (error) log.warn?.("[maintenance] audit insert failed:", error.message);
  }

  async function finishIfDue() {
    const t = now();
    for (const r of rows) {
      if (m.statusOf(r, t) !== "completed" || r.cancelled_at || notified.has(r.id) || r.end_notified_at) continue;
      if (t - new Date(r.ended_at || r.ends_at).getTime() > 10 * 60_000) { notified.add(r.id); continue; }
      notified.add(r.id);
      const patch = { end_notified_at: new Date(t).toISOString() };
      if (!r.ended_at) patch.ended_at = r.ends_at;
      Object.assign(r, patch);
      await supabase.from(TABLE).update(patch).eq("id", r.id);
      const io = getIo();
      if (io) io.emit("maintenance:ended", { id: r.id, notify: Boolean(r.notify_on_end), title: r.title });
    }
  }

  async function tick() {
    try {
      await ensure();
      await finishIfDue();
      emitState();
    } catch (err) {
      log.warn?.("[maintenance] tick:", err?.message || err);
    }
  }

  function start(intervalMs = 5000) {
    if (timer) return;
    tick();
    timer = setInterval(tick, intervalMs);
    timer.unref?.();
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function overview({ recentlyActiveUsers = null } = {}) {
    await reload();
    const t = now();
    const cur = m.currentWindow(rows, t);
    const ids = rows.slice(0, 20).map((r) => r.id);
    let events = [];
    if (ids.length) {
      const { data } = await supabase.from(AUDIT).select("*").in("window_id", ids).order("created_at", { ascending: false }).limit(30);
      events = (data || []).map((e) => ({
        id: e.id,
        windowId: e.window_id,
        action: e.action,
        actorUsername: e.actor_username,
        details: e.details || {},
        at: e.created_at,
      }));
    }
    return {
      serverTime: new Date(t).toISOString(),
      current: m.adminView(cur, t),
      history: rows.slice(0, 6).map((r) => m.adminView(r, t)),
      events,
      summary: m.buildSummary(rows, { now: t, recentlyActiveUsers }),
      options: { platforms: m.PLATFORMS, announceMinutes: m.ANNOUNCE_OPTIONS },
    };
  }

  function fail(status, code) {
    const e = new Error(code);
    e.status = status;
    e.code = code;
    return e;
  }

  async function findRow(id) {
    await reload();
    const row = rows.find((r) => r.id === id);
    if (!row) throw fail(404, "not_found");
    return row;
  }

  async function create(body, actor) {
    await reload();
    const v = m.validateInput(body, { now: now() });
    if (!v.ok) throw fail(400, v.code);
    if (m.findOverlap(rows, v.value, { now: now() })) throw fail(409, "overlap");
    const ts = new Date(now()).toISOString();
    const row = { ...v.value, original_ends_at: v.value.ends_at, created_by: actor.id, created_by_username: actor.username, created_at: ts, updated_at: ts };
    const { data, error } = await supabase.from(TABLE).insert(row).select("*").single();
    if (error) throw fail(500, "db_error");
    const saved = data || row;
    rows.unshift(saved);
    await audit(saved.id, actor, "created", { startsAt: saved.starts_at, endsAt: saved.ends_at, kind: saved.kind, platforms: saved.platforms });
    emitState(true);
    return m.adminView(saved, now());
  }

  async function update(id, body, actor) {
    const row = await findRow(id);
    const st = m.statusOf(row, now());
    if (st !== "scheduled" && st !== "active") throw fail(409, "not_editable");
    if (st === "active" && body.startsAt !== undefined && new Date(body.startsAt).getTime() !== new Date(row.starts_at).getTime())
      throw fail(409, "already_started");
    const v = m.validateInput(body, { existing: row, now: now() });
    if (!v.ok) throw fail(400, v.code);
    if (m.findOverlap(rows, v.value, { ignoreId: id, now: now() })) throw fail(409, "overlap");
    const changed = {};
    for (const [k, val] of Object.entries(v.value)) {
      if (JSON.stringify(row[k]) !== JSON.stringify(val)) changed[k] = { from: row[k] ?? null, to: val };
    }
    if (!Object.keys(changed).length) return m.adminView(row, now());
    const patch = { ...v.value, updated_at: new Date(now()).toISOString() };
    const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
    if (error) throw fail(500, "db_error");
    Object.assign(row, patch);
    const action = changed.starts_at || changed.ends_at ? (changed.message && Object.keys(changed).length === 1 ? "message_edited" : "dates_edited") : changed.message ? "message_edited" : "settings_edited";
    await audit(id, actor, action, { changed: Object.keys(changed), ...(changed.starts_at ? { startsAt: changed.starts_at } : {}), ...(changed.ends_at ? { endsAt: changed.ends_at } : {}) });
    emitState(true);
    return m.adminView(row, now());
  }

  async function extend(id, minutes, actor) {
    const row = await findRow(id);
    if (m.statusOf(row, now()) !== "active") throw fail(409, "not_active");
    const min = Math.round(Number(minutes));
    if (!Number.isFinite(min) || min < 5 || min > m.MAX_EXTEND_MIN) throw fail(400, "invalid_minutes");
    const endsAt = new Date(new Date(row.ends_at).getTime() + min * 60_000).toISOString();
    if (m.findOverlap(rows, { starts_at: row.starts_at, ends_at: endsAt }, { ignoreId: id, now: now() })) throw fail(409, "overlap");
    const patch = { ends_at: endsAt, updated_at: new Date(now()).toISOString() };
    const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
    if (error) throw fail(500, "db_error");
    const from = row.ends_at;
    Object.assign(row, patch);
    await audit(id, actor, "extended", { minutes: min, from, to: endsAt });
    emitState(true);
    return m.adminView(row, now());
  }

  async function endNow(id, actor) {
    const row = await findRow(id);
    if (m.statusOf(row, now()) !== "active") throw fail(409, "not_active");
    const ts = new Date(now()).toISOString();
    const patch = { ended_at: ts, updated_at: ts };
    const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
    if (error) throw fail(500, "db_error");
    Object.assign(row, patch);
    await audit(id, actor, "ended_early", { plannedEnd: row.ends_at, endedAt: ts });
    await finishIfDue();
    emitState(true);
    return m.adminView(row, now());
  }

  async function cancel(id, reason, actor) {
    const row = await findRow(id);
    const st = m.statusOf(row, now());
    if (st !== "scheduled") throw fail(409, st === "active" ? "use_end_now" : "not_cancellable");
    const ts = new Date(now()).toISOString();
    const why = m.cleanText(reason, m.MAX_REASON) || null;
    const patch = { cancelled_at: ts, cancelled_by: actor.id, cancelled_by_username: actor.username, cancel_reason: why, updated_at: ts };
    const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
    if (error) throw fail(500, "db_error");
    Object.assign(row, patch);
    await audit(id, actor, "cancelled", { reason: why });
    emitState(true);
    return m.adminView(row, now());
  }

  return { reload, ensure, publicState, emitState, tick, start, stop, overview, create, update, extend, endNow, cancel, _rows: () => rows };
}

module.exports = { createMaintenanceService };
