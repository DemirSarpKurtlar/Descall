"use strict";

/**
 * Chess rules core (FIDE): 0x88 board, legal move generation with make/unmake,
 * FEN in/out, SAN in/out, UCI, game status (checkmate, stalemate, fifty-move
 * rule, insufficient material), repetition keys and perft.
 *
 * Pieces: color << 3 | type, white 1..6, black 9..14.
 *   type 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king.
 * Squares: 0x88, sq = rank * 16 + file (a1 = 0, h8 = 0x77).
 * Moves are integers: from | to << 7 | promo << 14 | flags << 17.
 *   flags: 1 capture, 2 en passant, 4 castle, 8 double pawn push.
 */

const WHITE = 0;
const BLACK = 1;
const PAWN = 1;
const KNIGHT = 2;
const BISHOP = 3;
const ROOK = 4;
const QUEEN = 5;
const KING = 6;

const F_CAPTURE = 1;
const F_EP = 2;
const F_CASTLE = 4;
const F_DOUBLE = 8;

const KNIGHT_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_OFF = [1, -1, 16, -16, 15, 17, -15, -17];
const DIAG = [15, 17, -15, -17];
const ORTHO = [1, -1, 16, -16];
const PIECE_CHARS = " pnbrqk";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Castling bits: 1 white king side, 2 white queen side, 4 black king side, 8 black queen side.
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[0x04] = 15 & ~3; // e1
CASTLE_MASK[0x07] = 15 & ~1; // h1
CASTLE_MASK[0x00] = 15 & ~2; // a1
CASTLE_MASK[0x74] = 15 & ~12; // e8
CASTLE_MASK[0x77] = 15 & ~4; // h8
CASTLE_MASK[0x70] = 15 & ~8; // a8

// Zobrist keys from a fixed seeded generator (two 32-bit halves).
const Z = (() => {
  let x = 0x9e3779b9;
  const next = () => {
    // xorshift32
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
  const table = () => {
    const lo = new Int32Array(16 * 128);
    const hi = new Int32Array(16 * 128);
    for (let i = 0; i < lo.length; i++) {
      lo[i] = next() | 0;
      hi[i] = next() | 0;
    }
    return { lo, hi };
  };
  const piece = table();
  const castleLo = new Int32Array(16);
  const castleHi = new Int32Array(16);
  for (let i = 0; i < 16; i++) {
    castleLo[i] = next() | 0;
    castleHi[i] = next() | 0;
  }
  const epLo = new Int32Array(8);
  const epHi = new Int32Array(8);
  for (let i = 0; i < 8; i++) {
    epLo[i] = next() | 0;
    epHi[i] = next() | 0;
  }
  return { piece, castleLo, castleHi, epLo, epHi, sideLo: next() | 0, sideHi: next() | 0 };
})();

const onBoard = (sq) => (sq & 0x88) === 0;
const colorOf = (p) => p >> 3;
const typeOf = (p) => p & 7;
const mFrom = (m) => m & 127;
const mTo = (m) => (m >> 7) & 127;
const mPromo = (m) => (m >> 14) & 7;
const mFlags = (m) => (m >> 17) & 15;
const encode = (from, to, promo, flags) => from | (to << 7) | (promo << 14) | (flags << 17);

function sqName(sq) {
  return "abcdefgh"[sq & 7] + String((sq >> 4) + 1);
}

function parseSq(s) {
  if (typeof s !== "string" || !/^[a-h][1-8]$/.test(s)) return -1;
  return (s.charCodeAt(1) - 49) * 16 + (s.charCodeAt(0) - 97);
}

class Position {
  constructor() {
    this.b = new Int8Array(128);
    this.side = WHITE;
    this.castling = 0;
    this.ep = -1;
    this.half = 0;
    this.full = 1;
    this.kings = [-1, -1];
    this.hashLo = 0;
    this.hashHi = 0;
    this.stack = [];
  }

  static fromFen(fen) {
    const pos = new Position();
    const err = pos.loadFen(fen);
    if (err) throw new Error(err);
    return pos;
  }

  /** Returns an error string or null. */
  loadFen(fen) {
    if (typeof fen !== "string") return "fen_type";
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4 || parts.length > 6) return "fen_fields";
    const rows = parts[0].split("/");
    if (rows.length !== 8) return "fen_ranks";
    this.b.fill(0);
    this.kings = [-1, -1];
    for (let r = 0; r < 8; r++) {
      const rank = 7 - r;
      let file = 0;
      for (const ch of rows[r]) {
        if (ch >= "1" && ch <= "8") {
          file += Number(ch);
        } else {
          const t = PIECE_CHARS.indexOf(ch.toLowerCase());
          if (t <= 0) return "fen_piece";
          if (file > 7) return "fen_rank_len";
          const color = ch === ch.toLowerCase() ? BLACK : WHITE;
          if (t === PAWN && (rank === 0 || rank === 7)) return "fen_pawn_rank";
          const sq = rank * 16 + file;
          this.b[sq] = (color << 3) | t;
          if (t === KING) {
            if (this.kings[color] !== -1) return "fen_two_kings";
            this.kings[color] = sq;
          }
          file++;
        }
      }
      if (file !== 8) return "fen_rank_len";
    }
    if (this.kings[0] === -1 || this.kings[1] === -1) return "fen_no_king";
    if (parts[1] !== "w" && parts[1] !== "b") return "fen_side";
    this.side = parts[1] === "w" ? WHITE : BLACK;
    if (!/^(-|K?Q?k?q?)$/.test(parts[2]) || parts[2] === "") return "fen_castling";
    this.castling = 0;
    if (parts[2].includes("K") && this.b[0x04] === KING && this.b[0x07] === ROOK) this.castling |= 1;
    if (parts[2].includes("Q") && this.b[0x04] === KING && this.b[0x00] === ROOK) this.castling |= 2;
    if (parts[2].includes("k") && this.b[0x74] === (8 | KING) && this.b[0x77] === (8 | ROOK)) this.castling |= 4;
    if (parts[2].includes("q") && this.b[0x74] === (8 | KING) && this.b[0x70] === (8 | ROOK)) this.castling |= 8;
    this.ep = -1;
    if (parts[3] !== "-") {
      const sq = parseSq(parts[3]);
      if (sq < 0) return "fen_ep";
      const rank = sq >> 4;
      if ((this.side === WHITE && rank !== 5) || (this.side === BLACK && rank !== 2)) return "fen_ep";
      this.ep = sq;
    }
    this.half = parts[4] !== undefined ? Number(parts[4]) : 0;
    this.full = parts[5] !== undefined ? Number(parts[5]) : 1;
    if (!Number.isInteger(this.half) || this.half < 0 || !Number.isInteger(this.full) || this.full < 0) return "fen_counters";
    if (this.full === 0) this.full = 1; // common in hand-written FENs
    // The side not to move must not be in check.
    if (this.attacked(this.kings[this.side ^ 1], this.side)) return "fen_illegal_check";
    this.stack = [];
    this.rehash();
    return null;
  }

  rehash() {
    let lo = 0;
    let hi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (!onBoard(sq)) {
        sq += 7;
        continue;
      }
      const p = this.b[sq];
      if (p) {
        lo ^= Z.piece.lo[p * 128 + sq];
        hi ^= Z.piece.hi[p * 128 + sq];
      }
    }
    lo ^= Z.castleLo[this.castling];
    hi ^= Z.castleHi[this.castling];
    if (this.side === BLACK) {
      lo ^= Z.sideLo;
      hi ^= Z.sideHi;
    }
    this.hashLo = lo;
    this.hashHi = hi;
  }

  /** Hash with the en passant file only when a pawn stands ready to take (search key). */
  key() {
    let lo = this.hashLo;
    let hi = this.hashHi;
    if (this.ep >= 0 && this.epCapturable()) {
      lo ^= Z.epLo[this.ep & 7];
      hi ^= Z.epHi[this.ep & 7];
    }
    return (hi & 0x1fffff) * 4294967296 + (lo >>> 0);
  }

  epCapturable() {
    const us = this.side;
    const pawn = (us << 3) | PAWN;
    const from1 = us === WHITE ? this.ep - 15 : this.ep + 15;
    const from2 = us === WHITE ? this.ep - 17 : this.ep + 17;
    return (onBoard(from1) && this.b[from1] === pawn) || (onBoard(from2) && this.b[from2] === pawn);
  }

  toFen() {
    let s = "";
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = this.b[rank * 16 + file];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) {
          s += empty;
          empty = 0;
        }
        const ch = PIECE_CHARS[typeOf(p)];
        s += colorOf(p) === WHITE ? ch.toUpperCase() : ch;
      }
      if (empty) s += empty;
      if (rank) s += "/";
    }
    let c = "";
    if (this.castling & 1) c += "K";
    if (this.castling & 2) c += "Q";
    if (this.castling & 4) c += "k";
    if (this.castling & 8) c += "q";
    return `${s} ${this.side === WHITE ? "w" : "b"} ${c || "-"} ${this.ep >= 0 ? sqName(this.ep) : "-"} ${this.half} ${this.full}`;
  }

  /** Is `sq` attacked by color `by`? */
  attacked(sq, by) {
    const b = this.b;
    const pawn = (by << 3) | PAWN;
    if (by === WHITE) {
      if ((onBoard(sq - 15) && b[sq - 15] === pawn) || (onBoard(sq - 17) && b[sq - 17] === pawn)) return true;
    } else if ((onBoard(sq + 15) && b[sq + 15] === pawn) || (onBoard(sq + 17) && b[sq + 17] === pawn)) return true;
    const knight = (by << 3) | KNIGHT;
    for (let i = 0; i < 8; i++) {
      const t = sq + KNIGHT_OFF[i];
      if (onBoard(t) && b[t] === knight) return true;
    }
    const king = (by << 3) | KING;
    for (let i = 0; i < 8; i++) {
      const t = sq + KING_OFF[i];
      if (onBoard(t) && b[t] === king) return true;
    }
    const bishop = (by << 3) | BISHOP;
    const rook = (by << 3) | ROOK;
    const queen = (by << 3) | QUEEN;
    for (let i = 0; i < 4; i++) {
      const d = DIAG[i];
      let t = sq + d;
      while (onBoard(t)) {
        const p = b[t];
        if (p) {
          if (p === bishop || p === queen) return true;
          break;
        }
        t += d;
      }
    }
    for (let i = 0; i < 4; i++) {
      const d = ORTHO[i];
      let t = sq + d;
      while (onBoard(t)) {
        const p = b[t];
        if (p) {
          if (p === rook || p === queen) return true;
          break;
        }
        t += d;
      }
    }
    return false;
  }

  inCheck(color = this.side) {
    return this.attacked(this.kings[color], color ^ 1);
  }

  /** Pseudo-legal moves (castling already checked for attacked squares). */
  pseudo(out = [], capturesOnly = false) {
    const b = this.b;
    const us = this.side;
    const them = us ^ 1;
    for (let sq = 0; sq < 128; sq++) {
      if (!onBoard(sq)) {
        sq += 7;
        continue;
      }
      const p = b[sq];
      if (!p || colorOf(p) !== us) continue;
      const t = typeOf(p);
      if (t === PAWN) {
        const dir = us === WHITE ? 16 : -16;
        const startRank = us === WHITE ? 1 : 6;
        const promoRank = us === WHITE ? 7 : 0;
        const one = sq + dir;
        if (!capturesOnly && onBoard(one) && !b[one]) {
          if (one >> 4 === promoRank) {
            for (let pr = QUEEN; pr >= KNIGHT; pr--) out.push(encode(sq, one, pr, 0));
          } else {
            out.push(encode(sq, one, 0, 0));
            const two = one + dir;
            if (sq >> 4 === startRank && !b[two]) out.push(encode(sq, two, 0, F_DOUBLE));
          }
        } else if (capturesOnly && onBoard(one) && !b[one] && one >> 4 === promoRank) {
          out.push(encode(sq, one, QUEEN, 0)); // queen promotions count as tactical
        }
        for (const side of [dir - 1, dir + 1]) {
          const c = sq + side;
          if (!onBoard(c)) continue;
          const q = b[c];
          if (q && colorOf(q) === them) {
            if (c >> 4 === promoRank) {
              for (let pr = QUEEN; pr >= KNIGHT; pr--) {
                if (capturesOnly && pr !== QUEEN) continue;
                out.push(encode(sq, c, pr, F_CAPTURE));
              }
            } else out.push(encode(sq, c, 0, F_CAPTURE));
          } else if (c === this.ep) {
            out.push(encode(sq, c, 0, F_CAPTURE | F_EP));
          }
        }
      } else if (t === KNIGHT || t === KING) {
        const offs = t === KNIGHT ? KNIGHT_OFF : KING_OFF;
        for (let i = 0; i < 8; i++) {
          const to = sq + offs[i];
          if (!onBoard(to)) continue;
          const q = b[to];
          if (!q) {
            if (!capturesOnly) out.push(encode(sq, to, 0, 0));
          } else if (colorOf(q) === them) out.push(encode(sq, to, 0, F_CAPTURE));
        }
        if (t === KING && !capturesOnly) this.castles(out);
      } else {
        const dirs = t === BISHOP ? DIAG : t === ROOK ? ORTHO : null;
        const list = dirs || KING_OFF; // queen: all eight
        for (let i = 0; i < list.length; i++) {
          const d = list[i];
          let to = sq + d;
          while (onBoard(to)) {
            const q = b[to];
            if (!q) {
              if (!capturesOnly) out.push(encode(sq, to, 0, 0));
            } else {
              if (colorOf(q) === them) out.push(encode(sq, to, 0, F_CAPTURE));
              break;
            }
            to += d;
          }
        }
      }
    }
    return out;
  }

  castles(out) {
    const b = this.b;
    const us = this.side;
    const them = us ^ 1;
    const base = us === WHITE ? 0 : 0x70;
    const ks = us === WHITE ? 1 : 4;
    const qs = us === WHITE ? 2 : 8;
    if (!(this.castling & (ks | qs))) return;
    if (this.attacked(base + 4, them)) return;
    if (this.castling & ks && !b[base + 5] && !b[base + 6] && !this.attacked(base + 5, them) && !this.attacked(base + 6, them)) {
      out.push(encode(base + 4, base + 6, 0, F_CASTLE));
    }
    if (this.castling & qs && !b[base + 3] && !b[base + 2] && !b[base + 1] && !this.attacked(base + 3, them) && !this.attacked(base + 2, them)) {
      out.push(encode(base + 4, base + 2, 0, F_CASTLE));
    }
  }

  /** Make a move; returns false (and undoes it) when it leaves the own king in check. */
  make(m) {
    const b = this.b;
    const from = mFrom(m);
    const to = mTo(m);
    const flags = mFlags(m);
    const promo = mPromo(m);
    const us = this.side;
    const piece = b[from];
    let capSq = to;
    if (flags & F_EP) capSq = us === WHITE ? to - 16 : to + 16;
    const captured = b[capSq];
    this.stack.push({ m, captured, castling: this.castling, ep: this.ep, half: this.half, hashLo: this.hashLo, hashHi: this.hashHi });
    let lo = this.hashLo;
    let hi = this.hashHi;
    // remove mover and captured
    lo ^= Z.piece.lo[piece * 128 + from];
    hi ^= Z.piece.hi[piece * 128 + from];
    if (captured) {
      lo ^= Z.piece.lo[captured * 128 + capSq];
      hi ^= Z.piece.hi[captured * 128 + capSq];
      b[capSq] = 0;
    }
    b[from] = 0;
    const placed = promo ? (us << 3) | promo : piece;
    b[to] = placed;
    lo ^= Z.piece.lo[placed * 128 + to];
    hi ^= Z.piece.hi[placed * 128 + to];
    if (flags & F_CASTLE) {
      const base = us === WHITE ? 0 : 0x70;
      const rook = (us << 3) | ROOK;
      const [rf, rt] = to === base + 6 ? [base + 7, base + 5] : [base, base + 3];
      b[rf] = 0;
      b[rt] = rook;
      lo ^= Z.piece.lo[rook * 128 + rf] ^ Z.piece.lo[rook * 128 + rt];
      hi ^= Z.piece.hi[rook * 128 + rf] ^ Z.piece.hi[rook * 128 + rt];
    }
    if (typeOf(piece) === KING) this.kings[us] = to;
    lo ^= Z.castleLo[this.castling];
    hi ^= Z.castleHi[this.castling];
    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    lo ^= Z.castleLo[this.castling];
    hi ^= Z.castleHi[this.castling];
    this.ep = flags & F_DOUBLE ? (from + to) >> 1 : -1;
    this.half = typeOf(piece) === PAWN || captured ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.side = us ^ 1;
    lo ^= Z.sideLo;
    hi ^= Z.sideHi;
    this.hashLo = lo;
    this.hashHi = hi;
    if (this.attacked(this.kings[us], us ^ 1)) {
      this.unmake();
      return false;
    }
    return true;
  }

  unmake() {
    const u = this.stack.pop();
    const b = this.b;
    const m = u.m;
    const from = mFrom(m);
    const to = mTo(m);
    const flags = mFlags(m);
    const promo = mPromo(m);
    this.side ^= 1;
    const us = this.side;
    const piece = promo ? (us << 3) | PAWN : b[to];
    b[from] = piece;
    b[to] = 0;
    if (u.captured) {
      const capSq = flags & F_EP ? (us === WHITE ? to - 16 : to + 16) : to;
      b[capSq] = u.captured;
    }
    if (flags & F_CASTLE) {
      const base = us === WHITE ? 0 : 0x70;
      const rook = (us << 3) | ROOK;
      const [rf, rt] = to === base + 6 ? [base + 7, base + 5] : [base, base + 3];
      b[rt] = 0;
      b[rf] = rook;
    }
    if (typeOf(piece) === KING) this.kings[us] = from;
    this.castling = u.castling;
    this.ep = u.ep;
    this.half = u.half;
    if (us === BLACK) this.full--;
    this.hashLo = u.hashLo;
    this.hashHi = u.hashHi;
  }

  /** Null move for search (side flips, ep cleared). */
  makeNull() {
    this.stack.push({ m: 0, captured: 0, castling: this.castling, ep: this.ep, half: this.half, hashLo: this.hashLo, hashHi: this.hashHi, nul: true });
    this.ep = -1;
    this.side ^= 1;
    this.hashLo ^= Z.sideLo;
    this.hashHi ^= Z.sideHi;
    this.half++;
  }

  unmakeNull() {
    const u = this.stack.pop();
    this.side ^= 1;
    this.ep = u.ep;
    this.half = u.half;
    this.hashLo = u.hashLo;
    this.hashHi = u.hashHi;
  }

  legalMoves() {
    const out = [];
    for (const m of this.pseudo([])) {
      if (this.make(m)) {
        this.unmake();
        out.push(m);
      }
    }
    return out;
  }

  clone() {
    const p = new Position();
    p.b.set(this.b);
    p.side = this.side;
    p.castling = this.castling;
    p.ep = this.ep;
    p.half = this.half;
    p.full = this.full;
    p.kings = this.kings.slice();
    p.hashLo = this.hashLo;
    p.hashHi = this.hashHi;
    return p;
  }
}

// ---------------------------------------------------------------- notation

function uci(m) {
  const pr = mPromo(m);
  return sqName(mFrom(m)) + sqName(mTo(m)) + (pr ? PIECE_CHARS[pr] : "");
}

function sanOf(pos, m, legal = pos.legalMoves()) {
  const from = mFrom(m);
  const to = mTo(m);
  const flags = mFlags(m);
  const piece = pos.b[from];
  const t = typeOf(piece);
  let s;
  if (flags & F_CASTLE) s = (to & 7) === 6 ? "O-O" : "O-O-O";
  else if (t === PAWN) {
    s = flags & F_CAPTURE ? "abcdefgh"[from & 7] + "x" + sqName(to) : sqName(to);
    if (mPromo(m)) s += "=" + PIECE_CHARS[mPromo(m)].toUpperCase();
  } else {
    let dis = "";
    const rivals = legal.filter((x) => x !== m && mTo(x) === to && pos.b[mFrom(x)] === piece);
    if (rivals.length) {
      const sameFile = rivals.some((x) => (mFrom(x) & 7) === (from & 7));
      const sameRank = rivals.some((x) => mFrom(x) >> 4 === from >> 4);
      if (!sameFile) dis = "abcdefgh"[from & 7];
      else if (!sameRank) dis = String((from >> 4) + 1);
      else dis = sqName(from);
    }
    s = PIECE_CHARS[t].toUpperCase() + dis + (flags & F_CAPTURE ? "x" : "") + sqName(to);
  }
  pos.make(m);
  if (pos.inCheck()) s += pos.legalMoves().length === 0 ? "#" : "+";
  pos.unmake();
  return s;
}

function normSan(s) {
  return String(s)
    .trim()
    .replace(/[+#!?]+$/g, "")
    .replace(/0/g, "O")
    .replace(/=/g, "")
    .replace(/^([a-h])([1-8])x?$/, "$1$2");
}

/** Move for a SAN string (strict match after normalising +, #, =, 0-0), or 0. */
function moveFromSan(pos, san) {
  const want = normSan(san);
  if (!want) return 0;
  const legal = pos.legalMoves();
  for (const m of legal) if (normSan(sanOf(pos, m, legal)) === want) return m;
  // Lenient forms: "Ngf3"-style over-disambiguation, "exd6e.p.".
  const lax = want.replace(/e\.?p\.?$/i, "");
  for (const m of legal) {
    const full = PIECE_CHARS[typeOf(pos.b[mFrom(m)])].toUpperCase() + sqName(mFrom(m)) + (mFlags(m) & F_CAPTURE ? "x" : "") + sqName(mTo(m)) + (mPromo(m) ? PIECE_CHARS[mPromo(m)].toUpperCase() : "");
    const alt = full.replace(/^P/, "");
    if (lax === full || lax === alt || lax === full.replace("x", "") || lax === alt.replace("x", "")) return m;
  }
  return 0;
}

/** Move for UCI ("e2e4", "e7e8q") or {from, to, promotion}, or 0. */
function moveFromCoords(pos, from, to, promotion) {
  const f = typeof from === "number" ? from : parseSq(from);
  const t = typeof to === "number" ? to : parseSq(to);
  if (f < 0 || t < 0) return 0;
  const pr = promotion ? PIECE_CHARS.indexOf(String(promotion).toLowerCase()) : 0;
  for (const m of pos.legalMoves()) {
    if (mFrom(m) !== f || mTo(m) !== t) continue;
    if (mPromo(m)) {
      if (mPromo(m) === pr) return m;
    } else if (!pr) return m;
  }
  return 0;
}

function moveFromUci(pos, s) {
  if (typeof s !== "string" || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(s)) return 0;
  return moveFromCoords(pos, s.slice(0, 2), s.slice(2, 4), s[4] || null);
}

// ---------------------------------------------------------------- status

/** FIDE dead positions we detect: K v K, K+minor v K, bishops all on one colour. */
function insufficientMaterial(pos) {
  let minors = 0;
  let knights = 0;
  const bishopColors = new Set();
  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) {
      sq += 7;
      continue;
    }
    const p = pos.b[sq];
    if (!p) continue;
    const t = typeOf(p);
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    if (t === KNIGHT) {
      minors++;
      knights++;
    } else if (t === BISHOP) {
      minors++;
      bishopColors.add(((sq >> 4) + (sq & 7)) & 1);
    }
  }
  if (minors <= 1) return true;
  return knights === 0 && bishopColors.size === 1;
}

/** Can `color` still mate with any sequence of legal moves (flag-fall rule)? */
function canMate(pos, color) {
  let pieces = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) {
      sq += 7;
      continue;
    }
    const p = pos.b[sq];
    if (p && colorOf(p) === color && typeOf(p) !== KING) pieces++;
  }
  if (pieces === 0) return false;
  return !insufficientMaterial(pos);
}

/** Key for threefold repetition: placement, side, castling, ep only when a legal ep capture exists. */
function repetitionKey(pos) {
  const fen = pos.toFen().split(" ");
  let ep = "-";
  if (pos.ep >= 0 && pos.legalMoves().some((m) => mFlags(m) & F_EP)) ep = fen[3];
  return `${fen[0]} ${fen[1]} ${fen[2]} ${ep}`;
}

function perft(pos, depth) {
  if (depth === 0) return 1;
  let n = 0;
  const moves = pos.pseudo([]);
  for (let i = 0; i < moves.length; i++) {
    if (!pos.make(moves[i])) continue;
    n += depth === 1 ? 1 : perft(pos, depth - 1);
    pos.unmake();
  }
  return n;
}

module.exports = {
  WHITE,
  BLACK,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING,
  F_CAPTURE,
  F_EP,
  F_CASTLE,
  F_DOUBLE,
  START_FEN,
  PIECE_CHARS,
  Position,
  onBoard,
  colorOf,
  typeOf,
  mFrom,
  mTo,
  mPromo,
  mFlags,
  encode,
  sqName,
  parseSq,
  uci,
  sanOf,
  moveFromSan,
  moveFromUci,
  moveFromCoords,
  insufficientMaterial,
  canMate,
  repetitionKey,
  perft,
};
