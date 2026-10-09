/**
 * Deferral rules for Electron auto-update while a voice chat is active.
 * Run: node frontend/electron/updateDeferral.selftest.mjs
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const {
  CALL_GRACE_MS,
  SYSTEM_IDLE_THRESHOLD_MS,
  BACKGROUND_SETTLE_MS,
  createDeferralState,
  applyDeferralEvent,
  decideUpdateInstall,
} = require("./updateDeferral.cjs");

assert.equal(CALL_GRACE_MS, 2 * 60 * 1000);
assert.equal(SYSTEM_IDLE_THRESHOLD_MS, 5 * 60 * 1000);
assert.equal(BACKGROUND_SETTLE_MS, 12 * 1000);

function decide(state, now, extra = {}) {
  return decideUpdateInstall({ ...state, now, ...extra });
}

// ── nothing staged ──────────────────────────────────────────────────────────
{
  const d = decide(createDeferralState(), 0, {
    voiceBusy: true,
    systemIdleMs: SYSTEM_IDLE_THRESHOLD_MS,
    explicitConfirm: true,
  });
  assert.equal(d.reason, "no-update");
}

// ── a live call blocks every automatic trigger, including "critical" ones ──
{
  let s = createDeferralState();
  s = applyDeferralEvent(s, { type: "update-ready", now: 0 });
  s = applyDeferralEvent(s, { type: "voice-busy", busy: true, now: 0 });
  assert.equal(s.callDeferralArmed, true);
  assert.equal(s.graceUntil, null);

  for (const extra of [
    { systemIdleMs: SYSTEM_IDLE_THRESHOLD_MS * 2, sessionLocked: true },
    { appInBackground: true, backgroundSince: 0, prelaunch: true },
    { graceUntil: 0 },
  ]) {
    const d = decide(s, 60_000, extra);
    assert.equal(d.action, "wait", `busy must wait despite ${JSON.stringify(extra)}`);
    assert.equal(d.reason, "voice-busy");
  }
}

// ── explicit confirm is the only mid-call install ──────────────────────────
{
  let s = createDeferralState();
  s = applyDeferralEvent(s, { type: "update-ready", now: 0 });
  s = applyDeferralEvent(s, { type: "voice-busy", busy: true, now: 0 });
  const d = decide(s, 1000, { explicitConfirm: true });
  assert.equal(d.action, "install");
  assert.equal(d.reason, "user-confirmed");
}

// ── leave call → grace; call during grace cancels; leave again restarts ───
{
  let s = createDeferralState();
  s = applyDeferralEvent(s, { type: "update-ready", now: 0 });
  s = applyDeferralEvent(s, { type: "voice-busy", busy: true, now: 0 });
  s = applyDeferralEvent(s, { type: "voice-busy", busy: false, now: 10_000 });
  assert.equal(s.graceUntil, 10_000 + CALL_GRACE_MS);
  assert.equal(s.voiceBusy, false);

  const during = decide(s, 10_000 + 60_000, {
    systemIdleMs: SYSTEM_IDLE_THRESHOLD_MS,
    sessionLocked: true,
    appInBackground: true,
    backgroundSince: 0,
  });
  assert.equal(during.action, "wait");
  assert.equal(during.reason, "call-grace");

  // Call starts during grace — cancel, do not keep the old deadline.
  s = applyDeferralEvent(s, { type: "voice-busy", busy: true, now: 20_000 });
  assert.equal(s.graceUntil, null);
  assert.equal(s.callDeferralArmed, true);
  assert.equal(decide(s, 20_000 + CALL_GRACE_MS).reason, "voice-busy");

  s = applyDeferralEvent(s, { type: "voice-busy", busy: false, now: 30_000 });
  assert.equal(s.graceUntil, 30_000 + CALL_GRACE_MS);

  assert.equal(decide(s, s.graceUntil - 1).action, "wait");
  assert.equal(decide(s, s.graceUntil - 1).reason, "call-grace");

  // Re-check right before install: busy again → do not install.
  const raced = decide(s, s.graceUntil, { voiceBusy: true });
  assert.equal(raced.action, "wait");
  assert.equal(raced.reason, "voice-busy");

  // Grace elapsed and still idle → install even if the window is focused.
  const elapsed = decide(s, s.graceUntil, {
    voiceBusy: false,
    appInBackground: false,
    systemIdleMs: 0,
  });
  assert.equal(elapsed.action, "install");
  assert.equal(elapsed.reason, "call-grace-elapsed");
}

// ── a second "not busy" must not extend the grace ──────────────────────────
{
  let s = createDeferralState();
  s = applyDeferralEvent(s, { type: "update-ready", now: 0 });
  s = applyDeferralEvent(s, { type: "voice-busy", busy: true, now: 0 });
  s = applyDeferralEvent(s, { type: "voice-busy", busy: false, now: 5_000 });
  const until = s.graceUntil;
  s = applyDeferralEvent(s, { type: "voice-busy", busy: false, now: 50_000 });
  assert.equal(s.graceUntil, until);
}

// ── renderer crash/reload resets busy and starts grace only if a call was up
{
  let s = createDeferralState();
  s = applyDeferralEvent(s, { type: "voice-busy", busy: true, now: 0 });
  s = applyDeferralEvent(s, { type: "update-ready", now: 1_000 });
  assert.equal(s.callDeferralArmed, true);
  s = applyDeferralEvent(s, { type: "reset-voice", now: 4_000 });
  assert.equal(s.voiceBusy, false);
  assert.equal(s.graceUntil, 4_000 + CALL_GRACE_MS);
  assert.equal(decide(s, 4_000 + 1_000).reason, "call-grace");

  let idle = createDeferralState();
  idle = applyDeferralEvent(idle, { type: "update-ready", now: 0 });
  idle = applyDeferralEvent(idle, { type: "reset-voice", now: 2_000 });
  assert.equal(idle.graceUntil, null);
  assert.equal(idle.callDeferralArmed, false);
  assert.equal(idle.voiceBusy, false);
}

// ── system idle / lock install only when not in a call and not in grace ────
{
  let s = createDeferralState();
  s = applyDeferralEvent(s, { type: "update-ready", now: 0 });
  s = applyDeferralEvent(s, {
    type: "presence",
    now: 0,
    appInBackground: false,
    systemIdleMs: SYSTEM_IDLE_THRESHOLD_MS - 1,
    sessionLocked: false,
    prelaunch: false,
  });
  assert.equal(decide(s, 1_000).reason, "foreground-active");

  s = applyDeferralEvent(s, {
    type: "presence",
    now: 1_000,
    appInBackground: false,
    systemIdleMs: SYSTEM_IDLE_THRESHOLD_MS,
    sessionLocked: false,
    prelaunch: false,
  });
  assert.equal(decide(s, 1_000).reason, "system-idle");

  s = applyDeferralEvent(s, {
    type: "presence",
    now: 1_000,
    appInBackground: false,
    systemIdleMs: 0,
    sessionLocked: true,
    prelaunch: false,
  });
  assert.equal(decide(s, 1_000).reason, "session-locked");
}

// ── background quiet path only when the update never overlapped a call ─────
{
  let s = createDeferralState();
  s = applyDeferralEvent(s, { type: "update-ready", now: 0 });
  s = applyDeferralEvent(s, {
    type: "presence",
    now: 1_000,
    appInBackground: true,
    systemIdleMs: 0,
    sessionLocked: false,
    prelaunch: false,
  });
  assert.equal(s.backgroundSince, 1_000);
  assert.equal(decide(s, 1_000 + BACKGROUND_SETTLE_MS - 1).reason, "background-settling");
  assert.equal(decide(s, 1_000 + BACKGROUND_SETTLE_MS).reason, "background-quiet");

  // Presence ticks must not move backgroundSince forward.
  s = applyDeferralEvent(s, {
    type: "presence",
    now: 5_000,
    appInBackground: true,
    systemIdleMs: 0,
    sessionLocked: false,
    prelaunch: false,
  });
  assert.equal(s.backgroundSince, 1_000);

  // Coming back to the foreground clears the settle clock.
  s = applyDeferralEvent(s, {
    type: "presence",
    now: 6_000,
    appInBackground: false,
    systemIdleMs: 0,
    sessionLocked: false,
    prelaunch: false,
  });
  assert.equal(s.backgroundSince, null);

  // Overlapping a call disarms the 12s path until grace elapses.
  s = applyDeferralEvent(s, { type: "voice-busy", busy: true, now: 7_000 });
  s = applyDeferralEvent(s, { type: "voice-busy", busy: false, now: 8_000 });
  s = applyDeferralEvent(s, {
    type: "presence",
    now: 8_000,
    appInBackground: true,
    systemIdleMs: 0,
    sessionLocked: false,
    prelaunch: false,
  });
  const midGrace = decide(s, 8_000 + BACKGROUND_SETTLE_MS);
  assert.equal(midGrace.reason, "call-grace");
}

// ── prelaunch installs only when nobody is in a call ───────────────────────
{
  let s = createDeferralState();
  s = applyDeferralEvent(s, { type: "update-ready", now: 0 });
  s = applyDeferralEvent(s, {
    type: "presence",
    now: 0,
    appInBackground: false,
    systemIdleMs: 0,
    sessionLocked: false,
    prelaunch: true,
  });
  assert.equal(decide(s, 0).reason, "prelaunch");

  s = applyDeferralEvent(s, { type: "voice-busy", busy: true, now: 0 });
  assert.equal(decide(s, 0, { prelaunch: true }).reason, "voice-busy");
}

// ── leaving a call before an update exists does not arm a later grace ──────
{
  let s = createDeferralState();
  s = applyDeferralEvent(s, { type: "voice-busy", busy: true, now: 0 });
  s = applyDeferralEvent(s, { type: "voice-busy", busy: false, now: 1_000 });
  assert.equal(s.graceUntil, null);
  assert.equal(s.callDeferralArmed, false);
  s = applyDeferralEvent(s, { type: "update-ready", now: 2_000 });
  assert.equal(s.callDeferralArmed, false);
}

console.log("updateDeferral.selftest.mjs: ok");
