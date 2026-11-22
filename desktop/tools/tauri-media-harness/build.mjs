// Bundles the real frontend media modules (IIFE) for the Tauri-origin harness.
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FE = join(here, "..", "..", "..", "frontend");
const require = createRequire(join(FE, "package.json"));
const esbuild = require("esbuild");
const out = process.env.OUT || "/dev/shm/descall-media-harness";
mkdirSync(join(out, "assets"), { recursive: true });
const urlPlugin = {
  name: "url",
  setup(b) {
    b.onResolve({ filter: /\?url$/ }, async (a) => {
      const r = await b.resolve(a.path.replace(/\?url$/, ""), { resolveDir: a.resolveDir, kind: "import-statement" });
      return { path: r.path, namespace: "url" };
    });
    b.onLoad({ filter: /.*/, namespace: "url" }, (a) => {
      const name = `${basename(dirname(a.path))}-${basename(a.path)}`;
      copyFileSync(a.path, join(out, "assets", name));
      return { contents: `export default ${JSON.stringify("./assets/" + name)};`, loader: "js" };
    });
  },
};
await esbuild.build({
  stdin: {
    contents: ["noiseSuppression", "webrtcScreenShare", "callAudioDevices", "callWakeLock"]
      .map((m, i) => `import * as m${i} from ${JSON.stringify(join(FE, "src", "lib", m + ".js"))};`).join("\n")
      + "\nwindow.__h = { ns: m0, ss: m1, dev: m2, wl: m3 };",
    resolveDir: here,
    loader: "js",
  },
  bundle: true,
  format: "iife",
  outfile: join(out, "assets", "h.js"),
  plugins: [urlPlugin],
  nodePaths: [join(FE, "node_modules")],
  define: { "import.meta.env": JSON.stringify({ MODE: "production", PROD: true, DEV: false }) },
  loader: { ".jsx": "jsx", ".css": "empty", ".png": "empty", ".svg": "empty", ".webp": "empty", ".mp3": "empty", ".wav": "empty", ".ogg": "empty" },
  jsx: "automatic",
  logLevel: "error",
});
console.log("built");
