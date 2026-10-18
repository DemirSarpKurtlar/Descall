// node src/lib/callDeviceMenus.selftest.mjs
import assert from "node:assert/strict";
import { inputMenuGroups, outputMenuGroups } from "./callDeviceMenus.js";

const t = (k) => ({ Loudspeaker: "Hoparlör", Headphones: "Kulaklık", "System default": "Sistem varsayılanı", "iPhone microphone": "iPhone mikrofonu", Earpiece: "Ahize", Microphone: "Mikrofon", "Audio output": "Ses çıkışı", Default: "Varsayılan" })[k] || k;

// Electron / web: enumerateDevices lists, checkmark on the chosen id.
const picked = [];
const hook = {
  audioInputDevices: [{ deviceId: "default", label: "Default - USB Mic" }, { deviceId: "m1", label: "USB Mic" }, { deviceId: "m2", label: "" }],
  audioOutputDevices: [{ deviceId: "default", label: "Default - Speakers" }, { deviceId: "o1", label: "Headset" }],
  selectedAudioInput: "m1",
  selectedAudioOutput: "",
  setAudioInput: (id) => picked.push(["in", id]),
  setAudioOutput: (id) => picked.push(["out", id]),
};
const [mic] = inputMenuGroups(hook, t);
assert.equal(mic.label, "Mikrofon");
assert.deepEqual(mic.rows.map((r) => [r.id, r.selected]), [["default", false], ["m1", true], ["m2", false]]);
assert.equal(mic.rows[2].name, "Varsayılan", "unlabeled device gets a name");
mic.onSelect("m2");
const [out] = outputMenuGroups(hook, t);
assert.equal(out.label, "Ses çıkışı");
assert.deepEqual(out.rows.map((r) => [r.id, r.selected]), [["default", true], ["o1", false]], "\"\" = system default checked");
out.onSelect("o1");
assert.deepEqual(picked, [["in", "m2"], ["out", "o1"]]);
// Saved device missing → default checked; browsers without a "default" entry get one.
const [miss] = outputMenuGroups({ ...hook, selectedAudioOutput: "gone" }, t);
assert.equal(miss.rows.find((r) => r.selected).id, "default");
const [safari] = outputMenuGroups({ audioOutputDevices: [], selectedAudioOutput: "" }, t);
assert.deepEqual(safari.rows.map((r) => [r.id, r.name, r.selected]), [["", "Sistem varsayılanı", true]]);

// Native iOS: AVAudioSession routes, checkmark on `selected`, AirPods as output.
const routes = [];
const ios = {
  iosAudioRoute: {
    active: true, current: "speaker", selected: "speaker",
    routes: [
      { id: "receiver", kind: "receiver", name: "" },
      { id: "speaker", kind: "speaker", name: "" },
      { id: "input:bt", kind: "bluetooth", name: "AirPods Pro" },
    ],
  },
  selectIosRoute: (id) => routes.push(id),
  audioOutputDevices: [{ deviceId: "should-not-be-used" }],
};
const [iosOut] = outputMenuGroups(ios, t);
assert.deepEqual(iosOut.rows.map((r) => [r.id, r.name, r.selected]), [["receiver", "iPhone", false], ["speaker", "Hoparlör", true], ["input:bt", "AirPods Pro", false]]);
assert.equal(iosOut.rows[0].detail, "Ahize");
iosOut.onSelect("input:bt");
const [iosIn] = inputMenuGroups(ios, t);
assert.deepEqual(iosIn.rows.map((r) => [r.id, r.name, r.selected]), [["builtin", "iPhone mikrofonu", true], ["input:bt", "AirPods Pro", false]]);
iosIn.onSelect("builtin");
iosIn.onSelect("input:bt");
assert.deepEqual(routes, ["input:bt", "speaker", "input:bt"], "built-in mic keeps the built-in output");
// Before the route snapshot arrives (EMPTY state) the web lists are used.
const [early] = outputMenuGroups({ ...ios, iosAudioRoute: { routes: [] }, audioOutputDevices: [] }, t);
assert.equal(early.rows.length, 1);
console.log("callDeviceMenus selftest ok");
