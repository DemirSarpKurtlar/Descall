"use strict";

/**
 * Okey bot. It sees only what a player at the table sees (okey.botKnowledge):
 * its own rack, the indicator, every discard stack and the pile size.
 *
 * Hand evaluation (in "tile units", higher is better):
 *   sets plan : tiles placed in melds by the best partition (exact search,
 *               okeys as wilds) + partial-meld potential of the leftovers
 *               (two of a run with a gap of at most one, two of a group), each
 *               weighted by how many of the missing tiles are still live
 *               (not visible in discards, the indicator or the own rack).
 *   pairs plan: 2 per pair (wilds complete singles) + live singles; only
 *               counted from 4 pairs up, so the bot switches plan when a pairs
 *               finish is genuinely closer.
 * Decisions:
 *   finish    : always, choosing the discard that scores most (okey discard,
 *               pairs) when several finish.
 *   draw      : the previous discard when it finishes the hand or raises the
 *               evaluation by at least a meld step; otherwise the pile.
 *   discard   : the tile whose removal keeps the best evaluation; a real okey
 *               is never thrown unless it finishes.
 * Levels: easy (sets plan only, no potential, 35% sloppy discards, rarely takes
 * discards), medium (full evaluation, 12% second-choice discards), hard (full
 * evaluation with live-tile counting, takes discards a little more readily).
 * Measured over 80 all-bot matches with seats swapped: hard 147 vs easy 60 hand
 * wins, hard 217 vs medium 209.
 */

const R = require("./okeyRules");

const LEVEL = {
  easy: { potential: false, pairs: false, live: false, sloppy: 0.35, takeMargin: 2.5, showIndicator: 0.5 },
  medium: { potential: true, pairs: true, live: false, sloppy: 0.12, takeMargin: 0.9, showIndicator: 1 },
  hard: { potential: true, pairs: true, live: true, sloppy: 0, takeMargin: 0.75, showIndicator: 1 },
};

function levelOf(level) {
  return LEVEL[level] || LEVEL.medium;
}

/** How many copies of each face are still unseen by this bot (0..2). */
function liveCounts(k, rack) {
  const seen = new Array(52).fill(0);
  const add = (id) => {
    if (R.isFake(id)) return; // a false okey shows the okey face but is its own tile
    seen[id % 52]++;
  };
  for (const id of rack) add(id);
  for (const d of k.discards) for (const id of d) add(id);
  add(k.indicator);
  return seen.map((n) => Math.max(0, 2 - n));
}

function potentialOf(restIds, okeyFace, live) {
  const faces = [];
  for (const id of restIds) {
    const f = R.meldFace(id, okeyFace);
    if (f !== R.WILD) faces.push(f);
  }
  const avail = (f) => (live ? Math.min(2, live[f]) / 2 : 1);
  let pot = 0;
  const uses = new Array(faces.length).fill(0);
  for (let a = 0; a < faces.length; a++) {
    for (let b = a + 1; b < faces.length; b++) {
      const fa = faces[a];
      const fb = faces[b];
      if (fa === fb) continue; // a duplicate is only good for pairs
      const ca = R.faceColor(fa);
      const cb = R.faceColor(fb);
      const na = R.faceNum(fa);
      const nb = R.faceNum(fb);
      let v = 0;
      if (ca === cb) {
        const lo = Math.min(na, nb);
        const hi = Math.max(na, nb);
        const d = hi - lo;
        if (d === 1) {
          const below = lo > 1 ? avail(R.faceIndex(ca, lo - 1)) : 0;
          const above = hi < 13 ? avail(R.faceIndex(ca, hi + 1)) : hi === 13 ? avail(R.faceIndex(ca, 1)) : 0;
          v = 0.35 * Math.min(1, below + above);
        } else if (d === 2) {
          v = 0.25 * avail(R.faceIndex(ca, lo + 1));
        } else if (lo === 1 && (hi === 13 || hi === 12)) {
          // 12/13 with a 1 (1 played high)
          v = hi === 13 ? 0.3 * avail(R.faceIndex(ca, 12)) : 0.22 * avail(R.faceIndex(ca, 13));
        }
      } else if (na === nb) {
        let missing = 0;
        for (let col = 0; col < 4; col++) if (col !== ca && col !== cb) missing += avail(R.faceIndex(col, na));
        v = 0.3 * Math.min(1, missing);
      }
      if (v > 0) {
        // Each tile counts in at most two partial melds; keeps a cluster from inflating.
        if (uses[a] >= 2 || uses[b] >= 2) continue;
        uses[a]++;
        uses[b]++;
        pot += v;
      }
    }
  }
  return pot;
}

function pairsValue(ids, okeyFace, live) {
  const { counts, wilds } = R.countHand(ids, okeyFace);
  const p = R.pairsInfo(counts, wilds);
  if (p.total < 4) return 0;
  let v = 2 * p.total;
  // Singles that can still be paired (their twin is unseen) are worth a little.
  let liveSingles = 0;
  for (let f = 0; f < 52; f++) if (counts[f] === 1 && (!live || live[f] > 0)) liveSingles++;
  v += 0.25 * Math.min(liveSingles, 14 - 2 * p.total);
  return v;
}

/** Evaluation of a hand of 14 (or any size) for the bot. */
function evaluate(ids, k, lv, live) {
  const part = R.bestPartition(ids, k.okeyFace);
  let sets = part.score;
  if (lv.potential) sets += potentialOf(part.rest, k.okeyFace, lv.live ? live : null);
  const pairs = lv.pairs ? pairsValue(ids, k.okeyFace, lv.live ? live : null) : 0;
  return Math.max(sets, pairs);
}

function finishScore(win, tile, okeyFace) {
  const okeyDiscard = R.isOkey(tile, okeyFace);
  return (win.kind === "pairs" ? 4 : 2) * (okeyDiscard ? 2 : 1);
}

/** Best finishing discard for a 15-tile rack, or null. */
function findFinish(rack, okeyFace) {
  // Cheap necessary conditions first: a winning 14 inside 15 tiles means the
  // 15 tiles place at least 14 in melds, or hold 7 pairs.
  const { counts, wilds } = R.countHand(rack, okeyFace);
  if (R.pairsInfo(counts, wilds).total < 7 && R.searchMelds(counts, wilds, "max").score < 14) return null;
  let best = null;
  const tried = new Set();
  for (const t of rack) {
    const face = R.isOkey(t, okeyFace) ? "W" : R.meldFace(t, okeyFace);
    if (tried.has(face)) continue;
    tried.add(face);
    const rest = rack.filter((x) => x !== t);
    const win = R.findWin(rest, okeyFace);
    if (!win) continue;
    const score = finishScore(win, t, okeyFace);
    if (!best || score > best.score) best = { tile: t, score, kind: win.kind };
  }
  return best;
}

/** Discard candidates: leftovers of the best partition plus the ends of long melds. */
function discardCandidates(rack, okeyFace) {
  const part = R.bestPartition(rack, okeyFace);
  const cand = new Set();
  for (const t of part.rest) if (!R.isOkey(t, okeyFace)) cand.add(t);
  for (const m of part.melds) {
    if (m.length >= 4) {
      for (const t of [m[0], m[m.length - 1]]) if (!R.isOkey(t, okeyFace)) cand.add(t);
    }
  }
  // Pairs plans may want to break a meld: duplicates of a face are candidates too.
  if (cand.size < 3) for (const t of rack) if (!R.isOkey(t, okeyFace)) cand.add(t);
  if (cand.size === 0) for (const t of rack) cand.add(t); // only okeys left (cannot happen with 15 tiles)
  return Array.from(cand);
}

/**
 * Choose a discard from a 15-tile rack. Returns { action, value }.
 * `rng` may be null (deterministic choice).
 */
function chooseDiscard(k, level, rng) {
  const lv = levelOf(level);
  const rack = k.rack;
  const fin = findFinish(rack, k.okeyFace);
  if (fin) return { action: { type: "finish", tile: fin.tile }, value: 100 };
  const live = lv.live ? liveCounts(k, rack) : null;
  const cands = discardCandidates(rack, k.okeyFace);
  let best = null;
  const scored = [];
  const seenFace = new Map();
  for (const t of cands) {
    const face = R.meldFace(t, k.okeyFace);
    let v;
    if (seenFace.has(face)) v = seenFace.get(face);
    else {
      v = evaluate(rack.filter((x) => x !== t), k, lv, live);
      seenFace.set(face, v);
    }
    let score = v;
    // Prefer throwing high numbers on ties (they cost more in some house rules and are harder to use).
    score += R.faceNum(face === R.WILD ? 0 : face) * 0.001;
    scored.push({ t, score, v });
    if (!best || score > best.score || (score === best.score && t < best.t)) best = { t, score, v };
  }
  if (rng && lv.sloppy > 0 && scored.length > 1 && rng.float() < lv.sloppy) {
    scored.sort((a, b) => b.score - a.score || a.t - b.t);
    const pick = scored[Math.min(scored.length - 1, 1 + rng.int(Math.min(3, scored.length - 1)))];
    return { action: { type: "discard", tile: pick.t }, value: pick.v };
  }
  return { action: { type: "discard", tile: best.t }, value: best.v };
}

/** Draw decision for a 14-tile rack. */
function chooseDraw(k, level) {
  const lv = levelOf(level);
  const prev = (k.seat + 3) % 4;
  const stack = k.discards[prev];
  if (!stack || stack.length === 0) return { type: "draw", from: "pile" };
  const top = stack[stack.length - 1];
  const withTop = k.rack.concat([top]);
  if (findFinish(withTop, k.okeyFace)) return { type: "draw", from: "discard" };
  // An okey on the discard pile is always worth taking.
  if (R.isOkey(top, k.okeyFace)) return { type: "draw", from: "discard" };
  const live = lv.live ? liveCounts(k, k.rack) : null;
  const now = evaluate(k.rack, k, lv, live);
  const after = chooseDiscard({ ...k, rack: withTop }, level, null);
  if (after.action.type === "discard" && after.action.tile === top) return { type: "draw", from: "pile" };
  return after.value >= now + lv.takeMargin ? { type: "draw", from: "discard" } : { type: "draw", from: "pile" };
}

/** One bot decision for the seat to move. */
function decide(k, level, rng) {
  const lv = levelOf(level);
  if (k.canShowIndicator && (!rng || rng.float() < lv.showIndicator)) return { type: "showIndicator" };
  if (k.step === "draw") return chooseDraw(k, level);
  return chooseDiscard(k, level, rng).action;
}

module.exports = { decide, chooseDiscard, chooseDraw, evaluate, findFinish, liveCounts, LEVEL };
