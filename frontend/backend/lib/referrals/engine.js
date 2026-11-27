"use strict";

/**
 * Davet ödülleri engine (growth phase 4, Davet Merkezi).
 *
 *   recordSignup     friend-link sign-up -> pending row with its signals (or held / denied)
 *   noteFirstMessage the invitee's first DM / server message (socket hooks)
 *   noteSeen         the invitee (or anyone) connects: return visit + notice delivery
 *   sweep            every few minutes: return via users.last_seen, expiry, unlocks
 *   pay              both sides through lib/descoin.js creditIdempotent, keys
 *                    "referral:<id>:inviter" / "referral:<id>:invitee"; milestones
 *                    "referral:milestone:<inviter>:<at>"
 *   admin            hold / release / revoke (reason, previewed text, notices), pause link,
 *                    rules versions, alerts; every action has a 10 minute undo and lands in
 *                    the admin audit log (state.appendAudit) and in referral_actions.
 *
 * Rewards that were paid by the old instant logic stay paid: their rows are legacy, and a
 * pending row whose invitee already got the old referral credits is closed as legacy
 * instead of paying twice (the window between applying the migration and deploying).
 */

const crypto = require("crypto");
const model = require("./model");
const store = require("./store");
const texts = require("./texts");

const UNDO_MS = 10 * 60 * 1000;
const NEG_CACHE_MS = 10 * 60 * 1000;
const SEEN_THROTTLE_MS = 20 * 60 * 1000;

let ioRef = null;
function setIo(io) {
  if (io && typeof io.to === "function") ioRef = io;
}

function deps() {
  return {
    descoin: require("../descoin"),
    state: require("../../runtime/sharedState"),
  };
}
let depsOverride = null;
function d() {
  return depsOverride || deps();
}
function __setDepsForTests(x) {
  depsOverride = x;
}

function emitTo(io, userId, event, payload) {
  const target = io || ioRef;
  if (!target || !userId) return;
  try {
    target.to(`user:${userId}`).emit(event, payload);
  } catch {
    /* best effort */
  }
}

function pingAdmins(io, payload) {
  const target = io || ioRef;
  try {
    target?.to?.("admins")?.emit?.("admin:invites", payload);
  } catch {
    /* best effort */
  }
}

function audit(actor, action, target, meta) {
  try {
    return d().state.appendAudit(actor?.id || null, actor?.username || "system", action, target, meta);
  } catch {
    return null;
  }
}

const nowIso = (t = Date.now()) => new Date(t).toISOString();

// ---------------------------------------------------------------- caches
const noReferral = new Map(); // userId -> until (no open referral as invitee)
const seenAt = new Map(); // userId -> last noteSeen run
function cachedNone(userId, now) {
  const until = noReferral.get(String(userId));
  if (until && until > now) return true;
  if (until) noReferral.delete(String(userId));
  return false;
}
function markNone(userId, now) {
  noReferral.set(String(userId), now + NEG_CACHE_MS);
  if (noReferral.size > 20000) noReferral.delete(noReferral.keys().next().value);
}
function forget(userId) {
  noReferral.delete(String(userId));
}
function __resetCaches() {
  noReferral.clear();
  seenAt.clear();
}

function header(req, name) {
  try {
    return req?.get ? req.get(name) : req?.headers?.[name.toLowerCase()];
  } catch {
    return null;
  }
}

function signupFingerprint(req) {
  let ip = "";
  try {
    ip = require("../clientIp").ipOfRequest(req);
  } catch {
    ip = req?.ip || "";
  }
  if (ip === "unknown") ip = "";
  const device = String(header(req, "x-descall-device") || "").slice(0, 200);
  return {
    deviceHash: device ? model.hashOf("device", device) : null,
    ipHash: ip ? model.hashOf("ip", ip) : null,
    subnetHash: ip ? model.hashOf("net", model.subnetOf(ip)) : null,
  };
}

function isDisposable(domain) {
  if (!domain) return false;
  try {
    return require("../signupReport").isDisposableDomain(domain);
  } catch {
    return false;
  }
}

function signalsHaveAction(signals, rules, action) {
  return (signals || []).find((s) => (rules.signals?.[s.code] || "none") === action) || null;
}

// ---------------------------------------------------------------- sign-up
/**
 * A friend-link sign-up. Never throws into sign-up. Returns
 * { recorded, status, inviterAmount, inviteeAmount }.
 */
async function recordSignup({ inviterId, inviteeId, email = null, req = null, io = null, now = Date.now() }) {
  if (!inviterId || !inviteeId || String(inviterId) === String(inviteeId)) return { recorded: false };
  try {
    const { version, rules } = await store.getRules();
    const [inviter, stateRow, siblings] = await Promise.all([
      store.userById(inviterId),
      store.getInviterState(inviterId),
      store.referralsByInviter(inviterId, { since: nowIso(now - 30 * model.DAY) }),
    ]);
    const fp = signupFingerprint(req);
    const domain = model.emailDomain(email);
    const signals = model.signupSignals({
      deviceHash: fp.deviceHash,
      subnetHash: fp.subnetHash,
      disposable: isDisposable(domain),
      inviterDevices: stateRow.device_hashes,
      inviterSubnets: stateRow.subnet_hashes,
      siblings: siblings.filter((s) => String(s.invitee_id) !== String(inviteeId)),
    });
    const action = model.decide(signals, rules);
    const tl = model.timeline(nowIso(now), rules);
    let status = "pending";
    let holdReason = null;
    if (stateRow.link_paused) {
      status = "denied";
      holdReason = "link_paused";
    } else if (action === "deny") {
      status = "denied";
      holdReason = signalsHaveAction(signals, rules, "deny")?.code || "denied";
    } else if (action === "hold") {
      status = "held";
      holdReason = signalsHaveAction(signals, rules, "hold")?.code || "review";
    }
    const inviterAgeDays = inviter?.created_at ? (now - new Date(inviter.created_at).getTime()) / model.DAY : 999;
    const inviterSkip = inviterAgeDays < rules.minInviterAgeDays ? "inviter_age" : null;
    const row = {
      inviter_id: inviterId,
      invitee_id: inviteeId,
      inviter_amount: rules.inviterReward,
      invitee_amount: rules.inviteeReward,
      status,
      legacy: false,
      signup_at: nowIso(now),
      unlock_at: tl.unlockAt,
      expires_at: tl.expiresAt,
      inviter_skip: inviterSkip,
      hold_reason: holdReason,
      held_at: status === "held" ? nowIso(now) : null,
      auto_hold: status === "held",
      risk_score: model.rowRisk(signals),
      risk_signals: signals,
      device_hash: fp.deviceHash,
      ip_hash: fp.ipHash,
      subnet_hash: fp.subnetHash,
      email_domain: domain,
      rules_version: version || null,
    };
    const ins = await store.insertReferral(row);
    if (!ins.ok) {
      if (ins.missing) console.warn("[referrals] referral_rewards is not migrated yet (20261125b); reward not recorded");
      return { recorded: false, duplicate: Boolean(ins.duplicate) };
    }
    forget(inviteeId);
    if (status === "held") {
      await store.insertAction({
        id: crypto.randomUUID(),
        actor_id: null,
        actor_username: "system",
        action: "auto_hold",
        inviter_id: inviterId,
        referral_ids: [ins.row.id],
        reason_code: holdReason,
        payload: { prev: [{ id: ins.row.id, status: "pending" }], signals: signals.map((s) => s.code) },
        undo_until: nowIso(now + UNDO_MS),
      }).catch(() => null);
      audit(null, "invite_auto_hold", inviterId, { count: 1, reason: holdReason, inviter: inviter?.username || null });
    }
    await checkAnomaly({ inviterId, inviter, rules, io, now }).catch((err) => console.warn("[referrals] anomaly check:", err?.message || err));
    emitTo(io, inviterId, "invites:update", { kind: "signup" });
    pingAdmins(io, { kind: "signup", inviterId });
    return { recorded: true, status, inviterAmount: inviterSkip ? 0 : rules.inviterReward, inviteeAmount: rules.inviteeReward, id: ins.row.id };
  } catch (err) {
    console.warn("[referrals] record signup failed:", err?.message || err);
    return { recorded: false };
  }
}

/** Burst + overlapping signals -> alert and automatic hold of the window's rows. */
async function checkAnomaly({ inviterId, inviter, rules, io, now = Date.now() }) {
  const a = rules.anomaly;
  const windowMs = a.windowMinutes * 60 * 1000;
  const since30 = now - 30 * model.DAY;
  const rows = await store.referralsByInviter(inviterId, { since: nowIso(since30) });
  const recent = rows.filter((r) => new Date(r.signup_at || r.created_at).getTime() >= now - windowMs);
  const older = rows.length - recent.length;
  const windows = Math.max(1, (30 * model.DAY - windowMs) / windowMs);
  const riskyRecent = recent.filter((r) => {
    const act = model.decide(r.risk_signals, rules);
    return act === "hold" || act === "deny";
  }).length;
  const res = model.detectAnomaly({ recent: recent.length, baselinePerWindow: older / windows, riskyRecent }, rules);
  if (!res.flagged) return { flagged: false };
  if (await store.openAlertFor(inviterId, "burst", nowIso(now - windowMs))) return { flagged: true, existing: true };
  const toHold = recent.filter((r) => r.status === "pending");
  const held = [];
  for (const r of toHold) {
    const up = await store.updateReferral(r.id, { status: "held", hold_reason: "anomaly", held_at: nowIso(now), auto_hold: true }, { expect: "pending" });
    if (up.length) held.push(r);
  }
  const device = recent.filter((r) => model.hasSignal(r, "same_device") || model.hasSignal(r, "inviter_device")).length;
  const amount = recent.filter((r) => ["held", "pending"].includes(r.status) || held.includes(r)).reduce((s, r) => s + (r.inviter_skip ? 0 : r.inviter_amount || 0) + (r.invitee_amount || 0), 0);
  const actionId = crypto.randomUUID();
  const alert = await store.insertAlert({
    inviter_id: inviterId,
    kind: "burst",
    status: "open",
    detail: {
      signups: recent.length,
      factor: res.factor,
      sameDevice: device,
      windowMinutes: a.windowMinutes,
      held: held.length,
      protected: amount,
      referralIds: recent.map((r) => r.id),
      actionId,
    },
  });
  await store.insertAction({
    id: actionId,
    actor_id: null,
    actor_username: "system",
    action: "auto_hold",
    inviter_id: inviterId,
    referral_ids: held.map((r) => r.id),
    reason_code: "anomaly",
    payload: { prev: held.map((r) => ({ id: r.id, status: "pending" })), alertId: alert?.id || null },
    undo_until: nowIso(now + UNDO_MS),
  }).catch(() => null);
  audit(null, "invite_auto_hold", inviterId, { count: held.length + recent.filter((r) => r.status === "held").length, reason: "anomaly", inviter: inviter?.username || null, factor: res.factor });
  pingAdmins(io, { kind: "alert", inviterId, alertId: alert?.id || null });
  emitTo(io, inviterId, "invites:update", { kind: "review" });
  return { flagged: true, held: held.length };
}

// ---------------------------------------------------------------- invitee activity
/** The invitee's first real message. kind: "dm" | "server". Never throws. */
async function noteFirstMessage({ userId, peerId = null, io = null, at = Date.now() }) {
  if (!userId) return { changed: false };
  if (cachedNone(userId, at)) return { changed: false };
  try {
    const row = await store.referralByInvitee(userId);
    if (!row || row.legacy || !["pending", "held"].includes(row.status)) {
      markNone(userId, at);
      return { changed: false };
    }
    if (row.first_message_at) {
      if (row.status === "pending") await tryUnlock(row, { io, now: at });
      markNone(userId, at);
      return { changed: false };
    }
    const { rules } = await store.getRules();
    const peerIsInviter = peerId != null && String(peerId) === String(row.inviter_id);
    const sigs = model.messageSignals({ signupAt: row.signup_at || row.created_at, at: nowIso(at), peerIsInviter, rules });
    const merged = [...row.risk_signals.filter((s) => !sigs.some((n) => n.code === s.code)), ...sigs];
    const patch = {
      first_message_at: nowIso(at),
      first_message_peer: peerIsInviter ? "inviter" : "other",
      risk_signals: merged,
      risk_score: model.rowRisk(merged),
    };
    const act = model.decide(sigs, rules);
    let held = false;
    if (row.status === "pending" && (act === "hold" || act === "deny")) {
      patch.status = "held";
      patch.hold_reason = signalsHaveAction(sigs, rules, act)?.code || "review";
      patch.held_at = nowIso(at);
      patch.auto_hold = true;
      held = true;
    }
    const up = await store.updateReferral(row.id, patch, { expect: row.status });
    if (!up.length) return { changed: false };
    if (held) {
      await store.insertAction({
        id: crypto.randomUUID(),
        actor_id: null,
        actor_username: "system",
        action: "auto_hold",
        inviter_id: row.inviter_id,
        referral_ids: [row.id],
        reason_code: patch.hold_reason,
        payload: { prev: [{ id: row.id, status: "pending" }] },
        undo_until: nowIso(at + UNDO_MS),
      }).catch(() => null);
      audit(null, "invite_auto_hold", row.inviter_id, { count: 1, reason: patch.hold_reason });
    }
    emitTo(io, row.inviter_id, "invites:update", { kind: "first_message" });
    emitTo(io, userId, "invites:welcome", { kind: "first_message" });
    if (up[0].status === "pending") await tryUnlock(up[0], { io, now: at });
    return { changed: true, held };
  } catch (err) {
    console.warn("[referrals] first message hook:", err?.message || err);
    return { changed: false };
  }
}

/**
 * Any authenticated connect. For an invitee: a visit after the unlock time is the return
 * visit. For everyone: unread notices are pushed (toast) once per connect.
 */
async function noteSeen({ userId, io = null, at = Date.now(), force = false }) {
  if (!userId) return { changed: false };
  const key = String(userId);
  const last = seenAt.get(key) || 0;
  if (!force && at - last < SEEN_THROTTLE_MS) return { changed: false, throttled: true };
  seenAt.set(key, at);
  if (seenAt.size > 50000) seenAt.delete(seenAt.keys().next().value);
  let changed = false;
  try {
    if (!cachedNone(userId, at)) {
      const row = await store.referralByInvitee(userId);
      if (!row || row.legacy || row.status !== "pending") {
        if (!row || !["pending", "held"].includes(row?.status)) markNone(userId, at);
      } else {
        const { rules } = await store.getRules();
        const tl = model.timeline(row.signup_at || row.created_at, rules);
        const unlock = new Date(tl.unlockAt).getTime();
        const expires = new Date(tl.expiresAt).getTime();
        if (!row.returned_at && at >= unlock && at <= expires) {
          const up = await store.updateReferral(row.id, { returned_at: nowIso(at) }, { expect: "pending" });
          if (up.length) {
            changed = true;
            emitTo(io, row.inviter_id, "invites:update", { kind: "returned" });
            await tryUnlock(up[0], { io, now: at });
          }
        } else if (at > expires) {
          await tryUnlock(row, { io, now: at });
        }
      }
    }
    const notices = (await store.listNotices(userId, { limit: 3 })).filter((n) => !n.read_at);
    for (const n of notices.reverse()) emitTo(io, userId, "invites:notice", { id: n.id, kind: n.kind, text: n.text, amount: n.amount, at: n.created_at });
  } catch (err) {
    console.warn("[referrals] seen hook:", err?.message || err);
  }
  return { changed };
}

// ---------------------------------------------------------------- unlock + pay
async function tryUnlock(row, { io = null, now = Date.now() } = {}) {
  const { rules } = await store.getRules();
  const decision = model.evaluateUnlock(row, rules, now);
  if (decision === "expire") {
    const up = await store.updateReferral(row.id, { status: "expired" }, { expect: "pending" });
    if (up.length) {
      emitTo(io, row.inviter_id, "invites:update", { kind: "expired" });
      emitTo(io, row.invitee_id, "invites:welcome", { kind: "expired" });
    }
    return { decision, done: up.length > 0 };
  }
  if (decision === "pay") return { decision, ...(await pay(row, { io, now, rules })) };
  return { decision };
}

async function legacyCreditExists(row) {
  try {
    const supabase = require("../../db/supabase");
    const { data, error } = await supabase
      .from("descoin_ledger")
      .select("id")
      .eq("user_id", row.invitee_id)
      .eq("reason", "referral_welcome")
      .eq("meta->>inviterId", String(row.inviter_id))
      .limit(5);
    if (error) return false;
    return (data || []).some(Boolean) && !(await keyedCreditExists(row));
  } catch {
    return false;
  }
}

async function keyedCreditExists(row) {
  try {
    return Boolean(await d().descoin.findByIdempotencyKey(row.invitee_id, `referral:${row.id}:invitee`));
  } catch {
    return false;
  }
}

async function monthlyPaidCount(inviterId, excludeId, now) {
  const since = model.monthStartIso(now);
  const rows = await store.referralsByInviter(inviterId, { since: nowIso(new Date(since).getTime() - 3 * model.DAY) });
  return rows.filter((r) => r.status === "paid" && !r.legacy && !r.inviter_skip && String(r.id) !== String(excludeId) && (r.paid_at || "") >= since).length;
}

/**
 * Pay a pending row once. The status flip pending -> paid is the claim (conditional
 * update); the credits carry idempotency keys, so a retry after a crash never pays twice.
 */
async function pay(row, { io = null, now = Date.now(), rules = null } = {}) {
  const r = rules || (await store.getRules()).rules;
  const claimed = await store.updateReferral(row.id, { status: "paid", paid_at: nowIso(now) }, { expect: "pending" });
  if (!claimed.length) return { paid: false, reason: "claimed" };
  if (await legacyCreditExists(row)) {
    await store.updateReferral(row.id, { legacy: true }, { expect: "paid" });
    return { paid: false, reason: "legacy" };
  }
  let skip = row.inviter_skip || null;
  if (!skip && r.monthlyCap >= 0 && (await monthlyPaidCount(row.inviter_id, row.id, now)) >= r.monthlyCap) skip = "monthly_cap";
  const descoin = d().descoin;
  const results = { inviter: null, invitee: null };
  try {
    results.invitee = await descoin.creditIdempotent(row.invitee_id, row.invitee_amount, "referral_welcome", `referral:${row.id}:invitee`, {
      inviterId: String(row.inviter_id),
      referralId: String(row.id),
    });
  } catch (err) {
    if (err?.code !== "WALLET_FROZEN") {
      await store.updateReferral(row.id, { status: "pending", paid_at: null }, { expect: "paid" });
      console.warn("[referrals] invitee credit failed, will retry:", err?.message || err);
      return { paid: false, reason: "error" };
    }
    results.invitee = { credited: 0, frozen: true };
  }
  if (!skip) {
    try {
      results.inviter = await descoin.creditIdempotent(row.inviter_id, row.inviter_amount, "referral_invite", `referral:${row.id}:inviter`, {
        inviteeId: String(row.invitee_id),
        referralId: String(row.id),
      });
    } catch (err) {
      if (err?.code === "WALLET_FROZEN") skip = "wallet_frozen";
      else {
        await store.updateReferral(row.id, { status: "pending", paid_at: null }, { expect: "paid" });
        console.warn("[referrals] inviter credit failed, will retry:", err?.message || err);
        return { paid: false, reason: "error" };
      }
    }
  }
  if (skip !== (row.inviter_skip || null)) await store.updateReferral(row.id, { inviter_skip: skip }, { expect: "paid" });
  if (r.inviteeItemId) {
    try {
      await require("../shop").grantItem(row.invitee_id, r.inviteeItemId, { acquiredVia: "gift", giftedBy: row.inviter_id });
    } catch (err) {
      console.warn("[referrals] invitee item grant failed:", err?.message || err);
    }
  }
  if (results.invitee?.credited > 0) {
    emitTo(io, row.invitee_id, "descoin:balance", { balance: results.invitee.balance, delta: results.invitee.credited, reason: "referral_welcome" });
  }
  if (results.inviter?.credited > 0) {
    emitTo(io, row.inviter_id, "descoin:balance", { balance: results.inviter.balance, delta: results.inviter.credited, reason: "referral_invite" });
  }
  emitTo(io, row.inviter_id, "invites:update", { kind: "paid", amount: results.inviter?.credited || 0 });
  emitTo(io, row.invitee_id, "invites:welcome", { kind: "paid", amount: results.invitee?.credited || 0 });
  pingAdmins(io, { kind: "paid", inviterId: row.inviter_id });
  if (!skip) await checkMilestones(row.inviter_id, { io, rules: r }).catch((err) => console.warn("[referrals] milestones:", err?.message || err));
  return { paid: true, inviter: results.inviter?.credited || 0, invitee: results.invitee?.credited || 0, skip };
}

async function activeCount(inviterId) {
  const rows = await store.referralsByInviter(inviterId);
  return rows.filter((r) => r.status === "paid" && !r.legacy).length;
}

async function checkMilestones(inviterId, { io = null, rules = null } = {}) {
  const r = rules || (await store.getRules()).rules;
  const count = await activeCount(inviterId);
  const have = new Set((await store.listMilestones(inviterId)).map((m) => Number(m.milestone)));
  const paid = [];
  for (const m of r.milestones) {
    if (count < m.at || have.has(m.at)) continue;
    if (!(await store.claimMilestone(inviterId, m.at, m.amount, m.itemId))) continue;
    try {
      const out = await d().descoin.creditIdempotent(inviterId, m.amount, "referral_milestone", `referral:milestone:${inviterId}:${m.at}`, { milestone: m.at, kind: m.kind });
      if (m.itemId) {
        await require("../shop").grantItem(inviterId, m.itemId, { acquiredVia: "gift" }).catch((err) => console.warn("[referrals] milestone item:", err?.message || err));
      }
      if (out.credited > 0) emitTo(io, inviterId, "descoin:balance", { balance: out.balance, delta: out.credited, reason: "referral_milestone" });
      emitTo(io, inviterId, "invites:milestone", { at: m.at, amount: m.amount, kind: m.kind });
      paid.push(m.at);
    } catch (err) {
      if (err?.code !== "WALLET_FROZEN") await store.releaseMilestone(inviterId, m.at).catch(() => {});
      console.warn("[referrals] milestone credit failed:", err?.message || err);
    }
  }
  return { count, paid };
}

// ---------------------------------------------------------------- sweeper
let sweeping = false;
async function sweep({ io = null, now = Date.now(), limit = 400 } = {}) {
  if (sweeping) return { skipped: true };
  sweeping = true;
  let paid = 0;
  let expired = 0;
  try {
    const due = (await store.pendingDue(nowIso(now))).slice(0, limit);
    if (!due.length) return { paid, expired };
    const users = await store.usersByIds(due.map((r) => r.invitee_id));
    const { rules } = await store.getRules();
    for (const row of due) {
      let cur = row;
      const tl = model.timeline(row.signup_at || row.created_at, rules);
      const unlock = new Date(tl.unlockAt).getTime();
      const expires = new Date(tl.expiresAt).getTime();
      const seen = users.get(String(row.invitee_id))?.last_seen;
      const seenMs = seen ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(seen) ? seen : `${seen}Z`).getTime() : null;
      if (!row.returned_at && seenMs && seenMs >= unlock && seenMs <= expires) {
        const up = await store.updateReferral(row.id, { returned_at: nowIso(seenMs) }, { expect: "pending" });
        if (up.length) cur = up[0];
      }
      const out = await tryUnlock(cur, { io, now });
      if (out.decision === "pay" && out.paid) paid += 1;
      if (out.decision === "expire" && out.done) expired += 1;
    }
    return { paid, expired };
  } catch (err) {
    console.warn("[referrals] sweep failed:", err?.message || err);
    return { paid, expired, error: true };
  } finally {
    sweeping = false;
  }
}

let timer = null;
function startSweeper(io, { everyMs = 5 * 60 * 1000 } = {}) {
  setIo(io);
  if (timer || process.env.NODE_ENV === "test") return;
  timer = setInterval(() => void sweep({ io }), everyMs);
  timer.unref?.();
  setTimeout(() => void sweep({ io }), 30_000).unref?.();
}

// ---------------------------------------------------------------- admin actions
function cleanReason(code) {
  return texts.REASON_CODES.includes(code) ? code : "other";
}

async function inviterOf(inviterId) {
  const u = await store.userById(inviterId);
  if (!u) {
    const err = new Error("Inviter not found.");
    err.status = 404;
    err.code = "INVITER_NOT_FOUND";
    throw err;
  }
  return u;
}

async function targetRows(inviterId, ids, statuses) {
  const rows = ids && ids.length ? await store.referralsByIds(ids) : await store.referralsByInviter(inviterId);
  return rows.filter((r) => String(r.inviter_id) === String(inviterId) && statuses.includes(r.status));
}

async function writeNotice({ userId, kind, text, amount = 0, actionId, io }) {
  if (!text) return null;
  const n = await store.insertNotice({ user_id: userId, kind, text: String(text).slice(0, 600), amount, action_id: actionId });
  if (n) emitTo(io, userId, "invites:notice", { id: n.id, kind, text: n.text, amount, at: n.created_at });
  return n;
}

/** The text a person will see, in their language (admin preview). */
async function previewNotice({ userId, kind, count = 1, amount = 0, reasonCode = "other", note = "" }) {
  const u = await store.userById(userId);
  return { lang: texts.langOf(u?.language), text: texts.noticeText(kind, { lang: u?.language, count, amount, reasonCode: cleanReason(reasonCode), note }) };
}

/** Admin: hold pending rewards (all pending of the inviter, or the given ids). */
async function holdRewards({ actor, inviterId, ids = null, reasonCode = "other", note = "", message = null, notifyInviter = false, io = null, now = Date.now() }) {
  const inviter = await inviterOf(inviterId);
  const rows = await targetRows(inviterId, ids, ["pending"]);
  if (!rows.length) return { count: 0 };
  const reason = cleanReason(reasonCode);
  const changed = [];
  for (const r of rows) {
    const up = await store.updateReferral(r.id, { status: "held", hold_reason: reason, held_at: nowIso(now), held_by: actor?.id || null, auto_hold: false }, { expect: "pending" });
    if (up.length) changed.push(r);
  }
  const actionId = crypto.randomUUID();
  const text = notifyInviter ? message || texts.noticeText("holdInviter", { lang: inviter.language, count: changed.length, reasonCode: reason, note }) : null;
  await store.insertAction({
    id: actionId,
    actor_id: actor?.id || null,
    actor_username: actor?.username || null,
    action: "hold",
    inviter_id: inviterId,
    referral_ids: changed.map((r) => r.id),
    reason_code: reason,
    note: note || null,
    user_message: text,
    notify_inviter: Boolean(notifyInviter),
    payload: { prev: changed.map((r) => ({ id: r.id, status: "pending" })) },
    undo_until: nowIso(now + UNDO_MS),
  });
  if (text) await writeNotice({ userId: inviterId, kind: "hold", text, actionId, io });
  audit(actor, "invite_hold", inviterId, { username: inviter.username, count: changed.length, reason, note: note || undefined, actionId });
  emitTo(io, inviterId, "invites:update", { kind: "review" });
  pingAdmins(io, { kind: "hold", inviterId });
  return { actionId, count: changed.length, undoUntil: nowIso(now + UNDO_MS) };
}

/** Admin: release held rewards back to pending (they pay when the conditions hold). */
async function releaseRewards({ actor, inviterId, ids = null, notifyInviter = false, io = null, now = Date.now() }) {
  const inviter = await inviterOf(inviterId);
  const rows = await targetRows(inviterId, ids, ["held"]);
  if (!rows.length) return { count: 0 };
  const changed = [];
  for (const r of rows) {
    const up = await store.updateReferral(r.id, { status: "pending", hold_reason: null, held_at: null, held_by: null, auto_hold: false }, { expect: "held" });
    if (up.length) changed.push({ before: r, after: up[0] });
  }
  const actionId = crypto.randomUUID();
  const text = notifyInviter ? texts.noticeText("releaseInviter", { lang: inviter.language, count: changed.length }) : null;
  await store.insertAction({
    id: actionId,
    actor_id: actor?.id || null,
    actor_username: actor?.username || null,
    action: "release",
    inviter_id: inviterId,
    referral_ids: changed.map((c) => c.before.id),
    user_message: text,
    notify_inviter: Boolean(notifyInviter),
    payload: { prev: changed.map((c) => ({ id: c.before.id, status: "held", hold_reason: c.before.hold_reason, auto_hold: Boolean(c.before.auto_hold) })) },
    undo_until: nowIso(now + UNDO_MS),
  });
  if (text) await writeNotice({ userId: inviterId, kind: "release", text, actionId, io });
  audit(actor, "invite_release", inviterId, { username: inviter.username, count: changed.length, actionId });
  for (const c of changed) await tryUnlock(c.after, { io, now }).catch(() => null);
  emitTo(io, inviterId, "invites:update", { kind: "release" });
  pingAdmins(io, { kind: "release", inviterId });
  return { actionId, count: changed.length, undoUntil: nowIso(now + UNDO_MS) };
}

/**
 * Admin: take rewards back. Paid rows debit the inviter side (what the wallet still holds),
 * pending / held rows are closed without money. Milestones that are no longer reached are
 * taken back too. Reason is required; the inviter (and optionally the invitees) get the
 * previewed text. 10 minute undo puts everything back.
 */
async function revokeRewards({ actor, inviterId, ids = null, reasonCode, note = "", message = null, notifyInviter = true, notifyInvitees = false, io = null, now = Date.now() }) {
  if (!reasonCode) {
    const err = new Error("A reason is required.");
    err.status = 400;
    err.code = "REASON_REQUIRED";
    throw err;
  }
  const reason = cleanReason(reasonCode);
  if (reason === "other" && !String(note || "").trim()) {
    const err = new Error("Write a note for the reason \"other\".");
    err.status = 400;
    err.code = "NOTE_REQUIRED";
    throw err;
  }
  const inviter = await inviterOf(inviterId);
  const rows = await targetRows(inviterId, ids, ["pending", "held", "paid"]);
  if (!rows.length) return { count: 0, amount: 0 };
  const actionId = crypto.randomUUID();
  const descoin = d().descoin;
  const prev = [];
  let amount = 0;
  for (const r of rows) {
    const up = await store.updateReferral(
      r.id,
      { status: "revoked", revoked_at: nowIso(now), revoked_by: actor?.id || null, revoke_reason: reason },
      { expect: r.status }
    );
    if (!up.length) continue;
    let debited = 0;
    if (r.status === "paid" && !r.inviter_skip && r.inviter_amount > 0) {
      try {
        const out = await descoin.debitIdempotent(inviterId, r.inviter_amount, "referral_revoke", `referral:revoke:${actionId}:${r.id}`, { referralId: String(r.id), actionId, reason }, { partial: true });
        debited = out.debited || 0;
      } catch (err) {
        console.warn("[referrals] revoke debit failed:", err?.message || err);
      }
      if (debited) await store.updateReferral(r.id, { revoked_amount: debited }, { expect: "revoked" });
    }
    amount += debited;
    prev.push({ id: r.id, status: r.status, debited });
  }
  // Milestones above the new active count are no longer earned.
  const milestones = [];
  const count = await activeCount(inviterId);
  for (const m of await store.listMilestones(inviterId)) {
    if (m.revoked_at || Number(m.milestone) <= count) continue;
    let debited = 0;
    try {
      const out = await descoin.debitIdempotent(inviterId, m.amount, "referral_revoke", `referral:revoke:${actionId}:m${m.milestone}`, { milestone: m.milestone, actionId, reason }, { partial: true });
      debited = out.debited || 0;
    } catch (err) {
      console.warn("[referrals] milestone revoke failed:", err?.message || err);
    }
    await store.releaseMilestone(inviterId, m.milestone).catch(() => {});
    milestones.push({ milestone: Number(m.milestone), amount: m.amount, item_id: m.item_id || null, reached_at: m.reached_at, debited });
    amount += debited;
  }
  const text = notifyInviter
    ? message || texts.noticeText("revokeInviter", { lang: inviter.language, count: prev.length, amount, reasonCode: reason, note })
    : null;
  await store.insertAction({
    id: actionId,
    actor_id: actor?.id || null,
    actor_username: actor?.username || null,
    action: "revoke",
    inviter_id: inviterId,
    referral_ids: prev.map((p) => p.id),
    amount,
    reason_code: reason,
    note: note || null,
    user_message: text,
    notify_inviter: Boolean(notifyInviter),
    notify_invitees: Boolean(notifyInvitees),
    payload: { prev, milestones },
    undo_until: nowIso(now + UNDO_MS),
  });
  if (text) await writeNotice({ userId: inviterId, kind: "revoke", text, amount, actionId, io });
  if (notifyInvitees) {
    const invitees = await store.usersByIds(rows.map((r) => r.invitee_id));
    for (const p of prev) {
      const row = rows.find((r) => String(r.id) === String(p.id));
      const u = invitees.get(String(row?.invitee_id));
      if (!u) continue;
      await writeNotice({ userId: u.id, kind: "revoke_invitee", text: texts.noticeText("revokeInvitee", { lang: u.language, reasonCode: reason, note }), actionId, io });
    }
  }
  const bal = await descoin.getBalance(inviterId).catch(() => null);
  if (amount > 0 && bal != null) emitTo(io, inviterId, "descoin:balance", { balance: bal, delta: -amount, reason: "referral_revoke" });
  audit(actor, "invite_revoke", inviterId, { username: inviter.username, count: prev.length, amount, reason, note: note || undefined, actionId });
  emitTo(io, inviterId, "invites:update", { kind: "revoke" });
  pingAdmins(io, { kind: "revoke", inviterId });
  return { actionId, count: prev.length, amount, undoUntil: nowIso(now + UNDO_MS) };
}

/** Admin: pause / resume the inviter's link (new sign-ups through it earn nothing). */
async function setLinkPaused({ actor, inviterId, paused, reasonCode = "other", note = "", notifyInviter = false, io = null, now = Date.now() }) {
  const inviter = await inviterOf(inviterId);
  const before = await store.getInviterState(inviterId);
  await store.upsertInviterState(inviterId, {
    link_paused: Boolean(paused),
    paused_reason: paused ? cleanReason(reasonCode) : null,
    paused_at: paused ? nowIso(now) : null,
    paused_by: paused ? actor?.id || null : null,
    device_hashes: before.device_hashes || [],
    subnet_hashes: before.subnet_hashes || [],
  });
  const actionId = crypto.randomUUID();
  const text = notifyInviter ? texts.noticeText(paused ? "pausedInviter" : "resumedInviter", { lang: inviter.language }) : null;
  await store.insertAction({
    id: actionId,
    actor_id: actor?.id || null,
    actor_username: actor?.username || null,
    action: paused ? "pause" : "resume",
    inviter_id: inviterId,
    reason_code: paused ? cleanReason(reasonCode) : null,
    note: note || null,
    user_message: text,
    notify_inviter: Boolean(notifyInviter),
    payload: { prev: { link_paused: Boolean(before.link_paused), paused_reason: before.paused_reason || null } },
    undo_until: nowIso(now + UNDO_MS),
  });
  if (text) await writeNotice({ userId: inviterId, kind: paused ? "pause" : "resume", text, actionId, io });
  audit(actor, paused ? "invite_pause_link" : "invite_resume_link", inviterId, { username: inviter.username, reason: paused ? cleanReason(reasonCode) : undefined, actionId });
  emitTo(io, inviterId, "invites:update", { kind: paused ? "paused" : "resumed" });
  return { actionId, paused: Boolean(paused), undoUntil: nowIso(now + UNDO_MS) };
}

/** Admin: publish a new rules version. */
async function publishRules({ actor, input, note = "", now = Date.now() }) {
  const rulesLib = require("./rules");
  const current = await store.getRules({ fresh: true });
  const next = rulesLib.validateRules(input, current.rules);
  const diff = rulesLib.diffRules(current.rules, next);
  if (!diff.length) return { version: current.version, unchanged: true, diff };
  const saved = await store.saveRules(next, { actorId: actor?.id || null, note: String(note || "").slice(0, 200) || null });
  if (!saved.ok) {
    const err = new Error("Invite rules are not migrated yet.");
    err.status = 503;
    err.code = "REFERRALS_UNAVAILABLE";
    throw err;
  }
  const actionId = crypto.randomUUID();
  await store.insertAction({
    id: actionId,
    actor_id: actor?.id || null,
    actor_username: actor?.username || null,
    action: "rules",
    note: note || null,
    payload: { from: current.version, to: saved.version, diff, prevRules: current.rules },
    undo_until: nowIso(now + UNDO_MS),
  });
  audit(actor, "invite_rules", `v${saved.version}`, { from: current.version, to: saved.version, diff: diff.slice(0, 12), actionId });
  return { version: saved.version, diff, actionId, undoUntil: nowIso(now + UNDO_MS) };
}

/** Admin: the anomaly banner's "Yoksay" (release its automatic holds) or "İncele". */
async function handleAlert({ actor, alertId, decision, io = null, now = Date.now() }) {
  const alert = await store.getAlert(alertId);
  if (!alert) {
    const err = new Error("Alert not found.");
    err.status = 404;
    err.code = "ALERT_NOT_FOUND";
    throw err;
  }
  if (decision === "review") {
    await store.updateAlert(alertId, { status: "reviewed", handled_by: actor?.id || null, handled_at: nowIso(now) });
    return { status: "reviewed" };
  }
  await store.updateAlert(alertId, { status: "ignored", handled_by: actor?.id || null, handled_at: nowIso(now) });
  const ids = Array.isArray(alert.detail?.referralIds) ? alert.detail.referralIds : [];
  const rows = ids.length ? (await store.referralsByIds(ids)).filter((r) => r.status === "held" && r.auto_hold && r.hold_reason === "anomaly") : [];
  const changed = [];
  for (const r of rows) {
    const up = await store.updateReferral(r.id, { status: "pending", hold_reason: null, held_at: null, auto_hold: false }, { expect: "held" });
    if (up.length) changed.push({ before: r, after: up[0] });
  }
  const actionId = crypto.randomUUID();
  await store.insertAction({
    id: actionId,
    actor_id: actor?.id || null,
    actor_username: actor?.username || null,
    action: "alert_ignore",
    inviter_id: alert.inviter_id,
    referral_ids: changed.map((c) => c.before.id),
    payload: { alertId, prev: changed.map((c) => ({ id: c.before.id, status: "held", hold_reason: "anomaly", auto_hold: true })) },
    undo_until: nowIso(now + UNDO_MS),
  });
  audit(actor, "invite_alert_ignore", alert.inviter_id, { released: changed.length, actionId });
  for (const c of changed) await tryUnlock(c.after, { io, now }).catch(() => null);
  return { status: "ignored", released: changed.length, actionId, undoUntil: nowIso(now + UNDO_MS) };
}

/** Admin: undo one action within 10 minutes. */
async function undoAction({ actor, actionId, io = null, now = Date.now() }) {
  const a = await store.getAction(actionId);
  if (!a) {
    const err = new Error("Action not found.");
    err.status = 404;
    err.code = "ACTION_NOT_FOUND";
    throw err;
  }
  if (a.undone_at) {
    const err = new Error("This action was already undone.");
    err.status = 409;
    err.code = "ALREADY_UNDONE";
    throw err;
  }
  if (!a.undo_until || new Date(a.undo_until).getTime() < now) {
    const err = new Error("The 10 minute undo window has passed.");
    err.status = 409;
    err.code = "UNDO_EXPIRED";
    throw err;
  }
  if (!(await store.markActionUndone(a.id, actor?.id || null))) {
    const err = new Error("This action was already undone.");
    err.status = 409;
    err.code = "ALREADY_UNDONE";
    throw err;
  }
  const prev = a.payload?.prev;
  let restored = 0;
  let refunded = 0;
  const descoin = d().descoin;
  if (a.action === "hold" || a.action === "auto_hold") {
    for (const p of prev || []) {
      const up = await store.updateReferral(p.id, { status: "pending", hold_reason: null, held_at: null, held_by: null, auto_hold: false }, { expect: "held" });
      if (up.length) {
        restored += 1;
        await tryUnlock(up[0], { io, now }).catch(() => null);
      }
    }
  } else if (a.action === "release" || a.action === "alert_ignore") {
    for (const p of prev || []) {
      const up = await store.updateReferral(p.id, { status: "held", hold_reason: p.hold_reason || "review", held_at: nowIso(now), auto_hold: Boolean(p.auto_hold) }, { expect: "pending" });
      if (up.length) restored += 1;
    }
    if (a.action === "alert_ignore" && a.payload?.alertId) await store.updateAlert(a.payload.alertId, { status: "open", handled_by: null, handled_at: null }).catch(() => null);
  } else if (a.action === "revoke") {
    for (const p of prev || []) {
      const up = await store.updateReferral(p.id, { status: p.status, revoked_at: null, revoked_by: null, revoke_reason: null, revoked_amount: 0 }, { expect: "revoked" });
      if (!up.length) continue;
      restored += 1;
      if (p.debited > 0) {
        const out = await descoin.creditIdempotent(a.inviter_id, p.debited, "referral_invite", `referral:undo:${a.id}:${p.id}`, { referralId: String(p.id), undoOf: a.id });
        refunded += out.credited || 0;
      }
    }
    for (const m of a.payload?.milestones || []) {
      await store.claimMilestone(a.inviter_id, m.milestone, m.amount, m.item_id).catch(() => false);
      if (m.debited > 0) {
        const out = await descoin.creditIdempotent(a.inviter_id, m.debited, "referral_milestone", `referral:undo:${a.id}:m${m.milestone}`, { milestone: m.milestone, undoOf: a.id });
        refunded += out.credited || 0;
      }
    }
    if (refunded > 0) {
      const bal = await descoin.getBalance(a.inviter_id).catch(() => null);
      if (bal != null) emitTo(io, a.inviter_id, "descoin:balance", { balance: bal, delta: refunded, reason: "referral_invite" });
    }
  } else if (a.action === "pause" || a.action === "resume") {
    const before = await store.getInviterState(a.inviter_id);
    await store.upsertInviterState(a.inviter_id, {
      link_paused: Boolean(prev?.link_paused),
      paused_reason: prev?.paused_reason || null,
      device_hashes: before.device_hashes || [],
      subnet_hashes: before.subnet_hashes || [],
    });
    restored = 1;
  } else if (a.action === "rules") {
    const saved = await store.saveRules(a.payload?.prevRules || require("./rules").DEFAULT_RULES, { actorId: actor?.id || null, note: `undo v${a.payload?.to}` });
    restored = saved.ok ? 1 : 0;
  }
  const withdrawn = await store.withdrawNotices(a.id);
  for (const n of withdrawn) emitTo(io, n.user_id, "invites:notice-withdrawn", { id: n.id });
  audit(actor, "invite_undo", a.inviter_id || null, { of: a.action, actionId: a.id, restored, refunded });
  if (a.inviter_id) emitTo(io, a.inviter_id, "invites:update", { kind: "undo" });
  pingAdmins(io, { kind: "undo", inviterId: a.inviter_id });
  return { undone: true, action: a.action, restored, refunded };
}

module.exports = {
  UNDO_MS,
  setIo,
  recordSignup,
  checkAnomaly,
  noteFirstMessage,
  noteSeen,
  tryUnlock,
  pay,
  checkMilestones,
  sweep,
  startSweeper,
  previewNotice,
  holdRewards,
  releaseRewards,
  revokeRewards,
  setLinkPaused,
  publishRules,
  handleAlert,
  undoAction,
  signupFingerprint,
  __setDepsForTests,
  __resetCaches,
};
