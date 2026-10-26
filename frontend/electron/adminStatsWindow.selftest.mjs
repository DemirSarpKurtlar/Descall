import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { isSignupStatsUrl, signupStatsWindowOptions } = require("./adminStatsWindow.cjs");

assert.equal(isSignupStatsUrl("descall://app/admin/signup-stats"), true);
assert.equal(isSignupStatsUrl("descall://app/admin/signup-stats/"), true);
assert.equal(isSignupStatsUrl("http://localhost:5173/admin/signup-stats"), false, "dev origin only in dev");
assert.equal(isSignupStatsUrl("http://localhost:5173/admin/signup-stats", { isDev: true }), true);
assert.equal(isSignupStatsUrl("https://evil.example/admin/signup-stats"), false);
assert.equal(isSignupStatsUrl("descall://other/admin/signup-stats"), false);
assert.equal(isSignupStatsUrl("descall://app/admin/signup-statsx"), false);
assert.equal(isSignupStatsUrl("not a url"), false);
const o = signupStatsWindowOptions({ preload: "/p.cjs", platform: "win32" });
assert.equal(o.frame, false);
assert.equal(o.width, 1240);
assert.equal(o.webPreferences.contextIsolation, true);
assert.equal(o.webPreferences.nodeIntegration, false);
console.log("adminStatsWindow.selftest ok");
