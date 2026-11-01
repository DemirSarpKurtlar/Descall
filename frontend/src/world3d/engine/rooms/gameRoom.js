/**
 * Game room ("Oyun odası"): docs/design/3d-world/scene-2.jpg.
 * GLB: tools/world3d/build_game_room.py (layout: gameRoom.layout.js, generated).
 *
 * Tables (layout.anchors.tables), each with its seat names and placement anchors:
 *  - "bj"    blackjack, Masa 2: 5 player seats (counted in the draft) + the robot
 *            dealer (anchors.dealer, robot-dealer.glb: idle, dealCard, flipCard,
 *            collectCards, wave, thinking); card spots per player, dealer cards,
 *            shoe, discard, score cards (points only);
 *  - "okey"  Masa 1: 4 seats, a rack anchor per seat (pieces.layout.js gives the
 *            15 x 2 slots), draw pile, indicator;
 *  - "tavla" board anchor, 2 seats (the draft's back right table with a board);
 *  - "chess" board anchor, 2 seats, front right outside the hero view (the draft has
 *            no free table for it).
 * Pieces: okey.glb, cards.glb, tavla.glb, chess.glb through engine/pieces.js.
 */
import layout from "./gameRoom.layout.js";

export default {
  id: "game-room",
  glb: "game-room.glb",
  layout,
  look: {
    clearColor: [0.05, 0.04, 0.1],
    exposure: 1.7,
    contrast: 1.04,
    curves: { globalHue: 280, globalDensity: 12, globalSaturation: 4, shadowsHue: 245, shadowsDensity: 35, highlightsHue: 36, highlightsDensity: 14 },
    vignette: { weight: 1.3, color: [0.06, 0.03, 0.12, 0] },
    bloom: { threshold: 0.8, weight: 0.5, kernel: 72, scale: 0.5 },
    dof: { fStop: 4.0, focalLength: 34, focusDistance: 4200 },
    bakedTint: {},
    emissive: { EMIT_lamp: 1.6, EMIT_bulb: 1.5, EMIT_window: 0.9, EMIT_robot_glow: 1.5, EMIT_robot_blue: 1.4 },
    emissiveDefault: 1.3,
    doubleSided: [],
    pickable: "^FLOOR$|rug",
    mirror: { match: "BAKED_(furniture|chairs|props)", level: 0.12 },
    lights: {
      hemi: { dir: [0, 1, 0], diffuse: "#a596ff", ground: "#5a3a3a", intensity: 0.5 },
      directional: [
        { name: "fill", dir: [0.1, -0.6, 1], diffuse: "#ffd6e6", intensity: 0.32 },
      ],
      lamps: {
        match: "EMIT_lamp_|EMIT_globe",
        rules: [
          { match: "globe", diffuse: "#ffd2a0", intensity: 0.8, range: 3.0 },
          { diffuse: "#ffc77e", intensity: 2.2, range: 4.2 },
        ],
      },
    },
  },
  props: [
    { kind: "robot", glb: "robot-dealer.glb", at: "dealer", clip: "idle" },
    { kind: "pieces", sets: ["okey", "cards", "tavla", "chess"], dressing: "default" },
  ],
};
