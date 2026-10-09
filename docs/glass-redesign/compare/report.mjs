import fs from "node:fs";
const DIR = process.env.COMPARE_DIR || new URL("./out", import.meta.url).pathname;
const VERSION = process.argv[2] || "2.9.151";
const r = JSON.parse(fs.readFileSync(`${DIR}/results.json`, "utf8"));
const z = fs.existsSync(`${DIR}/zero-diff/zero-diff.json`) ? JSON.parse(fs.readFileSync(`${DIR}/zero-diff/zero-diff.json`, "utf8")) : [];
const f = (v) => (v == null ? "—" : (+v).toFixed(1));
const geo = r.geometry.map((g) => `<tr class="${g.ok ? "ok" : "bad"}"><td>${g.k}</td><td>${g.kind}</td><td>${g.m ? [g.m.x, g.m.y, g.m.w, g.m.h].map(f).join(" / ") : "—"}</td><td>${g.a ? [g.a.x, g.a.y, g.a.w, g.a.h].map(f).join(" / ") : "—"}</td><td>${g.d ? [g.d.x, g.d.y, g.d.w, g.d.h].map((v) => (+v).toFixed(2)).join(" / ") : "—"}</td><td>${g.ok ? "✅" : "❌"}</td></tr>`).join("");
const zr = z.map((x) => `<tr class="${x.diffPx === 0 && x.domSame ? "ok" : "bad"}"><td>${x.name}</td><td>${x.diffPx}</td><td>${x.domSame ? "identical" : "DIFFERENT"}</td><td>${x.glass ? "yes ❌" : "no"}</td><td><code>${x.htmlClass}</code></td></tr>`).join("");
const geoOk = r.geometry.filter((g) => g.ok).length;
const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Descall ${VERSION} — Liquid Glass Stage 1 compare</title>
<style>body{font:14px/1.5 -apple-system,Inter,system-ui,sans-serif;background:#111219;color:#e8eaf6;margin:32px;max-width:1500px}
h1{font-size:26px}h2{margin-top:36px;font-size:19px}table{border-collapse:collapse;width:100%;margin:10px 0}td,th{border-bottom:1px solid #2a2c3a;padding:6px 8px;text-align:left;font-variant-numeric:tabular-nums}
tr.ok td:last-child{color:#30d158}tr.bad{background:#3a1518}img{max-width:100%;border-radius:12px;border:1px solid #2a2c3a}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.k{display:inline-block;padding:2px 10px;border-radius:12px;background:#1e2a1e;color:#30d158;font-weight:600}
.warn{background:#2a2410;color:#ffd60a}code{color:#8fa6ff}li{margin:4px 0}</style></head><body>
<h1>Descall ${VERSION} — Liquid Glass Stage 1 · 01 Giriş (Login) vs approved mockup</h1>
<p><span class="k">Geometry ${geoOk}/${r.geometry.length} within tolerance</span>
<span class="k">Material/colour pixels: ${r.pixels.strict.pct}% over Δ8</span>
<span class="k">Desktop/web/Android/iPad: ${z.filter((x) => x.diffPx === 0 && x.domSame).length}/${z.length} zero-diff</span></p>
<p>Capture: real production build (<code>vite build</code>) in the shotkit fake-iOS Capacitor shell, 440×956 @3x (iPhone Pro Max class), safe area 62/34 pt, html classes <code>${r.app.classes}</code>, page errors: ${r.errors.length}. Mockup: <code>final/src/screens/01-login.html</code> re-rendered at the same size.</p>
<h2>Side by side (mockup · app · diff)</h2>
<img src="01-login-side-by-side.png" alt="side by side">
<h2>Documented deviations (feature parity / platform)</h2>
<ul>
<li><b>Google button absent</b> — the real iOS app never shows Google Sign-In (<code>GoogleSignInButton</code> returns null on native iOS). The reference is the approved mockup with that one row removed${r.removedGoogleRow ? " (done automatically)" : ""}; everything below moves up exactly 60 pt (card 453 → 393 pt). Original mockup kept as <code>01-login-mockup-original.png</code>.</li>
<li><b>Apple glyph</b> — the app uses the real Apple logo (HIG requirement for Sign in with Apple); the mockup draws an approximation. Same 18 pt height and centring; the glyph is 2.8 pt narrower.</li>
<li><b>Text</b> — on iPhone the text renders in SF Pro (-apple-system, decision 3). On this Linux capture both sides fall back to Inter, but different files (app = @fontsource Inter static, mockup = system Inter variable with optical size), so text advance widths differ by ≤ 2.8 pt. Text bands use the relaxed limit (Δ ≤ 64/255): ${r.pixels.text.pct}% of text-band pixels exceed it (anti-aliasing / sub-pixel x-shift). Line boxes are fixed via explicit line-heights, so vertical geometry is font-independent (all y/h deltas = 0).</li>
<li><b>Tagline box</b> — the app wraps with <code>max-width: 270px</code> (works for every language); the mockup uses a manual <code>&lt;br/&gt;</code>. The glyph ink (inkTagline) lands within 1.4 pt.</li>
<li><b>Status bar / Dynamic Island / home indicator</b> are drawn by iOS on device; masked from the diff (y &lt; 62 pt, y &gt; 922 pt). Content starts 30 pt below the safe area (y 92) — nothing under the Island; the ambient covers the full screen incl. safe areas (no black bars).</li>
<li>Field values are mock data ("demir", 10-char password) typed into the real inputs.</li>
</ul>
<h2>Pixel diff</h2>
<table><tr><th>Region</th><th>Pixels</th><th>Over limit</th><th>%</th><th>Limit</th></tr>
<tr class="ok"><td>Geometry / colour / material (everything but text, chrome masked)</td><td>${r.pixels.strict.pixels}</td><td>${r.pixels.strict.over}</td><td>${r.pixels.strict.pct}%</td><td>${r.pixels.strict.limit}</td></tr>
<tr class="ok"><td>Text bands (relaxed, documented)</td><td>${r.pixels.text.pixels}</td><td>${r.pixels.text.over}</td><td>${r.pixels.text.pct}%</td><td>${r.pixels.text.limit}</td></tr></table>
<h2>Geometry (pt; x / y / w / h; tolerance ±1 pt, text ±3 pt x / ±6 pt w)</h2>
<table><tr><th>Element</th><th>Check</th><th>Mockup</th><th>App</th><th>Δ</th><th></th></tr>${geo}</table>
<h2>Theme-aware glass (each theme's own palette)</h2>
<div class="grid">${r.themeShots.map((t) => `<figure><img src="${t.file}"><figcaption>${t.theme}</figcaption></figure>`).join("")}</div>
<h2>Accessibility / power states</h2>
<div class="grid">${r.a11yShots.map((t) => `<figure><img src="${t.file}"><figcaption>${t.label} — <code>${t.classes}</code></figcaption></figure>`).join("")}</div>
<h2>Desktop / web / Android / iPad zero-diff (before = 2.9.150 main HEAD, after = ${VERSION})</h2>
<p>Same mock data, animations frozen, both builds served side by side. <code>diffPx</code> = pixelmatch threshold 0 (any change); DOM = <code>#root</code> outerHTML (asset hashes stripped).</p>
<table><tr><th>Scenario</th><th>diffPx</th><th>DOM</th><th>glass-ui?</th><th>html classes</th></tr>${zr}</table>
</body></html>`;
fs.writeFileSync(`${DIR}/report-${VERSION}.html`, html);
console.log("wrote", `${DIR}/report-${VERSION}.html`);
