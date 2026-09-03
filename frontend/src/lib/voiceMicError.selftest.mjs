import assert from "node:assert/strict";
import { voiceMicErrorCopy, isVoiceMicError } from "./voiceMicError.js";

assert.equal(voiceMicErrorCopy({ name: "NotFoundError" }), "No microphones found");
assert.equal(voiceMicErrorCopy({ name: "NotAllowedError" }), "Microphone permission required");
assert.equal(voiceMicErrorCopy({ name: "NotReadableError" }), "Microphone is already in use by another app.");
assert.equal(isVoiceMicError({ name: "NotFoundError" }), true);
assert.equal(isVoiceMicError({ name: "TypeError" }), false);

console.log("voiceMicError self-test passed");
