/**
 * Camp ("Kamp"): docs/design/3d-world/scene-4.jpg.
 * GLB: tools/world3d/build_camp.py (layout: camp.layout.js, generated).
 *
 * Open area: the layout bounds are the invisible walls (x / z rectangle round the
 * camp, the lake beyond them), colliders for the fire ring, benches, tents, stump.
 * Anchors: fire (flame meshes, embers, light position), benches (two log seats each),
 * tents (door points), moon.
 * The fire is animated at runtime from fx.fire below (rooms/fire.js): flame flicker,
 * a flickering point light, the baked "fire" light layer, and particle systems
 * defined here as plain data.
 */
import layout from "./camp.layout.js";

export default {
  id: "camp",
  glb: "camp.glb",
  layout,
  lightLayer: "fire",
  look: {
    clearColor: [0.03, 0.04, 0.12],
    exposure: 1.65,
    contrast: 1.06,
    curves: { globalHue: 250, globalDensity: 14, globalSaturation: 10, shadowsHue: 240, shadowsDensity: 40, highlightsHue: 35, highlightsDensity: 18 },
    vignette: { weight: 1.5, color: [0.02, 0.03, 0.1, 0] },
    bloom: { threshold: 0.7, weight: 0.6, kernel: 80, scale: 0.5 },
    dof: { fStop: 5.0, focalLength: 31, focusDistance: 6000 },
    bakedTint: {},
    emissive: {
      EMIT_sky: 1.0, EMIT_moon: 1.6, EMIT_aurora: 1.3, EMIT_lake: 1.0, EMIT_flame: 1.0, EMIT_embers: 1.8,
      EMIT_fairy: 1.8, EMIT_tent_glow: 1.2, EMIT_lantern: 1.6,
    },
    emissiveDefault: 1.2,
    additive: ["EMIT_aurora", "EMIT_moon"],
    pickable: "^FLOOR$",
    mirror: null,
    animated: [
      { match: "^EMIT_aurora$", scrollU: 0.006, pulse: 0.12, speed: 0.4 },
      { match: "^EMIT_fairy$", pulse: 0.18, speed: 2.3 },
      { match: "^EMIT_lake$", scrollU: 0.0015 },
    ],
    layers: { fire: { color: "#ff9a50", level: 1.0 } },
    lights: {
      hemi: { dir: [0, 1, 0], diffuse: "#6f7cff", ground: "#2a3a2a", intensity: 0.42 },
      directional: [{ name: "moon", dir: [0.0, -0.45, 1], diffuse: "#9db0ff", specular: "#3b46aa", intensity: 0.35 }],
      points: [],
    },
  },
  fx: {
    fire: {
      light: { color: "#ff9a48", intensity: 2.8, range: 8, flicker: 0.22 },
      layer: { color: "#ff9a50", level: 1.0, flicker: 0.16 },
      flames: { scaleJitter: 0.16, sway: 0.07, speed: 7, intensity: 2.2 },
      particles: [
        {
          name: "sparks", capacity: 180, emitRate: 28, blend: "add",
          emitBox: [[-0.22, 0.25, -0.22], [0.22, 0.55, 0.22]],
          direction1: [-0.3, 1.0, -0.3], direction2: [0.3, 1.7, 0.3],
          minLife: 0.7, maxLife: 1.8, minSize: 0.012, maxSize: 0.032, minPower: 0.8, maxPower: 2.0,
          gravity: [0, 0.35, 0], angularSpeed: 2,
          color1: [1, 0.78, 0.35, 1], color2: [1, 0.5, 0.12, 1], colorDead: [0.5, 0.08, 0.0, 0],
        },
        {
          name: "fireflies", capacity: 48, emitRate: 6, blend: "add", origin: [0, 0, 1.5],
          emitBox: [[-7, 0.2, -5], [7, 1.6, 4]],
          direction1: [-0.12, -0.04, -0.12], direction2: [0.12, 0.08, 0.12],
          minLife: 4, maxLife: 8, minSize: 0.03, maxSize: 0.055, minPower: 0.2, maxPower: 0.5,
          gravity: [0, 0, 0], prewarm: 300,
          color1: [1, 0.92, 0.45, 1], color2: [0.85, 1, 0.4, 1], colorDead: [0.6, 0.7, 0.1, 0],
        },
      ],
    },
  },
};
