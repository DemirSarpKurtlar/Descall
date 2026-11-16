"use strict";

/**
 * Publishing timeline (pure): two-week lanes (rule versions, sets, night markets, events,
 * daily revenue) and clash detection.
 */

const time = require("./time");

const CLASH_RULES = {
  maxLiveSets: 3,
  legendaryWeightMax: 0.3,
};

function overlaps(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

/**
 * @param {object} p { sets:[{key,startsAt,endsAt,status,topRarityCount}], nights:[{id,startsAt,endsAt,status}],
 *                     rules:[{version,applyAt,status,weights}], events:[{id,startsAt,endsAt}], from, days }
 * @returns [{ code, severity: "warn"|"info", day, refs: [...] }]
 */
function detectClashes(p) {
  const out = [];
  const sets = (p.sets || []).filter((s) => s.startsAt && !["recalled", "archived", "draft"].includes(s.status));
  const days = time.dayRange(p.from || time.dayKey(), p.days || 14);
  const launchesByDay = new Map();
  for (const s of sets) {
    const d = time.dayKey(s.startsAt);
    if (!launchesByDay.has(d)) launchesByDay.set(d, []);
    launchesByDay.get(d).push(s);
  }
  for (const [day, list] of launchesByDay) {
    if (!days.includes(day)) continue;
    if (list.length >= 2) out.push({ code: "two_sets_same_day", severity: "warn", day, refs: list.map((s) => `set:${s.key}`) });
    const heavy = list.filter((s) => (s.topRarityCount || 0) > 0);
    if (heavy.length >= 2) out.push({ code: "legendary_density", severity: "warn", day, refs: heavy.map((s) => `set:${s.key}`) });
  }
  for (const day of days) {
    const t0 = time.dayStartMs(day);
    const t1 = t0 + time.DAY_MS;
    const live = sets.filter((s) => overlaps(time.ms(s.startsAt), time.ms(s.endsAt) ?? Infinity, t0, t1));
    if (live.length > CLASH_RULES.maxLiveSets) out.push({ code: "too_many_live_sets", severity: "warn", day, refs: live.map((s) => `set:${s.key}`), vars: { n: live.length, max: CLASH_RULES.maxLiveSets } });
  }
  for (const r of p.rules || []) {
    if (!r.applyAt || !["scheduled", "active"].includes(r.status)) continue;
    const at = time.ms(r.applyAt);
    const legendary = Number(r.weights?.rarity?.legendary) || 0;
    if (legendary > CLASH_RULES.legendaryWeightMax) out.push({ code: "legendary_density", severity: "warn", day: time.dayKey(at), refs: [`rule:${r.version}`], vars: { weight: legendary } });
    for (const n of p.nights || []) {
      if (["skipped", "cancelled"].includes(n.status)) continue;
      if (at >= time.ms(n.startsAt) && at < time.ms(n.endsAt)) out.push({ code: "rule_switch_during_night", severity: "warn", day: time.dayKey(at), refs: [`rule:${r.version}`, `night:${n.id}`] });
    }
  }
  for (const n of p.nights || []) {
    if (["skipped", "cancelled"].includes(n.status)) continue;
    const d = time.dayKey(n.startsAt);
    const launches = launchesByDay.get(d) || [];
    if (launches.length) out.push({ code: "night_on_launch_day", severity: "info", day: d, refs: [`night:${n.id}`, ...launches.map((s) => `set:${s.key}`)] });
  }
  for (const e of p.events || []) {
    const e0 = time.ms(e.startsAt);
    const e1 = time.ms(e.endsAt) ?? e0 + time.HOUR_MS;
    const hit = sets.filter((s) => {
      const s0 = time.ms(s.startsAt);
      return s0 >= e0 && s0 < e1;
    });
    if (hit.length) out.push({ code: "launch_during_event", severity: "info", day: time.dayKey(e0), refs: [`event:${e.id}`, ...hit.map((s) => `set:${s.key}`)] });
  }
  return out.filter((c) => days.includes(c.day)).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Lifecycle state of a set at `now`: draft | scheduled | live | last24h | soldout | ended | recalled | archived. */
function setLifecycle(set, now = Date.now()) {
  if (!set) return "draft";
  if (set.status === "recalled") return "recalled";
  if (set.status === "archived") return "archived";
  if (set.status === "draft") return "draft";
  const s = time.ms(set.startsAt);
  const e = time.ms(set.endsAt);
  if (s != null && now < s) return "scheduled";
  if (e != null && now >= e) return "ended";
  if (set.stockLimit != null && Number(set.stockSold) >= Number(set.stockLimit)) return "soldout";
  if (e != null && e - now <= time.DAY_MS) return "last24h";
  return "live";
}

module.exports = { CLASH_RULES, detectClashes, setLifecycle, overlaps };
