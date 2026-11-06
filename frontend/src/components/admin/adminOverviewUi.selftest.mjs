import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ov = readFileSync(new URL("./AdminOverview.jsx", import.meta.url), "utf8");
const card = readFileSync(new URL("./AdminErrorCard.jsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("./AdminPanel.jsx", import.meta.url), "utf8");
const adminRoutes = readFileSync(new URL("../../../backend/routes/admin.js", import.meta.url), "utf8");

assert.equal(ov.includes("quietError"), false, "overview keeps a single error line");
assert.equal(ov.includes('t("Never")'), false, "a failed load must not say Asla");
assert.match(ov, /descall:admin-overview/, "last good overview is cached");
assert.equal(ov.includes('adminFetch("/analytics")'), false, "overview must not poll the unbounded analytics read");
// UI audit #37: a failed load without cached data is one announced error card (no skeletons).
assert.match(ov, /<AdminErrorCard/, "the one failure state is the shared error card");
assert.match(card, /role="alert"/, "the error card is announced");
assert.match(ov, /error && !data \? \(\s*<AdminErrorCard/, "the error card replaces the skeleton KPIs");
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
assert.match(analytics, /Analytics timed out\. Please try again\./, "analytics timeout is a static English phrase (translated by the app)");

console.log("adminOverviewUi.selftest ok");
