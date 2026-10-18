"use strict";

/**
 * Group rename rules. Like iMessage group names, any member may rename a
 * group (the creator is always a member); a non-member never can.
 * Names are trimmed, inner whitespace runs collapse to one space, control
 * characters are dropped, and the result must be 1–50 characters.
 */

const GROUP_NAME_MIN = 1;
const GROUP_NAME_MAX = 50;

/** @returns {{ ok: true, name: string } | { ok: false, code: string, error: string }} */
function normalizeGroupName(raw) {
  if (typeof raw !== "string") return { ok: false, code: "NAME_REQUIRED", error: "Name required" };
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (name.length < GROUP_NAME_MIN) return { ok: false, code: "NAME_REQUIRED", error: "Name required" };
  if ([...name].length > GROUP_NAME_MAX) return { ok: false, code: "NAME_TOO_LONG", error: "Name must be 50 characters or fewer" };
  return { ok: true, name };
}

function canRenameGroup({ userId, createdBy, isMember }) {
  if (!userId) return false;
  return Boolean(isMember) || createdBy === userId;
}

module.exports = { normalizeGroupName, canRenameGroup, GROUP_NAME_MIN, GROUP_NAME_MAX };
