// node src/lib/iosOutputField.selftest.mjs — iPhone call output (27 Nov 2026: "ahizeye geçmiyor").
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { iosOutputFieldModel } from "./iosOutputField.js";
import { inputMenuGroups, outputMenuGroups } from "./callDeviceMenus.js";

const L = { speaker: "Hoparlör", receiver: "Ahize", systemDefault: "Sistem varsayılanı", now: "Şu an" };

// Idle: default for the next call.
let m = iosOutputFieldModel(null, "", L);
assert.equal(m.live, false);
assert.equal(m.value, "");
assert.deepEqual(m.options.map((o) => o.id), ["", "speaker", "receiver"]);
assert.equal(iosOutputFieldModel({ active: false, routes: [] }, "receiver", L).value, "receiver");
assert.equal(iosOutputFieldModel(null, "bogus", L).value, "");

// In a call: live routes, the real route selected.
const snap = {
  active: true,
  current: "receiver",
  selected: "receiver",
  routes: [
    { id: "receiver", kind: "receiver", name: "" },
    { id: "speaker", kind: "speaker", name: "" },
    { id: "input:BT-1", kind: "bluetooth", name: "AirPods" },
  ],
};
m = iosOutputFieldModel(snap, "speaker", L);
assert.equal(m.live, true);
assert.equal(m.value, "receiver", "shows what plays, not the stored default");
assert.equal(m.options.find((o) => o.id === "receiver").label, "Ahize · Şu an");
assert.equal(m.options.find((o) => o.id === "input:BT-1").label, "AirPods");
assert.equal(iosOutputFieldModel({ ...snap, selected: "" }, "", L).value, "receiver", "falls back to the first route");

// In-call menus of every call kind use the native routes when the hook has them
// (group calls and voice channels used to list WKWebView devices: none).
const picked = [];
const hook = { iosAudioRoute: snap, selectIosRoute: (id) => picked.push(id) };
const out = outputMenuGroups(hook, (s) => s);
assert.deepEqual(out[0].rows.map((r) => r.id), ["receiver", "speaker", "input:BT-1"]);
out[0].onSelect("receiver");
assert.deepEqual(picked, ["receiver"]);
assert.ok(inputMenuGroups(hook, (s) => s)[0].rows.length >= 1);

// Wiring: group and server voice hooks expose the native route; server voice owns it while in a channel.
const group = readFileSync(new URL("../hooks/useGroupCall.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../hooks/useServerVoice.js", import.meta.url), "utf8");
for (const [name, src] of [["useGroupCall", group], ["useServerVoice", server]]) {
  assert.match(src, /iosAudioRoute: iosRouteHook\.iosAudioRoute/, `${name} exposes iosAudioRoute`);
  assert.match(src, /selectIosRoute: iosRouteHook\.selectIosRoute/, `${name} exposes selectIosRoute`);
}
assert.match(server, /beginIosCallAudio\(\{ video: false, owner: "server" \}\)/, "voice channel begins the route");
assert.match(server, /endIosCallAudio\("server"\)/, "and ends it");

// Native root cause guard: the router clears .defaultToSpeaker for the earpiece.
const logic = readFileSync(new URL("../../ios/App/App/DescallNativeCallLogic.swift", import.meta.url), "utf8");
const router = readFileSync(new URL("../../ios/App/App/DescallCallManager.swift", import.meta.url), "utf8");
assert.match(logic, /static func routePlan\(/);
assert.match(router, /DescallNativeCallLogic\.routePlan\(/, "router applies the plan");
assert.match(router, /DescallNativeCall\.setDefaultToSpeaker\(on, nativeEngine: native\)/);
const plugin = readFileSync(new URL("../../ios/App/App/DescallCallKitPlugin.swift", import.meta.url), "utf8");
assert.match(plugin, /CAPPluginMethod\(name: "setCallAudioPreference"/);

console.log("iosOutputField.selftest ok");
