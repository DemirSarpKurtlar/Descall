"use strict";

const { debugRoutesEnabled } = require("./debugGate");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(debugRoutesEnabled({ ENABLE_DEBUG_ROUTES: "true" }) === true, "explicit flag enables debug");
assert(debugRoutesEnabled({ ENABLE_DEBUG_ROUTES: " TRUE " }) === true, "flag is trimmed");
assert(debugRoutesEnabled({ NODE_ENV: "development" }) === false, "NODE_ENV alone stays closed");
assert(debugRoutesEnabled({}) === false, "unset flag stays closed");

console.log("debugGate.selftest.cjs: ok");
