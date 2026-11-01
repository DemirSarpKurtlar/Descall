/**
 * Room props that live in their own GLBs: the game room's robot dealer and the game
 * pieces laid out on the tables (room definition `props`, anchors from the layout).
 *
 * props: [
 *   { kind: "robot", glb: "robot-dealer.glb", at: "dealer", clip: "idle" },
 *   { kind: "pieces", sets: ["okey", "cards", "tavla", "chess"], dressing: "default" | "draft" },
 * ]
 * Returns handles with update(dt, now) / dispose(); the robot handle has play(clip, loop).
 * Phase 4 drives real game state; "default" is how an idle table looks (empty racks
 * and a tile stack, a face-down shoe, boards set up), "draft" also deals the hands
 * shown in scene-2.jpg (dev evidence).
 */
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { loadPieces, PIECES } from "../pieces.js";

const v3 = (a) => new Vector3(a[0], a[1], a[2]);

async function loadRobot(engine, spec, anchors) {
  const a = anchors[spec.at];
  if (!a) return null;
  const scene = engine.scene;
  const c = await LoadAssetContainerAsync(`${engine.assetBase}${spec.glb}`, scene, { pluginExtension: ".glb" });
  c.addAllToScene();
  const holder = new TransformNode("robotDealer", scene);
  holder.position = v3(a.pos);
  holder.rotation.y = a.yaw; // the model faces +z
  const root = c.meshes.find((m) => m.name === "__root__");
  if (root) root.parent = holder;
  for (const m of c.meshes) m.isPickable = false;
  const levels = engine.roomDef.look.emissive || {};
  for (const mat of c.materials) {
    if (mat.name.startsWith("EMIT_")) {
      mat.emissiveIntensity = levels[mat.name] ?? 1.4;
      if ("albedoColor" in mat) mat.albedoColor.set(0, 0, 0);
    }
  }
  const groups = new Map(c.animationGroups.map((g) => [g.name, g]));
  for (const g of groups.values()) g.stop();
  let current = null;
  const play = (name, loop = name === "idle" || name === "thinking") => {
    const g = groups.get(name);
    if (!g) return false;
    if (current && current !== g) current.stop();
    current = g;
    g.start(loop, 1.0, g.from, g.to, false);
    if (!loop) {
      g.onAnimationGroupEndObservable.addOnce(() => {
        if (current === g) play("idle", true);
      });
    }
    return true;
  };
  play(spec.clip || "idle");
  return {
    kind: "robot",
    holder,
    clips: [...groups.keys()],
    play,
    dispose() {
      holder.dispose();
      c.dispose();
    },
  };
}

function place(node, pos, yaw = 0, tilt = 0) {
  node.position = pos.clone ? pos.clone() : v3(pos);
  node.rotationQuaternion = null;
  node.rotation.set(tilt, yaw, 0);
  node.isVisible = true;
  return node;
}

/** Offset in the table plane: `right` / `fwd` metres in a frame turned by yaw (fwd = +z at yaw 0). */
function offset(p, yaw, right, fwd, up = 0) {
  return new Vector3(p.x + Math.cos(yaw) * right + Math.sin(yaw) * fwd, p.y + up, p.z - Math.sin(yaw) * right + Math.cos(yaw) * fwd);
}

/** Tiles standing on a rack row, facing the rack's player (or the camera for the draft). */
function fillRack(set, rack, y, row, tiles, nodes, k = 1, flip = false) {
  const R = PIECES.okey.rack;
  const r = R.rows[row];
  const base = v3(rack.pos).set(rack.pos[0], y, rack.pos[2]);
  const n = tiles.length;
  tiles.forEach((t, i) => {
    const x = (i - (n - 1) / 2) * R.pitch * k;
    // rack frame: Blender local y -> Babylon local -z; the player sits on +z
    const p = offset(base, rack.yaw, x, -r.y * k, (r.z + 0.002) * k);
    const m = set.tile(t.color, t.number);
    place(m, p, rack.yaw + (flip ? Math.PI : 0), -((r.tilt * Math.PI) / 180) * (flip ? -1 : 1));
    m.scaling.setAll(k);
    nodes.push(m);
  });
}

/** A rack (scaled) at a table spot, optionally filled with a row of tiles. */
function rackAt(set, spot, y, nodes, k, tiles = null, flip = false) {
  const r = set.instance("RACK");
  place(r, v3(spot.pos).set(spot.pos[0], y, spot.pos[2]), spot.yaw);
  r.scaling.setAll(k);
  nodes.push(r);
  if (tiles) fillRack(set, spot, y, 0, tiles, nodes, k, flip);
}

function dressTables(set, tables, mode, nodes, scale = {}) {
  const ko = scale.okey || 1; // the draft draws pieces toy-sized: per-room scale (room module props)
  const kc = scale.cards || 1;
  const pick = (seed) => {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  };
  for (const t of tables) {
    const y = t.surfaceY;
    if (t.game === "okey") {
      for (const rack of t.racks) rackAt(set, rack, y, nodes, ko);
      // the draw pile: face-down stacks in the middle, the indicator face up
      const c = v3(t.tiles.drawPile);
      const T = PIECES.okey.tile;
      for (let k = 0; k < 5; k += 1) {
        for (let h = 0; h < 3; h += 1) {
          const m = set.tile("black", 1);
          place(m, offset(c, 0.5, (k - 2) * (T.w + 0.02) * ko, 0.05, y - c.y + T.t * (h + 0.5) * ko), 0.5, Math.PI / 2);
          m.rotation.x = -Math.PI / 2; // lying face down
          m.scaling.setAll(ko);
          nodes.push(m);
        }
      }
      const ind = set.tile("red", 7);
      place(ind, v3(t.tiles.indicator).set(t.tiles.indicator[0], y + (T.t / 2) * ko, t.tiles.indicator[2]), 0.5, Math.PI / 2);
      ind.scaling.setAll(ko);
      nodes.push(ind);
    } else if (t.game === "blackjack") {
      const shoe = set.instance("DECK");
      place(shoe, v3(t.spots.shoe.pos).set(t.spots.shoe.pos[0], y, t.spots.shoe.pos[2]), t.spots.shoe.yaw);
      shoe.scaling.setAll(kc);
      nodes.push(shoe);
      if (mode === "draft") {
        const rnd = pick(7);
        const suits = PIECES.cards.suits;
        const card = (m, pos, yaw) => {
          place(m, pos, yaw);
          m.scaling.setAll(kc);
          nodes.push(m);
        };
        t.spots.players.forEach((p, i) => {
          for (let k = 0; k < 2; k += 1) {
            const pos = offset(v3(p.cards).set(p.cards[0], y + 0.001 + k * 0.0015, p.cards[2]), p.yaw, (k - 0.5) * 0.055 * kc, k * 0.02 * kc);
            card(set.card(suits[Math.floor(rnd() * 4)], 1 + Math.floor(rnd() * 13)), pos, p.yaw + (k - 0.5) * 0.3 + i);
          }
        });
        const d = t.spots.dealerCards;
        card(set.card("diamond", "K"), offset(v3(d.pos).set(d.pos[0], y + 0.001, d.pos[2]), d.yaw, -0.045 * kc, 0), d.yaw);
        card(set.card("back"), offset(v3(d.pos).set(d.pos[0], y + 0.001, d.pos[2]), d.yaw, 0.045 * kc, 0), d.yaw);
        const sc = v3(t.spots.scoreCards);
        for (let k = 0; k < 2; k += 1) {
          card(set.card("score", k), offset(sc.set(sc.x, y + 0.002, sc.z), 1.1, (k - 0.5) * 0.105 * kc, 0), 1.1 + Math.PI / 2 + k * 0.05);
        }
        // scene-2.jpg also has okey racks on this table (left player, near-left player, the dealer):
        // shown in the draft dressing only, tiles turned to the camera as drawn
        const row = (seed) => {
          const r2 = pick(seed);
          return Array.from({ length: 7 }, () => ({ color: ["red", "black", "blue", "yellow"][Math.floor(r2() * 4)], number: 1 + Math.floor(r2() * 13) }));
        };
        const c = t.center;
        for (const [i, seed] of [[1, 3], [2, 5]]) {
          const pp = t.spots.players[i];
          const dx = c[0] - pp.cards[0];
          const dz = c[2] - pp.cards[2];
          const L = Math.hypot(dx, dz);
          rackAt(set, { pos: [pp.cards[0] - (dx / L) * 0.1, pp.cards[1], pp.cards[2] - (dz / L) * 0.1], yaw: pp.yaw + Math.PI }, y, nodes, ko, row(seed), true);
        }
        rackAt(set, { pos: d.pos, yaw: d.yaw + Math.PI }, y, nodes, ko, row(11), true);
      }
    } else if (t.game === "tavla" && set.templates.has("TAVLA_board")) {
      const b = t.board;
      const bp = v3(b.pos).set(b.pos[0], y, b.pos[2]);
      place(set.instance("TAVLA_board"), bp, b.yaw);
      const T = PIECES.tavla;
      for (const [side, start] of Object.entries(T.start)) {
        for (const [pt, count] of Object.entries(start)) {
          const P = T.points[Number(pt) - 1];
          for (let k = 0; k < count; k += 1) {
            const lx = P.base[0] + P.stack[0] * k;
            const lz = P.base[2] + P.stack[2] * k;
            const m = set.instance(side === "light" ? "TAVLA_checker_light" : "TAVLA_checker_dark");
            place(m, offset(bp, b.yaw, lx, lz, T.board.surfaceY), 0);
            nodes.push(m);
          }
        }
      }
      for (let k = 0; k < 2; k += 1) {
        const d = set.instance("TAVLA_die");
        place(d, offset(bp, b.yaw, 0.14 + k * 0.03, 0.02 * k, T.board.surfaceY), 0.4 * k);
        nodes.push(d);
      }
    } else if (t.game === "chess" && set.templates.has("CHESS_board")) {
      const b = t.board;
      const bp = v3(b.pos).set(b.pos[0], y, b.pos[2]);
      place(set.instance("CHESS_board"), bp, b.yaw);
      const C = PIECES.chess;
      const sq = C.board.square;
      const back = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
      for (let f = 0; f < 8; f += 1) {
        for (const [rank, kind, side] of [[1, back[f], "light"], [2, "pawn", "light"], [7, "pawn", "dark"], [8, back[f], "dark"]]) {
          const m = set.instance(`CHESS_${kind}_${side}`);
          place(m, offset(bp, b.yaw, (f - 3.5) * sq, (rank - 4.5) * sq, C.board.surfaceY), b.yaw);
          nodes.push(m);
        }
      }
    }
  }
}

async function loadPieceProps(engine, spec, anchors) {
  const set = await loadPieces(engine.scene, engine.assetBase, spec.sets);
  const nodes = [];
  dressTables(set, anchors.tables || [], spec.dressing || "default", nodes, spec.scale);
  return {
    kind: "pieces",
    set,
    nodes,
    redress(mode) {
      for (const n of nodes.splice(0)) n.dispose();
      dressTables(set, anchors.tables || [], mode, nodes, spec.scale);
    },
    dispose() {
      for (const n of nodes) n.dispose();
      set.dispose();
    },
  };
}

export async function loadRoomProps(engine, specs, anchors) {
  const out = [];
  for (const spec of specs) {
    const h = spec.kind === "robot" ? await loadRobot(engine, spec, anchors) : await loadPieceProps(engine, spec, anchors);
    if (h) out.push(h);
  }
  return out;
}
