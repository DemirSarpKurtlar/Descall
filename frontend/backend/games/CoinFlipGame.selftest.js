/**
 * Run: node frontend/backend/games/CoinFlipGame.selftest.js
 */
const { CoinFlipManager, CoinFlipRound } = require("./CoinFlipGame");
const { parseCoinArgs, parsePayArgs } = require("./casinoArgs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const pay = parsePayArgs("@ada 500");
assert(pay.userToken === "@ada" && pay.amount === 500, "pay @user amount");
const mention = parsePayArgs("<@11111111-1111-4111-8111-111111111111> 2500");
assert(mention.amount === 2500 && mention.userToken.includes("1111"), "pay mention");
assert(parsePayArgs("500").error, "pay needs a recipient");
assert(parsePayArgs("@ada 0").error, "pay rejects zero");
assert(parsePayArgs("@ada -5").error, "pay rejects negative");
assert(parsePayArgs("@ada 1,000").amount === 1000, "pay strips commas");

const both = parseCoinArgs("100 tura");
assert(both.amount === 100 && both.side === "tails", "cf amount + tura");
const alias = parseCoinArgs("250 heads");
assert(alias.amount === 250 && alias.side === "heads", "coinflip heads");
assert(parseCoinArgs("100 tails").amount === 100 && parseCoinArgs("100 tails").side === "tails", "tails at the end");
assert(parseCoinArgs("100 h").amount === 100 && parseCoinArgs("100 h").side === "heads", "h at the end is heads");
assert(parseCoinArgs("100 t").amount === 100 && parseCoinArgs("100 t").side === "tails", "t at the end is tails");
assert(parseCoinArgs("500 H").side === "heads" && parseCoinArgs("500 T").side === "tails", "H and T ignore case");
assert(parseCoinArgs("100 head").side === "heads" && parseCoinArgs("100 tail").side === "tails", "head and tail");
const yazi = parseCoinArgs("yazi");
assert(yazi.amount == null && yazi.side === "heads", "yazı alias");
const yazı = parseCoinArgs("yazı");
assert(yazı.side === "heads", "diacritic yazı");
assert(parseCoinArgs("100 nope").error, "unknown side");
assert(parseCoinArgs("").side == null && parseCoinArgs("").amount == null, "empty call");

const scripted = [1, 0, 1, 0];
let i = 0;
const rng = () => scripted[i++] % 2;

const loss = new CoinFlipRound({
  userId: "a",
  username: "Ada",
  groupId: "g",
  bet: 100,
  side: "heads",
  rng,
});
assert(loss.status === "finished" && loss.face === "tails" && loss.result === "loss", "mismatch loses");
assert(loss.winAmount === 0 && loss.profit === -100, "loss pays nothing");

const win = new CoinFlipRound({
  userId: "a",
  username: "Ada",
  groupId: "g",
  bet: 80,
  side: "heads",
  rng,
});
assert(win.face === "heads" && win.result === "win" && win.winAmount === 160, "match pays 2×");

const owner = "owner-1";
const watcher = "watcher-1";
const group = "group-1";
CoinFlipManager.remove(owner, group);
const open = CoinFlipManager.create({ userId: owner, username: "Owner", groupId: group, bet: 50 });
assert(open.state.status === "calling" && open.state.actions.length === 2, "open flip waits for a call");

const poked = CoinFlipManager.call(watcher, group, "heads");
assert(poked.error, "watcher cannot call someone else's coin");
assert(CoinFlipManager.get(owner, group)?.status === "calling", "owner flip still open");

const settled = CoinFlipManager.call(owner, group, "tails");
assert(settled.state.status === "finished", "owner settles");
assert(!CoinFlipManager.get(owner, group), "settled flip leaves the table");

const bad = CoinFlipManager.create({ userId: "u", username: "U", groupId: "g", bet: 3 });
assert(bad.error, "min bet");

let heads = 0;
const n = 4000;
for (let k = 0; k < n; k += 1) {
  const round = new CoinFlipRound({
    userId: "s",
    username: "S",
    groupId: "s",
    bet: 10,
    side: "heads",
  });
  if (round.face === "heads") heads += 1;
}
const ratio = heads / n;
assert(ratio > 0.45 && ratio < 0.55, `fairness ${ratio}`);

console.log("CoinFlipGame.selftest.js: ok");
