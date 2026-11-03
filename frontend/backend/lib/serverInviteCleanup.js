/**
 * Scheduled cleanup for server invites (3.7.32).
 *
 * Expired / used-up invites are no longer deleted inside GET previews or joins
 * ("soft expire"): the row stays so a late visitor gets a clear "expired" state
 * instead of "invalid", and reads never write. This job removes rows that have
 * been dead for longer than GRACE_MS.
 */
const HOUR_MS = 60 * 60 * 1000;
const GRACE_MS = 24 * HOUR_MS;
const BATCH = 500;

function isUsedUp(row) {
  return row && row.max_uses != null && (Number(row.uses) || 0) >= row.max_uses;
}

async function pruneExpiredInvites(supabase, now = new Date()) {
  let removed = 0;
  const cutoff = new Date(now.getTime() - GRACE_MS).toISOString();
  try {
    const { data: expired } = await supabase
      .from("server_invites")
      .select("code")
      .lt("expires_at", cutoff)
      .limit(BATCH);
    const codes = (expired || []).map((r) => r.code).filter(Boolean);
    // Used-up invites: no expiry signal of their own, so only those created before the cutoff.
    const { data: capped } = await supabase
      .from("server_invites")
      .select("code, uses, max_uses, created_at")
      .not("max_uses", "is", null)
      .lt("created_at", cutoff)
      .limit(BATCH);
    for (const row of capped || []) if (isUsedUp(row)) codes.push(row.code);
    if (codes.length) {
      await supabase.from("server_invites").delete().in("code", [...new Set(codes)]);
      removed = new Set(codes).size;
    }
  } catch (err) {
    console.warn("[SERVERS] invite cleanup failed:", err?.message || err);
  }
  return removed;
}

let timer = null;
function startInviteCleanup(supabase) {
  if (timer || process.env.NODE_ENV === "test") return;
  setTimeout(() => pruneExpiredInvites(supabase), 90_000).unref?.();
  timer = setInterval(() => pruneExpiredInvites(supabase), 6 * HOUR_MS);
  timer.unref?.();
}

module.exports = { pruneExpiredInvites, startInviteCleanup, GRACE_MS, isUsedUp };
