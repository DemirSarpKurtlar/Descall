/**
 * Messaging phase 5: which files can go with a scheduled message (client check;
 * the server checks the stored upload again).
 *   node src/lib/scheduledAttachment.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ATTACH_ACCEPT, MAX_ATTACH_BYTES, attachmentKind, attachmentProblem, formatBytes } from "./scheduledAttachment.js";

const f = (type, size = 1000) => ({ type, size, name: "x" });
assert.equal(attachmentKind(f("image/png")), "image");
assert.equal(attachmentKind(f("video/mp4")), "video");
assert.equal(attachmentKind(f("application/pdf")), "document");
assert.equal(attachmentKind(f("audio/webm")), null, "voice notes are not scheduled");
assert.equal(attachmentKind(f("application/x-msdownload")), null);
assert.equal(attachmentProblem(f("image/jpeg")), null);
assert.equal(attachmentProblem(f("audio/mpeg")), "bad_attachment");
assert.equal(attachmentProblem(f("image/png", MAX_ATTACH_BYTES + 1)), "attachment_too_large");
assert.equal(attachmentProblem(null), "bad_attachment");
assert.ok(ATTACH_ACCEPT.includes("image/png") && !ATTACH_ACCEPT.includes("audio/"));
assert.equal(formatBytes(512, "en"), "512 B");
assert.equal(formatBytes(2.5 * 1024 * 1024, "tr"), "2,5 MB");

// The backend limit and kinds match (routes/media.js, lib/scheduledMessages.js).
const backend = readFileSync(new URL("../../backend/lib/scheduledMessages.js", import.meta.url), "utf8");
assert.ok(backend.includes("100 * 1024 * 1024"), "same size limit");
assert.ok(backend.includes('["image", "video", "document", "file"]'), "same kinds");

console.log("scheduledAttachment selftest OK");
