/**
 * Pure parsers for casino slash arguments.
 * Pay: `/pay @user 500` · Slot: `/slot 100` · Coin: `/cf 100 tura`
 */

// Coin sides in every UI language (hints in the catalogs show the local words).
const HEADS = new Set(["yazi", "yazı", "heads", "head", "h", "y", "kopf", "cara", "face", "орёл", "орел"]);
const TAILS = new Set(["tura", "tails", "tail", "t", "zahl", "cruz", "coroa", "pile", "решка"]);

function parsePayArgs(arg) {
  const parts = String(arg || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) {
    return { error: "usage" };
  }
  const amountToken = parts[parts.length - 1].replace(/[,_]/g, "");
  if (!/^\d+$/.test(amountToken)) {
    return { error: "amount" };
  }
  const amount = Number(amountToken);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) {
    return { error: "amount" };
  }
  const userToken = parts.slice(0, -1).join(" ").trim();
  if (!userToken) return { error: "usage" };
  return { userToken, amount };
}

function parseCoinArgs(arg) {
  const parts = String(arg || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let amount = null;
  let side = null;
  for (const part of parts) {
    const token = part.toLowerCase();
    if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (!Number.isSafeInteger(n)) return { error: "amount" };
      amount = n;
      continue;
    }
    if (HEADS.has(token)) {
      if (side) return { error: "side" };
      side = "heads";
      continue;
    }
    if (TAILS.has(token)) {
      if (side) return { error: "side" };
      side = "tails";
      continue;
    }
    return { error: "usage" };
  }
  return { amount, side };
}

/** English side name (board text uses catalog refs, socket/gameHandlers.js sideRef). */
function sideLabel(side) {
  if (side === "heads") return "Heads";
  if (side === "tails") return "Tails";
  return "";
}

module.exports = {
  parsePayArgs,
  parseCoinArgs,
  sideLabel,
  HEADS,
  TAILS,
};
