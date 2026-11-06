// Descall+ audio engines: noise gate math, device preference order, presets and
// device profiles. Run from frontend/: node src/premium/audio/premiumAudio.selftest.mjs
import assert from "node:assert/strict";
import * as G from "./noiseGateMath.js";
import * as D from "./devicePreference.js";
import * as P from "./audioProfiles.js";

// ── noise gate math ──
assert.equal(G.linearToDb(1), 0);
assert.equal(Math.round(G.linearToDb(0.5)), -6);
assert.equal(G.linearToDb(0), G.DB_FLOOR);
assert.ok(Math.abs(G.dbToLinear(-20) - 0.1) < 1e-9);
assert.equal(G.dbToLinear(-200), 0);
for (const db of [-60, -40, -12, -3]) assert.ok(Math.abs(G.linearToDb(G.dbToLinear(db)) - db) < 1e-9, `round trip ${db}`);
assert.equal(G.rms([]), 0);
assert.ok(Math.abs(G.rms([0.5, -0.5, 0.5, -0.5]) - 0.5) < 1e-12);
assert.equal(G.meterPercent(-80), 0);
assert.equal(G.meterPercent(0), 100);
assert.equal(G.meterPercent(-40), 50);
assert.equal(G.meterPercent(-120), 0);
assert.equal(G.percentToDb(50), -40);
assert.deepEqual(G.gateParams({ thresholdDb: -50 }), { openThreshold: -50, closeThreshold: -60, holdMs: 120 });
assert.deepEqual(G.gateParams({ thresholdDb: -200, hysteresisDb: 99, holdMs: -5 }), { openThreshold: -80, closeThreshold: -110, holdMs: 0 }, "clamped");
assert.equal(G.gateParams({ thresholdDb: 5 }).openThreshold, -10);
// Hysteresis + hold.
const gp = G.gateParams({ thresholdDb: -50, hysteresisDb: 10, holdMs: 100 });
let st = G.stepGate(null, -70, 0, gp);
assert.equal(st.open, false);
st = G.stepGate(st, -45, 10, gp);
assert.equal(st.open, true, "opens at threshold");
st = G.stepGate(st, -55, 20, gp);
assert.equal(st.open, true, "stays open above the close threshold");
st = G.stepGate(st, -65, 30, gp);
assert.equal(st.open, true, "hold keeps it open");
st = G.stepGate(st, -65, 200, gp);
assert.equal(st.open, false, "closes after hold");
st = G.stepGate(st, -55, 210, gp);
assert.equal(st.open, false, "re-opening needs the open threshold");
assert.ok(G.smoothLevel(-60, -20) > G.smoothLevel(-20, -60) - 40, "fast attack, slow release");
assert.equal(G.smoothLevel(-60, -20, { attack: 1 }), -20);
assert.equal(G.gainFromPercent(150), 1.5);
assert.equal(G.gainFromPercent(999), 2);

// ── device preference order ──
const mic = (id, label) => ({ kind: "audioinput", deviceId: id, label });
const out = (id, label) => ({ kind: "audiooutput", deviceId: id, label });
const laptop = mic("lap", "Microphone Array (Realtek(R) Audio)");
const jabra = mic("jab", "Headset (Jabra Evolve 65) (0b0e:030c)");
const yeti = mic("yeti", "Yeti Stereo Microphone");
const order = [{ deviceId: "old-yeti-id", label: "Yeti Stereo Microphone" }, { deviceId: "jab", label: "Headset (Jabra Evolve 65)" }];
assert.equal(D.isHeadsetLabel(jabra.label), true);
assert.equal(D.sameDevice({ deviceId: "x", label: "Default - Headset (Jabra Evolve 65)" }, jabra), true, "label match ignores default prefix and usb id");
assert.equal(D.pickPreferred([laptop, jabra, yeti], order, "audioinput").deviceId, "yeti", "first in order wins by label even with a new id");
assert.equal(D.pickPreferred([laptop], order, "audioinput"), null);
assert.equal(D.pickPreferred([mic("default", "Default"), laptop, jabra], order, "audioinput").deviceId, "jab");
// Plug in the Jabra while on the laptop mic: switch.
assert.deepEqual(D.planSwitch({ prev: [laptop], next: [laptop, jabra], order, currentId: "lap" }), { deviceId: "jab", label: jabra.label, reason: "preferred-connected" });
// Yeti arrives while on the Jabra: Yeti ranks higher.
assert.equal(D.planSwitch({ prev: [laptop, jabra], next: [laptop, jabra, yeti], order, currentId: "jab" }).deviceId, "yeti");
// Jabra arrives while on the Yeti: keep the Yeti.
assert.equal(D.planSwitch({ prev: [laptop, yeti], next: [laptop, yeti, jabra], order, currentId: "yeti" }), null);
// Unplug the current preferred device: next preferred present.
assert.deepEqual(D.planSwitch({ prev: [laptop, yeti, jabra], next: [laptop, jabra], order, currentId: "yeti" }).reason, "current-removed");
// No preference: a new headset wins, unless switched off.
const noPref = { prev: [laptop], next: [laptop, jabra], order: [], currentId: "" };
assert.equal(D.planSwitch(noPref).reason, "headset-connected");
assert.equal(D.planSwitch({ ...noPref, headsetFirst: false }), null);
// No preference and the current device vanished: back to the system default.
assert.deepEqual(D.planSwitch({ prev: [laptop, yeti], next: [laptop], order: [], currentId: "yeti" }), { deviceId: "", label: "", reason: "current-removed" });
// Outputs are separate from inputs.
assert.equal(D.planSwitch({ prev: [laptop], next: [laptop, out("spk", "Headphones (Sony WH-1000XM5)")], order: [], kind: "audioinput" }), null);
assert.equal(D.planSwitch({ prev: [], next: [out("spk", "Headphones (Sony WH-1000XM5)")], order: [], kind: "audiooutput" }).deviceId, "spk");
// List editing.
assert.deepEqual(D.moveEntry(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
assert.deepEqual(D.moveEntry(["a", "b"], 5, 0), ["a", "b"]);
const added = D.addEntry(order, yeti);
assert.equal(added.length, 2, "no duplicate by label");
assert.equal(added[1].deviceId, "yeti", "re-added goes last with the fresh id");

// ── presets ──
const voice = P.BUILTIN_PRESETS[0];
assert.deepEqual(P.presetToPatch(voice), { voicePatch: { noiseMode: "on", echoCancellation: true, autoGainControl: true }, gain: 100 });
assert.equal(P.normalizePreset({ gain: 900, noiseMode: "x" }).gain, 200);
assert.equal(P.normalizePreset({ noiseMode: "x" }).noiseMode, "on");
let r = P.upsertPreset([], { name: "  Night  ", gain: 80, noiseMode: "strong", echoCancellation: true, autoGainControl: false });
assert.ok(r.ok);
assert.equal(r.preset.name, "Night");
assert.ok(r.preset.id.startsWith("preset:"));
const list1 = r.list;
assert.equal(P.upsertPreset(list1, { name: "night" }).error, "duplicate");
assert.equal(P.upsertPreset(list1, { name: "" }).error, "name");
r = P.upsertPreset(list1, { ...list1[0], gain: 90 });
assert.equal(r.list.length, 1);
assert.equal(r.list[0].gain, 90, "same id replaces");
assert.equal(P.matchPreset(r.list, { gain: 90, noiseMode: "strong", echoCancellation: true, autoGainControl: false }), r.list[0].id);
assert.equal(P.matchPreset(r.list, { gain: 91, noiseMode: "strong" }), null);
let many = [];
for (let i = 0; i < P.MAX_PRESETS; i += 1) many = P.upsertPreset(many, { name: `p${i}` }).list;
assert.equal(P.upsertPreset(many, { name: "one more" }).error, "limit");
assert.equal(P.removeById(many, many[0].id).length, P.MAX_PRESETS - 1);
assert.deepEqual(P.presetFromCurrent({ voiceProfile: { noiseMode: "off", echoCancellation: false, autoGainControl: true }, gain: 120 }, "x").noiseMode, "off");

// ── device profiles ──
let pr = P.upsertProfile([], { name: "Gaming", input: { deviceId: "jab", label: jabra.label }, output: { deviceId: "spk", label: "Headphones (Sony WH-1000XM5)" }, presetId: "builtin:noisy" });
assert.ok(pr.ok);
const devices = [laptop, mic("jab-new-id", "Headset (Jabra Evolve 65)"), out("spk2", "Headphones (Sony WH-1000XM5)")];
const res = P.resolveProfile(pr.profile, devices, []);
assert.equal(res.inputId, "jab-new-id", "resolved by label after the id changed");
assert.equal(res.outputId, "spk2");
assert.equal(res.preset.id, "builtin:noisy");
assert.deepEqual(res.missing, []);
const gone = P.resolveProfile({ ...pr.profile, presetId: "preset:deleted" }, [laptop], []);
assert.equal(gone.inputId, null);
assert.deepEqual(gone.missing.sort(), ["input", "output", "preset"]);
assert.equal(P.upsertProfile(pr.list, { name: "gaming" }).error, "duplicate");
assert.equal(P.normalizeProfile({ name: "x", input: { deviceId: "", label: "" } }).input, null);

console.log("premiumAudio.selftest ok");
