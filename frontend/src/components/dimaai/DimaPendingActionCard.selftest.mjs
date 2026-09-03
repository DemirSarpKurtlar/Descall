/**
 * Run: node frontend/src/components/dimaai/DimaPendingActionCard.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const card = readFileSync(join(root, "DimaPendingActionCard.jsx"), "utf8");
const turn = readFileSync(join(root, "DimaChatTurn.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/dimaai.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(card.includes("dima-agent-bubble"), "DM drafts must render as a chat bubble");
assert(card.includes("dima-agent-to"), "DM drafts must show a recipient row");
assert(card.includes("agentApprove"), "card must keep an Approve & send control");
assert(!/JSON\.stringify/.test(card), "card must not dump the draft as JSON");
assert(turn.includes("stripAgentDraftChrome"), "chat turns must hide compose JSON from markdown");
assert(turn.includes("DimaPendingActionCard"), "chat turns must render the approval card");
assert(turn.includes("collapsePendingActions"), "duplicate draft cards must collapse");
assert(/\.dima-agent-bubble \{/.test(css), "bubble styles must exist");
assert(!/linear-gradient\(90deg,\s*#8b5cf6,\s*#ec4899\)/.test(css), "approve button must use app primary, not the old purple-pink fill");

console.log("DimaPendingActionCard.selftest.mjs: ok");
