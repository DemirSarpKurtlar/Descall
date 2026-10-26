/**
 * Copy for group member events (Oct 2026): the centered system rows
 * ("Demir, Can’ı gruptan çıkardı"), the removed banner and list previews.
 * Turkish needs the accusative on the target ("Can’ı") and the locative on
 * the time ("21:58’de"); English passes the plain values. Pure, so the same
 * text is checked in groupMemberEvents.selftest.mjs.
 */
import { trAccusative, trLocativeTime } from "./trSuffix.js";
import { parseMemberEvent } from "./groupMembers.js";

/** Typographic apostrophe, as drawn ("Can’ı", "21:58’de"). */
const curly = (s) => String(s || "").replace(/'/g, "’");

/**
 * Template → [{ text, bold }] so the row can bold the names.
 * `t` is the app translator (key, vars); placeholders survive when no vars.
 */
export function splitTemplate(template, values = {}, boldKeys = []) {
  const out = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  let m;
  const str = String(template || "");
  while ((m = re.exec(str))) {
    if (m.index > last) out.push({ text: str.slice(last, m.index), bold: false });
    out.push({ text: values[m[1]] != null ? String(values[m[1]]) : "", bold: boldKeys.includes(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push({ text: str.slice(last), bold: false });
  return out.filter((p) => p.text);
}

/**
 * Segments for a member_removed / member_left row.
 * @param {{ type: string, actorName?: string, targetName?: string, targetIsMe?: boolean }} ev
 */
export function memberEventSegments(ev, t = (k) => k) {
  if (!ev) return [];
  const actor = ev.actorName || "?";
  if (ev.type === "member_left") return splitTemplate(t("gk.eventLeft"), { actor }, ["actor"]);
  if (ev.targetIsMe) return splitTemplate(t("gk.eventRemovedMe"), { actor }, ["actor"]);
  const target = ev.targetName || "?";
  return splitTemplate(
    t("gk.eventRemoved"),
    { actor, target, targetAcc: curly(trAccusative(target)) },
    ["actor", "target", "targetAcc"],
  );
}

export const segmentsText = (segments) => segments.map((s) => s.text).join("");

/** Event details from a normalized group message (type + JSON text). */
export function memberEventFromMessage(msg, { meId = null, members = [] } = {}) {
  const type = msg?.type || msg?.message_type;
  if (type !== "member_removed" && type !== "member_left") return null;
  const parsed = parseMemberEvent(msg.memberEvent || msg.text || msg.content) || {};
  const nameOf = (id, fallback) => {
    const m = (members || []).find((x) => x?.id === id);
    return m?.displayName || m?.display_name || m?.username || fallback || null;
  };
  return {
    type,
    actorId: parsed.actorId,
    targetId: parsed.targetId,
    actorName: nameOf(parsed.actorId, parsed.actorName || msg.username),
    targetName: nameOf(parsed.targetId, parsed.targetName),
    targetIsMe: Boolean(meId && parsed.targetId === meId),
  };
}

/** The removed banner body: "Demir seni 21:58’de çıkardı. …". */
export function removedBannerBody({ actorName, time }, t = (k) => k) {
  return t("gk.bannerBody", {
    actor: actorName || "?",
    time,
    timeLoc: curly(trLocativeTime(time)),
  });
}

/**
 * List preview: the API sends English sentences for member rows
 * ("demir removed can", "demir removed you", "can left the group").
 */
export function localizeMemberEventPreview(preview, t = (k) => k) {
  const raw = String(preview ?? "");
  let m = raw.match(/^([^\s:]{1,40}) removed you$/);
  if (m) return segmentsText(memberEventSegments({ type: "member_removed", actorName: m[1], targetIsMe: true }, t));
  m = raw.match(/^([^\s:]{1,40}) removed ([^\s:]{1,40})$/);
  if (m) return segmentsText(memberEventSegments({ type: "member_removed", actorName: m[1], targetName: m[2] }, t));
  m = raw.match(/^([^\s:]{1,40}) left the group$/);
  if (m) return segmentsText(memberEventSegments({ type: "member_left", actorName: m[1] }, t));
  return null;
}
