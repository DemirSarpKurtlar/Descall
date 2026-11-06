/**
 * Premium Yönetimi (Descall+ / Descall Ultra, phase 1): pure helpers for the
 * admin pages. No React, no network: the end-date calculator, the request
 * bodies sent to /admin/premium (docs/premium/CONTRACT.md), the request_id
 * idempotency helper and the before/after summary shown before a write.
 * Tested by premiumModel.selftest.mjs.
 */

export const PLANS = Object.freeze(["plus", "ultra"]);
/** Monthly DesCoin gift per plan (owner decision, CONTRACT.md). */
export const MONTHLY_DESCOIN = Object.freeze({ plus: 5000, ultra: 15000 });
export const OPS = Object.freeze(["grant", "extend", "change_plan", "cancel", "set_end", "set_unlimited"]);
export const BULK_OPS = Object.freeze(["grant", "extend", "change_plan", "cancel", "set_end", "set_unlimited"]);
export const EVENT_KINDS = Object.freeze([
  "grant", "extend", "change_plan", "cancel", "set_end", "set_unlimited", "expire", "coin_grant", "campaign_redeem",
]);
export const CAMPAIGN_KINDS = Object.freeze(["free_membership", "percent", "fixed"]);
export const DURATION_PRESETS = Object.freeze([1, 7, 30, 90, 180, 365]);
export const DURATION_MODES = Object.freeze(["preset", "custom", "date", "unlimited"]);
export const MAX_DAYS = 3650;
export const REASON_MIN = 3;
export const BULK_MAX = 500;

const DAY_MS = 864e5;

function toDate(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DD" + "HH:MM" in the viewer's local time → Date (null when invalid). */
export function localInputToDate(date, time = "23:59") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!m) return null;
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(time || "00:00")) || [null, "0", "0"];
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]), 0, 0);
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

/** Date → { date: "YYYY-MM-DD", time: "HH:MM" } in local time (for <input type=date|time>). */
export function dateToLocalInput(value) {
  const d = toDate(value);
  if (!d) return { date: "", time: "" };
  const p = (n) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

/** Whole positive days, or null. "30" → 30, "0", "-1", "2.5", "x" → null. */
export function parseDays(value) {
  const s = String(value ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_DAYS ? n : null;
}

/**
 * The end of a membership from the duration control.
 * @param {{ mode: "preset"|"custom"|"date"|"unlimited", days?: number|string, endDate?: string, endTime?: string, start?: Date|string|number }} d
 * @param {Date|number} [now]
 * @returns {{ ok: true, unlimited: boolean, endsAt: Date|null, days: number|null } | { ok: false, error: string }}
 *   error is a premiumAdmin.err.* key suffix.
 */
export function computeEnd(d, now = Date.now()) {
  const mode = d?.mode;
  if (mode === "unlimited") return { ok: true, unlimited: true, endsAt: null, days: null };
  const start = toDate(d?.start) || toDate(now);
  if (mode === "preset" || mode === "custom") {
    const days = parseDays(d?.days);
    if (days == null) return { ok: false, error: "days" };
    if (mode === "preset" && !DURATION_PRESETS.includes(days)) return { ok: false, error: "days" };
    return { ok: true, unlimited: false, endsAt: new Date(start.getTime() + days * DAY_MS), days };
  }
  if (mode === "date") {
    const end = localInputToDate(d?.endDate, d?.endTime || "23:59");
    if (!end) return { ok: false, error: "endDate" };
    if (end.getTime() <= toDate(now).getTime()) return { ok: false, error: "endPast" };
    if (end.getTime() <= start.getTime()) return { ok: false, error: "endBeforeStart" };
    return { ok: true, unlimited: false, endsAt: end, days: Math.ceil((end.getTime() - start.getTime()) / DAY_MS) };
  }
  return { ok: false, error: "duration" };
}

/** Where "extend" counts from: the current end if it is still ahead, else now. */
export function extendBase(sub, now = Date.now()) {
  const nowD = toDate(now);
  const end = toDate(sub?.ends_at);
  if (sub && !sub.unlimited && sub.status === "active" && end && end > nowD) return end;
  return nowD;
}

/** Current state of a subscription row (CONTRACT user_subscriptions shape). */
export function subscriptionState(sub, now = Date.now()) {
  if (!sub || !sub.plan_id) return { state: "none", plan: null, daysLeft: null };
  const end = toDate(sub.ends_at);
  const nowMs = toDate(now).getTime();
  let state = sub.status || "active";
  if (state === "active" && !sub.unlimited && end && end.getTime() <= nowMs) state = "expired";
  const daysLeft = state === "active" && !sub.unlimited && end ? Math.max(0, Math.ceil((end.getTime() - nowMs) / DAY_MS)) : null;
  return { state, plan: sub.plan_id, daysLeft };
}

function cleanText(v, max) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Validates the action form and builds the shared part of an apply / bulk body.
 * @returns {{ ok: true, body: object } | { ok: false, error: string }}
 */
function buildOpBody(form, { current = null, now = Date.now() } = {}) {
  const op = form?.op;
  if (!OPS.includes(op)) return { ok: false, error: "op" };
  const reason = cleanText(form.reason, 500);
  if (reason.length < REASON_MIN) return { ok: false, error: "reason" };
  const body = { op, plan: null, is_free: form.isFree !== false, reason, note: cleanText(form.note, 1000) };
  const plan = form.plan;
  const needsPlan = op === "grant" || op === "change_plan";
  if (needsPlan && !PLANS.includes(plan)) return { ok: false, error: "plan" };
  body.plan = PLANS.includes(plan) ? plan : current?.plan_id || null;
  if (op === "change_plan" && current?.plan_id && current.plan_id === plan) return { ok: false, error: "samePlan" };

  if (op === "grant") {
    // The server has no start date: a grant always starts when it is applied. "days" lets the
    // server count from its own clock; an exact end date is sent as ends_at.
    const end = computeEnd({ ...form.duration, start: now }, now);
    if (!end.ok) return end;
    if (end.unlimited) {
      body.unlimited = true;
    } else {
      body.unlimited = false;
      if (form.duration.mode === "date") body.ends_at = end.endsAt.toISOString();
      else body.days = end.days;
    }
  } else if (op === "extend") {
    if (form.duration?.mode === "unlimited") return { ok: false, error: "extendUnlimited" };
    // The server extends by whole days only; an exact new end is "set_end".
    if (form.duration?.mode === "date") return { ok: false, error: "extendDate" };
    const days = parseDays(form.duration?.days);
    if (days == null) return { ok: false, error: "days" };
    body.days = days;
  } else if (op === "set_end") {
    if (form.duration?.mode === "unlimited") return { ok: false, error: "useUnlimited" };
    const end = computeEnd({ ...form.duration, start: now }, now);
    if (!end.ok) return end;
    body.ends_at = end.endsAt.toISOString();
    body.unlimited = false;
  } else if (op === "set_unlimited") {
    body.unlimited = true;
  }
  return { ok: true, body };
}

/** POST /admin/premium/users/:id/apply body. */
export function buildApplyPayload(form, { requestId, current = null, now = Date.now() } = {}) {
  const out = buildOpBody(form, { current, now });
  if (!out.ok) return out;
  if (!requestId) return { ok: false, error: "requestId" };
  return { ok: true, body: { ...out.body, request_id: requestId } };
}

/** POST /admin/premium/bulk body: unique ids, at least one, at most BULK_MAX. */
export function buildBulkPayload(form, userIds, { requestId, now = Date.now() } = {}) {
  const ids = [...new Set((userIds || []).map((x) => String(x?.id ?? x ?? "").trim()).filter(Boolean))];
  if (!ids.length) return { ok: false, error: "noUsers" };
  if (ids.length > BULK_MAX) return { ok: false, error: "tooMany" };
  const out = buildOpBody(form, { current: null, now });
  if (!out.ok) return out;
  if (!requestId) return { ok: false, error: "requestId" };
  return { ok: true, body: { user_ids: ids, ...out.body, request_id: requestId } };
}

/** Campaign codes: A-Z and 0-9, 4 to 32 characters. */
export function normalizeCampaignCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

function optInt(v, min) {
  const s = String(v ?? "").trim();
  if (s === "") return { ok: true, value: null };
  if (!/^\d+$/.test(s) || Number(s) < min) return { ok: false };
  return { ok: true, value: Number(s) };
}

/** POST / PATCH /admin/premium/campaigns body. */
export function buildCampaignPayload(form) {
  const code = normalizeCampaignCode(form?.code);
  if (code.length < 4) return { ok: false, error: "code" };
  if (!CAMPAIGN_KINDS.includes(form.kind)) return { ok: false, error: "kind" };
  const planLimit = form.planLimit || null;
  if (planLimit && !PLANS.includes(planLimit)) return { ok: false, error: "plan" };
  if (form.kind === "free_membership" && !planLimit) return { ok: false, error: "campaignPlan" };
  const duration = form.kind === "free_membership" ? parseDays(form.durationDays) : optInt(form.durationDays, 1).value ?? null;
  if (form.kind === "free_membership" && duration == null) return { ok: false, error: "days" };
  const start = form.startDate ? localInputToDate(form.startDate, form.startTime || "00:00") : null;
  const end = form.endDate ? localInputToDate(form.endDate, form.endTime || "23:59") : null;
  if ((form.startDate && !start) || (form.endDate && !end)) return { ok: false, error: "endDate" };
  if (start && end && end <= start) return { ok: false, error: "endBeforeStart" };
  const total = optInt(form.totalLimit, 1);
  const perUser = optInt(form.perUserLimit, 1);
  if (!total.ok || !perUser.ok) return { ok: false, error: "limit" };
  const value = form.kind === "free_membership" ? null : optInt(form.value, 1);
  if (value && !value.ok) return { ok: false, error: "value" };
  if (form.kind === "percent" && value?.value != null && value.value > 100) return { ok: false, error: "value" };
  if (form.kind !== "free_membership" && value?.value == null) return { ok: false, error: "value" };
  const currency = String(form.currency || "").trim().toUpperCase();
  if (form.kind === "fixed" && !/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "currency" };
  return {
    ok: true,
    body: {
      code,
      kind: form.kind,
      plan_id: planLimit,
      duration_days: duration,
      value: value ? value.value : null,
      currency: form.kind === "fixed" ? currency : null,
      starts_at: start ? start.toISOString() : null,
      ends_at: end ? end.toISOString() : null,
      total_limit: total.value,
      per_user_limit: perUser.value ?? 1,
      allowed_user_ids: [...new Set((form.allowedUsers || []).map((u) => String(u?.id ?? u)).filter(Boolean))],
      active: form.active !== false,
    },
  };
}

/** PATCH /admin/premium/plans/:id body: only the editable fields; price never. */
export function buildPlanPatch(form) {
  const name = cleanText(form?.name, 60);
  if (!name) return { ok: false, error: "name" };
  const features = [...new Set((Array.isArray(form.features) ? form.features : String(form.features || "").split(/[\n,]/))
    .map((f) => String(f).trim())
    .filter(Boolean))];
  if (!["active", "archived"].includes(form.status)) return { ok: false, error: "status" };
  return {
    ok: true,
    body: { name, description: cleanText(form.description, 400), features, visible: Boolean(form.visible), status: form.status },
  };
}

/** Stable JSON (sorted keys) so the same form always has the same fingerprint. */
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function defaultRandom() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function newRequestId(random = defaultRandom, now = Date.now()) {
  return `pa-${Number(now).toString(36)}-${String(random()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;
}

/**
 * One request_id per submit. A retry of the same body (after a network error
 * or a step-up prompt) keeps the id, so the server's unique (request_id,
 * user_id) index turns it into a no-op; a changed body or a success starts a
 * new id.
 */
export function createIdempotency(random = defaultRandom, clock = () => Date.now()) {
  let last = null;
  return {
    idFor(scope, body) {
      const fp = `${scope}|${stableJson(body)}`;
      if (last && last.fp === fp) return last.id;
      last = { fp, id: newRequestId(random, clock()) };
      return last.id;
    },
    succeeded() {
      last = null;
    },
    peek() {
      return last?.id || null;
    },
  };
}

/**
 * Before / after rows for the confirmation dialog.
 * @returns {{ before: object, after: object }} each { plan, state, endsAt (ISO|null), unlimited, isFree }
 */
export function previewChange(current, body, now = Date.now()) {
  const nowD = toDate(now);
  const st = subscriptionState(current, now);
  const before = {
    plan: st.plan,
    state: st.state,
    endsAt: current?.ends_at || null,
    unlimited: Boolean(current?.unlimited),
    isFree: current ? Boolean(current.is_free) : null,
  };
  const after = { ...before };
  const endFrom = (base, days) => new Date(base.getTime() + days * DAY_MS).toISOString();
  switch (body?.op) {
    case "grant":
      after.plan = body.plan;
      after.state = "active";
      after.unlimited = Boolean(body.unlimited);
      after.endsAt = body.unlimited ? null : body.ends_at || endFrom(nowD, body.days);
      after.isFree = body.is_free;
      break;
    case "extend":
      after.state = "active";
      after.plan = before.plan || body.plan;
      after.endsAt = before.unlimited ? null : body.ends_at || endFrom(extendBase(current, now), body.days);
      break;
    case "change_plan":
      after.plan = body.plan;
      break;
    case "cancel":
      after.state = "cancelled";
      break;
    case "set_end":
      after.endsAt = body.ends_at;
      after.unlimited = false;
      after.state = "active";
      break;
    case "set_unlimited":
      after.unlimited = true;
      after.endsAt = null;
      after.state = "active";
      break;
    default:
      break;
  }
  return { before, after };
}

/** Analytics range: preset "7d" | "30d" | "90d" | "12m" | "custom". */
export function resolveRange(preset, custom = {}, now = Date.now()) {
  const end = toDate(now);
  const days = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 }[preset];
  if (days) {
    const bucket = days <= 30 ? "day" : days <= 90 ? "week" : "month";
    return { ok: true, from: new Date(end.getTime() - days * DAY_MS).toISOString(), to: end.toISOString(), bucket };
  }
  const from = localInputToDate(custom.from, "00:00");
  const to = localInputToDate(custom.to, "23:59");
  if (!from || !to || to <= from) return { ok: false, error: "range" };
  const span = (to - from) / DAY_MS;
  return { ok: true, from: from.toISOString(), to: to.toISOString(), bucket: span <= 31 ? "day" : span <= 120 ? "week" : "month" };
}

/** Query string from an object, skipping empty values. */
export function qs(params) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === "") continue;
    s.set(k, String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : "";
}

/** A metric value from the server: a finite number, or null ("Veri yok" / "Hesaplanamıyor"). */
export function metric(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowLabel(r) {
  return String(r?.bucket ?? r?.t ?? r?.day ?? r?.date ?? r?.period ?? "");
}

function seriesRows(list, keys) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.map((r) => ({ label: rowLabel(r), values: keys.map((k) => metric(r[k]) ?? 0) }));
}

function pick(obj, ...names) {
  for (const n of names) if (obj && obj[n] !== undefined) return obj[n];
  return undefined;
}

function pair(obj, a, b) {
  if (!obj || typeof obj !== "object") return null;
  if (metric(obj[a]) == null && metric(obj[b]) == null) return null;
  return { [a]: metric(obj[a]), [b]: metric(obj[b]) };
}

/**
 * GET /admin/premium/analytics → chart-ready data. Every metric is either the
 * server's real rows / numbers or null (the page then says "Veri yok" or
 * "Hesaplanamıyor"); nothing is filled in or estimated here.
 */
export function normalizeAnalytics(raw) {
  const r = raw || {};
  let cancelRenew = seriesRows(pick(r, "cancellations_renewals", "churn"), ["cancellations", "renewals"]);
  if (!cancelRenew && (Array.isArray(r.cancellations) || Array.isArray(r.renewals))) {
    const byKey = new Map();
    [r.cancellations, r.renewals].forEach((list, i) => {
      for (const row of list || []) {
        const cur = byKey.get(rowLabel(row)) || [0, 0];
        cur[i] = metric(row.n ?? row.count ?? row.value) ?? 0;
        byKey.set(rowLabel(row), cur);
      }
    });
    cancelRenew = byKey.size ? [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, values]) => ({ label, values })) : null;
  }
  const ud = pick(r, "upgrades_downgrades", "upgradesDowngrades");
  const avg = pick(r, "avg_duration_days", "average_duration_days", "avgDurationDays");
  const conv = pick(r, "conversion");
  const camps = pick(r, "campaigns", "campaign_performance");
  return {
    acquisitions: seriesRows(pick(r, "acquisitions", "new"), ["plus", "ultra"]),
    active: seriesRows(pick(r, "active", "active_per_day", "active_series"), ["total"]),
    planSplit: pair(pick(r, "plan_split", "planSplit"), "plus", "ultra"),
    cancelRenew,
    freePaid: pair(pick(r, "free_paid", "freePaid"), "free", "paid"),
    upDown: Array.isArray(ud) ? seriesRows(ud, ["upgrades", "downgrades"]) : pair(ud, "upgrades", "downgrades"),
    avgDuration: avg == null ? null : typeof avg === "object"
      ? { all: metric(avg.all ?? avg.total), plus: metric(avg.plus), ultra: metric(avg.ultra) }
      : { all: metric(avg), plus: null, ultra: null },
    conversion: conv && typeof conv === "object"
      ? {
        rate: metric(conv.rate ?? conv.value),
        numerator: metric(conv.numerator),
        denominator: metric(conv.denominator),
        denominatorLabel: conv.denominator_label || conv.denominatorLabel || null,
      }
      : null,
    campaigns: Array.isArray(camps) && camps.length
      ? camps.map((c) => ({
        id: String(c.id ?? c.code ?? ""),
        code: String(c.code || c.id || ""),
        redemptions: metric(c.redemptions ?? c.redeemed),
        users: metric(c.users ?? c.unique_users),
        stillActive: metric(c.still_active ?? c.active_now),
      }))
      : null,
  };
}
