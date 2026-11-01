"use strict";

/**
 * Okey (standard Turkish Okey, not 101): tiles, okey tile, hand validation and
 * the meld partition search used by the win check, the rack helper and the bot.
 *
 * Tiles (106): ids 0..103 are the numbered tiles, 104 and 105 the false okeys.
 *   copy  = id < 52 ? 0 : 1
 *   color = floor((id % 52) / 13)     0 yellow, 1 blue, 2 black, 3 red
 *   num   = (id % 13) + 1             1..13
 *
 * The indicator (gösterge) is a numbered tile turned face up. The okey is the
 * same colour with the next number (13 wraps to 1). Both okey tiles are wild.
 * The false okeys (sahte okey) are not wild: they stand for the okey's face.
 *
 * Melds (per) are judged on "faces" (color*13 + num-1, 0..51) plus wilds.
 *   group (set): same number, different colours, 3 or 4 tiles
 *   run  (seri): same colour, consecutive numbers, 3+ tiles; 1 may follow 13
 *                (12-13-1 is valid) but nothing wraps past it (13-1-2 is not).
 *                Internally a 1 used after 13 is rank 14.
 * A winning hand is 14 tiles that split completely into melds, or 7 pairs
 * (çift) of identical faces; a wild completes any pair.
 */

const TILE_COUNT = 106;
const FAKE_IDS = [104, 105];
const COLORS = ["yellow", "blue", "black", "red"];
const WILD = -1;
const RACK_ROWS = 2;
const RACK_COLS = 14;
const RACK_SLOTS = RACK_ROWS * RACK_COLS;

function isFake(id) {
  return id === 104 || id === 105;
}

function isValidTileId(id) {
  return Number.isInteger(id) && id >= 0 && id < TILE_COUNT;
}

function tileColor(id) {
  return Math.floor((id % 52) / 13);
}

function tileNum(id) {
  return (id % 13) + 1;
}

function faceOfNumbered(id) {
  return id % 52;
}

function faceIndex(color, num) {
  return color * 13 + (num - 1);
}

/** Okey face for an indicator tile id. */
function okeyFaceFor(indicatorId) {
  const color = tileColor(indicatorId);
  const num = (tileNum(indicatorId) % 13) + 1;
  return faceIndex(color, num);
}

function faceColor(face) {
  return Math.floor(face / 13);
}

function faceNum(face) {
  return (face % 13) + 1;
}

/** Meld face of a tile: WILD for a real okey, the okey face for a false okey. */
function meldFace(id, okeyFace) {
  if (isFake(id)) return okeyFace;
  const f = faceOfNumbered(id);
  return f === okeyFace ? WILD : f;
}

function isOkey(id, okeyFace) {
  return !isFake(id) && faceOfNumbered(id) === okeyFace;
}

/** Public tile description for views (plain JSON). */
function describeTile(id, okeyFace = null) {
  if (isFake(id)) {
    return { id, fake: true, color: okeyFace == null ? null : COLORS[faceColor(okeyFace)], num: okeyFace == null ? null : faceNum(okeyFace) };
  }
  const t = { id, color: COLORS[tileColor(id)], num: tileNum(id) };
  if (okeyFace != null && faceOfNumbered(id) === okeyFace) t.okey = true;
  return t;
}

/** Face counts (length 52) and number of wilds of a hand. */
function countHand(ids, okeyFace) {
  const counts = new Array(52).fill(0);
  let wilds = 0;
  for (const id of ids) {
    const f = meldFace(id, okeyFace);
    if (f === WILD) wilds++;
    else counts[f]++;
  }
  return { counts, wilds };
}

function runFace(color, rank) {
  return faceIndex(color, rank === 14 ? 1 : rank);
}

/**
 * Meld partition search over face counts.
 *   mode "all": every tile must be used (win check); returns melds or null.
 *   mode "max": maximise the number of tiles placed in melds; leftovers allowed.
 * A meld is { kind: "group"|"run", faces: [face|WILD...] } in table order.
 *
 * The first remaining face (lowest index) must be either left over ("max") or
 * part of a meld; every meld containing it is enumerated. A real tile is always
 * preferred over a wild for a position (swapping them never breaks a solution),
 * which keeps the branching small.
 */
const POW3 = Array.from({ length: 26 }, (_, i) => 3 ** i);

function searchMelds(counts, wilds, mode) {
  const memo = new Map();
  const c = counts.slice();
  const all = mode === "all";
  // Memo key: the counts as two base-3 numbers (26 faces each, exact in a double) and the wilds.
  let k0 = 0;
  let k1 = 0;
  let remaining = 0;
  for (let i = 0; i < 52; i++) {
    if (i < 26) k0 += c[i] * POW3[i];
    else k1 += c[i] * POW3[i - 26];
    remaining += c[i];
  }
  const take = (i) => {
    c[i]--;
    remaining--;
    if (i < 26) k0 -= POW3[i];
    else k1 -= POW3[i - 26];
  };
  const give = (i) => {
    c[i]++;
    remaining++;
    if (i < 26) k0 += POW3[i];
    else k1 += POW3[i - 26];
  };

  // Returns { score, melds } (max) or melds|null (all). score counts tiles in melds.
  function dfs(from, w) {
    let f = from;
    while (f < 52 && c[f] === 0) f++;
    if (f >= 52) {
      if (all) return w === 0 ? [] : null;
      return { score: 0, melds: [] };
    }
    const k = `${k0}:${k1}:${w}`;
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    const ceiling = remaining + w; // every tile placed
    let best = all ? null : { score: -1, melds: [] };
    const done = () => (all ? best !== null : best.score >= ceiling);

    const consider = (meld, wUsed) => {
      const sub = dfs(f, w - wUsed);
      if (all) {
        if (sub && !best) best = [meld, ...sub];
      } else {
        const score = sub.score + meld.faces.length;
        if (score > best.score) best = { score, melds: [meld, ...sub.melds] };
      }
    };

    const color = faceColor(f);
    const num = faceNum(f);
    take(f);

    // 1. groups: same number, the first tile's colour plus 2 or 3 other colours.
    const others = color === 0 ? [1, 2, 3] : color === 1 ? [0, 2, 3] : color === 2 ? [0, 1, 3] : [0, 1, 2];
    for (let sIdx = 0; sIdx < 4 && !done(); sIdx++) {
      const sub = sIdx === 0 ? [others[0], others[1]] : sIdx === 1 ? [others[0], others[2]] : sIdx === 2 ? [others[1], others[2]] : others;
      const faces = [f];
      const taken = [];
      let wNeed = 0;
      for (const col of sub) {
        const g = faceIndex(col, num);
        if (c[g] > 0) {
          take(g);
          taken.push(g);
          faces.push(g);
        } else {
          wNeed++;
          faces.push(WILD);
        }
      }
      if (wNeed <= w) consider({ kind: "group", faces }, wNeed);
      for (const g of taken) give(g);
    }

    // 2. runs of this colour containing the tile at rank `num` (or 14 for a 1 played high).
    const ranks = num === 1 ? [1, 14] : [num];
    for (const p of ranks) {
      // Start positions from p downwards; the wilds needed only grow, so stop at the first miss.
      for (let s = p; s >= 1 && !done(); s--) {
        const before = [];
        const takenBefore = [];
        let wNeed = 0;
        for (let r = s; r < p; r++) {
          const g = runFace(color, r);
          if (c[g] > 0) {
            take(g);
            takenBefore.push(g);
            before.push(g);
          } else {
            wNeed++;
            before.push(WILD);
          }
        }
        if (wNeed > w) {
          for (const g of takenBefore) give(g);
          break;
        }
        const after = [];
        const takenAfter = [];
        let wAfter = 0;
        for (let e = p; e <= 14; e++) {
          if (e > p) {
            const g = runFace(color, e);
            if (c[g] > 0) {
              take(g);
              takenAfter.push(g);
              after.push(g);
            } else {
              wAfter++;
              after.push(WILD);
            }
          }
          if (wNeed + wAfter > w) break;
          if (p - s + 1 + (e - p) >= 3) {
            consider({ kind: "run", faces: [...before, f, ...after], start: s }, wNeed + wAfter);
            if (done()) break;
          }
        }
        for (const g of takenAfter) give(g);
        for (const g of takenBefore) give(g);
      }
    }

    // 3. leave it over (max mode only).
    if (!all && !done()) {
      const sub = dfs(f, w);
      if (sub.score > best.score) best = { score: sub.score, melds: sub.melds };
    }

    give(f);
    memo.set(k, best);
    return best;
  }

  return dfs(0, wilds);
}

/** Pairs (çift): faces with 2 copies pair up; singles need a wild; spare wilds pair together. */
function pairsInfo(counts, wilds) {
  let pairs = 0;
  let singles = 0;
  for (let i = 0; i < 52; i++) {
    if (counts[i] >= 2) pairs += Math.floor(counts[i] / 2);
    if (counts[i] % 2 === 1) singles++;
  }
  const wildForSingles = Math.min(wilds, singles);
  const spare = wilds - wildForSingles;
  return { pairs, singles, wilds, total: pairs + wildForSingles + Math.floor(spare / 2) };
}

/** Map face melds back to concrete tile ids. */
function assignIds(ids, okeyFace, faceMelds) {
  const pool = new Map();
  const wildIds = [];
  for (const id of ids) {
    const f = meldFace(id, okeyFace);
    if (f === WILD) wildIds.push(id);
    else {
      if (!pool.has(f)) pool.set(f, []);
      pool.get(f).push(id);
    }
  }
  const melds = faceMelds.map((m) => m.faces.map((f) => (f === WILD ? wildIds.shift() : pool.get(f).shift())));
  const rest = [];
  for (const list of pool.values()) rest.push(...list);
  rest.push(...wildIds);
  return { melds, rest };
}

/**
 * Win check for exactly 14 tiles. Returns null or
 *   { kind: "sets"|"pairs", melds: [[ids]] }.
 * When a hand is both, "pairs" is returned (it scores higher).
 */
function findWin(ids, okeyFace) {
  if (!Array.isArray(ids) || ids.length !== 14) return null;
  const { counts, wilds } = countHand(ids, okeyFace);
  const p = pairsInfo(counts, wilds);
  if (p.singles <= wilds && (wilds - p.singles) % 2 === 0 && p.total === 7) {
    return { kind: "pairs", melds: pairMelds(ids, okeyFace).melds };
  }
  const melds = searchMelds(counts, wilds, "all");
  if (!melds) return null;
  return { kind: "sets", melds: assignIds(ids, okeyFace, melds).melds };
}

function isWinningHand(ids, okeyFace) {
  return findWin(ids, okeyFace) != null;
}

/** Group a hand into pairs (wilds complete singles, then pair together). */
function pairMelds(ids, okeyFace) {
  const byFace = new Map();
  const wildIds = [];
  for (const id of ids) {
    const f = meldFace(id, okeyFace);
    if (f === WILD) wildIds.push(id);
    else {
      if (!byFace.has(f)) byFace.set(f, []);
      byFace.get(f).push(id);
    }
  }
  const melds = [];
  const singles = [];
  for (const f of Array.from(byFace.keys()).sort((a, b) => a - b)) {
    const list = byFace.get(f);
    while (list.length >= 2) melds.push([list.shift(), list.shift()]);
    if (list.length) singles.push(list[0]);
  }
  // Highest singles get the wilds first (they are the costliest to keep).
  singles.sort((a, b) => sortKey(b, okeyFace) - sortKey(a, okeyFace));
  const rest = [];
  for (const id of singles) {
    if (wildIds.length) melds.push([id, wildIds.shift()]);
    else rest.push(id);
  }
  while (wildIds.length >= 2) melds.push([wildIds.shift(), wildIds.shift()]);
  rest.push(...wildIds);
  return { melds, rest };
}

function sortKey(id, okeyFace) {
  const f = meldFace(id, okeyFace);
  if (f === WILD) return 1000;
  return faceColor(f) * 20 + faceNum(f);
}

/** Best meld partition of any hand (max tiles in melds). */
function bestPartition(ids, okeyFace) {
  const { counts, wilds } = countHand(ids, okeyFace);
  const res = searchMelds(counts, wilds, "max");
  const { melds, rest } = assignIds(ids, okeyFace, res.melds);
  return { score: res.score, melds, rest };
}

/**
 * Rack helper: a suggested arrangement for the 2 x 14 rack.
 *   mode "runs"  : best meld partition (runs and groups), leftovers sorted
 *   mode "pairs" : pairs first, then singles
 *   mode "sorted": by colour then number
 * Returns { mode, melds, rest, slots } where slots has RACK_SLOTS entries
 * (tile id or null), melds separated by an empty slot and never split across
 * the two rows when they fit.
 */
function suggestArrangement(ids, okeyFace, mode = "runs") {
  let melds = [];
  let rest = [];
  if (mode === "pairs") {
    ({ melds, rest } = pairMelds(ids, okeyFace));
  } else if (mode === "sorted") {
    rest = ids.slice();
  } else {
    ({ melds, rest } = bestPartition(ids, okeyFace));
    mode = "runs";
  }
  rest = rest.slice().sort((a, b) => sortKey(a, okeyFace) - sortKey(b, okeyFace) || a - b);
  const blocks = melds.map((m) => m.slice());
  // Leftovers: one block per colour, wilds last.
  const byColor = new Map();
  for (const id of rest) {
    const f = meldFace(id, okeyFace);
    const k = f === WILD ? 9 : faceColor(f);
    if (!byColor.has(k)) byColor.set(k, []);
    byColor.get(k).push(id);
  }
  for (const k of Array.from(byColor.keys()).sort((a, b) => a - b)) blocks.push(byColor.get(k));
  return { mode, melds, rest, slots: layoutBlocks(blocks) };
}

function layoutBlocks(blocks) {
  const slots = new Array(RACK_SLOTS).fill(null);
  const total = blocks.reduce((n, b) => n + b.length, 0);
  const withGaps = total + Math.max(0, blocks.length - 1);
  if (withGaps > RACK_SLOTS) {
    blocks.flat().forEach((id, i) => {
      slots[i] = id;
    });
    return slots;
  }
  let row = 0;
  let col = 0;
  const flatFallback = () => {
    slots.fill(null);
    blocks.flat().forEach((id, i) => {
      slots[i] = id;
    });
    return slots;
  };
  for (const block of blocks) {
    if (col > 0 && col + block.length > RACK_COLS) {
      row++;
      col = 0;
    }
    if (row >= RACK_ROWS) return flatFallback();
    for (const id of block) {
      if (col >= RACK_COLS) {
        row++;
        col = 0;
        if (row >= RACK_ROWS) return flatFallback();
      }
      slots[row * RACK_COLS + col] = id;
      col++;
    }
    col++; // gap
    if (col >= RACK_COLS) {
      row++;
      col = 0;
    }
  }
  return slots;
}

/** Validate a client rack layout: exactly the hand's ids, each once, rest null. */
function validSlots(slots, handIds) {
  if (!Array.isArray(slots) || slots.length !== RACK_SLOTS) return false;
  const want = new Set(handIds);
  const seen = new Set();
  for (const v of slots) {
    if (v === null) continue;
    if (!Number.isInteger(v) || !want.has(v) || seen.has(v)) return false;
    seen.add(v);
  }
  return seen.size === want.size;
}

/** Keep a player's layout in sync after a tile came in or went out. */
function reconcileSlots(slots, handIds) {
  const hand = new Set(handIds);
  const out = Array.isArray(slots) && slots.length === RACK_SLOTS ? slots.map((v) => (hand.has(v) ? v : null)) : new Array(RACK_SLOTS).fill(null);
  const placed = new Set(out.filter((v) => v !== null));
  for (const id of handIds) {
    if (placed.has(id)) continue;
    // First free slot from the right end of the second row backwards keeps new tiles visible.
    let idx = -1;
    for (let i = RACK_SLOTS - 1; i >= 0; i--) {
      if (out[i] === null) {
        idx = i;
        break;
      }
    }
    if (idx < 0) break;
    out[idx] = id;
    placed.add(id);
  }
  return out;
}

module.exports = {
  TILE_COUNT,
  FAKE_IDS,
  COLORS,
  WILD,
  RACK_ROWS,
  RACK_COLS,
  RACK_SLOTS,
  isFake,
  isValidTileId,
  tileColor,
  tileNum,
  faceIndex,
  faceColor,
  faceNum,
  okeyFaceFor,
  meldFace,
  isOkey,
  describeTile,
  countHand,
  searchMelds,
  pairsInfo,
  findWin,
  isWinningHand,
  pairMelds,
  bestPartition,
  suggestArrangement,
  validSlots,
  reconcileSlots,
  sortKey,
};
