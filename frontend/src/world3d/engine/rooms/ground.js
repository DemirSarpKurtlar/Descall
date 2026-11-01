/**
 * Walkable floor heights (pure): rooms with tiers (the cinema) list raised rectangles
 * in their layout; everything else is ground level 0.
 */

/** Ground height at (x, z): the highest floor rectangle containing the point, else 0. */
export function groundAt(floors, x, z) {
  let y = 0;
  if (!floors) return y;
  for (const f of floors) {
    if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && f.y > y) y = f.y;
  }
  return y;
}

/** Ease a height toward the ground (steps up / down a tier in about a tenth of a second). */
export function easeHeight(current, target, dt) {
  if (!Number.isFinite(current)) return target;
  const k = Math.min(1, dt * 14);
  const next = current + (target - current) * k;
  return Math.abs(next - target) < 0.002 ? target : next;
}
