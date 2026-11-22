"use strict";

/**
 * Sunucu Ağı (hybrid server, owner only): pure helpers shared by routes/adminNodes.js, the
 * live push and the alert monitor. No database, no clock unless passed.
 *
 *  - Node key format: "dsk_node_" + 43 base64url characters (32 random bytes); only the
 *    SHA-256 hex is stored; prefix = first 4 random characters, last4 = last 4.
 *  - PC config (dc:cfg:pc) validation: RAM 0.5-8 GB in 512 MB steps, 1-8 cores, load rule
 *    thresholds, game mode share, weekly schedule slots, alert switches.
 *  - Schedule slots: { d, from, to } with d = 0 (Sunday) .. 6 (Saturday) like
 *    Date.getDay(), times "HH:MM" in cfg.schedule.tz (Europe/Istanbul); to <= from is an
 *    overnight slot that ends on the next day. schedule.enabled === false, or no slots,
 *    means "always available".
 *  - Capacity estimate: per-user memory (measured when a node has enough connections,
 *    else PER_USER_MB_DEFAULT) against each node's usable memory.
 *  - Saved cost: PC GB-hours this month priced like Render Standard (2 GB for 25 USD).
 */

const crypto = require("crypto");

const KEY_PREFIX = "dsk_node_";
const KEY_RE = /^dsk_node_[A-Za-z0-9_-]{43}$/;
const KEY_NAME_MAX = 40;
const KEY_ACTIVE_MAX = 5;
const REASON_MIN = 3;
const REASON_MAX = 300;

const RAM_MIN_MB = 512;
const RAM_MAX_MB = 8192;
const RAM_STEP_MB = 512;
const CORES_MIN = 1;
const CORES_MAX = 8;
const RENDER_PCT = Object.freeze([30, 95]);
const PC_PCT = Object.freeze([50, 98]);
const SHARE_MIN_MB = 256;
const SLOTS_MAX = 64;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

const BASE_MB = 180; // a Descall backend process at rest (same constant as the Descall Node app)
const HEADROOM = 0.85; // never plan above 85 % of a node's memory
const PER_USER_MB_DEFAULT = 2.5;
const PER_USER_MIN = 0.5;
const PER_USER_MAX = 8;
const MEASURE_MIN_CONNS = 25;
const USD_PER_GB_HOUR = 12.5 / 730; // Render Standard: 12.5 USD per GB-month, 730 h a month

/**
 * Same defaults as lib/cluster/index.js DEFAULT_CFG and the Descall Node app (cfg.rs): a
 * 2 GB / 2 core share, load rule on, game mode on, schedule on with no slots (= always
 * available until the owner draws the week), no emergency.
 */
const DEFAULT_CFG = Object.freeze({
  ramMb: 2048,
  cores: 2,
  loadRule: Object.freeze({ enabled: true, renderHighPct: 60, pcHighPct: 85 }),
  gameMode: Object.freeze({ enabled: true, shareMb: 1024, fullHandover: false }),
  schedule: Object.freeze({ enabled: true, tz: "Europe/Istanbul", slots: Object.freeze([]) }),
  alerts: Object.freeze({ pcDown: true, kvFull: true, render90: true }),
  emergency: Object.freeze({ on: false, at: null, by: null, reason: null }),
});

const ALERT_KINDS = Object.freeze(["pcDown", "kvFull", "render90"]);

/* ---------------- keys ---------------- */

function newKeySecret() {
  return KEY_PREFIX + crypto.randomBytes(32).toString("base64url");
}

function hashKey(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest("hex");
}

function isWellFormedKey(v) {
  return typeof v === "string" && KEY_RE.test(v);
}

function keyParts(secret) {
  const body = String(secret).slice(KEY_PREFIX.length);
  return { prefix: body.slice(0, 4), last4: body.slice(-4) };
}

function maskedKey(prefix, last4) {
  return `${KEY_PREFIX}${prefix || "????"}…${last4 || "????"}`;
}

function cleanName(v) {
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return s.length >= 1 && s.length <= KEY_NAME_MAX ? s : null;
}

function cleanReason(v) {
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s.length >= REASON_MIN && s.length <= REASON_MAX ? s : null;
}

/* ---------------- config ---------------- */

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function isObj(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Deep merge (arrays and scalars replace). */
function merge(base, patch) {
  if (!isObj(patch)) return patch === undefined ? base : patch;
  const out = { ...(isObj(base) ? base : {}) };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) ? merge(out[k], v) : v;
  return out;
}

/** A complete config: defaults under whatever the cluster holds. */
function normalizeCfg(cfg) {
  const c = merge(clone(DEFAULT_CFG), isObj(cfg) ? cfg : {});
  if (!Array.isArray(c.schedule?.slots)) c.schedule.slots = clone(DEFAULT_CFG.schedule.slots);
  return c;
}

const int = (v) => (typeof v === "number" && Number.isFinite(v) && Math.floor(v) === v ? v : NaN);
const bool = (v) => typeof v === "boolean";

/**
 * Validate a partial dc:cfg:pc body against the current config.
 * @returns {{ ok: true, patch: object, cfg: object } | { ok: false, field: string }}
 */
function validateCfgPatch(body, current) {
  if (!isObj(body)) return { ok: false, field: "body" };
  const allowed = ["ramMb", "cores", "loadRule", "gameMode", "schedule", "alerts"];
  for (const k of Object.keys(body)) if (!allowed.includes(k)) return { ok: false, field: k };
  const patch = {};
  if ("ramMb" in body) {
    const v = int(body.ramMb);
    if (!(v >= RAM_MIN_MB && v <= RAM_MAX_MB && v % RAM_STEP_MB === 0)) return { ok: false, field: "ramMb" };
    patch.ramMb = v;
  }
  if ("cores" in body) {
    const v = int(body.cores);
    if (!(v >= CORES_MIN && v <= CORES_MAX)) return { ok: false, field: "cores" };
    patch.cores = v;
  }
  if ("loadRule" in body) {
    const r = body.loadRule;
    if (!isObj(r)) return { ok: false, field: "loadRule" };
    const p = {};
    for (const k of Object.keys(r)) if (!["enabled", "renderHighPct", "pcHighPct"].includes(k)) return { ok: false, field: `loadRule.${k}` };
    if ("enabled" in r) {
      if (!bool(r.enabled)) return { ok: false, field: "loadRule.enabled" };
      p.enabled = r.enabled;
    }
    if ("renderHighPct" in r) {
      const v = int(r.renderHighPct);
      if (!(v >= RENDER_PCT[0] && v <= RENDER_PCT[1])) return { ok: false, field: "loadRule.renderHighPct" };
      p.renderHighPct = v;
    }
    if ("pcHighPct" in r) {
      const v = int(r.pcHighPct);
      if (!(v >= PC_PCT[0] && v <= PC_PCT[1])) return { ok: false, field: "loadRule.pcHighPct" };
      p.pcHighPct = v;
    }
    patch.loadRule = p;
  }
  if ("gameMode" in body) {
    const g = body.gameMode;
    if (!isObj(g)) return { ok: false, field: "gameMode" };
    const p = {};
    for (const k of Object.keys(g)) if (!["enabled", "shareMb", "fullHandover"].includes(k)) return { ok: false, field: `gameMode.${k}` };
    for (const k of ["enabled", "fullHandover"]) {
      if (k in g) {
        if (!bool(g[k])) return { ok: false, field: `gameMode.${k}` };
        p[k] = g[k];
      }
    }
    if ("shareMb" in g) {
      const v = int(g.shareMb);
      if (!(v >= SHARE_MIN_MB && v <= RAM_MAX_MB && v % 256 === 0)) return { ok: false, field: "gameMode.shareMb" };
      p.shareMb = v;
    }
    patch.gameMode = p;
  }
  if ("schedule" in body) {
    const s = body.schedule;
    if (!isObj(s)) return { ok: false, field: "schedule" };
    const p = {};
    for (const k of Object.keys(s)) if (!["enabled", "tz", "slots"].includes(k)) return { ok: false, field: `schedule.${k}` };
    if ("enabled" in s) {
      if (!bool(s.enabled)) return { ok: false, field: "schedule.enabled" };
      p.enabled = s.enabled;
    }
    if ("tz" in s) {
      if (typeof s.tz !== "string" || !validTz(s.tz)) return { ok: false, field: "schedule.tz" };
      p.tz = s.tz;
    }
    if ("slots" in s) {
      if (!Array.isArray(s.slots) || s.slots.length > SLOTS_MAX) return { ok: false, field: "schedule.slots" };
      const slots = [];
      for (const x of s.slots) {
        if (!isObj(x) || !(int(x.d) >= 0 && int(x.d) <= 6) || !TIME_RE.test(String(x.from)) || !TIME_RE.test(String(x.to)) || x.from === "24:00" || x.from === x.to) {
          return { ok: false, field: "schedule.slots" };
        }
        slots.push({ d: x.d, from: x.from, to: x.to });
      }
      p.slots = slots;
    }
    patch.schedule = p;
  }
  if ("alerts" in body) {
    const a = body.alerts;
    if (!isObj(a)) return { ok: false, field: "alerts" };
    const p = {};
    for (const [k, v] of Object.entries(a)) {
      if (!ALERT_KINDS.includes(k) || !bool(v)) return { ok: false, field: `alerts.${k}` };
      p[k] = v;
    }
    patch.alerts = p;
  }
  const cfg = normalizeCfg(merge(normalizeCfg(current), patch));
  if (cfg.gameMode.shareMb > cfg.ramMb) return { ok: false, field: "gameMode.shareMb" };
  return { ok: true, patch, cfg };
}

function validTz(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Which top-level parts changed (for the audit entry and the event line). */
function changedParts(before, after) {
  const a = normalizeCfg(before);
  const b = normalizeCfg(after);
  return ["ramMb", "cores", "loadRule", "gameMode", "schedule", "alerts"].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/* ---------------- schedule ---------------- */

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

/** Weekday (0 = Sunday) and minute of day of `date` in `tz`. */
function localClock(date, tz = "Europe/Istanbul") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const d = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { d, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Is the PC planned to serve at `date`? (schedule off or no slots: always). */
function inSchedule(cfg, date = new Date()) {
  const s = normalizeCfg(cfg).schedule;
  if (s.enabled === false || !s.slots.length) return true;
  const { d, minute } = localClock(date, s.tz);
  for (const slot of s.slots) {
    const from = minutesOf(slot.from);
    const to = minutesOf(slot.to);
    if (to > from) {
      if (slot.d === d && minute >= from && minute < to) return true;
    } else {
      if (slot.d === d && minute >= from) return true;
      if ((slot.d + 1) % 7 === d && minute < to) return true;
    }
  }
  return false;
}

/** Planned hours per week. */
function scheduledHours(cfg) {
  const s = normalizeCfg(cfg).schedule;
  if (s.enabled === false || !s.slots.length) return 168;
  let mins = 0;
  for (const slot of s.slots) {
    const from = minutesOf(slot.from);
    const to = minutesOf(slot.to);
    mins += to > from ? to - from : 1440 - from + to;
  }
  return Math.min(168, Math.round((mins / 60) * 10) / 10);
}

/* ---------------- capacity, cost ---------------- */

function isPc(node) {
  return node?.role === "secondary";
}

/** Measured MB per connection, or the default. */
function perUserMb(nodes) {
  let mem = 0;
  let conns = 0;
  for (const n of nodes || []) {
    const c = Number(n?.conns) || 0;
    const rss = Number(n?.memRss) || 0;
    if (c >= MEASURE_MIN_CONNS && rss > BASE_MB) {
      mem += rss - BASE_MB;
      conns += c;
    }
  }
  if (!conns) return PER_USER_MB_DEFAULT;
  return Math.round(Math.min(PER_USER_MAX, Math.max(PER_USER_MIN, mem / conns)) * 100) / 100;
}

function usableUsers(limitMb, per) {
  return Math.max(0, Math.floor((limitMb * HEADROOM - BASE_MB) / per));
}

/**
 * Concurrent users the network can hold. With `ramMb` the PC share is replaced (the slider
 * preview); a PC that is not active counts only when `assumePc` is set.
 */
function capacity(nodes, cfg, { ramMb = null, assumePc = false } = {}) {
  const c = normalizeCfg(cfg);
  const per = perUserMb(nodes);
  const list = Array.isArray(nodes) ? nodes : [];
  const primary = list.find((n) => !isPc(n));
  const pc = list.find((n) => isPc(n));
  const renderLimit = Number(primary?.memLimit) || 512;
  const renderUsers = usableUsers(renderLimit, per);
  const pcLive = pc && (pc.state === "active" || pc.state === "draining");
  const share = ramMb != null ? ramMb : c.ramMb;
  const pcUsers = pcLive || assumePc ? usableUsers(share, per) : 0;
  return { estimate: renderUsers + pcUsers, renderUsers, pcUsers, perUserMb: per };
}

function savedUsd(gbHours) {
  return Math.round(Math.max(0, Number(gbHours) || 0) * USD_PER_GB_HOUR * 100) / 100;
}

function monthKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 7);
}

/** lastBeat / startedAt: epoch ms in dc:nodes (lib/cluster), ISO elsewhere -> epoch ms or NaN. */
function timeMs(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v === "string" && /^\d{10,}$/.test(v)) return Number(v);
  return Date.parse(v || "");
}

function toIso(v) {
  const t = timeMs(v);
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null;
}

/* ---------------- overview payload ---------------- */

function eventKey(e) {
  return `${e?.at || ""}|${e?.kind || ""}|${e?.nodeId || ""}`;
}

/** Cluster + durable events, newest first, deduped, at most `limit`. */
function mergeEvents(a, b, limit = 50) {
  const seen = new Set();
  const out = [];
  for (const e of [...(a || []), ...(b || [])].sort((x, y) => String(y?.at || "").localeCompare(String(x?.at || "")))) {
    if (!e?.kind) continue;
    const k = eventKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ at: e.at, kind: String(e.kind), nodeId: e.nodeId || null, detail: isObj(e.detail) ? e.detail : null });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The GET /api/admin/nodes body (contract shape plus a few additive fields).
 * @param {{ enabled: boolean, kv: object, nodes: object[], leader: string|null, cfg: object,
 *   events: object[], ledger: object, keys: object, storage: boolean, kvConfigured: boolean,
 *   now?: number }} p
 */
function overview(p) {
  const now = p.now || Date.now();
  const nodes = (p.nodes || []).map((n) => ({ ...n }));
  const cfg = normalizeCfg(p.cfg);
  const byNode = {};
  let conns = 0;
  for (const n of nodes) {
    const c = Math.max(0, Number(n.conns) || 0);
    byNode[n.id] = c;
    conns += c;
  }
  const cap = capacity(nodes, cfg);
  const pc = nodes.find(isPc) || null;
  const gbHours = Number(p.ledger?.gbHours) || 0;
  const registered = Boolean(pc) || Boolean(p.keys?.everUsed) || (p.events || []).some((e) => /^node_(register|join)/.test(String(e?.kind || "")));
  return {
    available: true,
    single: !p.enabled,
    kv: { ok: Boolean(p.kv?.ok), usedMb: Number(p.kv?.usedMb) || 0, maxMb: Number(p.kv?.maxMb) || 25, configured: Boolean(p.kvConfigured) },
    nodes,
    leader: p.leader || null,
    cfg,
    totals: { conns, byNode },
    capacity: { estimate: cap.estimate, perUserMb: cap.perUserMb, renderUsers: cap.renderUsers, pcUsers: cap.pcUsers },
    savedUsdMonth: savedUsd(gbHours),
    saved: { month: p.ledger?.month || monthKey(now), gbHours: Math.round(gbHours * 10) / 10, pcHours: Math.round((Number(p.ledger?.pcHours) || 0) * 10) / 10 },
    schedule: { now: inSchedule(cfg, new Date(now)), hoursPerWeek: scheduledHours(cfg) },
    pc: { registered, online: Boolean(pc && pc.state !== "down"), lastSeenAt: toIso(pc?.lastBeat) || p.keys?.lastUsedAt || null },
    keys: { available: Boolean(p.keys?.available), active: Number(p.keys?.active) || 0, max: KEY_ACTIVE_MAX },
    storage: { ok: Boolean(p.storage) },
    emergency: isObj(cfg.emergency) && cfg.emergency.on ? cfg.emergency : null,
    events: mergeEvents(p.events, [], 50),
    at: new Date(now).toISOString(),
  };
}

module.exports = {
  KEY_PREFIX,
  KEY_RE,
  KEY_NAME_MAX,
  KEY_ACTIVE_MAX,
  REASON_MIN,
  REASON_MAX,
  RAM_MIN_MB,
  RAM_MAX_MB,
  RAM_STEP_MB,
  CORES_MIN,
  CORES_MAX,
  RENDER_PCT,
  PC_PCT,
  BASE_MB,
  HEADROOM,
  PER_USER_MB_DEFAULT,
  USD_PER_GB_HOUR,
  DEFAULT_CFG,
  ALERT_KINDS,
  newKeySecret,
  hashKey,
  isWellFormedKey,
  keyParts,
  maskedKey,
  cleanName,
  cleanReason,
  merge,
  normalizeCfg,
  validateCfgPatch,
  changedParts,
  localClock,
  inSchedule,
  scheduledHours,
  isPc,
  perUserMb,
  capacity,
  savedUsd,
  monthKey,
  mergeEvents,
  overview,
  timeMs,
  toIso,
};
