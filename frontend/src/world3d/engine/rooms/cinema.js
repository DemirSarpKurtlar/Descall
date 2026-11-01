/**
 * Cinema ("Sinema"): docs/design/3d-world/scene-1.jpg.
 * GLB: tools/world3d/build_cinema.py (layout: cinema.layout.js, generated).
 *
 * Interactive anchors (layout.anchors):
 *  - screen: SCREEN_main with material EMIT_screen, a separate unbaked emissive mesh;
 *    UV 0..1 spans its 16:9 face (u left to right, v bottom to top as seen from the
 *    seats). Phase 3 puts the live screen share there through
 *    engine.roomRuntime.screen.setSource({ texture, element }); the baked "screen"
 *    light layer and the avatar light follow the picture's average colour.
 *  - seatRows: seat names per row (front, mid, back); seats are tiered (floors).
 *  - projector (beam mesh EMIT_beam), popcorn machine.
 */
import layout from "./cinema.layout.js";

export default {
  id: "cinema",
  glb: "cinema.glb",
  layout,
  lightLayer: "screen",
  look: {
    clearColor: [0.03, 0.025, 0.08],
    exposure: 1.6,
    contrast: 1.08,
    curves: { globalHue: 285, globalDensity: 10, globalSaturation: -5, shadowsHue: 255, shadowsDensity: 30, highlightsHue: 30, highlightsDensity: 8 },
    vignette: { weight: 1.7, color: [0.04, 0.02, 0.12, 0] },
    bloom: { threshold: 0.72, weight: 0.6, kernel: 80, scale: 0.5 },
    dof: { fStop: 5.6, focalLength: 26, focusDistance: 7000 },
    // grade toward the draft: indigo-violet walls, plum velvet (the bake runs blue)
    bakedTint: { BAKED_seats: [0.95, 0.72, 0.86], BAKED_shell: [1.9, 1.3, 0.95], FLOOR: [1.15, 1.05, 0.85], BAKED_furniture: [1.4, 1.1, 0.9] },
    emissive: {
      EMIT_neon: 1.7, EMIT_aisle: 1.3, EMIT_downlight: 1.5, EMIT_popcorn_bulb: 1.5, EMIT_popcorn_sign: 1.1,
      EMIT_pouf_ring: 1.5, EMIT_speaker_led: 1.0, EMIT_projector_lens: 2.2, EMIT_sconce: 1.0, EMIT_screen: 0.5,
    },
    emissiveDefault: 1.2,
    pickable: "^FLOOR$",
    mirror: null,
    screen: { standbyColor: "#2b2f7a", standbyLevel: 0.12, liveLevel: 1.0, layerGain: 1.0, emissiveLive: 0.72, emissiveStandby: 0.45, avatarLight: 1.3 },
    beam: { color: "#5fa8ff", level: 0.6, idle: 0.25 },
    lights: {
      hemi: { dir: [0, 1, 0], diffuse: "#8f7cff", ground: "#2c2046", intensity: 0.42 },
      directional: [
        { name: "backFill", dir: [0.1, -0.5, 1], diffuse: "#c49aff", intensity: 0.32 },
      ],
      points: [
        { name: "neon", pos: [-0.3, 3.2, -7.5], diffuse: "#3f6bff", intensity: 1.2, range: 4.5 },
        { name: "popcorn", pos: [-0.6, 1.5, -9.2], diffuse: "#ffc27a", intensity: 1.2, range: 3.0 },
      ],
    },
  },
};
