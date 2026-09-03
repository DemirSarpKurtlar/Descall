"use strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";

const assert = require("assert");
const { convKey, formatDmPreview } = require("./dmMessages");

assert.equal(convKey("b", "a"), "a::b");
assert.equal(convKey("a", "a"), "a::a");

assert.equal(formatDmPreview(null), null);
assert.equal(formatDmPreview({ text: "hello" }), "hello");
assert.equal(formatDmPreview({ text: "  hi  " }), "hi");
assert.equal(formatDmPreview({ text: "", mediaType: "image" }), "📷 Photo");
assert.equal(formatDmPreview({ text: "", mediaType: "voice" }), "🎤 Voice message");
assert.equal(formatDmPreview({ text: "__voice__:3.2" }), "🎤 Voice message");
assert.equal(formatDmPreview({ text: "", mediaUrl: "https://cdn/file.png" }), "📎 Attachment");
assert.equal(formatDmPreview({ text: "" }), null);

console.log("dmMessages.unit.test.js: ok");
