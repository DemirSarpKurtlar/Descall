// Group call ringback stops when the ring is over, not only on an accept.
// Before: a decline (or the callee's 30 s auto-decline), a busy member, no
// answer at all, or two members starting a call at once left the caller's
// ringback looping until they hung up.
// Run from frontend/: node src/lib/groupRingback.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GROUP_RINGBACK_MS, createGroupRingback } from "./groupRingback.js";

function harness() {
  const log = [];
  const timers = new Map();
  let nextId = 1;
  const rb = createGroupRingback({
    play: () => log.push("play"),
    stop: () => log.push("stop"),
    onEnd: (reason) => log.push(`end:${reason}`),
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const fire = () => {
    const pending = [...timers.entries()];
    timers.clear();
    pending.forEach(([, t]) => t.fn());
  };
  return { rb, log, timers, fire };
}

// 1. The only member declines: the ringback stops (this is the 1:1 group case).
{
  const { rb, log, timers } = harness();
  rb.start(["me", "bob"], "me");
  assert.equal(rb.isRinging(), true);
  assert.equal(rb.pendingCount(), 1, "the caller is not rung");
  assert.equal(rb.declined("bob"), "declined");
  assert.equal(rb.isRinging(), false);
  assert.deepEqual(log, ["play", "stop", "end:declined"]);
  assert.equal(timers.size, 0, "ring timer cleared");
}

// 2. Several members: it keeps ringing until the last one says no (busy counts).
{
  const { rb, log } = harness();
  rb.start(["me", "a", "b", "c"], "me");
  assert.equal(rb.declined("a"), null);
  assert.equal(rb.declined("a"), null, "a repeated decline is not counted twice");
  assert.equal(rb.declined("b"), null);
  assert.equal(rb.isRinging(), true);
  assert.equal(rb.declined("c"), "declined");
  assert.deepEqual(log.filter((x) => x === "stop"), ["stop"], "stopped once");
}

// 3. Ids may be numbers on one side and strings on the other.
{
  const { rb } = harness();
  rb.start([1, 2], 1);
  assert.equal(rb.declined("2"), "declined");
}

// 4. Nobody answers: it stops after the DM ring length.
{
  const { rb, log, timers, fire } = harness();
  rb.start(["me", "a", "b"], "me");
  assert.equal([...timers.values()][0].ms, GROUP_RINGBACK_MS);
  assert.equal(GROUP_RINGBACK_MS, 45_000, "same as the server's DM ring");
  fire();
  assert.equal(rb.isRinging(), false);
  assert.deepEqual(log, ["play", "stop", "end:timeout"]);
}

// 5. Unknown member list (server rings everyone): only accept or the timeout end it.
{
  const { rb, fire } = harness();
  rb.start([], "me");
  assert.equal(rb.pendingCount(), null);
  assert.equal(rb.declined("x"), null);
  assert.equal(rb.isRinging(), true);
  fire();
  assert.equal(rb.isRinging(), false);
}

// 6. An accept stops it; late declines / timers do nothing after that.
{
  const { rb, log, timers } = harness();
  rb.start(["me", "a", "b"], "me");
  assert.equal(rb.answered(), "answered");
  assert.equal(timers.size, 0);
  assert.equal(rb.declined("a"), null);
  assert.equal(rb.declined("b"), null);
  assert.equal(rb.end(), null, "ending twice is a no-op");
  assert.deepEqual(log, ["play", "stop", "end:answered"]);
}

// 7. Leaving while it rings stops it without the "No answer" path.
{
  const { rb, log } = harness();
  rb.start(["me", "a"], "me");
  rb.end("ended");
  assert.deepEqual(log, ["play", "stop", "end:ended"]);
}

// 8. Wiring in useGroupCall.
const src = readFileSync(new URL("../hooks/useGroupCall.js", import.meta.url), "utf8");
assert.match(src, /createGroupRingback\(\{/);
assert.match(src, /else ringbackRef\.current\.start\(memberIds, myIdRef\.current\)/, "start rings through the ringback");
assert.doesNotMatch(src, /audioManager\.play\("outgoingCall", \{ loop: true \}\);\n/, "no bare ringback loop left");
const onDeclined = src.slice(src.indexOf("const onDeclined = "), src.indexOf("const onIncomingDeclined"));
assert.match(onDeclined, /ringbackRef\.current\?\.declined\(fromUserId\)/, "a decline counts");
assert.match(src, /socket\.on\("group:call:busy", onBusy\)/, "busy is handled (was ignored)");
assert.match(src, /socket\.off\("group:call:busy", onBusy\)/);
const onAccept = src.slice(src.indexOf("const onAccept = async"), src.indexOf("const stream = localStreamRef.current;", src.indexOf("const onAccept = async")));
assert.match(onAccept, /ringbackRef\.current\?\.answered\(\)/);
const cleanup = src.slice(src.indexOf("const cleanup = useCallback"), src.indexOf("const setupPeerConnection = useCallback"));
assert.match(cleanup, /ringbackRef\.current\?\.end\("ended"\)/);
assert.match(cleanup, /isInitiatorRef\.current = false/);
const join = src.slice(src.indexOf("const onJoinExisting = async"), src.indexOf("// Get media stream", src.indexOf("const onJoinExisting = async")));
assert.match(join, /isInitiatorRef\.current && activeGroupIdRef\.current === groupId/, "a phantom start of the same group is dropped");
assert.match(join, /cleanup\(\);/);
assert.doesNotMatch(join, /if \(isInCallRef\.current\) \{\s*return;\s*\}/, "join-existing is no longer ignored while our start is pending");

console.log("groupRingback selftest ok");
