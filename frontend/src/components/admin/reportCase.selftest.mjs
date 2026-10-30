// node src/components/admin/reportCase.selftest.mjs
// Rapor iş akışı (3.4.0): Raporlar shows the case controls, the menu sits above
// the in-app admin panel, copy exists in both languages, phone targets 44pt.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const reports = rd("./AdminReports.jsx");
const kase = rd("./ReportCase.jsx");
const css = rd("../../styles/report-case.css");
const menu = rd("../ui/GlassActionMenu.jsx");
const perms = rd("../../../backend/lib/adminPermissions.js");
const routes = rd("../../../backend/routes/adminPeople.js");

assert.match(reports, /<AssigneeButton group=\{g\} t=\{t\} onChanged=\{load\} \/>/);
assert.match(reports, /<CaseTimeline targetId=\{g\.targetId\}/);
assert.match(reports, /q\.set\("assignee", assignee\)/, "filter goes to the server");
assert.match(kase, /\/reports\/target\/\$\{encodeURIComponent\(group\.targetId\)\}\/assign/);
assert.match(kase, /\/reports\/target\/\$\{encodeURIComponent\(targetId\)\}\/notes/);
// The in-app admin shell is z-index 99998; the menu must open above it.
const z = Number(kase.match(/zIndex=\{(\d+)\}/)?.[1]);
assert.ok(z > 99998, "assign menu above the admin panel");
assert.match(menu, /align = "right"/, "GlassActionMenu keeps right alignment by default");
// Server: every workflow route is under /reports (section "reports").
for (const r of ["/reports/assignees", "/reports/target/:targetId/assign", "/reports/target/:targetId/notes"]) {
  assert.ok(routes.includes(`"${r}"`), `route ${r}`);
}
assert.match(perms, /\[\/\^\\\/reports\(\\\/\|\$\)\/, "reports"\]/, "reports paths need the Raporlar section");

const tr = rd("../../i18n/locales/tr.js");
const en = rd("../../i18n/locales/en.js");
for (const key of new Set([...(reports + kase).matchAll(/t\("admin\.(case\w+)"/g)].map((m) => m[1]))) {
  assert.ok(new RegExp(`"${key}":`).test(tr), `tr admin.${key}`);
  assert.ok(new RegExp(`"${key}":`).test(en), `en admin.${key}`);
}
assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(kase + reports), "no emoji");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*min-height: 44px/);
console.log("reportCase.selftest: ok");
