// Electron always-on-top voice overlay (2.11.8): Liquid Glass card, theme tint,
// clear on/off states, press feedback, reduced motion, and a safe update path.
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { buildOverlayHtml, OVERLAY_WIDTH, OVERLAY_HEIGHT } = require("./overlayHtml.cjs");
const html = buildOverlayHtml();

// --- material and states (source shape) ---
assert.equal(/#1e1f22|#2b2d31|#3c1618/.test(html), false, "the flat Discord-grey slab is gone");
assert.match(html, /rgba\(22, 24, 34, \.9\d+\)/, "near-opaque tinted base: nothing behind reads through");
assert.match(html, /rgba\(var\(--ov-brand\), \.2\d\)/, "card tint follows the theme accent");
assert.match(html, /inset 0 1px 0 rgba\(255,255,255,\.2\d\)/, "thin specular top edge");
assert.match(html, /\.btn:active \{ transform:scale\(\.96\)/, "instant press feedback");
assert.match(html, /\.btn:hover/);
assert.match(html, /\.btn:focus-visible/);
assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transform:none/);
assert.match(html, /@media \(prefers-reduced-transparency: reduce\)/);
assert.match(html, /grid-template-columns:repeat\(3, 1fr\)/, "three equal buttons");
assert.match(html, /\.btn\.leave \{[^}]*rgba\(255,69,58,/, "leave is red-tinted glass");
assert.equal(/&#127908;|&#128263;|&#127911;|&#128222;/.test(html), false, "no emoji glyphs as icons");
assert.ok(OVERLAY_WIDTH >= 280 + 2 * 12 && OVERLAY_HEIGHT >= 100, "window leaves room for the shadow");

// overlayWindow.cjs uses this markup
const win = fs.readFileSync(path.join(here, "overlayWindow.cjs"), "utf8");
assert.match(win, /require\('\.\/overlayHtml\.cjs'\)/);
assert.equal(/background:#1e1f22/.test(win), false);

// --- behaviour: run the inline script against a tiny fake DOM ---
function el(id) {
  const attrs = {};
  const classes = new Set();
  return {
    id, attrs, hidden: false, textContent: "", innerHTML: "", title: "", style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
    classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); }, contains: (c) => classes.has(c) },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    set src(v) { attrs.src = v; }, get src() { return attrs.src; },
  };
}
const ids = ["card", "title", "status", "avInit", "avImg", "muteBtn", "deafenBtn", "leaveBtn"];
const els = Object.fromEntries(ids.map((i) => [i, el(i)]));
const rootStyle = { props: {}, setProperty(k, v) { this.props[k] = v; } };
const actions = [];
const ctx = {
  document: { getElementById: (i) => els[i], documentElement: { style: rootStyle, lang: "" } },
  window: { overlayAPI: { action: (a) => actions.push(a) } },
  Date, setInterval: () => 1, clearInterval: () => {},
};
ctx.window.document = ctx.document;
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
vm.runInNewContext(script, Object.assign(ctx, { window: Object.assign(ctx.window, {}) }));
const update = ctx.window.__overlayUpdate;
assert.equal(typeof update, "function");

update({ title: "cinar.baskin", connected: true, kind: "dm", since: Date.now() - 65_000, lang: "tr", brandRgb: "34,199,214", avatarUrl: "" });
assert.equal(els.title.textContent, "cinar.baskin");
assert.match(els.status.textContent, /^Bağlı · 01:0[5-6]$/);
assert.equal(els.avInit.textContent, "C");
assert.equal(rootStyle.props["--ov-brand"], "34,199,214", "theme accent applied");
assert.equal(els.muteBtn.getAttribute("aria-pressed"), "false");
assert.equal(els.muteBtn.getAttribute("aria-label"), "Mikrofonu kapat");
assert.equal(els.leaveBtn.getAttribute("aria-label"), "Aramayı bitir");
assert.ok(els.card.classList.contains("is-live"));

update({ muted: true, deafened: true });
assert.ok(els.muteBtn.classList.contains("is-off"));
assert.equal(els.muteBtn.getAttribute("aria-pressed"), "true");
assert.equal(els.muteBtn.getAttribute("aria-label"), "Mikrofonu aç");
assert.ok(els.deafenBtn.classList.contains("is-off"));
assert.match(els.muteBtn.innerHTML, /x1="2" x2="22"/, "slashed mic icon when muted");

update({ pending: true });
assert.equal(els.status.textContent, "Aranıyor…");
assert.ok(els.card.classList.contains("is-pending"));

// unsafe values are ignored
update({ brandRgb: "red; background:url(x)", avatarUrl: "javascript:alert(1)", pending: false });
assert.equal(rootStyle.props["--ov-brand"], "34,199,214");
assert.equal(els.avImg.hidden, true);
assert.equal(els.avImg.getAttribute("src"), null);
update({ avatarUrl: "https://x.supabase.co/a.png" });
assert.equal(els.avImg.hidden, false);
assert.equal(els.avImg.getAttribute("src"), "https://x.supabase.co/a.png");

update({ kind: "server", title: "Genel", lang: "en", avatarUrl: "" });
assert.match(els.status.textContent, /^Voice channel · /);
assert.equal(els.leaveBtn.getAttribute("aria-label"), "Leave");
assert.match(els.avInit.innerHTML, /<svg/);

els.muteBtn.onclick(); els.deafenBtn.onclick(); els.leaveBtn.onclick();
assert.deepEqual(actions, ["mute", "deafen", "leave"]);

console.log("overlayHtml selftest ok");
