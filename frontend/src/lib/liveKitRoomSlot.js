/**
 * One LiveKit room per voice session (server voice, feedback 2026-11-22 "2 sesli sohbet
 * birden katılıyo").
 *
 * room.connect() takes a while (SDK load, URL probe, signalling). A room whose join was
 * left or replaced during that time used to finish connecting anyway, become the
 * "current" room and publish the microphone; the next join then replaced the ref
 * without disconnecting it. The user stayed in the old channel's LiveKit room (heard
 * it, was heard there) while seated in the new one.
 *
 * Rooms that are still connecting are tracked in `pending`. Leaving (or any
 * disconnect of the session) abandons them; a room that finishes connecting is only
 * adopted while it is still pending and still wanted, otherwise it is disconnected at
 * once. Adopting a room also disconnects a different room that was current, so the
 * session never holds two. Pure (no SDK import): liveKitRoomSlot.selftest.mjs.
 */

function safeDisconnect(room) {
  if (!room || typeof room.disconnect !== "function") return;
  try {
    const p = room.disconnect();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* already gone */
  }
}

/** A room starts connecting. */
export function trackPendingRoom(pending, room) {
  if (pending && room) pending.add(room);
  return room;
}

/** The room is current or still connecting (its events still matter). */
export function isLiveRoom(slot, pending, room) {
  if (!room) return false;
  return (slot && slot.current === room) || Boolean(pending && pending.has(room));
}

/**
 * Leave: disconnect every room that is still connecting. Returns how many were
 * abandoned. The current room is left to the caller (it also resets its own state).
 */
export function abandonPendingRooms(pending) {
  if (!pending || !pending.size) return 0;
  const rooms = [...pending];
  pending.clear();
  for (const room of rooms) safeDisconnect(room);
  return rooms.length;
}

/** room.connect() failed: forget it and make sure it is closed. */
export function dropPendingRoom(pending, room) {
  if (pending) pending.delete(room);
  safeDisconnect(room);
}

/**
 * room.connect() resolved. Adopt it as `slot.current` when it is still pending (not
 * abandoned by a leave) and `wanted` (the session still wants this channel). Otherwise
 * disconnect it. Returns true when adopted.
 */
export function adoptConnectedRoom({ slot, pending, room, wanted = true }) {
  const stillPending = Boolean(pending && pending.delete(room));
  if (!room || !slot || !stillPending || !wanted) {
    safeDisconnect(room);
    return false;
  }
  const previous = slot.current;
  slot.current = room;
  if (previous && previous !== room) safeDisconnect(previous);
  return true;
}

/** Error thrown when a connect finished for a join that is no longer wanted. */
export function supersededRoomError() {
  const err = new Error("LiveKit room no longer wanted");
  err.code = "LIVEKIT_SUPERSEDED";
  return err;
}
