/**
 * Whether this client is inside a voice session that an Electron update
 * must not restart through. Incoming ringing counts. Web and iOS call the
 * same helper; only the Electron hook forwards the result over IPC.
 */

const DM_BUSY_MODES = new Set(["incoming", "outgoing", "active"]);

export function deriveVoiceBusy({ call, groupCall, serverVoice } = {}) {
  const dmBusy = DM_BUSY_MODES.has(call?.mode);
  const groupBusy = Boolean(groupCall?.isInCall) || Boolean(groupCall?.incomingCall);
  const serverBusy = Boolean(serverVoice?.isInVoice) || Boolean(serverVoice?.connecting);
  return dmBusy || groupBusy || serverBusy;
}

let currentBusy = false;
const listeners = new Set();

export function getVoiceBusy() {
  return currentBusy;
}

/** Local mirror so Electron UI can confirm a restart without asking main twice. */
export function publishVoiceBusy(busy) {
  const next = Boolean(busy);
  if (next === currentBusy) return false;
  currentBusy = next;
  for (const fn of listeners) {
    try {
      fn(next);
    } catch {
      /* a subscriber must not break the others */
    }
  }
  return true;
}

export function subscribeVoiceBusy(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test-only. Production never needs to forget the last sample. */
export function resetVoiceBusyForTests() {
  currentBusy = false;
  listeners.clear();
}
