/**
 * Living room ("Oturma odası"), phase 1: docs/design/3d-world/scene-3.jpg.
 * GLB: tools/world3d/build_living_room.py. The layout module was read out of the
 * GLB's helper nodes with the phase 1 parser (dev harness `layout` mode), so the
 * room behaves exactly as before; every look value below is the phase 1 one.
 */
import layout from "./livingRoom.layout.js";

export default {
  id: "living-room",
  glb: "living-room.glb",
  layout,
  look: {
    clearColor: [0.04, 0.03, 0.09],
    exposure: 1.75,
    contrast: 1.05,
    // colour grade: violet shadows and mids, warm highlights (scene-3.jpg)
    curves: { globalHue: 272, globalDensity: 30, globalSaturation: -20, shadowsHue: 250, shadowsDensity: 55, highlightsHue: 32, highlightsDensity: 14 },
    vignette: { weight: 1.4, color: [0.05, 0.02, 0.12, 0] },
    bloom: { threshold: 0.82, weight: 0.45, kernel: 72, scale: 0.5 },
    dof: { fStop: 4.0, focalLength: 28, focusDistance: 5200 },
    // grade toward the draft: dusty lavender walls, browner floor (the bake is neutral-warm)
    bakedTint: { FLOOR: [0.9, 0.8, 0.88], BAKED_shell: [1.02, 0.98, 1.4], BAKED_furniture: [1.22, 1.18, 1.4], BAKED_rug: [1.05, 1.0, 1.08], BAKED_props: [1.05, 1.0, 1.15] },
    emissive: { EMIT_shade: 1.15, EMIT_globe: 1.2, EMIT_lava: 1.3, EMIT_sky_far: 0.95, EMIT_sky_near: 1.0 },
    emissiveDefault: 1.5,
    doubleSided: ["BAKED_foliage"],
    alphaTest: ["EMIT_sky_near"],
    pickable: "^FLOOR$|rug",
    mirror: { match: "EMIT_|sofa|table|console|tv", level: 0.22 },
    lights: {
      hemi: { dir: [0, 1, 0], diffuse: "#9a86ff", ground: "#3b2846", intensity: 0.46 },
      directional: [
        { name: "window", dir: [0.15, -0.35, -1], diffuse: "#6f7cff", specular: "#3b46aa", intensity: 0.42 },
        { name: "front", dir: [0.2, -0.45, 1], diffuse: "#ffd9e6", intensity: 0.3 },
      ],
      lamps: {
        match: "EMIT_(lamp|globe|lava)",
        rules: [
          { match: "lava", diffuse: "#ff5fd2", intensity: 0.9, range: 2.2 },
          { diffuse: "#ffb46e", intensity: 2.4, range: 5.5 },
        ],
      },
    },
  },
};
