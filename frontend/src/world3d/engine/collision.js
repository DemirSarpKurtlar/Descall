/**
 * Avatar collision in the floor plane (pure): circle vs oriented boxes + room bounds.
 * Boxes: { cx, cz, hx, hz, cos, sin } (centre, half extents, rotation about Y).
 */

export function makeBox(cx, cz, hx, hz, angle = 0) {
  return { cx, cz, hx, hz, cos: Math.cos(angle), sin: Math.sin(angle) };
}

/** Push point (x, z) with radius r out of the box. Returns [x, z]. */
export function pushOutOfBox(x, z, r, b) {
  const dx = x - b.cx;
  const dz = z - b.cz;
  // into box space
  const lx = dx * b.cos + dz * b.sin;
  const lz = -dx * b.sin + dz * b.cos;
  const ex = b.hx + r;
  const ez = b.hz + r;
  if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return [x, z];
  // smallest push axis
  const px = ex - Math.abs(lx);
  const pz = ez - Math.abs(lz);
  let nx = lx;
  let nz = lz;
  if (px < pz) nx = Math.sign(lx || 1) * ex;
  else nz = Math.sign(lz || 1) * ez;
  // back to world
  return [b.cx + nx * b.cos - nz * b.sin, b.cz + nx * b.sin + nz * b.cos];
}

export function clampToBounds(x, z, r, bounds) {
  return [
    Math.min(bounds.maxX - r, Math.max(bounds.minX + r, x)),
    Math.min(bounds.maxZ - r, Math.max(bounds.minZ + r, z)),
  ];
}

/** Resolve a desired position against every box (a few passes for corners) and the room. */
export function resolve(x, z, r, boxes, bounds) {
  let p = [x, z];
  for (let pass = 0; pass < 3; pass += 1) {
    for (const b of boxes) p = pushOutOfBox(p[0], p[1], r, b);
    if (bounds) p = clampToBounds(p[0], p[1], r, bounds);
  }
  return p;
}

/** Shorten a camera boom so the camera stays inside the room box (minus a margin). */
export function clampBoom(target, dir, length, bounds, margin = 0.2) {
  let t = length;
  const axes = [
    ["x", bounds.minX + margin, bounds.maxX - margin],
    ["y", bounds.minY + margin, bounds.maxY - margin],
    ["z", bounds.minZ + margin, bounds.maxZ - margin],
  ];
  for (const [k, lo, hi] of axes) {
    const d = dir[k];
    if (Math.abs(d) < 1e-6) continue;
    const limit = d > 0 ? (hi - target[k]) / d : (lo - target[k]) / d;
    if (limit < t) t = Math.max(0.3, limit);
  }
  return t;
}
