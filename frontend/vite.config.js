import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { phosphorWeightsPlugin } from "./scripts/phosphor-weights-lib.mjs";
import { createRequire } from "node:module";

// Web needs absolute asset URLs so deep marketing routes (/faq, /download, …)
// resolve /assets/* correctly. Electron loadFile() still needs relative "./".
const electronBase =
  process.env.ELECTRON_BUILD === "1" || process.env.VITE_BASE === "./";

const require = createRequire(import.meta.url);

/**
 * Inject Search Console / Bing verification metas (DES-8 / DES-18 / DES-50).
 */
function descallHtmlSeoPlugin() {
  return {
    name: "descall-html-seo",
    transformIndexHtml: {
      order: "post",
      handler() {
        const tags = [];
        const gsc = String(process.env.VITE_GSC_VERIFICATION || "").trim();
        const bing = String(process.env.VITE_BING_SITE_VERIFICATION || "").trim();
        if (gsc) {
          tags.push({
            tag: "meta",
            attrs: { name: "google-site-verification", content: gsc },
            injectTo: "head",
          });
        }
        if (bing) {
          tags.push({
            tag: "meta",
            attrs: { name: "msvalidate.01", content: bing },
            injectTo: "head",
          });
        }
        return tags;
      },
    },
  };
}


/**
 * Electron IIFE builds still get <script type="module"> from Vite's HTML
 * transform. Module scripts never set document.currentScript, so Vite's
 * relative-asset polyfill (new URL(file, currentScript||baseURI)) resolves
 * hashed files against dist/index.html instead of dist/assets/ — brand JPEG,
 * fonts imported from JS, and WASM 404. Force a classic defer script when
 * building for Electron so currentScript.src points at the IIFE bundle.
 */
function electronClassicScriptPlugin() {
  if (!electronBase) return null;
  return {
    name: "descall-electron-classic-script",
    enforce: "post",
    transformIndexHtml(html) {
      return html
        .replace(
          /<script type="module" crossorigin src="(\.\/assets\/[^"]+\.js)"><\/script>/g,
          '<script defer src="$1"></script>'
        )
        // The app stylesheet (cssCodeSplit off below): a plain same-origin request like the
        // script, no CORS mode on the descall: / tauri.localhost schemes.
        .replace(/<link rel="stylesheet" crossorigin href="(\.\/assets\/[^"]+\.css)">/g, '<link rel="stylesheet" href="$1">');
    },
  };
}

const appVersion = require("./package.json").version;

export default defineConfig({
  plugins: [phosphorWeightsPlugin(), react(), descallHtmlSeoPlugin(), electronClassicScriptPlugin()].filter(Boolean),
  // Sentry release tag (descall@<version>), kept in sync by electron/sync-version.cjs.
  define: {
    __DESCALL_VERSION__: JSON.stringify(appVersion),
  },
  // Serve prerendered dist/<route>/index.html shells in preview (not SPA fallback to /).
  appType: "mpa",
  base: electronBase ? "./" : "/",
  publicDir: "public",
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["@sapphi-red/web-noise-suppressor"],
  },
  build: {
    target: "es2020",
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    // Desktop (Electron / Tauri) builds are IIFE: with CSS code splitting on, Vite put the
    // whole app stylesheet inside the JS bundle as a runtime <style> element. The desktop app
    // then had no stylesheet of its own: whenever that injection did not apply (an inline
    // style the page CSP refuses, the bundle start failing) the app rendered as raw HTML.
    // One real ./assets/index-*.css <link> (style-src 'self') instead, render-blocking like
    // the web build's.
    cssCodeSplit: electronBase ? false : true,
    // Never inline a script asset as a data: URL. The small noise-gate AudioWorklet
    // (`noiseGateWorklet.js?url`) became data:text/javascript, which script-src 'self'
    // blocks (web and Electron), so the noise gate never loaded (2.11.11).
    assetsInlineLimit: (filePath) => (/\.(?:m?js|cjs)(?:\?|$)/.test(filePath) ? false : undefined),
    // Electron's file:// loader historically used IIFE; web builds benefit from
    // ES modules + manual chunks so marketing pages do not download voice WASM first.
    rollupOptions: {
      output: electronBase
        ? { format: "iife" }
        : {
            // Site catalog parts (src/site/i18n/<id>/<part>.js) are named after locale and
            // part ("site-de-features-x.js"): every locale has a core.js, features.js, ...
            chunkFileNames(chunk) {
              const m = (chunk.facadeModuleId || "").match(/[\\/]src[\\/]site[\\/]i18n[\\/]([\w-]+)[\\/]([\w-]+)\.js$/);
              return m ? `assets/site-${m[1]}-${m[2]}-[hash].js` : "assets/[name]-[hash].js";
            },
            manualChunks(id) {
              if (id.includes("node_modules")) {
                // Lazy-loaded error reporting; must stay out of vendor-react ("/@sentry/react/" matches "/react/").
                if (id.includes("/@sentry/") || id.includes("/@sentry-internal/")) return "vendor-sentry";
                if (id.includes("livekit")) return "vendor-livekit";
                if (id.includes("framer-motion")) return "vendor-motion";
                if (id.includes("socket.io")) return "vendor-socket";
                if (id.includes("posthog")) return "vendor-analytics";
                if (id.includes("@sapphi-red") || id.includes("rnnoise")) return "vendor-noise";
                // @phosphor-icons/react contains "/react/", so it would join vendor-react
                // and ship in the marketing first paint. Keep it with the app shell.
                if (id.includes("@phosphor-icons")) return "vendor-phosphor";
                if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
              }
              // The SDK facade rides in the lazy Sentry chunk. On its own it is so small that
              // Rollup merged it into the entry, which then imported vendor-sentry statically.
              if (/[\\/]src[\\/]lib[\\/]sentrySdk\.js$/.test(id)) return "vendor-sentry";
              // Do not force all /src/site into one chunk — route lazy() splits pages.
              return undefined;
            },
          },
    },
    copyPublicDir: true,
  },
});
