/**
 * Yönetici Paneli › Sunucu Ağı (owner pick Draft A "Kontrol merkezi"): pure helpers.
 * No React, no DOM: the page state (single-node, KV down, PC never registered), KPI
 * figures, the capacity preview while a slider moves (same formula as the server,
 * backend/lib/nodeKeys/model.js), chart geometry for the 1 h memory and latency charts,
 * the weekly hour grid <-> schedule slots, event lines, error keys, the PC config draft.
 * Tested by adminNodes.selftest.mjs.
 */

export const RAM_MIN_MB = 512;
export const RAM_MAX_MB = 8192;
export const RAM_STEP_MB = 512;
export const CORES_MIN = 1;
export const CORES_MAX = 8;
export const SHARE_OPTIONS_MB = Object.freeze([512, 1024, 1536, 2048, 3072, 4096]);
export const RENDER_PCT = Object.freeze([30, 95]);
export const PC_PCT = Object.freeze([50, 98]);
export const BASE_MB = 180;
export const HEADROOM = 0.85;
export const PER_USER_MB_DEFAULT = 2.5;
export const REASON_MIN = 3;
export const REASON_MAX = 300;
export const KEY_NAME_MAX = 40;
export const KEY_PREFIX = "dsk_node_";
export const PUSH_FALLBACK_MS = 12000;
export const POLL_MS = 10000;
export const METRICS_POLL_MS = 30000;
export const WINDOW_MS = 60 * 60 * 1000;
export const STEP_MS = 10 * 1000;
export const ACCENT = "#587af5";
export const PC_COLOR = "#b47cff";
export const OK = "#3ccf91";
export const WARN = "#f2b13c";
export const BAD = "#f25562";
/** Monday first, like the draft's heat map; values are Date.getDay() (0 = Sunday). */
export const DAY_ORDER = Object.freeze([1, 2, 3, 4, 5, 6, 0]);
export const ALERT_KINDS = Object.freeze(["pcDown", "kvFull", "render90"]);
export const NODE_STATES = Object.freeze(["active", "draining", "paused", "down"]);

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ---------- nodes ---------- */

export const isPc = (n) => n?.role === "secondary";

export function pickNodes(data) {
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  return { render: nodes.find((n) => !isPc(n)) || null, pc: nodes.find(isPc) || null };
}

export const stateKey = (s) => `anodes.state.${NODE_STATES.includes(s) ? s : "down"}`;

/** Memory share in percent (0..100). */
export function memPct(node, limitOverride = null) {
  const lim = num(limitOverride ?? node?.memLimit);
  if (!lim) return 0;
  return clamp(Math.round((num(node?.memRss) / lim) * 100), 0, 100);
}

/** Bar tone: Render turns amber past the load rule, red past 90 %. */
export function memTone(pct, highPct = 60) {
  if (pct >= 90) return "bad";
  if (pct >= highPct) return "warn";
  return "ok";
}

/**
 * What the page says about the network:
 *   kvDown   Redis configured but unreachable (every node falls back to single-node mode)
 *   single   no shared memory configured: single server mode
 *   noPc     hybrid, but the PC never registered (setup steps)
 *   pcOff    the PC registered once and is not connected now
 *   ready    the PC serves
 */
export function viewState(data) {
  if (!data) return "loading";
  const { pc } = pickNodes(data);
  if (data.single && data.kv?.configured && !data.kv?.ok) return "kvDown";
  if (data.single) return "single";
  if (!pc && !data.pc?.registered) return "noPc";
  if (!pc || pc.state === "down") return "pcOff";
  return "ready";
}

/* ---------- capacity ---------- */

export function usableUsers(limitMb, per) {
  return Math.max(0, Math.floor((num(limitMb) * HEADROOM - BASE_MB) / Math.max(0.1, num(per) || PER_USER_MB_DEFAULT)));
}

/** Capacity with the PC share at `ramMb` (the slider preview). */
export function capacityFor(data, ramMb) {
  const per = num(data?.capacity?.perUserMb) || PER_USER_MB_DEFAULT;
  const { render } = pickNodes(data);
  const renderUsers = usableUsers(num(render?.memLimit) || 512, per);
  const pcUsers = usableUsers(ramMb, per);
  return { renderUsers, pcUsers, estimate: renderUsers + pcUsers, perUserMb: per };
}

/* ---------- PC config draft ---------- */

export function draftOf(cfg) {
  const c = cfg || {};
  return {
    ramMb: clamp(Math.round(num(c.ramMb) / RAM_STEP_MB) * RAM_STEP_MB || 3072, RAM_MIN_MB, RAM_MAX_MB),
    cores: clamp(Math.round(num(c.cores)) || 4, CORES_MIN, CORES_MAX),
    loadRule: {
      enabled: c.loadRule?.enabled !== false,
      renderHighPct: clamp(Math.round(num(c.loadRule?.renderHighPct)) || 60, ...RENDER_PCT),
      pcHighPct: clamp(Math.round(num(c.loadRule?.pcHighPct)) || 85, ...PC_PCT),
    },
  };
}

/** Body for PUT /nodes/pc-config with only what changed (null: nothing). */
export function sharePatch(saved, draft) {
  const a = draftOf(saved);
  const out = {};
  if (a.ramMb !== draft.ramMb) out.ramMb = draft.ramMb;
  if (a.cores !== draft.cores) out.cores = draft.cores;
  const lr = {};
  for (const k of ["enabled", "renderHighPct", "pcHighPct"]) if (a.loadRule[k] !== draft.loadRule[k]) lr[k] = draft.loadRule[k];
  if (Object.keys(lr).length) out.loadRule = lr;
  return Object.keys(out).length ? out : null;
}

/** Game mode share stays at or under the RAM share. */
export function shareChoices(ramMb) {
  const list = SHARE_OPTIONS_MB.filter((x) => x <= ramMb);
  return list.length ? list : [Math.min(512, ramMb)];
}

/* ---------- schedule grid ---------- */

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const hh = (h) => `${String(h).padStart(2, "0")}:00`;

/** 7 x 24 booleans, indexed [getDay()][hour]; an hour counts when its first minute is in a slot. */
export function slotsToGrid(slots) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(false));
  for (const s of Array.isArray(slots) ? slots : []) {
    const d = num(s?.d);
    if (d < 0 || d > 6) continue;
    const from = minutesOf(s.from);
    const to = minutesOf(s.to);
    const startH = Math.floor(from / 60);
    const endH = Math.ceil(to / 60);
    if (to > from) {
      for (let h = startH; h < endH; h += 1) grid[d][h] = true;
    } else {
      for (let h = startH; h < 24; h += 1) grid[d][h] = true;
      for (let h = 0; h < endH; h += 1) grid[(d + 1) % 7][h] = true;
    }
  }
  return grid;
}

/**
 * Grid -> slots: one slot per run of hours; a run that reaches midnight continues into
 * the next morning's run (an overnight slot "18:00-02:00"), at most one day across.
 */
export function gridToSlots(grid) {
  const runs = [];
  for (let d = 0; d < 7; d += 1) {
    let h = 0;
    while (h < 24) {
      if (!grid?.[d]?.[h]) {
        h += 1;
        continue;
      }
      const start = h;
      while (h < 24 && grid[d][h]) h += 1;
      runs.push({ d, start, end: h });
    }
  }
  // Evening runs first claim the next morning's run (unless that day is a whole-day run),
  // so Saturday night into Sunday morning is one slot whatever the loop order.
  const claimed = new Map(); // "d:0" of a morning run -> its end hour
  for (const r of runs) {
    if (r.end !== 24 || r.start === 0) continue;
    const next = runs.find((x) => x.d === (r.d + 1) % 7 && x.start === 0 && x.end < 24);
    if (next && !claimed.has(`${next.d}:0`)) claimed.set(`${next.d}:0`, next.end);
    r.to = next ? hh(next.end) : "00:00";
  }
  const slots = [];
  for (const r of runs) {
    if (r.start === 0 && r.end < 24 && claimed.has(`${r.d}:0`)) continue;
    if (r.to) slots.push({ d: r.d, from: hh(r.start), to: r.to });
    // A whole day is "00:00-24:00" (the server accepts 24:00 as an end).
    else slots.push({ d: r.d, from: hh(r.start), to: r.end === 24 ? "24:00" : hh(r.end) });
  }
  return slots.sort((a, b) => DAY_ORDER.indexOf(a.d) - DAY_ORDER.indexOf(b.d) || a.from.localeCompare(b.from));
}

export const gridHours = (grid) => (grid || []).reduce((a, row) => a + (row || []).filter(Boolean).length, 0);

/** Presets for the editor: weekday evenings, every evening, always, clear. */
export function presetGrid(kind) {
  const g = Array.from({ length: 7 }, () => Array(24).fill(false));
  const on = (d, from, to) => {
    for (let h = from; h < to; h += 1) g[d][h] = true;
  };
  if (kind === "evenings") {
    for (const d of [1, 2, 3, 4, 5]) {
      on(d, 18, 24);
      on((d + 1) % 7, 0, 2);
    }
    for (const d of [6, 0]) {
      on(d, 12, 24);
      on((d + 1) % 7, 0, 3);
    }
  } else if (kind === "nightly") {
    for (let d = 0; d < 7; d += 1) {
      on(d, 18, 24);
      on((d + 1) % 7, 0, 2);
    }
  } else if (kind === "always") {
    for (let d = 0; d < 7; d += 1) on(d, 0, 24);
  }
  return g;
}

/**
 * The one-line summary under "Zaman planı": the weekday slot (and the weekend slot) when
 * every weekday shares one, else the planned hours a week.
 */
export function scheduleSummary(schedule) {
  const slots = Array.isArray(schedule?.slots) ? schedule.slots : [];
  if (schedule?.enabled === false || !slots.length) return { key: "anodes.plan.always" };
  const hours = gridHours(slotsToGrid(slots));
  if (hours >= 168) return { key: "anodes.plan.allDay" };
  const one = (days) => {
    const list = slots.filter((s) => days.includes(s.d));
    if (list.length !== days.length) return null;
    const f = list[0];
    return list.every((s) => s.from === f.from && s.to === f.to) ? `${f.from}-${f.to === "24:00" ? "00:00" : f.to}` : null;
  };
  const wk = one([1, 2, 3, 4, 5]);
  const we = one([6, 0]);
  const others = slots.filter((s) => ![1, 2, 3, 4, 5, 6, 0].includes(s.d));
  if (wk && we && wk === we && !others.length && slots.length === 7) return { key: "anodes.plan.daily", vars: { week: wk } };
  if (wk && we && !others.length && slots.length === 7) return { key: "anodes.plan.weekBoth", vars: { week: wk, weekend: we } };
  if (wk && slots.length === 5) return { key: "anodes.plan.weekdays", vars: { week: wk } };
  return { key: "anodes.plan.hours", vars: { n: hours } };
}

/* ---------- charts ---------- */

/**
 * Samples -> 10 s buckets over the last hour. Returns { t0, t1, render: [...], pc: [...],
 * p95: [...], err: [...] } with null gaps; memory as percent of each node's limit.
 */
export function chartSeries(series, data, now = Date.now()) {
  const { render, pc } = pickNodes(data);
  const t1 = Math.floor(now / STEP_MS) * STEP_MS;
  const t0 = t1 - WINDOW_MS;
  const n = WINDOW_MS / STEP_MS + 1;
  const slot = (t) => Math.round((t - t0) / STEP_MS);
  const empty = () => Array(n).fill(null);
  const out = { t0, t1, n, render: empty(), pc: empty(), renderMb: empty(), pcMb: empty(), p95: empty(), err: empty(), conns: empty() };
  const put = (id, key, limit) => {
    for (const s of series?.[id] || []) {
      const i = slot(num(s.t));
      if (i < 0 || i >= n) continue;
      out[`${key}Mb`][i] = num(s.rss);
      out[key][i] = limit ? clamp((num(s.rss) / limit) * 100, 0, 100) : null;
    }
  };
  if (render) put(render.id, "render", num(render.memLimit) || 512);
  if (pc) put(pc.id, "pc", num(pc.memLimit) || num(data?.cfg?.ramMb) || 3072);
  // Network latency: the worst node per bucket; errors weighted by connections.
  const lat = Array(n).fill(null);
  const errW = Array(n).fill(0);
  const errN = Array(n).fill(0);
  const conns = Array(n).fill(null);
  for (const list of Object.values(series || {})) {
    for (const s of list || []) {
      const i = slot(num(s.t));
      if (i < 0 || i >= n) continue;
      lat[i] = Math.max(lat[i] ?? 0, num(s.p95));
      const w = Math.max(1, num(s.conns));
      errW[i] += num(s.err) * w;
      errN[i] += w;
      conns[i] = (conns[i] ?? 0) + num(s.conns);
    }
  }
  for (let i = 0; i < n; i += 1) {
    out.p95[i] = lat[i];
    out.err[i] = errN[i] ? errW[i] / errN[i] : null;
    out.conns[i] = conns[i];
  }
  return out;
}

/** Add the overview's live figures as the newest samples (between metric fetches). */
export function appendLive(series, data, at = Date.now()) {
  const next = { ...(series || {}) };
  for (const node of data?.nodes || []) {
    if (!node?.id) continue;
    const list = Array.isArray(next[node.id]) ? [...next[node.id]] : [];
    const t = Math.floor(at / STEP_MS) * STEP_MS;
    const sample = { t, rss: num(node.memRss), cpu: num(node.cpu), conns: num(node.conns), p95: num(node.p95ms), err: num(node.errRate) };
    if (list.length && list[list.length - 1].t === t) list[list.length - 1] = sample;
    else list.push(sample);
    next[node.id] = list.filter((s) => s.t >= at - WINDOW_MS - STEP_MS);
  }
  return next;
}

/** SVG path through the non-null values (gaps break the line). */
export function linePath(values, w, h, max) {
  const n = values.length;
  if (n < 2) return "";
  const top = Math.max(1e-9, max);
  let d = "";
  let pen = false;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      pen = false;
      continue;
    }
    const x = (i / (n - 1)) * w;
    const y = h - (clamp(v, 0, top) / top) * h;
    d += `${pen ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

export function areaPath(values, w, h, max) {
  const line = linePath(values, w, h, max);
  if (!line) return "";
  const first = values.findIndex((v) => v != null);
  let last = values.length - 1;
  while (last > 0 && values[last] == null) last -= 1;
  const x0 = ((first / (values.length - 1)) * w).toFixed(1);
  const x1 = ((last / (values.length - 1)) * w).toFixed(1);
  return `${line}L${x1} ${h}L${x0} ${h}Z`;
}

/** A round axis top above the largest value. */
export function niceMax(values, floor = 1) {
  const m = Math.max(floor, ...values.filter((v) => v != null && Number.isFinite(v)));
  const p = 10 ** Math.floor(Math.log10(m));
  for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= m) return k * p;
  return 10 * p;
}

export function lastValue(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) if (values[i] != null) return values[i];
  return null;
}

/** Index under the pointer (0..n-1) from an x fraction. */
export const indexAt = (frac, n) => clamp(Math.round(frac * (n - 1)), 0, n - 1);

/* ---------- events ---------- */

const EVENT_TONE = {
  cfg_update: "acc",
  node_drain: "warn",
  node_draining: "warn",
  node_resume: "pc",
  node_active: "pc",
  node_paused: "mut",
  node_register: "pc",
  node_join: "pc",
  node_leave: "warn",
  node_down: "bad",
  all_to_render: "bad",
  drill: "acc",
  key_create: "acc",
  key_revoke: "bad",
  alert_pcDown: "bad",
  alert_kvFull: "bad",
  alert_render90: "warn",
  leader_change: "acc",
  kv_down: "bad",
  kv_up: "ok",
  game_mode: "warn",
  load_rule: "acc",
  game_end: "pc",
  schedule_pause: "mut",
  schedule_resume: "pc",
  drain_done: "pc",
};
export const EVENT_KINDS = Object.freeze(Object.keys(EVENT_TONE));

const gb = (mb) => Math.round((num(mb) / 1024) * 10) / 10;

/** { what: {key, vars}, effect: {key, vars} | null, tone } for one event row. */
export function eventLine(e) {
  const kind = String(e?.kind || "");
  const d = e?.detail || {};
  const known = Object.prototype.hasOwnProperty.call(EVENT_TONE, kind);
  const vars = {
    node: d.nodeId || e?.nodeId || "",
    reason: d.reason || "",
    name: d.name || "",
    n: num(d.conns ?? d.moved ?? d.count),
    moved: num(d.moved),
    dropped: num(d.dropped),
    sec: Math.round(num(d.ms) / 100) / 10,
    gb: gb(d.ramMb),
    prevGb: gb(d.prevRamMb),
    cores: num(d.cores),
    pct: num(d.pct),
    masked: d.masked || "",
  };
  let effect = null;
  if (kind === "drill") effect = { key: d.dropped ? "anodes.ev.drillLoss" : "anodes.ev.drillOk", vars };
  else if (kind === "node_drain" || kind === "node_draining" || kind === "all_to_render") effect = { key: "anodes.ev.moving", vars };
  else if (kind === "cfg_update" && d.ramMb && d.prevRamMb && d.ramMb !== d.prevRamMb) effect = { key: "anodes.ev.capacity", vars };
  else if (kind === "node_join" || kind === "node_register" || kind === "node_resume" || kind === "node_active") effect = { key: "anodes.ev.toPc" };
  else if (kind === "alert_render90" || kind === "load_rule") effect = { key: "anodes.ev.toPc" };
  else if (kind === "game_mode" && d.ramMb) effect = { key: "anodes.ev.gameMoved", vars };
  else if (kind === "alert_pcDown" || kind === "node_down") effect = { key: "anodes.ev.toRender" };
  else if (kind === "key_revoke") effect = { key: "anodes.ev.keyOff" };
  else if (kind === "alert_kvFull") effect = { key: d.reason === "down" ? "anodes.ev.single" : "anodes.ev.kvRisk" };
  const what = known ? { key: `anodes.ev.k.${kind === "alert_kvFull" && d.reason === "down" ? "alert_kvDown" : kind}`, vars } : { key: "anodes.ev.k.other", vars: { kind } };
  return { what, effect, tone: EVENT_TONE[kind] || "mut" };
}

/* ---------- forms, errors ---------- */

export const reasonOk = (v) => {
  const s = String(v || "").trim();
  return s.length >= REASON_MIN && s.length <= REASON_MAX;
};
export const keyNameOk = (v) => {
  const s = String(v || "").trim();
  return s.length >= 1 && s.length <= KEY_NAME_MAX;
};
export const maskKey = (k) => k?.masked || `${KEY_PREFIX}${k?.prefix || "????"}…${k?.last4 || "????"}`;

const ERR = {
  OWNER_ONLY: "anodes.err.ownerOnly",
  BAD_CFG: "anodes.err.badCfg",
  BAD_REASON: "anodes.err.reason",
  CONFIRM_REQUIRED: "anodes.err.confirm",
  CONFIRM_MISMATCH: "anodes.err.confirm",
  NODE_NOT_FOUND: "anodes.err.node",
  NOT_SECONDARY: "anodes.err.node",
  NO_ACTIVE_PC: "anodes.err.noActivePc",
  NO_PC: "anodes.err.noPc",
  DRILL_BUSY: "anodes.err.drillBusy",
  KEYS_UNAVAILABLE: "anodes.err.keysOff",
  KEY_LIMIT: "anodes.err.keyLimit",
  NAME_REQUIRED: "anodes.err.name",
  KEY_NOT_FOUND: "anodes.err.keyGone",
  KEY_REVOKED: "anodes.err.keyGone",
  STEP_UP_REQUIRED: "anodes.err.stepUp",
};
export const ERROR_CODES = Object.freeze(Object.keys(ERR));

export function errorKey(err) {
  if (err?.code && ERR[err.code]) return ERR[err.code];
  if (err?.status === 404) return "anodes.err.notDeployed";
  if (err?.status === 403) return "anodes.err.ownerOnly";
  return "anodes.err.generic";
}

/* ---------- time ---------- */

export function agoLabel(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return { key: "anodes.ago.never" };
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return { key: "anodes.ago.now" };
  if (s < 60) return { key: "anodes.ago.s", vars: { n: s } };
  if (s < 3600) return { key: "anodes.ago.m", vars: { n: Math.floor(s / 60) } };
  if (s < 86400) return { key: "anodes.ago.h", vars: { n: Math.floor(s / 3600) } };
  return { key: "anodes.ago.d", vars: { n: Math.floor(s / 86400) } };
}
