/**
 * Which desktop notifications to close when an incoming call stops ringing.
 *
 * Incoming calls are shown with requireInteraction (web / service worker) or
 * duration 0 (Electron), so they never time out. Closing them means keeping
 * the tag (and, on the page, the Notification handle) and closing that tag
 * on every outcome: accept, decline, cancel, end, miss, answered elsewhere.
 *
 * Message, mention, friend, and missed-call notifications are never selected.
 */

export const DM_INCOMING_TAG = "descall-incoming-call";

/** Tag used when a group ring had no name (older clients). */
export const GROUP_INCOMING_FALLBACK_TAG = "group-call-Grup";

export function dmIncomingTags(fromId) {
  const tags = [DM_INCOMING_TAG, "incoming-call"];
  if (fromId) tags.push(`call-${fromId}`);
  return tags;
}

export function groupIncomingTags(groupId, groupName) {
  const tags = ["group-call", GROUP_INCOMING_FALLBACK_TAG];
  if (groupId) tags.push(`group-call-${groupId}`);
  if (groupName) tags.push(`group-call-${groupName}`);
  return [...new Set(tags)];
}

export function tagsForIncomingDismiss({ kind = "dm", fromId = null, groupId = null, groupName = null } = {}) {
  if (kind === "group") return groupIncomingTags(groupId, groupName);
  return dmIncomingTags(fromId);
}

/**
 * @param {{ tag?: string, data?: { type?: string, fromId?: string, groupId?: string } }} notification
 * @param {{ kind?: string, fromId?: string|null, groupId?: string|null, groupName?: string|null, tags?: string[] }} query
 */
export function shouldCloseCallNotification(notification, query = {}) {
  const kind = query.kind === "group" ? "group" : "dm";
  const tag = String(notification?.tag || "");
  const data = notification?.data || {};
  const tags = new Set(query.tags || tagsForIncomingDismiss({ ...query, kind }));
  if (tag && tags.has(tag)) return true;

  if (kind === "group") {
    if (data.type !== "group-call") return false;
    if (!query.groupId || !data.groupId || data.groupId === query.groupId) return true;
    return false;
  }

  if (data.type !== "call") return false;
  if (!query.fromId || !data.fromId || data.fromId === query.fromId) return true;
  return false;
}

/**
 * Tags to send to Electron / the service worker, plus which already-shown
 * page notifications match this outcome.
 */
export function planIncomingDismiss(query = {}, shownEntries = []) {
  const kind = query.kind === "group" ? "group" : "dm";
  const full = {
    kind,
    fromId: query.fromId || null,
    groupId: query.groupId || null,
    groupName: query.groupName || null,
  };
  full.tags = tagsForIncomingDismiss(full);
  const shownTags = [];
  for (const entry of shownEntries || []) {
    if (shouldCloseCallNotification(entry, full)) shownTags.push(entry.tag);
  }
  return { query: full, closeTags: full.tags, shownTags };
}

export function createIncomingCloseGate() {
  return {
    showSeq: 0,
    liveByKind: { dm: [], group: [] },
  };
}

/** @returns {{ seq: number, kind: string, identity: string|null, cancelled: boolean }} */
export function beginIncomingShow(gate, kind, identity = null) {
  const key = kind === "group" ? "group" : "dm";
  gate.showSeq += 1;
  const ticket = {
    seq: gate.showSeq,
    kind: key,
    identity: identity || null,
    cancelled: false,
  };
  const live = gate.liveByKind[key] || (gate.liveByKind[key] = []);
  live.push(ticket);
  if (live.length > 8) live.splice(0, live.length - 8);
  return ticket;
}

/**
 * Cancel in-flight shows for this ring.
 * A newer ring with a different id is left alone so replacing one group
 * call does not swallow the next show. Every in-flight show for the same
 * id is cancelled, including one that a later duplicate already superseded.
 */
export function markIncomingDismissed(gate, kind, identity = null) {
  const key = kind === "group" ? "group" : "dm";
  const live = gate.liveByKind[key] || [];
  for (const ticket of live) {
    if (ticket.cancelled) continue;
    if (identity && ticket.identity && ticket.identity !== identity) continue;
    ticket.cancelled = true;
  }
  gate.liveByKind[key] = live.filter((ticket) => !ticket.cancelled);
}

export function incomingShowStillCurrent(_gate, ticket) {
  return Boolean(ticket) && ticket.cancelled !== true;
}
