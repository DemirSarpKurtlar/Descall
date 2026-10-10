"use strict";

const {
  recordFailure,
  peek,
  resetLimits,
  rejectIfLimited,
  isReviewDemo,
  TOO_MANY_TR,
} = require("./rateLimit");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

resetLimits();
const key = "login:ip:test";
for (let i = 0; i < 3; i += 1) {
  const row = recordFailure(key, { max: 3, windowMs: 1000 });
  assert(row.ok, "attempt " + i + " allowed");
}
const locked = recordFailure(key, { max: 3, windowMs: 1000 });
assert(!locked.ok && locked.retryAfterSec >= 30, "fourth attempt locks with backoff");
const again = peek(key, { max: 3, windowMs: 1000 });
assert(!again.ok && again.retryAfterSec >= 1, "peek stays locked");

let status = 0;
let body = null;
let retry = null;
const res = {
  set(name, value) {
    if (String(name).toLowerCase() === "retry-after") retry = value;
  },
  status(code) {
    status = code;
    return this;
  },
  json(payload) {
    body = payload;
  },
};
assert(rejectIfLimited(res, [again]) === true, "rejectIfLimited writes the response");
assert(status === 429, "status 429");
assert(body.error === TOO_MANY_TR, "Turkish message");
assert(Number(retry) >= 1, "Retry-After set");

assert(isReviewDemo("Reviewer", { REVIEW_DEMO_USERNAMES: "reviewer, other" }), "demo match is case-insensitive");
assert(!isReviewDemo("alice", { REVIEW_DEMO_USERNAMES: "reviewer" }), "other accounts are not exempt");

resetLimits();
console.log("rateLimit.selftest.cjs: ok");
