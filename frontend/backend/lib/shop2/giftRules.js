"use strict";

/**
 * Gift rules (pure): daily caps, new-account limits, schedule window, and ring detection
 * (coins laundered around a circle of accounts: A -> B -> C -> A, or a fast back-and-forth).
 */

const { normalizeLimits } = require("./rules");
const time = require("./time");

/**
 * @returns {{ ok: true } | { ok: false, code: string, vars?: object }}
 */
function checkGift(p) {
  const g = normalizeLimits({ gifts: p.limits || {} }).gifts;
  const now = time.ms(p.now) ?? Date.now();
  if (!g.enabled || g.frozen) return { ok: false, code: "gifts_paused" };
  if (!p.senderId || !p.recipientId || p.senderId === p.recipientId) return { ok: false, code: "gift_self" };
  const ageDays = p.senderCreatedAt ? (now - time.ms(p.senderCreatedAt)) / time.DAY_MS : Infinity;
  if (ageDays < g.minAccountDaysSend) return { ok: false, code: "gift_new_account", vars: { days: g.minAccountDaysSend } };
  if (p.kind === "set" && ageDays < g.minAccountDaysSetBuy) return { ok: false, code: "gift_new_account_set", vars: { days: g.minAccountDaysSetBuy } };
  if ((p.sentToday || 0) >= g.perDay) return { ok: false, code: "gift_daily_cap", vars: { max: g.perDay } };
  if ((p.sentToRecipientToday || 0) >= g.perRecipientDay) return { ok: false, code: "gift_recipient_cap", vars: { max: g.perRecipientDay } };
  if ((p.recipientReceivedToday || 0) >= g.receivePerDay) return { ok: false, code: "gift_receive_cap", vars: { max: g.receivePerDay } };
  if (typeof p.message === "string" && p.message.length > g.maxMessage) return { ok: false, code: "gift_message_long", vars: { max: g.maxMessage } };
  if (p.sendAt != null) {
    const at = time.ms(p.sendAt);
    if (at == null) return { ok: false, code: "gift_bad_time" };
    if (at > now + g.maxScheduleDays * time.DAY_MS) return { ok: false, code: "gift_too_far", vars: { days: g.maxScheduleDays } };
  }
  return { ok: true };
}

/**
 * Ring check for a new gift edge. `edges` = recent gifts [{ from, to, at, amount }].
 * cycle: a path to -> ... -> from (length <= maxDepth) inside the window closes a ring.
 * pingPong: both directions between the pair at least twice each inside the window.
 */
function detectRing(edges, edge, { windowDays = 7, maxDepth = 4, now = Date.now() } = {}) {
  const since = now - windowDays * time.DAY_MS;
  const recent = (edges || []).filter((e) => (time.ms(e.at) ?? now) >= since && e.from && e.to && e.from !== e.to);
  const out = new Map();
  for (const e of recent) {
    if (!out.has(e.from)) out.set(e.from, new Set());
    out.get(e.from).add(e.to);
  }
  // BFS from edge.to looking for edge.from.
  let cycle = null;
  const queue = [[edge.to]];
  const seen = new Set([edge.to]);
  while (queue.length && !cycle) {
    const path = queue.shift();
    if (path.length > maxDepth) continue;
    const last = path[path.length - 1];
    for (const nxt of out.get(last) || []) {
      if (nxt === edge.from) {
        cycle = [edge.from, ...path, edge.from];
        break;
      }
      if (!seen.has(nxt)) {
        seen.add(nxt);
        queue.push([...path, nxt]);
      }
    }
  }
  const ab = recent.filter((e) => e.from === edge.from && e.to === edge.to).length + 1;
  const ba = recent.filter((e) => e.from === edge.to && e.to === edge.from).length;
  const pingPong = ab >= 2 && ba >= 2;
  const amount = recent.filter((e) => cycle && cycle.includes(e.from) && cycle.includes(e.to)).reduce((a, e) => a + (Number(e.amount) || 0), 0) + (Number(edge.amount) || 0);
  return { ring: Boolean(cycle) || pingPong, cycle, pingPong, amount };
}

/** "What if yesterday": how many of `gifts` the given limits would have refused. */
function impactOf(gifts, limits, { usersById = new Map() } = {}) {
  const sorted = [...(gifts || [])].sort((a, b) => time.ms(a.at) - time.ms(b.at));
  const sent = new Map();
  const pair = new Map();
  const recv = new Map();
  let blocked = 0;
  let blockedAmount = 0;
  const byCode = {};
  for (const g of sorted) {
    const day = time.dayKey(g.at);
    const sk = `${g.from}|${day}`;
    const pk = `${g.from}|${g.to}|${day}`;
    const rk = `${g.to}|${day}`;
    const v = checkGift({
      limits,
      now: time.ms(g.at),
      senderId: g.from,
      recipientId: g.to,
      senderCreatedAt: usersById.get(g.from)?.created_at || null,
      kind: g.kind,
      sentToday: sent.get(sk) || 0,
      sentToRecipientToday: pair.get(pk) || 0,
      recipientReceivedToday: recv.get(rk) || 0,
    });
    if (!v.ok) {
      blocked += 1;
      blockedAmount += Number(g.amount) || 0;
      byCode[v.code] = (byCode[v.code] || 0) + 1;
      continue;
    }
    sent.set(sk, (sent.get(sk) || 0) + 1);
    pair.set(pk, (pair.get(pk) || 0) + 1);
    recv.set(rk, (recv.get(rk) || 0) + 1);
  }
  return { total: sorted.length, blocked, blockedAmount, byCode };
}

module.exports = { checkGift, detectRing, impactOf };
