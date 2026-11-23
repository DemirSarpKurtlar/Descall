// node src/components/admin/security/humanCheckCard.render.selftest.mjs
// Güvenlik Merkezi "İnsan doğrulaması" card rendered with react-dom/server in Turkish and
// English: enforcing with data, not set up, pinned by env, and loading. A crash, a missing
// string or a wrong control state fails CI.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../../..");
const out = mkdtempSync(join(tmpdir(), "hcc-"));
const J = (p) => JSON.stringify(join(src, p));
const entry = `
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import HumanCheckCard from ${J("components/admin/security/HumanCheckCard.jsx")};
export { SEC_CENTER_TR } from ${J("i18n/locales/secCenter.tr.js")};
export { SEC_CENTER_EN } from ${J("i18n/locales/secCenter.en.js")};
export function render(props) { return renderToStaticMarkup(h(HumanCheckCard, props)); }
`;
const file = join(out, "bundle.mjs");
await build({
  stdin: { contents: entry, resolveDir: src, loader: "jsx" },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: file,
  jsx: "automatic",
  logLevel: "silent",
  loader: { ".css": "empty", ".svg": "empty", ".png": "empty" },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});
const { render, SEC_CENTER_TR, SEC_CENTER_EN } = await import(pathToFileURL(file).href);
rmSync(out, { recursive: true, force: true });

function makeT(cat) {
  return (key, vars = {}) => {
    let s = key.split(".").slice(1).reduce((o, k) => (o == null ? undefined : o[k]), cat);
    assert.equal(typeof s, "string", `missing key ${key}`);
    s = s.replace(/\{(\w+), plural, [^{]*\{[^}]*\}(?: \w+ \{[^}]*\})* other \{([^}]*)\}\}/g, (_, v, other) => other.replace(/#/g, String(vars[v])));
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k])));
  };
}
const now = Date.parse("2026-11-23T12:30:00Z");
const series = { start: "2026-11-22T13:00:00.000Z", bucketMs: 3600000, pass: Array.from({ length: 24 }, (_, i) => i % 5), refused: Array.from({ length: 24 }, (_, i) => (i === 20 ? 9 : 0)), let: Array.from({ length: 24 }, () => 0) };
const live = {
  configured: true,
  source: "db",
  siteKey: "0x4AAA…k3Pq",
  hostnames: ["descall.com", "www.descall.com", "des-call.onrender.com"],
  updatedAt: new Date(now - 3 * 3600000).toISOString(),
  setting: "enforce",
  envOverride: null,
  mode: "enforce",
  enforcing: true,
  fallback: { usedThisHour: 2, fallbackGlobal: 60, fallbackPerIp: 3 },
  stats: { totals: { pass: 48, fail: 7, blocked: 2, fallback: 2, failOpen: 0, monitor: 0, challenged: 5 }, byAction: { register: { pass: 40, fail: 7, blocked: 2 }, login: { pass: 8, challenged: 5 } }, series, checks: 59, passRate: 81.4 },
};
const noop = () => {};
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

for (const [lang, cat] of [["tr", SEC_CENTER_TR], ["en", SEC_CENTER_EN]]) {
  const t = makeT(cat);
  const html = render({ t, locale: lang === "tr" ? "tr-TR" : "en-US", hc: live, now, loading: false, busy: false, onMode: noop });
  assert.ok(html.includes(esc(cat.human.title)) && html.includes(esc(cat.human.status.enforcing)), `${lang}: title + status`);
  assert.ok(html.includes(">48<") && html.includes(">9<"), `${lang}: counters (pass 48, stopped 7+2)`);
  assert.equal((html.match(/class="sc-hbar[ "]/g) || []).length, 24, `${lang}: 24 hourly bars`);
  for (const a of ["register", "social_signup", "password_reset", "login"]) assert.ok(html.includes(`data-action="${a}"`), `${lang}: row ${a}`);
  assert.ok(/data-testid="sc-human-mode-enforce"[^>]*disabled=""/.test(html) || /disabled=""[^>]*data-testid="sc-human-mode-enforce"/.test(html), `${lang}: the active mode button is disabled`);
  assert.ok(!/disabled=""[^>]*data-testid="sc-human-mode-off"/.test(html), `${lang}: other modes can be picked`);
  assert.ok(html.includes("aria-pressed=\"true\""), `${lang}: pressed state`);
  assert.ok(!html.includes("{"), `${lang}: no unfilled placeholder`);
}
{
  const t = makeT(SEC_CENTER_TR);
  const html = render({ t, locale: "tr-TR", hc: { configured: false, tableMissing: false, mode: "enforce", setting: "enforce", stats: null }, now, loading: false, busy: false, onMode: noop });
  assert.ok(html.includes(esc(SEC_CENTER_TR.human.status.notSetUp)) && html.includes(esc(SEC_CENTER_TR.human.setup)), "not set up: says how it gets set up");
  assert.equal((html.match(/data-testid="sc-human-mode-[a-z]+"[^>]*disabled=""|disabled=""[^>]*data-testid="sc-human-mode-/g) || []).length, 3, "no key: the switch is locked");
  const pinned = render({ t, locale: "tr-TR", hc: { ...live, envOverride: "off", mode: "off" }, now, loading: false, busy: false, onMode: noop });
  assert.ok(pinned.includes(esc(SEC_CENTER_TR.human.envLocked)), "env override explained");
  const sk = render({ t, locale: "tr-TR", hc: null, now, loading: true, busy: false, onMode: noop });
  assert.ok(sk.includes("aria-busy=\"true\""), "loading skeleton");
}
console.log("humanCheckCard.render.selftest.mjs: ok");
