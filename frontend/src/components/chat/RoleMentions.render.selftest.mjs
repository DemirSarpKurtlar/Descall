// Messaging phase 5: renders the @ list with people + roles + @everyone / @here
// and a bubble with a role mention, in Node (esbuild + react-dom/server), so a
// role item without `user` or a pill render error fails CI.
//   node src/components/chat/RoleMentions.render.selftest.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");
const out = mkdtempSync(join(tmpdir(), "rolemention-"));
const entry = `
import { renderToString } from "react-dom/server";
import { createElement as h } from "react";
import { LocaleProvider } from ${JSON.stringify(join(src, "context/LocaleContext.jsx"))};
import { UserPicker } from ${JSON.stringify(join(here, "SlashCommandMenu.jsx"))};
import MessageContent from ${JSON.stringify(join(here, "MessageContent.jsx"))};
import { registerRoles, roleSuggestions } from ${JSON.stringify(join(src, "lib/roleMentions.js"))};
export { registerRoles, roleSuggestions };
export function picker(props) { return renderToString(h(LocaleProvider, null, h(UserPicker, props))); }
export function bubble(text) { return renderToString(h(LocaleProvider, null, h(MessageContent, { text }))); }
`;
const file = join(out, "bundle.mjs");
try {
  await build({
    stdin: { contents: entry, resolveDir: src, loader: "jsx" },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: file,
    jsx: "automatic",
    logLevel: "silent",
    loader: { ".css": "empty", ".png": "empty", ".svg": "empty", ".webp": "empty", ".gif": "empty", ".woff2": "empty", ".mp3": "empty" },
    define: { "import.meta.env": JSON.stringify({ MODE: "test", DEV: false, PROD: true }) },
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  });

  const store = new Map();
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.navigator ??= { userAgent: "node" };
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.location ??= { hostname: "descall.com", href: "https://descall.com/", pathname: "/", search: "", hash: "", origin: "https://descall.com", protocol: "https:" };
  globalThis.addEventListener ??= () => {};
  globalThis.removeEventListener ??= () => {};
  globalThis.dispatchEvent ??= () => true;
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, dataset: {} });
  globalThis.document ??= { documentElement: el(), body: el(), head: el(), createElement: el, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, removeEventListener() {}, visibilityState: "visible", hidden: false, cookie: "" };
  for (const k of ["HTMLElement", "SVGElement", "Element", "Node", "Event", "CustomEvent", "Image", "ResizeObserver", "IntersectionObserver", "MutationObserver"]) globalThis[k] ??= class { observe() {} disconnect() {} unobserve() {} };
  globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 0);
  globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
  const origError = console.error;
  console.error = (...a) => { if (/useLayoutEffect does nothing on the server/.test(String(a[0]))) return; origError(...a); };

  const m = await import(pathToFileURL(file).href);
  const R1 = "0a1b2c3d-0000-4000-8000-000000000001";
  const roles = [{ id: R1, name: "Tasarım Ekibi", color: 0xe67e22, position: 2, mentionable: true }];
  const server = { id: "s1", isOwner: true, roles };
  const sections = [
    { id: "all", label: "Sunucu", items: [{ user: { id: "u1", username: "ayse", displayName: "Ayşe" }, presence: "online" }] },
    { id: "roles", label: "Roller", items: m.roleSuggestions(server, "") },
  ];
  const html = m.picker({ sections, activeIndex: 1, query: "" });
  assert.ok(html.indexOf("ayse") < html.indexOf("Tasarım Ekibi"), "people first, then roles");
  assert.ok(html.includes('data-testid="mention-role"'), "role row");
  assert.ok(html.includes("#e67e22"), "role colour");
  assert.ok(html.includes('data-testid="mention-everyone"') && html.includes('data-testid="mention-here"'), "@everyone / @here for the owner");

  m.registerRoles(roles, "s1");
  const bubble = m.bubble(`Bakın <@&${R1}> lütfen`);
  assert.ok(bubble.includes("msg-role-mention") && bubble.includes("Tasarım Ekibi"), "pill with the role name");
  assert.ok(bubble.includes("--role-c:#e67e22"), "pill in the role colour");
  assert.ok(!bubble.includes("&lt;@&amp;"), "no raw token");
  const unknown = m.bubble("<@&0a1b2c3d-0000-4000-8000-0000000000ff>");
  assert.ok(unknown.includes("msg-role-mention"), "unknown role still a pill");
  console.log("RoleMentions render selftest OK");
} finally {
  rmSync(out, { recursive: true, force: true });
}
