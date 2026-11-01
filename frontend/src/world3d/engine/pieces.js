/**
 * Game pieces for the 3D game room (GLBs from tools/world3d/build_game_pieces.py).
 *
 *   const set = await loadPieces(scene, "/world3d/", ["okey", "cards", "tavla", "chess"]);
 *   set.tile("red", 7)            // InstancedMesh of the one tile mesh, face = red 7
 *   set.tile("false")             // false okey
 *   set.card("heart", "Q")        // card face; set.card("back"), set.card("score", 0)
 *   set.instance("RACK")          // any template by name (DECK, TAVLA_board, CHESS_knight_dark, ...)
 *
 * One mesh + one atlas per kind: a tile / card variant is a copy of the template
 * geometry whose face UVs are moved to the atlas cell (made once per cell, then
 * instanced), so 106 tiles cost at most 54 small geometries and one material.
 * Templates sit at the origin in world space (glTF handedness baked in), hidden.
 * Positions / sizes the games need (rack slots, tavla points, chess squares): PIECES.
 */
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import PIECES from "./pieces.layout.js";

import { okeyCell, cardCell } from "./piecesData.js";

export { PIECES };
export { okeyCell, cardCell, okeySet } from "./piecesData.js";

function bakeToWorld(mesh) {
  mesh.computeWorldMatrix(true);
  const wm = mesh.getWorldMatrix().clone();
  mesh.setParent(null);
  mesh.position.setAll(0);
  mesh.rotationQuaternion = null;
  mesh.rotation.setAll(0);
  mesh.scaling.setAll(1);
  mesh.bakeTransformIntoVertices(wm);
}

export async function loadPieces(scene, assetBase, kinds = ["okey", "cards", "tavla", "chess"]) {
  const templates = new Map();
  const containers = [];
  for (const kind of kinds) {
    const c = await LoadAssetContainerAsync(`${assetBase}${kind}.glb`, scene, { pluginExtension: ".glb" });
    c.addAllToScene();
    containers.push(c);
    for (const m of c.meshes) {
      if (!m.getTotalVertices || !m.getTotalVertices()) continue;
      bakeToWorld(m);
      m.isVisible = false;
      m.isPickable = false;
      templates.set(m.name, m);
    }
    for (const m of c.meshes) if (!m.getTotalVertices || !m.getTotalVertices()) m.dispose();
  }
  const variants = new Map();
  /** Copy of a template with its face-cell UVs moved to `cell` (grid cols x rows). */
  const variant = (name, cell, grid) => {
    const key = `${name}#${cell}`;
    if (variants.has(key)) return variants.get(key);
    const base = templates.get(name);
    if (!base) throw new Error(`piece template ${name} not loaded`);
    const m = base.clone(`${name}_${cell}`, null, true);
    m.makeGeometryUnique();
    const uv = m.getVerticesData(VertexBuffer.UVKind);
    const du = 1 / grid.cols;
    const dv = 1 / grid.rows;
    const cu = (cell % grid.cols) * du;
    const cv = Math.floor(cell / grid.cols) * dv;
    for (let i = 0; i < uv.length; i += 2) {
      // the template's face sits in cell 0 (glTF UVs: v grows downwards in the atlas)
      if (uv[i] < du && uv[i + 1] < dv) {
        uv[i] += cu;
        uv[i + 1] += cv;
      }
    }
    m.setVerticesData(VertexBuffer.UVKind, uv, false);
    m.isVisible = false;
    variants.set(key, m);
    return m;
  };
  let serial = 0;
  const inst = (mesh) => {
    const i = mesh.createInstance(`${mesh.name}_i${(serial += 1)}`);
    i.isPickable = false;
    return i;
  };
  return {
    templates,
    tile: (color, number) => inst(variant("TILE", okeyCell(color, number), PIECES.okey.grid)),
    card: (suit, rank) => inst(variant("CARD", cardCell(suit, rank), PIECES.cards.grid)),
    instance: (name) => {
      const t = templates.get(name);
      if (!t) throw new Error(`piece template ${name} not loaded`);
      return inst(t);
    },
    dispose() {
      for (const v of variants.values()) v.dispose();
      for (const c of containers) c.dispose();
    },
  };
}
