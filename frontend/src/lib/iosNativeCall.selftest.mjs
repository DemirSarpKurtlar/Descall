// iOS 2.10.108: a DM call answered on the CallKit screen while Descall is in
// the background / killed connects natively (DescallNativeCall.swift). The web
// app must never answer, decline or end that call, and must not treat its
// offers as new rings.
// Run from frontend/: node src/lib/iosNativeCall.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCallKitController } from "./iosCallKitController.js";
import {
  createNativeCallStore,
  formatCallDuration,
  nativeCallStatusLabel,
  nativeOfferVerdict,
  normalizeNativeCall,
} from "./iosNativeCallState.js";

const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

// ── state store ─────────────────────────────────────────────────────────────
{
  assert.equal(normalizeNativeCall(null).active, false);
  assert.equal(normalizeNativeCall({ active: true, uuid: UUID, phase: "ended" }).active, false);
  const s = normalizeNativeCall({ active: true, uuid: UUID.toUpperCase(), callerId: "u1", callerName: "Ada", phase: "connected", connectedAt: 1000, muted: true });
  assert.equal(s.uuid, UUID);
  assert.equal(s.muted, true);
  assert.equal(nativeCallStatusLabel(s, 1000 + 65_000), "01:05");
  assert.equal(nativeCallStatusLabel({ ...s, phase: "connecting", connectedAt: null }), "Bağlanıyor…");
  assert.equal(nativeCallStatusLabel({ ...s, phase: "reconnecting" }), "Yeniden bağlanıyor…");
  assert.equal(formatCallDuration(3_725_000), "1:02:05");
  assert.equal(nativeOfferVerdict(s, "u1"), "ignore", "the native call's own offers are not rings");
  assert.equal(nativeOfferVerdict(s, "u2"), "decline", "another caller while in a native call = busy");
  assert.equal(nativeOfferVerdict(normalizeNativeCall(null), "u2"), null);

  const store = createNativeCallStore();
  let seen = 0;
  store.subscribe(() => { seen += 1; });
  store.set({ active: false });
  assert.equal(seen, 0, "idle → idle does not notify");
  store.set({ active: true, uuid: UUID, callerId: "u1", phase: "connecting" });
  store.set({ active: false, phase: "ended" });
  assert.equal(seen, 2);
  assert.equal(store.get().active, false);
}

// ── controller ──────────────────────────────────────────────────────────────
function harness(call) {
  const log = [];
  const emitted = [];
  const plugin = {
    reportIncomingCall: (a) => { log.push(["reportIncomingCall", a.uuid]); return Promise.resolve({ status: "reported" }); },
    reportCallEnded: (a) => log.push(["reportCallEnded", a.uuid, a.reason]),
    endCall: (a) => log.push(["endCall", a.uuid]),
    answerCall: (a) => log.push(["answerCall", a.uuid]),
    setMuted() {},
    callJoined() {},
  };
  let seq = 0;
  const ctl = createCallKitController({
    plugin,
    getCall: () => call.current,
    getSocket: () => ({ connected: true, emit: (n, p) => emitted.push([n, p]) }),
    isHidden: () => true,
    newUuid: () => "11111111-1111-4111-8111-111111111111",
    now: () => 0,
    setTimer: () => ++seq,
    clearTimer: () => {},
  });
  return { ctl, log, emitted };
}

{
  // Web app preloaded in the background already showed the ring; the native
  // engine answers it → local cleanup only, no decline / end to CallKit.
  let cleaned = 0, declined = 0;
  const call = { current: { mode: "incoming", peer: { id: "u1", username: "Ada" }, callUuid: UUID, cleanup: () => { cleaned += 1; call.current = { mode: null }; }, declineIncoming: () => { declined += 1; } } };
  const { ctl, log, emitted } = harness(call);
  ctl.sync();
  ctl.handleEvent("nativeCallAnswered", { uuid: UUID, callerId: "u1", native: true });
  assert.equal(cleaned, 1);
  assert.equal(declined, 0);
  ctl.sync(); // mode → null: finish() must not touch CallKit
  assert.deepEqual(log.filter(([n]) => n !== "reportIncomingCall"), []);
  assert.equal(emitted.filter(([n]) => n === "call:decline").length, 0);
  // Server tells this tab the ring was answered "elsewhere" (the native socket).
  ctl.onHandledElsewhere("answered", { fromUserId: "u1", callUuid: UUID });
  ctl.onResumeResult({ calls: [{ callUuid: UUID, state: "active" }] });
  assert.deepEqual(log.filter(([n]) => n === "reportCallEnded"), [], "never ends the native call in CallKit");
}

{
  // Cold start: JS loads after the native answer; a replayed offer must not ring.
  let cleaned = 0, declined = 0;
  const call = { current: { mode: null } };
  const { ctl, log, emitted } = harness(call);
  ctl.handleEvent("incomingPush", { uuid: UUID, callerId: "u1" });
  ctl.handleEvent("nativeCallAnswered", { uuid: UUID, callerId: "u1" });
  ctl.handleEvent("answer", { uuid: UUID, callerId: "u1" }); // stale duplicate is ignored
  assert.equal(ctl._state().pendingAnswer, null);
  call.current = { mode: "incoming", peer: { id: "u1" }, callUuid: UUID, cleanup: () => { cleaned += 1; }, declineIncoming: () => { declined += 1; } };
  ctl.sync();
  assert.equal(cleaned, 1);
  assert.equal(declined, 0);
  assert.equal(log.filter(([n]) => n === "reportIncomingCall").length, 0, "no second CallKit ring");
  // Native hang-up / remote end arrives as "end" with handledNatively.
  ctl.handleEvent("end", { uuid: UUID, callerId: "u1", handledNatively: true });
  assert.equal(emitted.filter(([n]) => n === "call:decline").length, 0, "native already signalled");
}

{
  // Declined on the ring screen while the native socket was up.
  const call = { current: { mode: null } };
  const { ctl, emitted } = harness(call);
  ctl.handleEvent("incomingPush", { uuid: UUID, callerId: "u1" });
  ctl.handleEvent("end", { uuid: UUID, callerId: "u1", handledNatively: true });
  assert.equal(emitted.filter(([n]) => n === "call:decline").length, 0);
  ctl.handleEvent("end", { uuid: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee", callerId: "u2" });
  assert.equal(emitted.filter(([n]) => n === "call:decline").length, 1, "non-native decline still sent by JS");
}

// ── wiring ──────────────────────────────────────────────────────────────────
{
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const useCall = read("../hooks/useCall.js");
  assert.match(useCall, /if \(renegotiate === true\) return;/, "stray renegotiation offers are not rings");
  assert.match(useCall, /nativeOfferVerdict\(getNativeCallSnapshot\(\), fromUser\.id\)/);
  const app = read("../App.jsx");
  assert.match(app, /<NativeCallCard \/>/);
  const card = read("../components/calls/NativeCallCard.jsx");
  for (const label of ["Sessiz", "Hoparlör", "Kapat"]) assert.ok(card.includes(label), label);
  const css = read("../components/calls/NativeCallCard.css");
  assert.match(css, /backdrop-filter: blur/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /prefers-reduced-transparency: reduce/);

  const mgr = read("../../ios/App/App/DescallCallManager.swift");
  assert.match(mgr, /DescallNativeCall\.shared\.prepare\(/, "prepared on the VoIP push");
  assert.match(mgr, /native\.canAnswer\(uuid\)/);
  assert.match(mgr, /emit\("nativeCallAnswered"/);
  assert.match(mgr, /DescallNativeCall\.shared\.audioSessionActivated\(audioSession\)/, "audio starts only in didActivate");
  const plug = read("../../ios/App/App/DescallCallKitPlugin.swift");
  assert.equal((plug.match(/DescallNativeCall\.shared\.owns\(uuid\)/g) || []).length >= 4, true, "JS can't end/answer/mute a native call");
  const eng = read("../../ios/App/App/DescallNativeCall.swift");
  assert.match(eng, /useManualAudio = true/);
  assert.match(eng, /bundlePolicy = \.maxBundle/);
  assert.match(eng, /rtcpMuxPolicy = \.require/);
  assert.match(eng, /tuneOpusSdp/);
  assert.match(eng, /firstAudio/);
  assert.doesNotMatch(eng, /setActive\(true/, "never activates the session itself (CallKit does)");
  const pbx = read("../../ios/App/App.xcodeproj/project.pbxproj");
  for (const f of ["DescallNativeCall.swift", "DescallNativeCallLogic.swift", "DescallSignalSocket.swift"]) {
    assert.ok(pbx.includes(`${f} in Sources`), `${f} compiled into the app target`);
  }
  assert.match(pbx, /https:\/\/github\.com\/stasel\/WebRTC/);
  const plist = read("../../ios/App/App/Info.plist");
  for (const mode of ["voip", "audio"]) assert.ok(plist.includes(`<string>${mode}</string>`), `UIBackgroundModes ${mode}`);
}

console.log("iosNativeCall.selftest ok");
