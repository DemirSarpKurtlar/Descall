/**
 * One geometry for every avatar effect ring (`.cosmetic-avatar-effect`).
 *
 * The effect box is concentric with the avatar and extends `gap + width`
 * past its edge. Every effect draws its visible ring inside the outer
 * `width` of that box (inset box-shadow, border, or mask band), so all
 * effects sit at the same radius and scale with the avatar instead of each
 * using its own fixed pixel spread outside a 12% inset.
 */
export function avatarEffectGeometry(avatarSize) {
  const size = Math.max(0, Number(avatarSize) || 0);
  const gap = Math.max(1, Math.round(size * 0.05));
  const width = Math.max(2, Math.round(size * 0.07));
  return { gap, width, outset: gap + width };
}

/** Inline style for an effect element around an avatar of `avatarSize` px. */
export function avatarEffectStyle(avatarSize, extra = undefined) {
  const { gap, width, outset } = avatarEffectGeometry(avatarSize);
  return {
    inset: -outset,
    "--fx-gap": `${gap}px`,
    "--fx-w": `${width}px`,
    ...(extra || {}),
  };
}
