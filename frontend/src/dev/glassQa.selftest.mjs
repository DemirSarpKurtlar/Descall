/**
 * The desktop glass visual harness must stay out of production bundles.
 * Run: node frontend/src/dev/glassQa.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const socket = read("socket.js");
assert(
  /import\.meta\.env\.DEV[\s\S]{0,240}__DESCALL_GLASS_QA_SOCKET__/.test(socket),
  "fake socket must be behind import.meta.env.DEV"
);

for (const file of ["hooks/useCall.js", "hooks/useGroupCall.js", "hooks/useServerVoice.js", "context/ToastContext.jsx"]) {
  const src = read(file);
  assert(src.includes("import.meta.env.DEV"), `${file} must gate the QA hook`);
  assert(!src.includes("import \"../dev/glassQaBridge.js\""), `${file} must not statically import the QA bridge`);
  assert(!src.includes("import '../dev/glassQaBridge.js'"), `${file} must not statically import the QA bridge`);
}

const app = read("App.jsx");
assert(!app.includes("glassQaBridge"), "App.jsx must not reference the QA bridge");
assert(!app.includes("__DESCALL_GLASS_QA_SOCKET__"), "App.jsx must not reference the QA socket");

const bridge = read("dev/glassQaBridge.js");
assert(bridge.includes("descall:glass-qa"), "bridge listens for the QA event");
assert(!bridge.includes("glass-ui"), "bridge must not touch the iPhone glass class");

console.log("glassQa.selftest ok");
