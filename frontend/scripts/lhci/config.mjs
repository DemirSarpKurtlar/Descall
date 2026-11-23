#!/usr/bin/env node
// Lighthouse CI settings for .github/workflows/lighthouse.yml (single source of truth).
//
//   node scripts/lhci/config.mjs rc <mobile|desktop> [--port 4173] [--out dir]  -> prints a lighthouserc JSON
//   node scripts/lhci/config.mjs check-pages [--dist dist]                       -> fails if a page is gone
//
// Budgets start as WARNINGS: they are printed in the job log and the PR comment but never
// fail the job. Once a few main runs have given a baseline, make them hard failures with
// LHCI_BUDGET_LEVEL=error (workflow env / repository variable LHCI_BUDGET_LEVEL), or change
// DEFAULT_LEVEL below. Tighten a number only after main has met it for a week.
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDistPath } from "./serve-dist.mjs";

export const LHCI_VERSION = "0.16.1";
export const DEFAULT_PORT = 4173;
export const RUNS = 3;
export const DEFAULT_LEVEL = "warn";

/**
 * Key public pages. kind "prerendered" must exist as a static file in dist (marketing /
 * SEO pages from scripts/prerender-seo.mjs); kind "spa" is an app route served by the
 * index.html shell (logged-out state, backend stubbed).
 */
export const PAGES = [
  { id: "home", path: "/", kind: "prerendered", label: "Landing" },
  { id: "login", path: "/login", kind: "spa", label: "Login" },
  { id: "features", path: "/features", kind: "prerendered", label: "Features" },
  { id: "blog", path: "/blog", kind: "prerendered", label: "Blog" },
  { id: "blog-post", path: "/blog/best-discord-alternatives-2026", kind: "prerendered", label: "Blog post" },
];

export const PRESETS = ["mobile", "desktop"];

/**
 * Core Web Vitals "good" limits (web.dev) and a byte budget per preset. numericValue units:
 * LCP / TBT in ms, CLS unitless, total-byte-weight in bytes (transfer size).
 */
export const BUDGETS = {
  mobile: {
    "largest-contentful-paint": 2500,
    "cumulative-layout-shift": 0.1,
    "total-blocking-time": 300,
    "total-byte-weight": 1600 * 1024,
  },
  desktop: {
    "largest-contentful-paint": 1500,
    "cumulative-layout-shift": 0.1,
    "total-blocking-time": 200,
    "total-byte-weight": 1600 * 1024,
  },
};

/** Category score floors (0..1), same level as the budgets. */
export const CATEGORY_FLOORS = { performance: 0.8, accessibility: 0.9, "best-practices": 0.9, seo: 0.9 };

/**
 * Third-party / production hosts the CI browser must never reach: analytics would count
 * fake visits and the API must stay the local stub. Lighthouse blockedUrlPatterns syntax.
 */
export const BLOCKED_URL_PATTERNS = [
  "*posthog.com*",
  "*googletagmanager.com*",
  "*google-analytics.com*",
  "*doubleclick.net*",
  "*googleadservices.com*",
  "*googlesyndication.com*",
  "*des-call.onrender.com*",
  "*api.descall.com*",
  "*descall.com/api/*",
];

export function budgetLevel(env = process.env) {
  return String(env.LHCI_BUDGET_LEVEL || "").trim().toLowerCase() === "error" ? "error" : DEFAULT_LEVEL;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pageUrls(port = DEFAULT_PORT) {
  return PAGES.map((p) => `http://127.0.0.1:${port}${p.path}`);
}

/** lighthouserc object for one preset. */
export function buildRc(preset, { port = DEFAULT_PORT, outDir = `.lighthouseci-${preset}`, level = budgetLevel() } = {}) {
  if (!PRESETS.includes(preset)) throw new Error(`unknown preset ${preset}`);
  const assertions = {};
  for (const [audit, max] of Object.entries(BUDGETS[preset])) assertions[audit] = [level, { maxNumericValue: max }];
  for (const [cat, min] of Object.entries(CATEGORY_FLOORS)) assertions[`categories:${cat}`] = [level, { minScore: min }];
  // App routes (login) are noindex on purpose, so the SEO floor would always warn there.
  const { "categories:seo": _seo, ...appAssertions } = assertions;
  const urlPattern = (kind) => `^http://127\\.0\\.0\\.1:${port}(${PAGES.filter((p) => p.kind === kind).map((p) => escapeRe(p.path)).join("|")})$`;
  const settings = {
    blockedUrlPatterns: BLOCKED_URL_PATTERNS,
    chromeFlags: "--no-sandbox --disable-dev-shm-usage --headless=new",
    // Logged-out public pages only; no PWA category (removed from Lighthouse 12).
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  };
  if (preset === "desktop") settings.preset = "desktop";
  return {
    ci: {
      collect: {
        url: pageUrls(port),
        numberOfRuns: RUNS,
        startServerCommand: `node scripts/lhci/serve-dist.mjs --dist dist --port ${port}`,
        startServerReadyPattern: "lhci-serve ready",
        startServerReadyTimeout: 30000,
        settings,
      },
      assert: {
        assertMatrix: [
          { matchingUrlPattern: urlPattern("prerendered"), aggregationMethod: "median-run", assertions },
          { matchingUrlPattern: urlPattern("spa"), aggregationMethod: "median-run", assertions: appAssertions },
        ],
      },
      // Reports stay inside the workflow (artifact), never on temporary-public-storage.
      upload: { target: "filesystem", outputDir: outDir },
    },
  };
}

/** Pages whose dist file is missing (prerendered page renamed or dropped). */
export function missingPages(dist) {
  const root = resolve(dist);
  const isFile = (rel) => {
    try {
      return statSync(join(root, rel)).isFile();
    } catch {
      return false;
    }
  };
  return PAGES.filter((p) => {
    const hit = resolveDistPath(p.path, isFile);
    if (!hit) return true;
    return p.kind === "prerendered" ? hit.spa : false;
  }).map((p) => p.path);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, preset] = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
  };
  if (cmd === "rc") {
    const rc = buildRc(preset, { port: Number(arg("port", DEFAULT_PORT)), outDir: arg("out", `.lighthouseci-${preset}`) });
    process.stdout.write(`${JSON.stringify(rc, null, 2)}\n`);
  } else if (cmd === "check-pages") {
    const dist = arg("dist", "dist");
    if (!existsSync(join(dist, "index.html"))) {
      console.error(`[lhci] no build in ${dist}`);
      process.exit(1);
    }
    const missing = missingPages(dist);
    if (missing.length) {
      console.error(`[lhci] pages missing from the build (update PAGES in scripts/lhci/config.mjs): ${missing.join(", ")}`);
      process.exit(1);
    }
    console.log(`[lhci] ${PAGES.length} pages present in ${dist}`);
  } else {
    console.error("usage: config.mjs rc <mobile|desktop> [--port N] [--out dir] | check-pages [--dist dir]");
    process.exit(2);
  }
}
