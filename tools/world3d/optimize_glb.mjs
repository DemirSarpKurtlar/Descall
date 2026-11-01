// Shrinks the world GLB files after the Blender export (build time only).
//   node tools/world3d/optimize_glb.mjs frontend/public/world3d/avatar.glb [more.glb ...]
// dedup + weld + KHR_mesh_quantization (no runtime decoder, so no WASM and no CSP change)
// + animation resample (drops redundant keys). Textures are already WebP from Blender.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, quantize, resample, sparse, weld } from "@gltf-transform/functions";
import { statSync } from "node:fs";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const before = statSync(file).size;
  const doc = await io.read(file);
  await doc.transform(
    dedup(),
    weld(),
    resample({ tolerance: 0.0005 }),
    prune({ keepAttributes: true, keepLeaves: true, keepExtras: true }),
    // one quantization volume for the whole file: every skinned mesh keeps the same inverse bind
    // matrices, so the skins dedupe to one (one skeleton per avatar, and the client can merge
    // the visible item meshes into one draw call)
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8, quantizationVolume: "scene" }),
    dedup(),
    // morph targets move only the eyes and mouth: store them sparse (avatar.glb, phase 5)
    sparse({ ratio: 1 / 4 }),
  );
  await io.write(file, doc);
  const after = statSync(file).size;
  console.log(`${file}: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
}
