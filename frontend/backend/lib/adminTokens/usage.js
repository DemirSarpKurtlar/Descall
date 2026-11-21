"use strict";

/**
 * Admin Token usage tracking and anomaly alerts.
 *
 * Low overhead by design: record() only touches memory (a ring buffer of the last
 * RING_MAX calls per token, hourly counters, the address book and per-minute buckets).
 * flush() writes in batches every FLUSH_MS: one upsert per (token, hour) and
 * (token, address), the token's last-used fields and request counter, and a bounded tail
 * of calls (at most CALLS_PER_FLUSH ordinary calls per token plus every destructive one).
 *
 * Alerts (admin_api_token_alerts):
 *  - new_ip / new_country: checked before the request runs (checkAddress), against the
 *    addresses the token used in the last 7 days. The first address a token ever uses is
 *    not an alert. A new country is reported instead of a new IP when both apply.
 *  - burst: after the request, when the last 5 minutes hold at least BURST_MIN requests
 *    and more than BURST_FACTOR times the token's usual 5-minute rate (the hour before).
 * When the owner's auto-pause switch and the matching rule are on, the token is paused at
 * once (a new-address request is refused). The owner gets a live socket event and an
 * e-mail (at most one per token per 10 minutes).
 */

const core = require("./core");
const store = require("./store");

const RING_MAX = 200;
const FLUSH_MS = 15 * 1000;
const CALLS_PER_FLUSH = 10;
const DESTRUCTIVE_PER_FLUSH = 200;
const KNOWN_DAYS = 7;
const BURST_WINDOW_MIN = 5;
const BURST_BASELINE_MIN = 60;
const BURST_MIN = 50;
const BURST_FACTOR = 10;
const BURST_COOLDOWN_MS = 15 * 60 * 1000;
const EMAIL_EVERY_MS = 10 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
const CALL_RETENTION_DAYS = 7;
const HOURLY_RETENTION_DAYS = 90;
const IP_RETENTION_DAYS = 30;

const recent = new Map(); // tokenId -> Call[] newest first
const hourlyPending = new Map(); // `${tokenId}|${hour}` -> delta
const ipsPending = new Map(); // `${tokenId}|${ip}` -> { token_id, ip, country, first_at, last_at, count }
const touchPending = new Map(); // tokenId -> { last_used_at, last_used_ip, last_used_country, last_client, count }
let callsPending = []; // rows for admin_api_token_calls
const known = new Map(); // tokenId -> { ready: Promise, ips: Map(ip -> { country, lastAt }) }
const minutes = new Map(); // tokenId -> Map(minuteIndex -> count)
const lastBurst = new Map(); // tokenId -> ms
const lastEmail = new Map(); // tokenId -> ms
let flushTimer = null;
let flushing = null;
let lastPruneAt = 0;
let ioRef = null;
let mailOverride = null;
let seq = 0;

function setIo(io) {
  if (io && typeof io.to === "function") ioRef = io;
}

function getIo() {
  return ioRef;
}

function callId(now) {
  seq = (seq + 1) % 1e6;
  return `c_${now.toString(36)}_${seq.toString(36)}`;
}

/* ---------------- address book (new IP / new country) ---------------- */

function knownFor(tokenId) {
  let k = known.get(tokenId);
  if (k) return k;
  k = { ips: new Map(), ready: null };
  k.ready = (async () => {
    try {
      const since = new Date(Date.now() - KNOWN_DAYS * 86400e3).toISOString();
      const res = await store.db().from(store.TABLES.ips).select("ip, country, last_at").eq("token_id", tokenId).gte("last_at", since).limit(1000);
      if (!res?.error) for (const r of res.data || []) k.ips.set(r.ip, { country: r.country || null, lastAt: Date.parse(r.last_at) || 0 });
    } catch {
      /* an empty book only means no alert for the first address */
    }
  })();
  known.set(tokenId, k);
  if (known.size > 500) known.delete(known.keys().next().value);
  return k;
}

/**
 * Before a token request runs: is the address new for this token? Raises the alert and,
 * per the owner's auto-pause rules, pauses the token.
 * @returns {Promise<{ paused: boolean, alert: object|null }>}
 */
async function checkAddress(row, { ip, country, now = Date.now() }) {
  if (!row?.id || !ip || ip === "unknown") return { paused: false, alert: null };
  // Loopback: this server calling itself (the admin agent's tools); never a new address.
  if (/^(127\.|::1$)/.test(String(ip))) return { paused: false, alert: null };
  const k = knownFor(row.id);
  await k.ready;
  const cutoff = now - KNOWN_DAYS * 86400e3;
  for (const [addr, v] of k.ips) if (v.lastAt && v.lastAt < cutoff) k.ips.delete(addr);
  const seen = k.ips.get(ip);
  if (seen) {
    seen.lastAt = now;
    if (country && !seen.country) seen.country = country;
    return { paused: false, alert: null };
  }
  const hadAny = k.ips.size > 0;
  const countries = new Set([...k.ips.values()].map((v) => v.country).filter(Boolean));
  const previousIp = row.last_used_ip && row.last_used_ip !== ip ? row.last_used_ip : [...k.ips.entries()].sort((a, b) => b[1].lastAt - a[1].lastAt)[0]?.[0] || null;
  const previousCountry = row.last_used_country || [...countries][0] || null;
  k.ips.set(ip, { country: country || null, lastAt: now });
  if (!hadAny) return { paused: false, alert: null };
  const kind = country && countries.size > 0 && !countries.has(country) ? "new_country" : "new_ip";
  const detail = kind === "new_country" ? { previousIp, previousCountry } : { previousIp, previousCountry: previousCountry || null };
  const out = await raiseAlert(row, { kind, ip, country: country || null, detail, now });
  return { paused: Boolean(out?.autoPaused), alert: out?.alert || null };
}

/* ---------------- recording ---------------- */

/**
 * Record one finished call (never throws).
 * @param {object} c { tokenId, at?, method, path, status, ms, ip, country, via, tool, destructiveKind, auditId, client, row? }
 */
function record(c) {
  try {
    if (!c?.tokenId) return null;
    const now = c.at ? Date.parse(c.at) || Date.now() : Date.now();
    const at = new Date(now).toISOString();
    const kind = c.destructiveKind || null;
    const call = {
      id: callId(now),
      at,
      method: String(c.method || "GET").toUpperCase().slice(0, 10),
      path: String(c.path || "/").slice(0, 200),
      status: Number(c.status) || 0,
      ms: Math.max(0, Math.round(Number(c.ms) || 0)),
      ip: c.ip && c.ip !== "unknown" ? String(c.ip).slice(0, 64) : null,
      country: c.country || null,
      via: c.via === "mcp" ? "mcp" : "rest",
      tool: c.tool ? String(c.tool).slice(0, 80) : null,
      destructive: Boolean(kind),
      destructiveKind: kind,
      auditId: c.auditId ? String(c.auditId).slice(0, 80) : null,
    };
    let ring = recent.get(c.tokenId);
    if (!ring) {
      ring = [];
      recent.set(c.tokenId, ring);
    }
    ring.unshift(call);
    if (ring.length > RING_MAX) ring.length = RING_MAX;

    const hk = `${c.tokenId}|${core.hourKey(now)}`;
    const h = hourlyPending.get(hk) || { count: 0, errors: 0, mcp: 0, destructive: 0, d_ban: 0, d_delete: 0, d_descoin: 0, d_broadcast: 0, ms_total: 0, ms_max: 0 };
    h.count += 1;
    if (call.status >= 400 || call.status === 0) h.errors += 1;
    if (call.via === "mcp") h.mcp += 1;
    if (kind) {
      h.destructive += 1;
      h[`d_${kind}`] = (h[`d_${kind}`] || 0) + 1;
    }
    h.ms_total += call.ms;
    h.ms_max = Math.max(h.ms_max, call.ms);
    hourlyPending.set(hk, h);

    if (call.ip) {
      const ik = `${c.tokenId}|${call.ip}`;
      const ipRow = ipsPending.get(ik) || { token_id: c.tokenId, ip: call.ip, country: call.country, first_at: at, last_at: at, count: 0 };
      ipRow.count += 1;
      ipRow.last_at = at;
      if (call.country) ipRow.country = call.country;
      ipsPending.set(ik, ipRow);
    }

    const t = touchPending.get(c.tokenId) || { count: 0 };
    t.count += 1;
    t.last_used_at = at;
    if (call.ip) t.last_used_ip = call.ip;
    if (call.country) t.last_used_country = call.country;
    if (c.client) t.last_client = String(c.client).slice(0, 60);
    touchPending.set(c.tokenId, t);

    const tokenCalls = callsPending.filter((r) => r.token_id === c.tokenId);
    const ordinary = tokenCalls.filter((r) => !r.destructive).length;
    const heavy = tokenCalls.length - ordinary;
    if (kind ? heavy < DESTRUCTIVE_PER_FLUSH : ordinary < CALLS_PER_FLUSH) {
      callsPending.push({
        token_id: c.tokenId,
        at,
        method: call.method,
        path: call.path,
        status: call.status,
        ms: call.ms,
        ip: call.ip,
        country: call.country,
        via: call.via,
        tool: call.tool,
        destructive: call.destructive,
        destructive_kind: kind,
        audit_id: call.auditId,
      });
    }

    noteMinute(c.tokenId, now);
    if (c.row) checkBurst(c.row, now, { ip: call.ip, country: call.country }).catch(() => {});
    scheduleFlush();
    return call;
  } catch {
    return null;
  }
}

function noteMinute(tokenId, now) {
  let m = minutes.get(tokenId);
  if (!m) {
    m = new Map();
    minutes.set(tokenId, m);
  }
  const idx = Math.floor(now / 60000);
  m.set(idx, (m.get(idx) || 0) + 1);
  const oldest = idx - BURST_WINDOW_MIN - BURST_BASELINE_MIN - 1;
  for (const k of m.keys()) if (k < oldest) m.delete(k);
}

/** { count (last 5 min), baseline (usual 5-min count over the hour before) } */
function burstStats(tokenId, now = Date.now()) {
  const m = minutes.get(tokenId) || new Map();
  const idx = Math.floor(now / 60000);
  let count = 0;
  for (let i = 0; i < BURST_WINDOW_MIN; i += 1) count += m.get(idx - i) || 0;
  let before = 0;
  for (let i = BURST_WINDOW_MIN; i < BURST_WINDOW_MIN + BURST_BASELINE_MIN; i += 1) before += m.get(idx - i) || 0;
  const baseline = before / (BURST_BASELINE_MIN / BURST_WINDOW_MIN);
  return { count, baseline: Math.round(baseline * 10) / 10 };
}

async function checkBurst(row, now = Date.now(), { ip = null, country = null } = {}) {
  const { count, baseline } = burstStats(row.id, now);
  if (count < BURST_MIN || count <= BURST_FACTOR * baseline) return null;
  if (now - (lastBurst.get(row.id) || 0) < BURST_COOLDOWN_MS) return null;
  lastBurst.set(row.id, now);
  return raiseAlert(row, { kind: "burst", ip: ip || row.last_used_ip || null, country: country || row.last_used_country || null, detail: { count, windowMin: BURST_WINDOW_MIN, baseline }, now });
}

/* ---------------- alerts ---------------- */

function ruleOn(settings, kind) {
  if (!settings?.enabled) return false;
  if (kind === "new_country") return Boolean(settings.rules?.newCountry || settings.rules?.newIp);
  if (kind === "new_ip") return Boolean(settings.rules?.newIp);
  if (kind === "burst") return Boolean(settings.rules?.burst);
  return false;
}

/** Contract Alert shape. */
function alertView(a, tokenName = null) {
  return {
    id: a.id,
    tokenId: a.token_id,
    tokenName: tokenName ?? a.token_name ?? null,
    kind: a.kind,
    ip: a.ip || null,
    country: a.country || null,
    detail: a.detail && typeof a.detail === "object" ? a.detail : {},
    createdAt: a.created_at,
    status: a.status || "open",
    autoPaused: Boolean(a.auto_paused),
  };
}

async function raiseAlert(row, { kind, ip, country, detail, now = Date.now() }) {
  let autoPaused = false;
  try {
    const settings = await store.getSettings();
    if (ruleOn(settings, kind) && !row.paused && !row.revoked_at) {
      await store.updateToken(row.id, { paused: true, paused_at: new Date(now).toISOString(), paused_reason: `auto:${kind}` });
      autoPaused = true;
      try {
        require("./auth").dropLiveConnections(row.id, "paused");
      } catch {
        /* no live connections */
      }
      try {
        require("../../runtime/sharedState").appendAudit(null, "system", "security_token_auto_pause", `token:${row.id}`, { name: row.name, kind, ip: ip || null, country: country || null });
      } catch {
        /* audit optional */
      }
    }
    const saved = await store.insertAlert({
      token_id: row.id,
      kind,
      ip: ip || null,
      country: country || null,
      detail: detail || {},
      status: "open",
      auto_paused: autoPaused,
      created_at: new Date(now).toISOString(),
    });
    const alert = alertView(saved, row.name);
    notifyOwner(row, alert);
    return { alert, autoPaused };
  } catch (err) {
    if (err?.code !== "TOKENS_UNAVAILABLE") console.warn("[admin-tokens] alert failed:", err?.message || err);
    return { alert: null, autoPaused };
  }
}

const KIND_TR = { new_ip: "Yeni IP adresi", new_country: "Yeni ülke", burst: "Ani istek artışı" };

function notifyOwner(row, alert) {
  try {
    if (ioRef) {
      ioRef.to(`user:${row.owner_id}`).emit("admin:token-alert", alert);
      ioRef.to("admin").emit("admin:update", { type: "token_alert", tokenId: row.id, alertId: alert.id, kind: alert.kind });
    }
  } catch {
    /* no sockets */
  }
  const now = Date.now();
  if (now - (lastEmail.get(row.id) || 0) < EMAIL_EVERY_MS) return;
  lastEmail.set(row.id, now);
  const send = mailOverride || ((m) => require("../mailer").sendEmail(m));
  const lines = [
    `Admin token: ${row.name} (${core.masked(row.prefix, row.last4)})`,
    `Uyarı: ${KIND_TR[alert.kind] || alert.kind}`,
    alert.ip ? `IP: ${alert.ip}${alert.country ? ` (${alert.country})` : ""}` : null,
    alert.kind === "burst" ? `Son ${alert.detail.windowMin} dk: ${alert.detail.count} istek (olağan: ${alert.detail.baseline})` : null,
    alert.autoPaused ? "Token otomatik olarak duraklatıldı." : "Token çalışmaya devam ediyor. Tanımıyorsanız Yönetici Paneli > Admin Token'dan duraklatın veya iptal edin.",
  ].filter(Boolean);
  setTimeout(() => {
    Promise.resolve()
      .then(() =>
        send({
          to: process.env.REPORT_ALERT_EMAIL || "demirkurtlar@icloud.com",
          subject: `Descall admin token uyarısı: ${KIND_TR[alert.kind] || alert.kind} (${row.name})`.slice(0, 140),
          text: `${lines.join("\n")}\n`,
        })
      )
      .catch(() => {});
  }, 0).unref?.();
}

/* ---------------- flush ---------------- */

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush().catch(() => {});
  }, FLUSH_MS);
  flushTimer.unref?.();
}

async function addTo(table, keyCols, row, numeric) {
  let q = store.db().from(table).select("*");
  for (const col of keyCols) q = q.eq(col, row[col]);
  const res = await q.maybeSingle();
  store.check(res);
  const prev = res.data || null;
  const next = { ...row };
  if (prev) {
    for (const col of numeric) next[col] = (Number(prev[col]) || 0) + (Number(row[col]) || 0);
    if (row.ms_max !== undefined) next.ms_max = Math.max(Number(prev.ms_max) || 0, Number(row.ms_max) || 0);
    if (prev.first_at && row.first_at !== undefined) next.first_at = prev.first_at;
    if (!row.country && prev.country !== undefined) next.country = prev.country;
  }
  store.check(await store.db().from(table).upsert(next, { onConflict: keyCols.join(",") }));
}

/** Write everything pending. Returns the promise so tests (and shutdown) can await it. */
function flush({ now = Date.now() } = {}) {
  if (flushing) return flushing.then(() => flush({ now }));
  const hourly = [...hourlyPending.entries()];
  const ips = [...ipsPending.values()];
  const touches = [...touchPending.entries()];
  const calls = callsPending;
  hourlyPending.clear();
  ipsPending.clear();
  touchPending.clear();
  callsPending = [];
  if (!hourly.length && !ips.length && !touches.length && !calls.length) return Promise.resolve(false);
  flushing = (async () => {
    try {
      for (const [key, d] of hourly) {
        const [tokenId, hour] = key.split("|");
        await addTo(store.TABLES.hourly, ["token_id", "hour"], { token_id: tokenId, hour, ...d, updated_at: new Date(now).toISOString() }, ["count", "errors", "mcp", "destructive", "d_ban", "d_delete", "d_descoin", "d_broadcast", "ms_total"]);
      }
      for (const r of ips) await addTo(store.TABLES.ips, ["token_id", "ip"], r, ["count"]);
      if (calls.length) store.check(await store.db().from(store.TABLES.calls).insert(calls));
      for (const [tokenId, t] of touches) {
        const res = store.check(await store.db().from(store.TABLES.tokens).select("request_count").eq("id", tokenId).maybeSingle());
        if (!res.data) continue;
        const patch = { request_count: (Number(res.data.request_count) || 0) + t.count, last_used_at: t.last_used_at };
        if (t.last_used_ip) patch.last_used_ip = t.last_used_ip;
        if (t.last_used_country) patch.last_used_country = t.last_used_country;
        if (t.last_client) patch.last_client = t.last_client;
        store.check(await store.db().from(store.TABLES.tokens).update(patch).eq("id", tokenId));
        store.invalidate(tokenId);
      }
      if (now - lastPruneAt > PRUNE_EVERY_MS) {
        lastPruneAt = now;
        await prune(now);
      }
      return true;
    } catch (err) {
      if (err?.code !== "TOKENS_UNAVAILABLE") console.warn("[admin-tokens] usage flush failed:", err?.message || err);
      return false;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

async function prune(now = Date.now()) {
  const day = 86400e3;
  try {
    await store.db().from(store.TABLES.calls).delete().lt("at", new Date(now - CALL_RETENTION_DAYS * day).toISOString());
    await store.db().from(store.TABLES.hourly).delete().lt("hour", new Date(now - HOURLY_RETENTION_DAYS * day).toISOString());
    await store.db().from(store.TABLES.ips).delete().lt("last_at", new Date(now - IP_RETENTION_DAYS * day).toISOString());
  } catch {
    /* next hour */
  }
}

/* ---------------- reads for the views ---------------- */

function emptyAgg() {
  return { count: 0, errors: 0, mcp: 0, destructive: 0, d_ban: 0, d_delete: 0, d_descoin: 0, d_broadcast: 0, ms_total: 0, ms_max: 0 };
}

function addAgg(a, b) {
  for (const k of Object.keys(emptyAgg())) {
    if (k === "ms_max") a.ms_max = Math.max(a.ms_max, Number(b.ms_max) || 0);
    else a[k] += Number(b[k]) || 0;
  }
  return a;
}

/**
 * Hourly counters since `sinceMs` for these tokens (database + not yet written).
 * @returns {Promise<Map<string, Map<string, object>>>} tokenId -> hour ISO -> agg
 */
async function hourlyFor(tokenIds, sinceMs) {
  const out = new Map();
  const ids = [...new Set((tokenIds || []).map(String))];
  for (const id of ids) out.set(id, new Map());
  if (!ids.length) return out;
  const since = core.hourKey(sinceMs);
  try {
    const res = await store.db().from(store.TABLES.hourly).select("*").in("token_id", ids).gte("hour", since).limit(ids.length * 60);
    store.check(res);
    for (const r of res.data || []) {
      const hour = core.hourKey(r.hour);
      const m = out.get(String(r.token_id));
      if (!m) continue;
      m.set(hour, addAgg(m.get(hour) || emptyAgg(), r));
    }
  } catch (err) {
    if (err?.code === "TOKENS_UNAVAILABLE") throw err;
  }
  for (const [key, d] of hourlyPending) {
    const [tokenId, hour] = key.split("|");
    if (!out.has(tokenId) || hour < since) continue;
    const m = out.get(tokenId);
    m.set(hour, addAgg(m.get(hour) || emptyAgg(), d));
  }
  return out;
}

/** 24 hourly buckets ending with the current hour, oldest first. */
function hours24(map, now = Date.now()) {
  const list = [];
  const cur = Date.parse(core.hourKey(now));
  for (let i = 23; i >= 0; i -= 1) {
    const hour = new Date(cur - i * 3600e3).toISOString();
    list.push({ hour, ...(map?.get(hour) || emptyAgg()) });
  }
  return list;
}

function sumRange(map, fromMs, toMs) {
  const total = emptyAgg();
  for (const [hour, agg] of map || []) {
    const t = Date.parse(hour);
    if (t >= fromMs && t < toMs) addAgg(total, agg);
  }
  return total;
}

function fromDbCall(r) {
  return {
    id: r.id,
    at: r.at,
    method: r.method,
    path: r.path,
    status: Number(r.status) || 0,
    ms: Number(r.ms) || 0,
    ip: r.ip || null,
    country: r.country || null,
    via: r.via === "mcp" ? "mcp" : "rest",
    tool: r.tool || null,
    destructive: Boolean(r.destructive),
    destructiveKind: r.destructive_kind || null,
    auditId: r.audit_id || null,
  };
}

/** Recent calls, newest first (memory, else the database tail after a restart). */
async function recentCalls(tokenId, { limit = 50, after = null } = {}) {
  const afterMs = after ? Date.parse(after) : NaN;
  const ring = recent.get(String(tokenId)) || [];
  let list = ring;
  if (!ring.length) {
    try {
      let q = store.db().from(store.TABLES.calls).select("*").eq("token_id", String(tokenId));
      if (Number.isFinite(afterMs)) q = q.gt("at", new Date(afterMs).toISOString());
      const res = await q.order("at", { ascending: false }).limit(Math.max(limit, 200));
      if (!res?.error) list = (res.data || []).map(fromDbCall);
    } catch {
      list = [];
    }
  }
  if (Number.isFinite(afterMs)) list = list.filter((c) => Date.parse(c.at) > afterMs);
  return list.slice(0, limit).map(publicCall);
}

/** Contract Call shape (destructiveKind kept for the UI's chips). */
function publicCall(c) {
  return {
    id: c.id,
    at: c.at,
    method: c.method,
    path: c.path,
    status: c.status,
    ms: c.ms,
    ip: c.ip,
    country: c.country,
    via: c.via,
    tool: c.tool,
    destructive: Boolean(c.destructive),
    destructiveKind: c.destructiveKind || null,
    auditId: c.auditId || null,
  };
}

/** Addresses of the last 7 days: [{ ip, country, count, lastAt }]. */
async function ips7d(tokenId, now = Date.now()) {
  const byIp = new Map();
  const since = new Date(now - KNOWN_DAYS * 86400e3).toISOString();
  try {
    const res = await store.db().from(store.TABLES.ips).select("ip, country, count, last_at").eq("token_id", String(tokenId)).gte("last_at", since).limit(500);
    if (!res?.error) for (const r of res.data || []) byIp.set(r.ip, { ip: r.ip, country: r.country || null, count: Number(r.count) || 0, lastAt: r.last_at });
  } catch {
    /* memory only */
  }
  for (const r of ipsPending.values()) {
    if (r.token_id !== String(tokenId)) continue;
    const prev = byIp.get(r.ip) || { ip: r.ip, country: null, count: 0, lastAt: r.last_at };
    prev.count += r.count;
    if (r.country) prev.country = r.country;
    if (!prev.lastAt || r.last_at > prev.lastAt) prev.lastAt = r.last_at;
    byIp.set(r.ip, prev);
  }
  return [...byIp.values()].sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
}

/** Calls of a token recorded but not yet added to its stored request_count. */
function pendingCount(tokenId) {
  return touchPending.get(String(tokenId))?.count || 0;
}

/** Latency samples of recent MCP calls across tokens (for the p50 in the list). */
function mcpLatencies() {
  const out = [];
  for (const ring of recent.values()) for (const c of ring) if (c.via === "mcp") out.push(c.ms);
  return out;
}

/** Forget a token's in-memory address book (after an "allow IP" so the next request is not re-checked). */
function rememberIp(tokenId, ip, country = null) {
  const k = knownFor(tokenId);
  k.ips.set(ip, { country, lastAt: Date.now() });
}

function __setMailerForTests(fn) {
  mailOverride = fn;
}

function __resetForTests() {
  recent.clear();
  hourlyPending.clear();
  ipsPending.clear();
  touchPending.clear();
  callsPending = [];
  known.clear();
  minutes.clear();
  lastBurst.clear();
  lastEmail.clear();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  flushing = null;
  lastPruneAt = 0;
}

module.exports = {
  RING_MAX,
  FLUSH_MS,
  BURST_MIN,
  BURST_FACTOR,
  BURST_WINDOW_MIN,
  setIo,
  getIo,
  checkAddress,
  record,
  burstStats,
  checkBurst,
  raiseAlert,
  alertView,
  ruleOn,
  flush,
  hourlyFor,
  hours24,
  sumRange,
  emptyAgg,
  recentCalls,
  publicCall,
  ips7d,
  mcpLatencies,
  pendingCount,
  rememberIp,
  __setMailerForTests,
  __resetForTests,
};
