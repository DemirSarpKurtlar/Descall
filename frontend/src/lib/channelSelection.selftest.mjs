/**
 * Run: node frontend/src/lib/channelSelection.selftest.mjs
 */
import {
  canCommitChannelPayload,
  canCommitServerDetail,
  createEpochCounter,
} from "./channelSelection.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const epoch = createEpochCounter();
const selections = [];

function select(channelId) {
  const token = epoch.bump();
  selections.push({ channelId, token });
  return token;
}

const tokenA = select("A");
const tokenB = select("B");
const tokenC = select("C");

assert(!epoch.isCurrent(tokenA), "A is stale after B and C");
assert(!epoch.isCurrent(tokenB), "B is stale after C");
assert(epoch.isCurrent(tokenC), "C is the only current selection");

assert(
  canCommitServerDetail({
    token: tokenC,
    epoch: epoch.value(),
    expected: { serverId: "s1", channelId: "C" },
    live: { view: "servers", serverId: "s1", channelId: "C" },
  }),
  "latest server detail may commit"
);
assert(
  !canCommitServerDetail({
    token: tokenA,
    epoch: epoch.value(),
    expected: { serverId: "s1", channelId: "A" },
    live: { view: "servers", serverId: "s1", channelId: "C" },
  }),
  "stale server detail must not commit"
);
assert(
  !canCommitServerDetail({
    token: epoch.bump(),
    epoch: epoch.value(),
    expected: { serverId: "s1", channelId: "C" },
    live: { view: "servers", serverId: "s2", channelId: "C" },
  }),
  "server switch invalidates the previous server"
);

const history = createEpochCounter();
const histA = history.bump();
const histB = history.bump();
assert(
  !canCommitChannelPayload({
    token: histA,
    epoch: history.value(),
    requestedChannelId: "A",
    activeChannelId: "B",
  }),
  "history for A must not fill B"
);
assert(
  canCommitChannelPayload({
    token: histB,
    epoch: history.value(),
    requestedChannelId: "B",
    activeChannelId: "B",
  }),
  "history for the active channel may commit"
);

const back = createEpochCounter();
const there = back.bump();
const away = back.bump();
const returned = back.bump();
assert(!back.isCurrent(there) && !back.isCurrent(away) && back.isCurrent(returned), "A → B → A keeps only the last token");

console.log("channelSelection.selftest.mjs ok");
