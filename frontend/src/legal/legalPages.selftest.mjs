/**
 * Renders every public legal page and the in-app legal modal.
 * Run: node frontend/src/legal/legalPages.selftest.mjs
 *
 * 2.10.1 shipped LegalDocument with an unused `PRIVACY_CONTENT` reference.
 * The module threw before paint, so /privacy was a blank Error Boundary.
 * Importing and rendering the pages fails that build.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "..", "..");
const require = createRequire(pathToFileURL(join(frontendRoot, "package.json")));
const esbuild = require("esbuild");

const source = readFileSync(join(here, "../components/legal/LegalDocument.jsx"), "utf8");
assert.equal(source.includes("PRIVACY_CONTENT"), false);
assert.equal(source.includes("TERMS_CONTENT"), false);
assert.equal(source.includes("COPYRIGHT_CONTENT"), false);

const outdir = mkdtempSync(join(tmpdir(), "descall-legal-"));
const outfile = join(outdir, "bundle.mjs");

const entry = `
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleContext } from "./../context/localeContextInstance.js";
import PrivacyPage from "./../site/pages/PrivacyPage.jsx";
import TermsPage from "./../site/pages/TermsPage.jsx";
import CopyrightPage from "./../site/pages/CopyrightPage.jsx";
import LegalContentModal from "./../components/legal/LegalContentModal.jsx";

const PAGES = [
  ["privacy", PrivacyPage],
  ["terms", TermsPage],
  ["copyright", CopyrightPage],
];

function localeValue(locale) {
  // Minimal catalog for the strings the modal chrome uses (3.7.21: "Close" goes through t()).
  const tr = { Close: "Kapat" };
  return { locale, setLocale() {}, t: (key) => String((locale === "tr" && tr[key]) || key || ""), locales: [] };
}

export function renderPage(type, locale) {
  const Page = PAGES.find((row) => row[0] === type)?.[1];
  if (!Page) throw new Error("unknown page " + type);
  return renderToStaticMarkup(
    createElement(LocaleContext.Provider, { value: localeValue(locale) }, createElement(Page))
  );
}

export function renderModal(type, locale) {
  return renderToStaticMarkup(
    createElement(
      LocaleContext.Provider,
      { value: localeValue(locale) },
      createElement(LegalContentModal, { open: true, type, onClose() {} })
    )
  );
}
`;

await esbuild.build({
  stdin: {
    contents: entry,
    resolveDir: here,
    sourcefile: "legalPages.entry.jsx",
    loader: "jsx",
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile,
  jsx: "automatic",
  logLevel: "error",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [
    {
      name: "legal-selftest",
      setup(build) {
        build.onResolve({ filter: /^framer-motion$/ }, () => ({ path: "motion-shim", namespace: "motion-shim" }));
        build.onLoad({ filter: /.*/, namespace: "motion-shim" }, () => ({
          contents: `
            import { createElement } from "react";
            const DROP = new Set(["initial", "animate", "exit", "transition", "variants", "whileHover", "whileTap", "layout"]);
            export function useReducedMotion() { return true; }
            export function AnimatePresence({ children }) { return children; }
            function Motion({ children, ...rest }) {
              const dom = {};
              for (const [key, value] of Object.entries(rest)) {
                if (!DROP.has(key)) dom[key] = value;
              }
              return createElement("div", dom, children);
            }
            export const motion = new Proxy({}, { get: () => Motion });
          `,
          loader: "js",
          resolveDir: frontendRoot,
        }));
        build.onResolve({ filter: /\/LocaleContext$/ }, () => ({
          path: join(frontendRoot, "src/context/localeContextInstance.js"),
        }));
        build.onResolve({ filter: /\.css$/ }, () => ({ path: "css-stub", namespace: "css-stub" }));
        build.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({ contents: "", loader: "js" }));
        build.onResolve({ filter: /^react-dom$/ }, (args) => {
          if (args.importer.endsWith("LegalContentModal.jsx")) {
            return { path: "portal-shim", namespace: "portal-shim" };
          }
          return null;
        });
        build.onLoad({ filter: /.*/, namespace: "portal-shim" }, () => ({
          contents: "export function createPortal(children) { return children; }\n",
          loader: "js",
        }));
      },
    },
  ],
});

globalThis.window = globalThis;
globalThis.document = {
  body: {},
  documentElement: { style: {} },
  getElementById() {
    return null;
  },
  createElement() {
    return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {} };
  },
};
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});

const { renderPage, renderModal } = await import(pathToFileURL(outfile).href);

const expect = {
  privacy: {
    tr: ["Gizlilik Politikası", "Hesap bilgileri", "contact@descall.com"],
    en: ["Privacy Policy", "Data controller", "contact@descall.com"],
  },
  terms: {
    tr: ["Hizmet Şartları", "contact@descall.com"],
    en: ["Terms of Service", "contact@descall.com"],
  },
  copyright: {
    tr: ["Telif hakkı bildirimleri", "contact@descall.com"],
    en: ["Copyright notices", "contact@descall.com"],
  },
};

for (const type of Object.keys(expect)) {
  for (const locale of ["tr", "en"]) {
    const page = renderPage(type, locale);
    const modal = renderModal(type, locale);
    for (const needle of expect[type][locale]) {
      assert.ok(page.includes(needle), `${type} ${locale} page missing ${needle}`);
      assert.ok(modal.includes(needle), `${type} ${locale} modal missing ${needle}`);
    }
    assert.match(page, /id="legal-doc-title"/);
    assert.match(modal, /role="dialog"/);
    assert.match(modal, locale === "tr" ? />Kapat</ : />Close</);
    assert.doesNotMatch(page, /PRIVACY_CONTENT/);
  }
}

console.log("legalPages.selftest ok");
