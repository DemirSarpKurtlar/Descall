/**
 * Extension point for special badges given by promo codes.
 *
 * The special-badge catalog ships in its own task. When it lands it calls
 * registerPromoBadges({ Icon, describe, Picker }) once at startup:
 *   - Icon({ badgeId, size }) draws the badge glyph,
 *   - describe(badgeId) → { name, tierLabel?, holders? } or null,
 *   - Picker({ value, onChange }) is the admin badge field.
 * Until then promo surfaces fall back to the Award icon and the raw badge id,
 * and the admin form explains that the catalog is not ready (the server also
 * refuses badge codes with "badges_unavailable").
 */
let registry = null;
const listeners = new Set();

export function registerPromoBadges(next) {
  registry = next && typeof next === "object" ? next : null;
  for (const fn of listeners) fn(registry);
}

export function getPromoBadges() {
  return registry;
}

export function onPromoBadgesChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function describePromoBadge(badgeId) {
  const d = registry?.describe?.(badgeId);
  return { name: d?.name || String(badgeId || ""), tierLabel: d?.tierLabel || "", holders: d?.holders ?? null };
}
