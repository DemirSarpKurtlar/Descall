/**
 * Run: node frontend/src/lib/errorScreen.selftest.mjs
 * The production crash screen must not render account or stack details.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boundaryAccount, canSeeErrorDetails, makeSupportCode } from "./errorScreen.js";

const here = dirname(fileURLToPath(import.meta.url));
const boundary = readFileSync(join(here, "../components/ErrorBoundary.jsx"), "utf8");
const render = boundary.slice(boundary.indexOf("render() {"));

assert.equal(boundaryAccount(null).role, "guest");
assert.equal(boundaryAccount({ username: "admin", email: "demir@descall.com", id: "d6a94c7c" }).role, "admin");
assert.equal(boundaryAccount({ username: "ada", is_admin: true }).role, "admin");
assert.equal(boundaryAccount({ username: "ada", isAdmin: true }).isAdmin, true);
assert.equal(boundaryAccount({ username: "ada", id: "user-1" }).role, "user");
assert.equal(canSeeErrorDetails({ dev: false, admin: false }), false);
assert.equal(canSeeErrorDetails({ dev: false, admin: true }), true);
assert.equal(canSeeErrorDetails({ dev: true, admin: false }), true);
assert.match(makeSupportCode(() => 0), /^[0-9A-F]{8}$/);

for (const secret of ["userData.email", "userData.id", "userData.username", "userData.role", "systemInfo", "userAgent"]) {
  assert.equal(render.includes(secret), false, `crash screen still renders ${secret}`);
}
assert.match(render, /supportCode/);
assert.match(render, /canSeeErrorDetails/);
assert.match(render, /Try again now/);
assert.doesNotMatch(render, /clearUser\(\)/);
assert.doesNotMatch(render, /clearToken\(\)/);

console.log("errorScreen.selftest ok");
