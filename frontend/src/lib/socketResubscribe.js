/**
 * One room rejoin per reconnect burst.
 *
 * Socket.IO fires the Manager "reconnect" event and then the Socket "connect"
 * event. Several hooks also listen for "connect". Identical room joins in that
 * burst are sent once. A later join with the same payload (after the burst, or
 * after a disconnect clears the group key) is sent again.
 */

const BURST_MS = 50;
let burstAt = 0;
let burstSeen = new Set();

function payloadKey(payload) {
  if (Array.isArray(payload)) return JSON.stringify(payload);
  if (payload && typeof payload === "object") {
    const keys = Object.keys(payload).sort();
    return JSON.stringify(keys.map((key) => [key, payload[key]]));
  }
  return JSON.stringify(payload ?? null);
}

/** Test hook. */
export function resetRoomEmitBurst() {
  burstAt = 0;
  burstSeen = new Set();
}

/**
 * Emit unless this event+payload was already emitted in the current burst.
 * Returns true when the packet was sent.
 */
export function emitRoomOnce(socket, event, payload, now = Date.now()) {
  if (!socket || typeof socket.emit !== "function") return false;
  if (!burstAt || now - burstAt > BURST_MS) {
    burstAt = now;
    burstSeen = new Set();
  }
  const key = `${event}\0${payloadKey(payload)}`;
  if (burstSeen.has(key)) return false;
  burstSeen.add(key);
  socket.emit(event, payload);
  return true;
}

/**
 * Full group-id list. Skip when this socket generation already rejoined it.
 * An empty list does not emit and does not change the stored key.
 */
export function nextGroupRejoin(ids, lastKey = "") {
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
  const key = JSON.stringify(list);
  if (!list.length) return { emit: false, key: "" };
  if (key === lastKey) return { emit: false, key };
  return { emit: true, key };
}
