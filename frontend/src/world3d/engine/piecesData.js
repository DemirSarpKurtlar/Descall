/**
 * Game piece data (pure, no Babylon): atlas cells for okey tiles and cards, the
 * okey set. Geometry facts come from pieces.layout.js (build_game_pieces.py).
 */
import PIECES from "./pieces.layout.js";

export { PIECES };

const OKEY_COLORS = PIECES.okey.colors;

/** Atlas cell of an okey tile: colour (name or 0..3) and number 1..13, or "false" (false okey). */
export function okeyCell(color, number) {
  if (color === "false" || color === "falseOkey") return PIECES.okey.cells.falseOkey;
  const c = typeof color === "number" ? color : OKEY_COLORS.indexOf(color);
  if (c < 0 || !(number >= 1 && number <= 13)) throw new Error(`bad okey tile ${color} ${number}`);
  return c * 13 + (number - 1);
}

/** Atlas cell of a card: suit + rank ("A".."K" or 1..13), "back", or ("score", 0 | 1). */
export function cardCell(suit, rank) {
  const C = PIECES.cards;
  if (suit === "back") return C.cells.back;
  if (suit === "score") return C.cells.score[rank ? 1 : 0];
  const s = C.suits.indexOf(suit);
  const r = typeof rank === "number" ? rank - 1 : C.ranks.indexOf(String(rank));
  if (s < 0 || r < 0 || r > 12) throw new Error(`bad card ${suit} ${rank}`);
  return s * 13 + r;
}

/** The full okey set: 4 colours x 1..13 x 2 + 2 false okeys = 106 tiles. */
export function okeySet() {
  const out = [];
  for (let copy = 0; copy < 2; copy += 1) {
    for (const color of OKEY_COLORS) for (let n = 1; n <= 13; n += 1) out.push({ color, number: n, copy });
    out.push({ color: "false", number: 0, copy });
  }
  return out;
}
