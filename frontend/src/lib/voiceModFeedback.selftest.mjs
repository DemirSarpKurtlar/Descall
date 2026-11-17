import assert from "node:assert/strict";
import { armVoiceModFeedback, VOICE_MOD_ERROR_EVENT } from "./voiceModFeedback.js";

const target = new EventTarget();
const fire = (message) => {
  const e = new Event(VOICE_MOD_ERROR_EVENT);
  e.detail = { message };
  target.dispatchEvent(e);
};
const toasts = [];
const toast = (m, kind) => toasts.push([m, kind]);

// The error that arrives after the menu closed still reaches a toast.
armVoiceModFeedback(toast, { target });
fire("Missing permission.");
assert.deepEqual(toasts, [["Missing permission.", "error"]]);

// One-shot: a later unrelated error does not toast again.
fire("Other");
assert.equal(toasts.length, 1);

// Re-arming replaces the previous listener (no double toast).
armVoiceModFeedback(toast, { target });
armVoiceModFeedback(toast, { target });
fire("Move failed.");
assert.equal(toasts.length, 2);

// Expires after the window.
armVoiceModFeedback(toast, { target, windowMs: 5 });
await new Promise((r) => setTimeout(r, 20));
fire("late");
assert.equal(toasts.length, 2);

console.log("voiceModFeedback selftest ok");
