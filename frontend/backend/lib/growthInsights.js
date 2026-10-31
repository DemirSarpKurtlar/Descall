"use strict";

/**
 * Faz 3 (3.7.5): Elde tutma + DesCoin ekonomisi, pure math over rows the
 * route loads (routes/adminGrowth.js). Days are local calendar days
 * ("YYYY-MM-DD", Europe/Istanbul via the SQL helpers). Admin accounts are left
 * out of every number; their test grants would drown real activity.
 */

const DAY = 86400000;

function dayNum(d) {
  return Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
}
function dayStr(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}
/** Monday of the week that holds day number n. */
function weekStart(n) {
  const dow = (new Date(n * DAY).getUTCDay() + 6) % 7; // Monday = 0
  return n - dow;
}
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * @param {{ activity: {user_id: string, day: string}[], users: {id: string, signupDay: string|null, isAdmin?: boolean}[], today: string, days?: number, weeks?: number }} p
 */
function retentionReport({ activity, users, today, days = 30, weeks = 10 }) {
  const t = dayNum(today);
  const real = new Map();
  for (const u of users || []) if (!u.isAdmin && u.signupDay) real.set(String(u.id), dayNum(u.signupDay));
  const byUser = new Map();
  const byDay = new Map();
  for (const r of activity || []) {
    const id = String(r.user_id);
    if (!real.has(id)) continue;
    const n = dayNum(r.day);
    if (n > t) continue;
    if (!byUser.has(id)) byUser.set(id, new Set());
    byUser.get(id).add(n);
    if (!byDay.has(n)) byDay.set(n, new Set());
    byDay.get(n).add(id);
  }
  const activeIn = (from, to) => {
    const s = new Set();
    for (let n = from; n <= to; n++) for (const id of byDay.get(n) || []) s.add(id);
    return s.size;
  };

  // Daily actives, split into accounts that signed up that day and the rest.
  const series = [];
  for (let n = t - days + 1; n <= t; n++) {
    const ids = [...(byDay.get(n) || [])];
    const fresh = ids.filter((id) => real.get(id) === n).length;
    const signups = [...real.values()].filter((s) => s === n).length;
    series.push({ day: dayStr(n), active: ids.length, new: fresh, returning: ids.length - fresh, signups });
  }

  const dau = (byDay.get(t) || new Set()).size;
  const wau = activeIn(t - 6, t);
  const mau = activeIn(t - 29, t);
  const avgDau7 = series.slice(-7).reduce((a, s) => a + s.active, 0) / Math.max(1, Math.min(7, series.length));

  // Day-N return: of the accounts old enough, how many came back in the window.
  const back = (from, to) => {
    let eligible = 0;
    let kept = 0;
    for (const [id, s] of real) {
      if (s + to > t) continue;
      eligible += 1;
      const set = byUser.get(id);
      if (!set) continue;
      for (let n = s + from; n <= s + to; n++) if (set.has(n)) { kept += 1; break; }
    }
    return { eligible, kept, pct: pct(kept, eligible) };
  };

  // Weekly signup cohorts: share of the cohort active in each later week.
  const thisWeek = weekStart(t);
  const cohorts = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = thisWeek - w * 7;
    const members = [...real].filter(([, s]) => s >= start && s < start + 7).map(([id]) => id);
    const cells = [];
    for (let k = 0; start + k * 7 <= t; k++) {
      const from = start + k * 7;
      const to = Math.min(from + 6, t);
      let n = 0;
      for (const id of members) {
        const set = byUser.get(id);
        if (!set) continue;
        for (let d = from; d <= to; d++) if (set.has(d)) { n += 1; break; }
      }
      cells.push({ week: k, active: n, pct: pct(n, members.length), partial: to < from + 6 });
    }
    cohorts.push({ weekStart: dayStr(start), size: members.length, cells });
  }

  return {
    kpis: {
      dau,
      wau,
      mau,
      stickiness: mau ? Math.round((avgDau7 / mau) * 1000) / 10 : null,
      accounts: real.size,
      newInRange: [...real.values()].filter((s) => s > t - days).length,
    },
    returns: { d1: back(1, 1), w2: back(7, 13), m2: back(30, 59) },
    series,
    cohorts,
  };
}

/* ---------------- DesCoin ---------------- */

const SOURCE_GROUPS = {
  message_activity: "activity",
  voice_activity: "activity",
  screenshare_activity: "activity",
  daily_claim: "daily",
  promo: "promo",
  referral_welcome: "referral",
  referral_invite: "referral",
  shop_refund: "refund",
  shop_purchase: "shop",
  admin_grant: "admin",
  admin_revoke: "admin",
};
const groupOf = (reason) => SOURCE_GROUPS[reason] || "other";

/**
 * @param {{ flow: {day: string, reason: string, minted: number, spent: number, entries: number, accounts: number}[],
 *           balances: {id: string, username?: string, balance: number, isAdmin?: boolean, frozen?: boolean}[],
 *           purchases: {item_id: string, amount_descoin: number|null, status?: string, created_at: string}[],
 *           items: {id: string, name: string, category?: string}[], today: string, days?: number }} p
 */
function economyReport({ flow, balances, purchases, items, today, days = 30 }) {
  const t = dayNum(today);
  const from = t - days + 1;
  const inRange = (d) => {
    const n = dayNum(d);
    return n >= from && n <= t;
  };
  const sources = {};
  const sinks = {};
  const daily = new Map();
  for (let n = from; n <= t; n++) daily.set(n, { day: dayStr(n), minted: 0, spent: 0 });
  let adminGranted = 0;
  let adminRevoked = 0;
  for (const r of flow || []) {
    if (!inRange(r.day)) continue;
    const g = groupOf(r.reason);
    const minted = Number(r.minted) || 0;
    const spent = Number(r.spent) || 0;
    if (g === "admin") {
      adminGranted += minted;
      adminRevoked += spent;
      continue;
    }
    if (minted) sources[g] = (sources[g] || 0) + minted;
    if (spent) sinks[g] = (sinks[g] || 0) + spent;
    const slot = daily.get(dayNum(r.day));
    slot.minted += minted;
    slot.spent += spent;
  }
  const minted = Object.values(sources).reduce((a, b) => a + b, 0);
  const spent = Object.values(sinks).reduce((a, b) => a + b, 0);

  // Admins can hand out any amount; a few test accounts hold a billion. The
  // economy numbers use the "earned" part: balance minus what admins granted
  // (net of revokes) over the account's life. The granted part is its own KPI.
  const holders = (balances || []).filter((b) => !b.isAdmin).map((b) => {
    const balance = Math.max(0, Number(b.balance) || 0);
    const granted = Math.max(0, Number(b.granted) || 0);
    return { ...b, balance, granted, earned: Math.max(0, balance - granted) };
  });
  const supply = holders.reduce((a, b) => a + b.earned, 0);
  const grantedHeld = holders.reduce((a, b) => a + Math.min(b.balance, b.granted), 0);
  const sorted = [...holders].sort((a, b) => b.earned - a.earned || b.balance - a.balance);
  const withCoins = sorted.filter((b) => b.earned > 0);
  const asc = withCoins.map((b) => b.earned).sort((a, b) => a - b);
  const median = asc.length ? asc[Math.floor((asc.length - 1) / 2)] : 0;
  const topN = Math.max(1, Math.ceil(withCoins.length * 0.1));
  const top10Share = supply ? Math.round((withCoins.slice(0, topN).reduce((a, b) => a + b.earned, 0) / supply) * 1000) / 10 : null;

  const itemById = new Map((items || []).map((i) => [String(i.id), i]));
  const sales = new Map();
  for (const p of purchases || []) {
    if (!inRange(String(p.created_at).slice(0, 10))) continue;
    if (p.status && !["completed", "paid", "succeeded", "complete"].includes(String(p.status))) continue;
    const k = String(p.item_id);
    const it = itemById.get(k);
    const s = sales.get(k) || { itemId: k, name: it?.name || "?", category: it?.category || null, count: 0, descoin: 0 };
    s.count += 1;
    s.descoin += Number(p.amount_descoin) || 0;
    sales.set(k, s);
  }

  return {
    kpis: {
      supply,
      holders: withCoins.length,
      median,
      top10Share,
      minted,
      spent,
      net: minted - spent,
      sinkRatio: minted ? Math.round((spent / minted) * 1000) / 10 : null,
      adminGranted,
      adminRevoked,
      frozen: holders.filter((b) => b.frozen).length,
      grantedHeld,
    },
    sources: Object.entries(sources).map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount),
    sinks: Object.entries(sinks).map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount),
    daily: [...daily.values()],
    topHolders: sorted.slice(0, 10).map((b) => ({ id: b.id, username: b.username || null, earned: b.earned, balance: b.balance, granted: Math.min(b.balance, b.granted), share: supply ? Math.round((b.earned / supply) * 1000) / 10 : 0 })),
    grantedTop: [...holders].filter((b) => b.granted > 0).sort((a, b) => b.granted - a.granted).slice(0, 5).map((b) => ({ id: b.id, username: b.username || null, granted: b.granted, balance: b.balance })),
    bestSellers: [...sales.values()].sort((a, b) => b.count - a.count || b.descoin - a.descoin).slice(0, 10),
  };
}

module.exports = { retentionReport, economyReport, dayNum, dayStr, weekStart, groupOf };
