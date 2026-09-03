import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./voiceSessionCapture.js", import.meta.url)), "utf8");
assert.match(source, /function ensureRecorder/);
assert.match(source, /mergeVoiceMeta/);
assert.match(source, /metaSnapshot/);
assert.match(source, /setInterval/);
assert.match(source, /ctx.state === "suspended"/);
assert.match(source, /\/api\/voice-recordings/);
assert.match(source, /\[voiceCapture\] upload/);

const audioLevel = readFileSync(fileURLToPath(new URL("../hooks/useAudioLevel.js", import.meta.url)), "utf8");
assert.match(audioLevel, /ctx.state === "suspended"/);

console.log("voiceSessionCapture retry + meta snapshot self-test passed");
