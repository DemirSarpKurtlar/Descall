import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ov = readFileSync(new URL("./AdminOverview.jsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("./AdminPanel.jsx", import.meta.url), "utf8");
const adminRoutes = readFileSync(new URL("../../../backend/routes/admin.js", import.meta.url), "utf8");

assert.equal(ov.includes("quietError"), false, "overview keeps a single error line");
assert.equal(ov.includes('t("Never")'), false, "a failed load must not say Asla");
assert.match(ov, /descall:admin-overview/, "last good overview is cached");
assert.equal(ov.includes('adminFetch("/analytics")'), false, "overview must not poll the unbounded analytics read");
assert.match(ov, /role="alert"/, "the one failure banner is announced");
assert.match(ov, /!data \?/, "missing data renders a skeleton");

const boot = panel.slice(
  panel.indexOf("Overview owns its own banner"),
  panel.indexOf('if (tab === "moderation")'),
);
assert.ok(boot.includes("loadStats().catch"), "background stats still load");
assert.equal(boot.includes("setErr"), false, "boot stats failure must not paint a second banner");

const analytics = adminRoutes.slice(
  adminRoutes.indexOf('router.get("/analytics"'),
  adminRoutes.indexOf('router.get("/analytics"') + 1800,
);
assert.match(analytics, /withTimeout\(/, "analytics reads are bounded");
assert.match(analytics, /Analitik zaman aşımına uğradı/, "analytics timeout is Turkish");

console.log("adminOverviewUi.selftest ok");
