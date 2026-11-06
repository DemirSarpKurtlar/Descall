// Call rings keep full volume when the window is in the background.
// Before: the background multiplier (0.5) applied to every sound, so on
// desktop the incoming ringtone rang at half volume exactly when the app was
// minimised / behind another window, and the ringback halved as soon as the
// caller switched apps. Sound-pack rings were not touched at all (mismatch).
// Run from frontend/: node src/lib/ringVolume.selftest.mjs
import assert from "node:assert/strict";

class FakeAudio {
  constructor() {
    this.volume = 1;
    this.paused = true;
    this.loop = false;
    this.currentTime = 0;
  }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  cloneNode() { return new FakeAudio(); }
  addEventListener(type, fn) { if (type === "canplaythrough") queueMicrotask(fn); }
  remove() {}
}
globalThis.Audio = FakeAudio;

const { default: audioManager, RING_TYPES } = await import("./audioManager.js");
await audioManager.init({});
audioManager.settings.volume = 0.8;
audioManager.settings.backgroundVolume = 0.5;

assert.ok(RING_TYPES.has("incomingCall") && RING_TYPES.has("outgoingCall"));
assert.ok(!RING_TYPES.has("message"));

// 1. Window in front: everything at the master volume.
audioManager.handleWindowFocus();
assert.equal(audioManager.sounds.incomingCall.volume, 0.8);
assert.equal(audioManager.sounds.message.volume, 0.8);

// 2. Window behind / minimised: rings stay, chat pings are softened.
audioManager.handleWindowBlur();
assert.equal(audioManager.sounds.incomingCall.volume, 0.8, "incoming ringtone not halved in the background");
assert.equal(audioManager.sounds.outgoingCall.volume, 0.8, "ringback not halved when the caller switches apps");
assert.equal(audioManager.sounds.message.volume, 0.4, "message ping still softened");
assert.equal(audioManager.effectiveVolume(undefined, "incomingCall"), 0.8);
assert.equal(audioManager.effectiveVolume(undefined, "notification"), 0.4);
assert.equal(audioManager.effectiveVolume(0.3, "incomingCall"), 0.3, "explicit volume wins");

// 3. A ring started while in the background starts at full volume.
audioManager.play("incomingCall", { loop: true });
assert.equal(audioManager.sounds.incomingCall.volume, 0.8);
assert.equal(audioManager.sounds.incomingCall.paused, false);
audioManager.stop("incomingCall");

// 4. Sound-pack loops follow the same rule when the window state changes.
{
  const element = new FakeAudio();
  element.volume = 0.123;
  const stop = () => {};
  stop.element = element;
  audioManager.synthLoops.set("outgoingCall", stop);
  audioManager.handleWindowFocus();
  assert.equal(element.volume, 0.8);
  audioManager.handleWindowBlur();
  assert.equal(element.volume, 0.8);
  audioManager.synthLoops.delete("outgoingCall");
}

audioManager.destroy();
console.log("ringVolume selftest ok");
process.exit(0); // preload's 5 s load guards are still pending
