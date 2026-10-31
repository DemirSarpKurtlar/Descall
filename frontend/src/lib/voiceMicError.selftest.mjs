import assert from "node:assert/strict";
import { voiceMicErrorCopy, isVoiceMicError } from "./voiceMicError.js";

assert.equal(voiceMicErrorCopy({ name: "NotFoundError" }), "No microphones found");
assert.equal(voiceMicErrorCopy({ name: "NotAllowedError" }), "Microphone permission required");
assert.equal(voiceMicErrorCopy({ name: "NotReadableError" }), "Microphone is already in use by another app.");
assert.equal(isVoiceMicError({ name: "NotFoundError" }), true);
assert.equal(isVoiceMicError({ name: "TypeError" }), false);

console.log("voiceMicError self-test passed");

// 3.7.15: a saved microphone that is gone (OverconstrainedError, empty message) has
// its own copy, and the server voice join falls back to the default mic instead of
// ending on the generic "Could not join voice channel.".
import { readFileSync } from "node:fs";
assert.equal(voiceMicErrorCopy({ name: "OverconstrainedError", message: "" }), "The selected microphone was not found.");
const hook = readFileSync(new URL("../hooks/useServerVoice.js", import.meta.url), "utf8");
assert.match(hook, /const acquireJoinMic = useCallback\(async \(\) => \{/);
assert.ok(hook.includes('if (!savedId || (err?.name !== "OverconstrainedError" && err?.name !== "NotFoundError")) throw err;'), "only a missing saved device falls back");
assert.match(hook, /writeAudioPref\("input", ""\);\s*toastRef\.current\?\.\(tRuntime\("The saved microphone was not found, using the default microphone\."\)/);
assert.match(hook, /return acquireVoiceMicStream\(\{ video: false \}\);/);
assert.match(hook, /const stream = isStage \? new MediaStream\(\) : await acquireJoinMic\(\);/);
assert.match(hook, /joinStep === "mic" \? "Could not access the microphone\." : "Could not connect to the voice server\."/);
for (const loc of ["tr", "en"]) {
  const src = readFileSync(new URL(`../i18n/locales/${loc}.js`, import.meta.url), "utf8");
  for (const k of ["The saved microphone was not found, using the default microphone.", "The selected microphone was not found.", "Could not connect to the voice server."]) {
    assert.ok(src.includes(`"${k}":`), `${loc} missing ${k}`);
  }
}
console.log("voiceMicError join fallback ok");
