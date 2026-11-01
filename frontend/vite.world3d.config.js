// 3D world engine bundle (Babylon.js), built after the app into dist/world3d/engine/.
// Kept out of the app build on purpose:
//  - the Electron app build is a single IIFE (no code splitting), so a lazy import()
//    there would still inline Babylon into the boot bundle;
//  - iOS / Android builds (VITE_WORLD3D=0) skip this step, so no world code ships there.
// World3DView loads it at runtime with import(`${origin}/world3d/engine/engine.js`).
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  logLevel: "warn",
  build: {
    target: "es2020",
    outDir: "dist/world3d/engine",
    emptyOutDir: true,
    sourcemap: false,
    minify: "esbuild",
    reportCompressedSize: false,
    chunkSizeWarningLimit: 4096,
    lib: {
      entry: "src/world3d/engine/index.js",
      formats: ["es"],
      fileName: () => "engine.js",
    },
    rollupOptions: {
      output: {
        chunkFileNames: "chunk-[hash].js",
      },
    },
  },
});
