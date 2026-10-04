"use strict";
const assert = require("assert");
const p = require("./usernamePolicy");

assert.equal(p.isReservedUsername("admin"), true);
assert.equal(p.isReservedUsername("  ADMIN "), true);
assert.equal(p.isReservedUsername("Descall"), true);
assert.equal(p.isReservedUsername("demir"), false);
assert.equal(p.isProtectedAccountUsername("Admin"), true);
assert.equal(p.isProtectedAccountUsername("demir"), false);
assert.equal(p.escapeLike("a_b%c\\d"), "a\\_b\\%c\\\\d");
console.log("usernamePolicy.selftest.cjs: ok");
