"use strict";

const { planDmSend, planCallOffer } = require("./messageRequestPolicy");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

assert(planDmSend({ friends: true }) === "deliver", "friends deliver");
assert(planDmSend({ friends: false }) === "request", "strangers request");
assert(planDmSend({ blocked: true, friends: true }) === "deny", "block wins over friendship");
assert(planDmSend({ self: true }) === "deny", "self is denied");

assert(planCallOffer({ friends: true }) === "ring", "friends ring");
assert(planCallOffer({ friends: false }) === "deny", "strangers do not ring");
assert(planCallOffer({ friends: false, activeRenegotiation: true }) === "ring", "live call can renegotiate");
assert(planCallOffer({ blocked: true, friends: true, activeRenegotiation: true }) === "deny", "block wins over a live call");

console.log("messageRequestPolicy.selftest: ok");
