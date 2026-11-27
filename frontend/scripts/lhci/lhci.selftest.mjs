// node scripts/lhci/lhci.selftest.mjs
// Lighthouse CI helpers: the dist server (clean URLs, SPA fallback, stub API, no path
// traversal, compression), the lighthouserc it generates (warn-only budgets, 3 runs, reports
// to the filesystem, production/analytics hosts blocked) and the PR comment (median run,
// deltas vs main, budget marks).
import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { apiStub, pickEncoding, resolveDistPath, startServer } from "./serve-dist.mjs";
import { BLOCKED_URL_PATTERNS, BUDGETS, LHCI_VERSION, PAGES, RUNS, budgetLevel, buildRc, missingPages } from "./config.mjs";
import { COMMENT_MARKER, budgetViolations, buildSummary, entryBundleSize, renderComment, scoreViolations, summarizePreset } from "./report.mjs";

// ── path resolution ─────────────────────────────────────────────────────────
const files = new Set(["index.html", "features.html", "blog.html", "blog/post-a.html", "de.html", "de/index.html", "assets/app-1.js", "robots.txt", "docs/index.html"]);
const isFile = (rel) => files.has(rel);
assert.deepEqual(resolveDistPath("/", isFile), { file: "index.html", spa: false });
assert.deepEqual(resolveDistPath("/features", isFile), { file: "features.html", spa: false }, "clean URL");
assert.deepEqual(resolveDistPath("/features?utm=x#top", isFile), { file: "features.html", spa: false });
assert.deepEqual(resolveDistPath("/blog/post-a", isFile), { file: "blog/post-a.html", spa: false });
assert.deepEqual(resolveDistPath("/de", isFile), { file: "de.html", spa: false }, "x.html wins over x/index.html like Vercel");
assert.deepEqual(resolveDistPath("/docs/", isFile), { file: "docs/index.html", spa: false });
assert.deepEqual(resolveDistPath("/login", isFile), { file: "index.html", spa: true }, "app route: SPA shell");
assert.deepEqual(resolveDistPath("/direct/123", isFile), { file: "index.html", spa: true });
assert.equal(resolveDistPath("/assets/missing-9.js", isFile), null, "missing asset is a 404, never the shell");
assert.equal(resolveDistPath("/../etc/passwd", isFile), null, "no traversal");
assert.equal(resolveDistPath("/%2e%2e/secret", isFile), null, "no encoded traversal");
assert.equal(resolveDistPath("/%E0%A4%A", isFile), null, "bad encoding");
assert.equal(apiStub("/api/auth/me").status, 401, "logged out");
assert.equal(apiStub("/api/servers/discover?x=1").status, 404);
assert.equal(pickEncoding("gzip, deflate, br, zstd"), "br");
assert.equal(pickEncoding("gzip"), "gzip");
assert.equal(pickEncoding(""), null);

// ── live server on a temporary dist ────────────────────────────────────────
const dist = mkdtempSync(join(tmpdir(), "lhci-dist-"));
try {
  mkdirSync(join(dist, "assets"));
  mkdirSync(join(dist, "blog"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>shell</title>" + "x".repeat(4000));
  writeFileSync(join(dist, "features.html"), "<!doctype html><title>features</title>");
  writeFileSync(join(dist, "blog.html"), "<!doctype html><title>blog</title>");
  writeFileSync(join(dist, "blog", "best-discord-alternatives-2026.html"), "<!doctype html><title>post</title>");
  writeFileSync(join(dist, "assets", "app-1.js"), "console.log(1)");
  writeFileSync(join(dist, "404.html"), "<!doctype html><title>404</title>");
  writeFileSync(join(tmpdir(), "lhci-outside.txt"), "secret");

  assert.deepEqual(missingPages(dist), [], "all measured pages present");
  const server = await startServer({ dist, port: 0, log: () => {} });
  const port = server.address().port;
  const raw = (path, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path, headers }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on("error", reject);
      req.end();
    });
  try {
    let r = await raw("/features");
    assert.equal(r.status, 200);
    assert.match(r.body.toString(), /<title>features/);
    assert.equal(r.headers["cache-control"], "no-cache");
    r = await raw("/login");
    assert.equal(r.status, 200);
    assert.match(r.body.toString(), /<title>shell/, "SPA route renders the shell");
    r = await raw("/", { "accept-encoding": "br" });
    assert.equal(r.headers["content-encoding"], "br");
    assert.match(brotliDecompressSync(r.body).toString(), /<title>shell/);
    r = await raw("/assets/app-1.js");
    assert.match(r.headers["cache-control"], /immutable/);
    assert.match(r.headers["content-type"], /javascript/);
    r = await raw("/assets/gone.js");
    assert.equal(r.status, 404);
    r = await raw("/%2e%2e/lhci-outside.txt");
    assert.equal(r.status, 404, "traversal refused");
    assert.doesNotMatch(r.body.toString(), /secret/);
    r = await raw("/api/auth/me");
    assert.equal(r.status, 401);
    assert.equal(JSON.parse(r.body.toString()).code, "LHCI_NO_BACKEND");
    r = await raw("/socket.io/?EIO=4&transport=polling");
    assert.equal(r.status, 404);
  } finally {
    server.close();
  }
  rmSync(join(dist, "features.html"));
  assert.deepEqual(missingPages(dist), ["/features"], "a renamed prerendered page is reported");
} finally {
  rmSync(dist, { recursive: true, force: true });
  rmSync(join(tmpdir(), "lhci-outside.txt"), { force: true });
}

// ── lighthouserc ───────────────────────────────────────────────────────────
assert.match(LHCI_VERSION, /^\d+\.\d+\.\d+$/, "pinned @lhci/cli version");
assert.equal(budgetLevel({}), "warn", "budgets warn until a baseline exists");
assert.equal(budgetLevel({ LHCI_BUDGET_LEVEL: "error" }), "error");
assert.equal(budgetLevel({ LHCI_BUDGET_LEVEL: "bogus" }), "warn");
for (const preset of ["mobile", "desktop"]) {
  const rc = buildRc(preset, { port: 4173, outDir: "/tmp/x", level: "warn" }).ci;
  assert.equal(rc.collect.numberOfRuns, 3);
  assert.equal(rc.collect.url.length, PAGES.length);
  assert.ok(rc.collect.url.every((u) => u.startsWith("http://127.0.0.1:4173/")), "local server only");
  assert.ok(rc.collect.url.includes("http://127.0.0.1:4173/") && rc.collect.url.includes("http://127.0.0.1:4173/login"), "landing and login measured");
  assert.equal(rc.upload.target, "filesystem", "reports never go to temporary-public-storage");
  const [pagesRule, appRule] = rc.assert.assertMatrix;
  assert.ok(rc.assert.assertMatrix.every((r) => r.aggregationMethod === "median-run"));
  for (const audit of ["largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time", "total-byte-weight"]) {
    assert.deepEqual(pagesRule.assertions[audit], ["warn", { maxNumericValue: BUDGETS[preset][audit] }], `${preset} ${audit} budget is a warning`);
    assert.deepEqual(appRule.assertions[audit], pagesRule.assertions[audit], "same budgets on app routes");
  }
  assert.ok(rc.assert.assertMatrix.every((r) => Object.values(r.assertions).every((a) => a[0] === "warn")), "nothing fails yet");
  assert.ok(pagesRule.assertions["categories:seo"] && !appRule.assertions["categories:seo"], "noindex app routes skip the SEO floor");
  const matched = (rule) => rc.collect.url.filter((u) => new RegExp(rule.matchingUrlPattern).test(u));
  assert.deepEqual(matched(appRule), ["http://127.0.0.1:4173/login"]);
  assert.equal(matched(pagesRule).length, PAGES.length - 1, "every other page is asserted");
  assert.deepEqual(rc.collect.settings.blockedUrlPatterns, BLOCKED_URL_PATTERNS);
  assert.ok(BLOCKED_URL_PATTERNS.some((p) => p.includes("posthog")) && BLOCKED_URL_PATTERNS.some((p) => p.includes("onrender")), "analytics and the production API are blocked");
  assert.equal(rc.collect.settings.preset, preset === "desktop" ? "desktop" : undefined);
  assert.match(rc.collect.startServerCommand, /serve-dist\.mjs --dist dist --port 4173/);
}
assert.equal(buildRc("mobile", { level: "error" }).ci.assert.assertMatrix[0].assertions["largest-contentful-paint"][0], "error", "LHCI_BUDGET_LEVEL=error makes budgets fail");
assert.throws(() => buildRc("tablet"));

// ── report ─────────────────────────────────────────────────────────────────
const lhr = (perf, lcp, cls, tbt, bytes) => ({
  categories: { performance: { score: perf }, accessibility: { score: 0.97 }, "best-practices": { score: 0.96 }, seo: { score: 1 } },
  audits: {
    "largest-contentful-paint": { numericValue: lcp },
    "cumulative-layout-shift": { numericValue: cls },
    "total-blocking-time": { numericValue: tbt },
    "total-byte-weight": { numericValue: bytes },
  },
});
const reports = {
  "a.json": lhr(0.91, 2100, 0.02, 120, 900 * 1024),
  "b.json": lhr(0.5, 9000, 0.3, 900, 3000 * 1024), // not the median run: ignored
  "c.json": lhr(0.72, 3100, 0.05, 250, 1200 * 1024),
};
const manifest = [
  { url: "http://127.0.0.1:4173/", isRepresentativeRun: true, jsonPath: "a.json", summary: { performance: 0.91 } },
  { url: "http://127.0.0.1:4173/", isRepresentativeRun: false, jsonPath: "b.json" },
  { url: "http://127.0.0.1:4173/login", isRepresentativeRun: true, jsonPath: "c.json" },
  { url: "http://127.0.0.1:4173/features", isRepresentativeRun: true, jsonPath: "missing.json", summary: { performance: 0.88 } },
];
const mobile = summarizePreset(manifest, (p) => {
  if (!reports[p]) throw new Error("ENOENT");
  return reports[p];
});
assert.equal(mobile["/"].scores.performance, 0.91, "median run only");
assert.equal(mobile["/login"].metrics.lcp, 3100);
assert.equal(mobile["/features"].scores.performance, 0.88, "summary used when the report JSON is missing");
assert.equal(mobile["/features"].metrics.lcp, null);
const current = buildSummary({ mobile, desktop: {} }, { sha: "1234567890abcdef", createdAt: "2026-11-24T00:00:00Z" });
assert.equal(current.runs, RUNS);
const over = budgetViolations(current);
assert.deepEqual(over.map((o) => `${o.path}:${o.metric}`), ["/login:lcp"], "login LCP 3.1 s is over the 2.5 s mobile budget");

let md = renderComment(current, null, { runUrl: "https://github.com/o/r/actions/runs/1", level: "warn" });
assert.ok(md.startsWith(COMMENT_MARKER), "sticky marker first");
assert.match(md, /## Lighthouse CI/);
assert.match(md, /henüz `main` ölçümü yok/, "Turkish, no baseline yet");
assert.match(md, /\| Sayfa \| Performans \| Erişilebilirlik \| En iyi uygulamalar \| SEO \|/);
assert.match(md, /\| `\/` \| 91 \| 97 \| 96 \| 100 \|/);
assert.match(md, /\| `\/login` \| \*\*72\*\* \|/, "performance under 90 in bold");
assert.match(md, /\*\*3 bütçe aşıldı\*\* \(şimdilik yalnızca uyarı, kontrolü düşürmez\): `\/login` performans 72 < 90, `\/features` performans 88 < 90, mobil `\/login` LCP 3,10 sn > 2,50 sn/);
assert.match(md, /\*\*3,10 sn\*\*/, "over-budget lab value in bold");
assert.match(md, /<details><summary>Sayfa başına laboratuvar ölçümleri \(LCP, TBT, CLS\)<\/summary>/);
assert.match(md, /\[Tam raporlar\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/1\)/);
assert.match(md, /\[Descall yönetici › Performans'ta aç\]\(https:\/\/descall\.com\/admin\/panel\?tab=perf#perf=[A-Za-z0-9_-]+\)/);
assert.doesNotMatch(md, /temporary-public-storage/);
assert.doesNotMatch(md, /[\u{1F300}-\u{1FAFF}]/u, "no emoji");

const baseline = buildSummary(
  { mobile: { "/": { scores: { performance: 0.95, accessibility: 0.97, "best-practices": 0.96, seo: 1 }, metrics: { lcp: 1900, cls: 0.02, tbt: 80, bytes: 850 * 1024 } } }, desktop: {} },
  { sha: "abcdef0123456", createdAt: "2026-11-20T00:00:00Z", bundle: { raw: 600000, gzip: 211800, files: 1 } },
);
const withBundle = { ...current, bundle: { raw: 700000, gzip: 250000, files: 1 } };
md = renderComment(withBundle, baseline, { level: "error" });
assert.match(md, /`1234567` commit'i `main` \(`abcdef0`, 2026-11-20\) ile karşılaştırıldı · 3 sayfa · 3 çalıştırmanın ortancası/);
assert.match(md, /\| `\/` \| 91 ▼ -4 \| 97 \| 96 \| 100 \|/, "score deltas vs main");
assert.match(md, /\| `\/` \| 2,10 sn \(\+0,20\) \| 0,020 \| 120 ms \(\+40\) \| 900 KB \(\+50 KB\) \|/, "lab deltas vs main");
assert.match(md, /Ana paket \*\*\+38,2 KB\*\* gzip/);
assert.match(md, /bunlar kontrolü düşürür/);
assert.match(renderComment(current, { version: 99, presets: {} }), /henüz `main` ölçümü yok/, "an incompatible baseline is ignored");
assert.deepEqual(scoreViolations(current).map((o) => o.path), ["/login", "/features"]);

// entry bundle size from dist/index.html
const distDir = mkdtempSync(join(tmpdir(), "lhci-dist-"));
mkdirSync(join(distDir, "assets"));
writeFileSync(join(distDir, "index.html"), '<script type="module" crossorigin src="/assets/index-abc.js"></script>');
writeFileSync(join(distDir, "assets", "index-abc.js"), "console.log(1);".repeat(400));
const b = entryBundleSize(distDir);
assert.ok(b && b.files === 1 && b.raw === 6000 && b.gzip > 0 && b.gzip < b.raw);
assert.equal(entryBundleSize(join(distDir, "nope")), null);
rmSync(distDir, { recursive: true, force: true });

console.log("lhci selftest OK");
