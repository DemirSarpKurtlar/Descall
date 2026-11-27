"use strict";

/**
 * Friendships that a friend-invite sign-up created by itself (routes/auth.js
 * applyFriendInvite accepts inviter <-> invitee right away). Other features that reward
 * "an accepted friend" (the Başla panosu "Bir arkadaş ekle" step, lib/onboarding) must not
 * count them: the invite reward itself only unlocks after the first message and the
 * next-day return, and an instant +50 for the automatic friendship would undercut that.
 *
 *   isInviteAutoFriendship(a, b)  true when a invited b or b invited a by friend link
 *   inviteAutoFriendIds(userId)   Set of user ids linked to userId that way
 * Legacy rows (paid by the old instant logic) count too: the friendship was still automatic.
 * Never throws; an unreadable table means "none".
 */

function db() {
  return require("../../db/supabase");
}

async function inviteAutoFriendIds(userId) {
  const out = new Set();
  if (!userId) return out;
  try {
    const uid = String(userId);
    const { data, error } = await db()
      .from("referral_rewards")
      .select("inviter_id, invitee_id")
      .or(`inviter_id.eq.${uid},invitee_id.eq.${uid}`)
      .limit(1000);
    if (error) return out;
    for (const r of data || []) {
      const other = String(r.inviter_id) === uid ? String(r.invitee_id) : String(r.inviter_id);
      if (other && other !== uid) out.add(other);
    }
  } catch {
    /* none */
  }
  return out;
}

async function isInviteAutoFriendship(a, b) {
  if (!a || !b) return false;
  return (await inviteAutoFriendIds(a)).has(String(b));
}

module.exports = { inviteAutoFriendIds, isInviteAutoFriendship };
