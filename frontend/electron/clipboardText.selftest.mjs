// clipboardText.cjs: the permission rule behind the Windows "Write permission denied" copy
// failure, and the clipboard:write-text IPC. Run from frontend/: node electron/clipboardText.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isPermissionAllowed, permissionUrl, writeClipboardText, MAX_CLIPBOARD_TEXT_CHARS } = require("./clipboardText.cjs");
const { isAppUrl } = require("./appTrust.cjs");

const MEDIA = ["media", "display-capture", "speaker-selection"];
const opts = { mediaPermissions: MEDIA, isAppUrl };

// Clipboard write: the app origin only.
assert.equal(isPermissionAllowed("clipboard-sanitized-write", "descall://app/friends", opts), true);
assert.equal(isPermissionAllowed("clipboard-sanitized-write", "descall://app/direct/123", opts), true);
assert.equal(isPermissionAllowed("clipboard-sanitized-write", "descall://app", opts), true);
assert.equal(isPermissionAllowed("clipboard-sanitized-write", "https://evil.example/", opts), false);
assert.equal(isPermissionAllowed("clipboard-sanitized-write", "descall://other/", opts), false);
assert.equal(isPermissionAllowed("clipboard-sanitized-write", "", opts), false);
assert.equal(isPermissionAllowed("clipboard-sanitized-write", "http://localhost:5173/", opts), false);
assert.equal(isPermissionAllowed("clipboard-sanitized-write", "http://localhost:5173/", { ...opts, isDev: true }), true);
assert.equal(isPermissionAllowed("clipboard-sanitized-write", "descall://app/", { mediaPermissions: MEDIA }), false, "no origin check, no grant");

// Nothing else widened: reading the clipboard and other permissions stay denied.
for (const p of ["clipboard-read", "notifications", "geolocation", "midi", "openExternal"]) {
  assert.equal(isPermissionAllowed(p, "descall://app/friends", opts), false, p);
}
// The media list is unchanged (any origin, as before).
for (const p of MEDIA) assert.equal(isPermissionAllowed(p, "", opts), true, p);

// The URL to judge by: requesting URL/origin first, else the page.
const wc = { getURL: () => "descall://app/direct" };
assert.equal(permissionUrl(wc, "descall://app/x"), "descall://app/x");
assert.equal(permissionUrl(wc, undefined, ""), "descall://app/direct");
assert.equal(permissionUrl(null), "");
assert.equal(permissionUrl({ getURL: () => { throw new Error("destroyed"); } }), "");

// writeClipboardText: strings only, capped, never rejects.
{
  const got = [];
  const clipboard = { writeText: async (t) => { got.push(t); } };
  assert.deepEqual(await writeClipboardText({ clipboard, text: "hello" }), { ok: true });
  assert.deepEqual(got, ["hello"]);
  assert.deepEqual(await writeClipboardText({ clipboard, text: 5 }), { ok: false, error: "not_a_string" });
  assert.deepEqual(await writeClipboardText({ clipboard, text: { toString: () => "x" } }), { ok: false, error: "not_a_string" });
  assert.deepEqual(await writeClipboardText({ clipboard, text: "a".repeat(MAX_CLIPBOARD_TEXT_CHARS + 1) }), { ok: false, error: "too_long" });
  assert.deepEqual(got, ["hello"], "refused values never reach the clipboard");
  assert.deepEqual(await writeClipboardText({ clipboard: { writeText: async () => { throw new Error("busy"); } }, text: "x" }), { ok: false, error: "write_failed" });
  assert.deepEqual(await writeClipboardText({ clipboard: {}, text: "x" }), { ok: false, error: "unavailable" });
  assert.deepEqual(await writeClipboardText({ clipboard: null, text: "x" }), { ok: false, error: "unavailable" });
}

console.log("clipboardText.selftest: ok");
