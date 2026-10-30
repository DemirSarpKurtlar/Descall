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

// 3.1: the whole admin panel window.
const { isAdminPanelUrl, adminPanelWindowOptions, ADMIN_PANEL_PATH } = require("./adminStatsWindow.cjs");
assert.equal(ADMIN_PANEL_PATH, "/admin/panel");
assert.equal(isAdminPanelUrl("descall://app/admin/panel"), true);
assert.equal(isAdminPanelUrl("descall://app/admin/panel/"), true);
assert.equal(isAdminPanelUrl("descall://app/admin/signup-stats"), false);
assert.equal(isAdminPanelUrl("descall://app/admin/panelx"), false);
assert.equal(isAdminPanelUrl("https://evil.example/admin/panel"), false);
assert.equal(isAdminPanelUrl("http://localhost:5173/admin/panel"), false, "dev origin only in dev");
assert.equal(isAdminPanelUrl("http://localhost:5173/admin/panel", { isDev: true }), true);
assert.equal(isSignupStatsUrl("descall://app/admin/panel"), false, "routes stay distinct");
const a = adminPanelWindowOptions({ preload: "/p.cjs", platform: "win32" });
assert.equal(a.frame, false);
assert.equal(a.width, 1440);
assert.equal(a.height, 900);
assert.equal(a.webPreferences.sandbox, true);
assert.equal(a.webPreferences.contextIsolation, true);
console.log("adminPanelWindow.selftest ok");
