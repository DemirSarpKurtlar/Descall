// node backend/lib/userFeedbackVoiceDiag.selftest.cjs — 3.7.27: web feedback stores
// browser / OS, call reports carry a whitelisted voice snapshot (no personal data).
const assert = require("node:assert/strict");
const uf = require("./userFeedback");

assert.deepEqual(uf.parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36"), { browser: "Chrome 156", os: "macOS" });
assert.deepEqual(uf.parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0"), { browser: "Edge 156", os: "Windows" });
assert.deepEqual(uf.parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), { browser: "Safari 18", os: "iOS" });
assert.equal(uf.parseUserAgent("Mozilla/5.0 (Windows NT 10.0) Descall/3.7.27 Chrome/130 Electron/33").browser, "Descall Desktop 3.7.27");

const env = { SUPABASE_URL: "https://abc.supabase.co" };
const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const voiceDiag = { audioContextState: "suspended", nsEngine: "gtcrn", trackEnabled: true, bytesSent: 1200, candidateType: "relay", ip: "203.0.113.5", localAddress: "10.0.0.2", deviceLabel: "MacBook Pro Microphone" };
let r = uf.sanitizeSubmission({ kind: "bug", message: "Ses karşıya gitmiyor", area: "voice", frequency: "always", platform: "Web", voiceDiag }, { env, userAgent: ua }).row;
assert.deepEqual(r.details.client, { browser: "Chrome 156", os: "macOS", ua });
assert.deepEqual(r.details.voiceDiag, { bytesSent: 1200, audioContextState: "suspended", nsEngine: "gtcrn", candidateType: "relay", trackEnabled: true });
assert.ok(!JSON.stringify(r.details).includes("203.0.113"), "no IPs");
assert.ok(!JSON.stringify(r.details).includes("MacBook"), "no device labels");
// Device info off → nothing.
r = uf.sanitizeSubmission({ kind: "bug", message: "Ses karşıya gitmiyor", includeDevice: false, voiceDiag }, { env, userAgent: ua }).row;
assert.equal(r.details.client, undefined);
assert.equal(r.details.voiceDiag, undefined);
// Not a call report → no snapshot, browser info still there.
r = uf.sanitizeSubmission({ kind: "suggestion", message: "Tema seçeneği olsun", area: "settings", voiceDiag }, { env, userAgent: ua }).row;
assert.equal(r.details.voiceDiag, undefined);
assert.equal(r.details.client.os, "macOS");

console.log("userFeedbackVoiceDiag.selftest ok");
