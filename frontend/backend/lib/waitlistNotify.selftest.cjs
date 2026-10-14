"use strict";

const { claimWaitlistNotify, resetWaitlistNotify, DAY_MS } = require("./waitlistNotify");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

resetWaitlistNotify();
const now = Date.parse("2026-10-14T12:00:00.000Z");
assert(claimWaitlistNotify("Ada@Descall.com", now) === true, "first signup notifies");
assert(claimWaitlistNotify("ada@descall.com", now + 1000) === false, "same address is deduped");
assert(claimWaitlistNotify("other@descall.com", now) === true, "a different address still notifies");
assert(claimWaitlistNotify("ada@descall.com", now + DAY_MS) === true, "the same address can notify the next day");

console.log("waitlistNotify.selftest.cjs: ok");
