'use strict';

/**
 * Pure decision logic for when a downloaded Electron update may restart the app.
 *
 * Downloading is always allowed. Installing is not, while any voice session is
 * busy (DM call including incoming ring, group call including incoming ring,
 * server voice channel including the join/connecting window).
 *
 * An automatic install is allowed only when one of these is true AND a fresh
 * read still says the user is not in a call:
 *   - the user left every call and stayed out for CALL_GRACE_MS (2 min)
 *   - the OS reports the session locked, or input idle for SYSTEM_IDLE_THRESHOLD_MS
 *     (5 min), and no post-call grace is still running
 *   - the update never overlapped a call, and the window has been in the
 *     background for BACKGROUND_SETTLE_MS (12s) — the previous quiet path
 *   - splash/prelaunch (no renderer, so no live call can exist)
 * Normal app quit is electron-updater autoInstallOnAppQuit and is not decided here.
 * An explicit "restart now" after the user confirms is the only mid-call install.
 */

const CALL_GRACE_MS = 2 * 60 * 1000;
const SYSTEM_IDLE_THRESHOLD_MS = 5 * 60 * 1000;
const BACKGROUND_SETTLE_MS = 12 * 1000;

function createDeferralState() {
  return {
    updateReady: false,
    voiceBusy: false,
    /** Epoch ms. Non-null while the post-call grace window is running. */
    graceUntil: null,
    /** True once a pending update overlapped a voice session. Blocks the 12s background path. */
    callDeferralArmed: false,
    appInBackground: false,
    backgroundSince: null,
    systemIdleMs: 0,
    sessionLocked: false,
    prelaunch: false,
  };
}

function applyDeferralEvent(state, event, opts = {}) {
  const graceMs = opts.graceMs ?? CALL_GRACE_MS;
  const next = { ...state };
  const now = Number(event.now) || 0;

  switch (event.type) {
    case 'update-ready':
      next.updateReady = true;
      if (next.voiceBusy) {
        next.callDeferralArmed = true;
        next.graceUntil = null;
      }
      break;

    case 'voice-busy':
      if (event.busy) {
        // A call starting during grace cancels the grace. The next leave starts a new one.
        next.voiceBusy = true;
        next.graceUntil = null;
        if (next.updateReady) next.callDeferralArmed = true;
      } else if (next.voiceBusy) {
        next.voiceBusy = false;
        if (next.updateReady && next.callDeferralArmed) {
          next.graceUntil = now + graceMs;
        } else {
          next.graceUntil = null;
        }
      }
      break;

    case 'reset-voice':
      // Renderer crash / reload / window closed. Same transition as "call ended"
      // when a call was active, so a pending update waits out the grace period
      // instead of restarting in the same breath. A reset while already idle
      // must not start or extend a grace window.
      return applyDeferralEvent(state, { type: 'voice-busy', busy: false, now }, opts);

    case 'presence':
      next.appInBackground = Boolean(event.appInBackground);
      next.systemIdleMs = Math.max(0, Number(event.systemIdleMs) || 0);
      next.sessionLocked = Boolean(event.sessionLocked);
      next.prelaunch = Boolean(event.prelaunch);
      if (next.appInBackground) {
        if (next.backgroundSince == null) next.backgroundSince = now;
      } else {
        next.backgroundSince = null;
      }
      break;

    default:
      break;
  }

  return next;
}

/**
 * @param {object} state deferral fields plus `now` (epoch ms) and optional `explicitConfirm`
 * @returns {{ action: 'install' | 'wait', reason: string }}
 */
function decideUpdateInstall(state, opts = {}) {
  const idleMs = opts.systemIdleThresholdMs ?? SYSTEM_IDLE_THRESHOLD_MS;
  const settleMs = opts.backgroundSettleMs ?? BACKGROUND_SETTLE_MS;
  const now = Number(state.now);

  if (!state.updateReady) return { action: 'wait', reason: 'no-update' };
  if (!Number.isFinite(now)) return { action: 'wait', reason: 'no-clock' };

  // The only automatic-or-UI path that may cut a live call. The user already
  // confirmed in the renderer. App quit is handled by autoInstallOnAppQuit.
  if (state.explicitConfirm) return { action: 'install', reason: 'user-confirmed' };

  if (state.voiceBusy) return { action: 'wait', reason: 'voice-busy' };

  const graceUntil = state.graceUntil;
  if (graceUntil != null && now < graceUntil) {
    return { action: 'wait', reason: 'call-grace' };
  }

  if (graceUntil != null && now >= graceUntil) {
    return { action: 'install', reason: 'call-grace-elapsed' };
  }

  // Splash gate runs before any renderer exists. A stuck busy flag must still
  // block this — prelaunch never sets one, and blocking a real call matters more
  // than the splash. Main only uses this when the busy signals are clear.
  if (state.prelaunch) return { action: 'install', reason: 'prelaunch' };

  if (state.sessionLocked) return { action: 'install', reason: 'session-locked' };

  if (state.systemIdleMs >= idleMs) return { action: 'install', reason: 'system-idle' };

  // Quiet background install only when this update never overlapped a call.
  // Otherwise we are waiting for the post-call grace (or for the user to leave).
  if (!state.callDeferralArmed && state.appInBackground) {
    const since = state.backgroundSince;
    if (since == null || now - since < settleMs) {
      return { action: 'wait', reason: 'background-settling' };
    }
    return { action: 'install', reason: 'background-quiet' };
  }

  if (state.callDeferralArmed) return { action: 'wait', reason: 'awaiting-idle' };
  return { action: 'wait', reason: 'foreground-active' };
}

module.exports = {
  CALL_GRACE_MS,
  SYSTEM_IDLE_THRESHOLD_MS,
  BACKGROUND_SETTLE_MS,
  createDeferralState,
  applyDeferralEvent,
  decideUpdateInstall,
};
