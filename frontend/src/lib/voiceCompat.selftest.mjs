// Voice-note playback fallback: WebM/Opus notes get an M4A copy where the element cannot decode them.
import assert from "node:assert";
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { voiceExtOf, needsVoiceCompat, fetchVoiceCompatUrl } = await import("./voiceCompat.js");
import { readFileSync } from "node:fs";

assert.equal(voiceExtOf("https://api.descall.com/api/media/f/files/1-ab.webm?e=1&s=x"), "webm");
assert.equal(voiceExtOf("sb://media-private/files/1-ab.m4a"), "m4a");
assert.equal(voiceExtOf("https://x/y"), "");
const safari = { canPlayType: (t) => (t.includes("webm") ? "" : "maybe") };
const chrome = { canPlayType: () => "probably" };
assert.equal(needsVoiceCompat("https://x/files/a.webm?e=1", safari), true);
assert.equal(needsVoiceCompat("https://x/files/a.webm?e=1", chrome), false);
assert.equal(needsVoiceCompat("https://x/files/a.m4a?e=1", safari), false);

let calls = 0;
const fetchImpl = async (url, init) => {
  calls += 1;
  assert.ok(url.endsWith("/api/media/voice-compat"));
  assert.equal(JSON.parse(init.body).url, "https://x/files/a.webm?e=1");
  return { ok: true, json: async () => ({ url: "https://x/files/a.webm.m4a?e=2" }) };
};
const [a, b] = await Promise.all([
  fetchVoiceCompatUrl("https://x/files/a.webm?e=1", { fetchImpl }),
  fetchVoiceCompatUrl("https://x/files/a.webm?e=1", { fetchImpl }),
]);
assert.equal(a, "https://x/files/a.webm.m4a?e=2");
assert.equal(b, a);
assert.equal(calls, 1);
const fail = await fetchVoiceCompatUrl("https://x/files/b.webm", { fetchImpl: async () => ({ ok: false }) });
assert.equal(fail, null);

// Recorder order: AAC/MP4 first, WebM/Opus before plain audio/mp4 (Chromium may put Opus in it).
const vm = readFileSync(new URL("./voiceMessage.js", import.meta.url), "utf8");
const i = (s) => vm.indexOf(`"${s}"`);
assert.ok(i("audio/mp4;codecs=mp4a.40.2") < i("audio/webm;codecs=opus"));
assert.ok(i("audio/webm;codecs=opus") < vm.lastIndexOf(`"audio/mp4"`));
// The player falls back to the compat copy.
const player = readFileSync(new URL("../components/chat/VoiceMessagePlayer.jsx", import.meta.url), "utf8");
assert.ok(player.includes("fetchVoiceCompatUrl") && player.includes("needsVoiceCompat"));
console.log("voiceCompat.selftest ok");
