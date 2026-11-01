// Shrinks the world GLB files after the Blender export (build time only).
//   node tools/world3d/optimize_glb.mjs frontend/public/world3d/avatar.glb [more.glb ...]
// dedup + weld + KHR_mesh_quantization (no runtime decoder, so no WASM and no CSP change)
// + animation resample (drops redundant keys). Textures are already WebP from Blender.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, quantize, resample, weld } from "@gltf-transform/functions";
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
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }),
  );
  await io.write(file, doc);
  const after = statSync(file).size;
  console.log(`${file}: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
}
