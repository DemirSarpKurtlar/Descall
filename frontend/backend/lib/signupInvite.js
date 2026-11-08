"use strict";

/**
 * The invite a sign-up started from (Nov 2026, invite growth).
 *
 * A logged-out visitor on an invite landing (/servers/join/:code, /s/:slug, /invite/:code)
 * presses "Join with a free account"; the client keeps the code in its pending slot
 * (src/lib/serverInviteRoute.js, localStorage + sessionStorage, so it survives Google /
 * Apple redirects) and sends it as `signupInvite: { kind, code }` with register / Google /
 * Apple sign-up. Here it becomes:
 *   - the signup source (invite_kind server_invite / group_invite), even when the visitor
 *     first landed on another page;
 *   - users.referred_by = the invite's creator (only when still empty: a friend invite that
 *     already linked the account wins). Attribution only: no friendship, no DesCoin; those
 *     stay with the personal invite link (applyFriendInvite in routes/auth.js);
 *   - users.signup_invite_kind / signup_invite_code, which invite converted
 *     (supabase/migrations/20261111_invite_preview.sql; skipped until it is applied).
 * Joining the server is done by the client right after sign-up (the landing's autoJoin).
 */

const CODE_RE = {
  server: /^[A-Za-z0-9_-]{4,32}$/,
  vanity: /^[a-z0-9][a-z0-9-]{2,31}$/,
  group: /^[A-Za-z0-9_-]{2,64}$/,
};

function cleanSignupInvite(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = String(raw.kind || "");
  const re = CODE_RE[kind];
  if (!re) return null;
  let code = String(raw.code ?? "").trim();
  if (kind === "vanity") code = code.toLowerCase();
  return re.test(code) ? { kind, code } : null;
}

/** invite_kind value for signupSourceTaxonomy ("" when there is no invite). */
function signupInviteKind(raw) {
  const inv = cleanSignupInvite(raw);
  if (!inv) return "";
  return inv.kind === "group" ? "group_invite" : "server_invite";
}

function isMissingColumn(err) {
  const msg = String(err?.message || err || "");
  return String(err?.code || "") === "42703" || /column .* does not exist/i.test(msg) || /schema cache/i.test(msg);
}

/** Who made the invite (null for vanity links: a public server address, nobody in particular). */
async function inviteCreatorId(supabase, inv) {
  const table = inv.kind === "server" ? "server_invites" : inv.kind === "group" ? "group_invite_links" : null;
  if (!table) return null;
  const { data, error } = await supabase.from(table).select("creator_id").eq("code", inv.code).maybeSingle();
  if (error || !data) return null;
  return data.creator_id || null;
}

/**
 * Record the invite on a brand-new account. Never throws, never blocks sign-up.
 * @returns {Promise<{ applied: boolean, kind?: string, referredBy?: string|null }>}
 */
async function applySignupInvite(supabase, userId, raw) {
  const inv = cleanSignupInvite(raw);
  if (!userId || !inv) return { applied: false };
  let referredBy = null;
  try {
    const creatorId = await inviteCreatorId(supabase, inv);
    if (creatorId && String(creatorId) !== String(userId)) {
      const { error } = await supabase.from("users").update({ referred_by: creatorId }).eq("id", userId).is("referred_by", null);
      if (!error) referredBy = creatorId;
    }
  } catch (err) {
    console.warn("[AUTH] signup invite referrer:", err?.message || err);
  }
  try {
    const { error } = await supabase
      .from("users")
      .update({ signup_invite_kind: inv.kind, signup_invite_code: inv.code })
      .eq("id", userId);
    if (error && !isMissingColumn(error)) console.warn("[AUTH] signup invite columns:", error.message);
  } catch (err) {
    console.warn("[AUTH] signup invite columns:", err?.message || err);
  }
  return { applied: true, kind: inv.kind, referredBy };
}

module.exports = { cleanSignupInvite, signupInviteKind, applySignupInvite };
