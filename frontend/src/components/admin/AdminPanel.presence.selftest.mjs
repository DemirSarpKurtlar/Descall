/**
 * Run: node frontend/src/components/admin/AdminPanel.presence.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const panel = readFileSync(join(root, "AdminPanel.jsx"), "utf8");
const handlers = readFileSync(join(root, "../../../backend/socket/handlers.js"), "utf8");
const adminRoute = readFileSync(join(root, "../../../backend/routes/admin.js"), "utf8");

assert(panel.includes("presenceStatusLabel"), "overview must show real presence status");
assert(panel.includes("connectedCount"), "overview must use pruned connected count");
assert(panel.includes('p?.type === "presence"'), "live presence events must refresh the overview");
assert(handlers.includes("remainingUserSocketIds"), "disconnect must ignore the closing socket still listed in the room");
assert(adminRoute.includes("pruneDeadPresence"), "admin stats must drop ghost presence rows");
assert(adminRoute.includes("summarizePresence"), "admin stats must count live sockets, not raw map size");

console.log("AdminPanel.presence.selftest.mjs: ok");
