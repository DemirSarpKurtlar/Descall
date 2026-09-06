/**
 * Run: node frontend/src/components/dimaai/DimaAiWorkspace.send.selftest.mjs
 * Guards: after send, conversation reload must not blank the live thread.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, "DimaAiWorkspace.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/dimaai.css"), "utf8");

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(src.includes("function preferLiveThread"), "preferLiveThread helper required");
assert(src.includes("function isTransientDimaMessage"), "transient message helper required");
assert(src.includes("busyRef.current"), "busy guard during reload");
assert(src.includes("loadConversation(conversationId, { force: true })"), "post-send force reload");
assert(src.includes("writeThreadCache(accountIdRef.current, conversationId"), "seed cache before navigate");
assert(src.includes("suppressReloadUntilRef.current = Date.now() + 15000"), "suppress wipe after create");
assert(src.includes("Never blank a populated thread") || src.includes("livePrev.length"), "empty server snapshot guard");
assert(css.includes("dima-scroll") && css.includes("flex: 1 1 0"), "scroll area keeps flex height");

console.log("DimaAiWorkspace.send.selftest.mjs: ok");
