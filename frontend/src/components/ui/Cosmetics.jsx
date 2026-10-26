/**
 * Small, reusable renderers for equipped profile-customization cosmetics
 * (name effects and the country flag; titles were retired in 2.13.0, shop profile
 * badges on 2026-10-26). Fed the same enriched `user`
 * object already used for avatars, degrades to plain text/nothing when a
 * slot isn't equipped, so callers can use these unconditionally.
 */
export { CountryBadge } from "../shop/CountryFlag";

/** Wraps a display name in its equipped name-effect gradient/glow, if any. */
export function NameEffectText({ user, children }) {
  const effectKey = user?.equippedNameEffect?.effect_key;
  if (!effectKey) return children;
  return <span className={`cosmetic-name-effect effect-${effectKey}`}>{children}</span>;
}

/** CSS class for the animated ring/aura behind an avatar, or "" if unequipped. */
export function avatarEffectClass(user) {
  const effectKey = user?.equippedAvatarEffect?.effect_key;
  return effectKey ? `cosmetic-avatar-effect effect-${effectKey}` : "";
}

/** CSS class for a chat bubble skin, or "" if unequipped. */
export function chatBubbleClass(user) {
  const effectKey = user?.equippedChatBubble?.effect_key;
  return effectKey ? `cosmetic-chat-bubble bubble-${effectKey}` : "";
}

/** CSS class for a presence status flare, or "" if unequipped. */
export function presenceFlareClass(user) {
  const effectKey = user?.equippedPresenceFlare?.effect_key;
  return effectKey ? `cosmetic-presence-flare flare-${effectKey}` : "";
}

/** CSS class for a profile-card aura, or "" if unequipped. */
export function profileAuraClass(user) {
  const effectKey = user?.equippedProfileAura?.effect_key;
  return effectKey ? `cosmetic-profile-aura aura-${effectKey}` : "";
}

/** Equipped sound-pack key (for notification/call tones), or null. */
export function soundPackKey(user) {
  return user?.equippedSoundPack?.effect_key || null;
}

/** CSS class for typing-indicator flare, or "" if unequipped. */
export function typingFlareClass(user) {
  const effectKey = user?.equippedTypingFlare?.effect_key;
  return effectKey ? `cosmetic-typing-flare typing-${effectKey}` : "";
}

/** CSS class for reaction burst style, or "" if unequipped. */
export function reactionBurstClass(user) {
  const effectKey = user?.equippedReactionBurst?.effect_key;
  return effectKey ? `cosmetic-reaction-burst burst-${effectKey}` : "";
}

/** CSS class for call overlay theme, or "" if unequipped. */
export function callOverlayClass(user) {
  const effectKey = user?.equippedCallOverlay?.effect_key;
  return effectKey ? `cosmetic-call-overlay overlay-${effectKey}` : "";
}
