"use strict";

/**
 * "Sessiz saatte mesajlar da sessiz gelsin" (notify_settings.quiet_messages): during the
 * account's quiet hours, DM / group / mention pushes arrive without sound (web: silent,
 * iOS: passive) unless the sender is a person with "Sessiz saati delsin" (break_quiet).
 * Default off, so nothing changes for anyone who did not choose it. Any failure keeps
 * the push as it was (loud).
 */

const R = require("./rules");

async function split(userIds, senderId, { now = Date.now(), store = require("./store") } = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const out = { loud: ids, quiet: [] };
  if (!ids.length) return out;
  try {
    const settings = await store.getSettingsMany(ids);
    const wants = ids.filter((id) => settings.get(id)?.quietMessages);
    if (!wants.length) return out;
    const { data } = await require("../../db/supabase").from("users").select("id, timezone").in("id", wants);
    const tz = new Map((data || []).map((u) => [String(u.id), u.timezone]));
    const inQuiet = wants.filter((id) => R.isQuietFor(settings.get(id), tz.get(id), now));
    if (!inQuiet.length) return out;
    const persons = senderId ? await store.personsFor(inQuiet, String(senderId)) : new Map();
    const quiet = new Set(inQuiet.filter((id) => !persons.get(id)?.breakQuiet));
    return { loud: ids.filter((id) => !quiet.has(id)), quiet: [...quiet] };
  } catch {
    return out;
  }
}

module.exports = { split };
