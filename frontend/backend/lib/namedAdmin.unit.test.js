"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isNamedAdmin } = require("./namedAdmin");

test("only the username admin is the voice-archive account", () => {
  assert.equal(isNamedAdmin({ username: "admin", is_admin: false }), true);
  assert.equal(isNamedAdmin({ username: "admin", is_admin: true }), true);
});

test("admin role without that username is not enough", () => {
  assert.equal(isNamedAdmin({ username: "moderator", is_admin: true }), false);
  assert.equal(isNamedAdmin({ username: "Admin", is_admin: true }), false);
  assert.equal(isNamedAdmin({ username: "yonetici", role: "admin" }), false);
  assert.equal(isNamedAdmin(null), false);
});
