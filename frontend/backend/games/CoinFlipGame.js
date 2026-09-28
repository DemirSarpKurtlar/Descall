/**
 * Descall Casino — called coin (yazı / tura).
 * The face is drawn server-side. Spectators receive the same rotation count
 * and landing face; they cannot change the call.
 * Even money: a correct call returns 2× the stake.
 */

const crypto = require("crypto");
const { MIN_BET, MAX_BET } = require("./BlackjackGame");

function randomBit() {
  return crypto.randomInt(0, 2);
}

function newId() {
  return `cf_${crypto.randomBytes(8).toString("hex")}`;
}

class CoinFlipRound {
  constructor({ userId, username, groupId, bet, side = null, rng = randomBit }) {
    this.id = newId();
    this.userId = userId;
    this.username = username || "Player";
    this.groupId = groupId;
    this.bet = bet;
    this.rng = rng;
    this.status = "calling";
    this.call = null;
    this.face = null;
    this.rotations = null;
    this.result = null;
    this.winAmount = 0;
    this.profit = 0;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    if (side) this.callSide(side);
  }

  callSide(side) {
    if (this.status !== "calling") {
      return { error: "This flip is already settled." };
    }
    if (side !== "heads" && side !== "tails") {
      return { error: "Call yazı (heads) or tura (tails)." };
    }
    this.call = side;
    this.face = this.rng() === 0 ? "heads" : "tails";
    this.rotations = 5 + crypto.randomInt(0, 4);
    const win = this.face === this.call;
    this.result = win ? "win" : "loss";
    this.winAmount = win ? this.bet * 2 : 0;
    this.profit = win ? this.bet : -this.bet;
    this.status = "finished";
    this.updatedAt = Date.now();
    return { state: this.getPublicState() };
  }

  getPublicState() {
    return {
      game: "coinflip",
      id: this.id,
      userId: this.userId,
      username: this.username,
      groupId: this.groupId,
      bet: this.bet,
      status: this.status,
      call: this.call,
      face: this.face,
      rotations: this.rotations,
      result: this.result,
      winAmount: this.winAmount,
      profit: this.profit,
      actions: this.status === "calling" ? ["call:heads", "call:tails"] : [],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toHistoryPayload() {
    return {
      bet: this.bet,
      result: this.result || "calling",
      winAmount: this.winAmount,
      player_hand: { call: this.call, face: this.face, rotations: this.rotations },
      dealer_hand: null,
    };
  }
}

const active = new Map();

function keyOf(userId, groupId) {
  return `${userId}:${groupId}`;
}

const CoinFlipManager = {
  get(userId, groupId) {
    return active.get(keyOf(userId, groupId)) || null;
  },

  create({ userId, username, groupId, bet, side = null, rng }) {
    const amount = Math.floor(Number(bet));
    if (!Number.isFinite(amount) || amount < MIN_BET || amount > MAX_BET) {
      return { error: `Bet must be between ${MIN_BET} and ${MAX_BET.toLocaleString()}.` };
    }
    const existing = this.get(userId, groupId);
    if (existing && existing.status === "calling") {
      return { error: "Call yazı or tura on your open flip first.", round: existing };
    }
    const round = new CoinFlipRound({ userId, username, groupId, bet: amount, side, rng });
    if (round.status === "calling") active.set(keyOf(userId, groupId), round);
    return { round, state: round.getPublicState() };
  },

  call(userId, groupId, side) {
    const round = this.get(userId, groupId);
    if (!round || round.status !== "calling") {
      return { error: "No coin in the air. Start with /cf 100." };
    }
    const result = round.callSide(side);
    if (result.error) return result;
    active.delete(keyOf(userId, groupId));
    return { round, state: result.state };
  },

  remove(userId, groupId) {
    active.delete(keyOf(userId, groupId));
  },
};

module.exports = {
  CoinFlipRound,
  CoinFlipManager,
  MIN_BET,
  MAX_BET,
};
