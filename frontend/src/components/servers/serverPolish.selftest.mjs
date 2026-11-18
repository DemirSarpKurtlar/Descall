// Polish pass (Nov 2026): member menu fit, localized labels in the server UI.
// Run: node src/components/servers/serverPolish.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const members = read("ServerMembersPanel.jsx");
const roles = read("ServerRolesModal.jsx");
const invite = read("ServerInviteModal.jsx");
const svhTr = read("../../i18n/locales/svh.tr.js");

// The member menu is measured after render and whenever a submenu opens, kept in the window.
assert.match(members, /useLayoutEffect\(\(\) => \{\s*const el = menuRef\.current;/);
assert.match(members, /\}, \[menu, roleSubmenu, timeoutSubmenu\]\);/);
assert.match(members, /el\.style\.maxHeight = /);

// Timeout durations come from Intl in the UI language, never "60s" / "1w".
assert.doesNotMatch(members, /"60s"|"1w"|"5m"/);
assert.match(members, /formatNumber\(value, getLocale\(\), \{ style: "unit", unit, unitDisplay: "short" \}\)/);

// Permission names without a flat-locale key reuse the translated hub names.
assert.match(roles, /USE_APPLICATION_COMMANDS: "svh\.p_USE_APPLICATION_COMMANDS"/);
assert.match(roles, /CHANGE_NICKNAME: "svh\.p_CHANGE_NICKNAME"/);
assert.match(roles, /\{permLabel\(t, key\)\}/);

// A non-expiring invite reads "never expires", not "never".
assert.match(invite, /t\("Never expires"\)/);
assert.match(svhTr, /badgeAnn: "DUYURU"/);

console.log("serverPolish selftest ok");
