import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAT_UPLOAD_MAX_BYTES, checkChatFile, codeForResponse, uploadErrorKey, uploadChatFile } from "./chatUpload.js";

assert.equal(checkChatFile({ size: 10 }), null);
assert.equal(checkChatFile({ size: CHAT_UPLOAD_MAX_BYTES + 1 }), "TOO_LARGE", "refused before any byte is sent");
assert.equal(checkChatFile(null), "FAILED");
assert.equal(codeForResponse(413, null), "TOO_LARGE");
assert.equal(codeForResponse(400, { code: "FILE_TOO_LARGE" }), "TOO_LARGE");
assert.equal(codeForResponse(415, { error: "File type x is not allowed." }), "TYPE");
assert.equal(codeForResponse(502, null), "FAILED", "an HTML 502 is a plain failure, never parser text");
assert.equal(uploadErrorKey("TOO_LARGE"), "msg5.upload.tooLarge");
assert.equal(uploadErrorKey("TYPE"), "msg5.upload.typeNotAllowed");
assert.equal(uploadErrorKey("whatever"), "msg5.upload.failed");
await assert.rejects(uploadChatFile({ size: CHAT_UPLOAD_MAX_BYTES * 2 }), (e) => e.code === "TOO_LARGE");

// Composer wiring: a chat switch drops a staged or uploading file (messaging-01),
// the field stays while uploading (messaging-21).
const here = dirname(fileURLToPath(import.meta.url));
const composer = readFileSync(join(here, "../components/chat/MessageComposer.jsx"), "utf8");
assert.ok(composer.includes("uploadChatFile("), "the composer uploads through chatUpload");
assert.ok(composer.includes("resetStagedForChatSwitch()"), "the chat switch clears the staged attachment");
assert.ok(composer.includes("draftKeyRef.current !== key"), "a finished upload for another chat is dropped");
assert.ok(!/\{uploading \? \(\s*<div className="recording-bar">/.test(composer), "the text field is not replaced while uploading");
assert.ok(composer.includes('role="alert"'), "upload errors are announced");

console.log("chatUpload selftest OK");
