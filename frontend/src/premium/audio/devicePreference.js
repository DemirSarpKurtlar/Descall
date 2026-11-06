/**
 * auto_device_switch / audio_device_profiles: device choice by the user's
 * preference order. Pure functions over MediaDeviceInfo-like objects
 * ({ deviceId, kind, label, groupId }).
 *
 * A preference entry is { deviceId, label }. Ids can change between sessions
 * (and are empty before permission), so an entry also matches by label.
 */

const HEADSET_RE = /airpod|headphone|headset|bluetooth|buds|earbud|hands-?free|kulakl/i;

export function isHeadsetLabel(label) {
  return HEADSET_RE.test(String(label || ""));
}

function cleanLabel(label) {
  // "Headset (Jabra Evolve 65) (0b0e:030c)" and "Default - Headset (Jabra ...)" match each other.
  return String(label || "")
    .replace(/^(default|communications|varsayılan)\s*-\s*/i, "")
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

export function sameDevice(entry, device) {
  if (!entry || !device) return false;
  if (entry.deviceId && device.deviceId && entry.deviceId === device.deviceId) return true;
  const a = cleanLabel(entry.label);
  return Boolean(a) && a === cleanLabel(device.label);
}

/** Real devices of one kind (the "default" / "communications" aliases are skipped). */
export function devicesOfKind(devices, kind) {
  return (devices || []).filter((d) => d && d.kind === kind && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications");
}

/** First present device in preference order, or null. */
export function pickPreferred(devices, order, kind) {
  const list = devicesOfKind(devices, kind);
  for (const entry of order || []) {
    const hit = list.find((d) => sameDevice(entry, d));
    if (hit) return hit;
  }
  return null;
}

/** Devices in `next` that were not in `prev` (by id), of one kind. */
export function addedDevices(prev, next, kind) {
  const before = new Set(devicesOfKind(prev, kind).map((d) => d.deviceId));
  return devicesOfKind(next, kind).filter((d) => !before.has(d.deviceId));
}

/**
 * What to do after a devicechange.
 *   prev / next: device lists before and after
 *   order: preference list for this kind
 *   currentId: device in use now ("" = system default)
 *   headsetFirst: when no preference matches, a newly connected headset wins
 * Returns { deviceId, reason } or null for "keep the current device".
 */
export function planSwitch({ prev = [], next = [], order = [], currentId = "", kind = "audioinput", headsetFirst = true } = {}) {
  const added = addedDevices(prev, next, kind);
  const present = devicesOfKind(next, kind);
  const preferred = pickPreferred(next, order, kind);
  const currentGone = Boolean(currentId) && !present.some((d) => d.deviceId === currentId);

  if (preferred) {
    if (preferred.deviceId === currentId) return null;
    const rankOf = (id) => (order || []).findIndex((e) => present.some((d) => d.deviceId === id && sameDevice(e, d)));
    const curRank = currentId ? rankOf(currentId) : -1;
    const prefRank = rankOf(preferred.deviceId);
    // Switch when the preferred device just arrived, the current one left, or the
    // current one ranks lower (or is not in the list at all).
    const arrived = added.some((d) => d.deviceId === preferred.deviceId);
    if (arrived || currentGone || curRank === -1 || prefRank < curRank) {
      return { deviceId: preferred.deviceId, label: preferred.label || "", reason: arrived ? "preferred-connected" : currentGone ? "current-removed" : "preferred-ranked" };
    }
    return null;
  }
  if (headsetFirst) {
    const headset = added.find((d) => isHeadsetLabel(d.label));
    if (headset && headset.deviceId !== currentId) return { deviceId: headset.deviceId, label: headset.label || "", reason: "headset-connected" };
  }
  if (currentGone) return { deviceId: "", label: "", reason: "current-removed" };
  return null;
}

/** Move entry at `from` to `to` in a preference list (settings drag / arrows). */
export function moveEntry(order, from, to) {
  const list = [...(order || [])];
  if (from < 0 || from >= list.length) return list;
  const [item] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, item);
  return list;
}

/** Add a device to the preference list (no duplicates; capped). */
export function addEntry(order, device, max = 8) {
  const list = (order || []).filter((e) => !sameDevice(e, device));
  list.push({ deviceId: device?.deviceId || "", label: String(device?.label || "").slice(0, 120) });
  return list.slice(-max);
}
