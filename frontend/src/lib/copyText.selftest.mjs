// lib/copyText.js: fallback order, never rejects, and no direct writeText left in the app.
// Run from frontend/: node src/lib/copyText.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { copyText, copyTextResult, COPY_TEXT_MAX_CHARS } from "./copyText.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");
const front = join(src, "..");

/** Fake browser: each layer can succeed, refuse, throw or be missing. Records the call order. */
function fakeEnv({ web = "ok", electron = "ok", exec = "ok" } = {}) {
  const calls = [];
  const written = [];
  const nav = web === "missing" ? {} : {
    clipboard: {
      writeText: (v) => {
        calls.push("clipboard");
        if (web === "deny") return Promise.reject(Object.assign(new Error("Write permission denied."), { name: "NotAllowedError" }));
        if (web === "throw") throw new Error("sync throw");
        written.push(["clipboard", v]);
        return Promise.resolve();
      },
    },
  };
  const win = electron === "missing" ? {} : {
    electronAPI: {
      writeClipboardText: (v) => {
        calls.push("electron");
        if (electron === "deny") return Promise.resolve({ ok: false, error: "write_failed" });
        if (electron === "reject") return Promise.reject(new Error("E_UNTRUSTED_SENDER"));
        if (electron === "garbage") return Promise.resolve(true);
        written.push(["electron", v]);
        return Promise.resolve({ ok: true });
      },
    },
  };
  const body = { children: [], appendChild(el) { this.children.push(el); } };
  const doc = exec === "missing" ? { body } : {
    body,
    activeElement: null,
    createElement: () => {
      const el = {
        value: "",
        style: {},
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        select() { doc.selected = this; },
        remove() { body.children = body.children.filter((c) => c !== this); },
      };
      return el;
    },
    execCommand: (cmd) => {
      calls.push("execCommand");
      assert.equal(cmd, "copy");
      if (exec === "throw") throw new Error("execCommand blew up");
      if (exec === "deny") return false;
      written.push(["execCommand", doc.selected?.value]);
      return true;
    },
  };
  return { deps: { navigator: nav, window: win, document: doc }, calls, written, body };
}

// 1. Web API works: used alone.
{
  const e = fakeEnv();
  assert.deepEqual(await copyTextResult("hi", e.deps), { ok: true, method: "clipboard" });
  assert.deepEqual(e.calls, ["clipboard"]);
  assert.deepEqual(e.written, [["clipboard", "hi"]]);
}

// 2. The Windows bug: writeText rejects with NotAllowedError -> Electron IPC.
{
  const e = fakeEnv({ web: "deny" });
  assert.deepEqual(await copyTextResult("@kullanici", e.deps), { ok: true, method: "electron" });
  assert.deepEqual(e.calls, ["clipboard", "electron"]);
  assert.deepEqual(e.written, [["electron", "@kullanici"]]);
}

// 3. Web API throws synchronously, Electron refuses -> hidden textarea; textarea removed.
{
  const e = fakeEnv({ web: "throw", electron: "deny" });
  assert.deepEqual(await copyTextResult("link", e.deps), { ok: true, method: "execCommand" });
  assert.deepEqual(e.calls, ["clipboard", "electron", "execCommand"]);
  assert.deepEqual(e.written, [["execCommand", "link"]]);
  assert.equal(e.body.children.length, 0, "textarea removed");
}

// 4. No web API, IPC rejects, a non-{ok:true} answer does not count as success.
{
  const e = fakeEnv({ web: "missing", electron: "reject" });
  assert.equal((await copyTextResult("x", e.deps)).method, "execCommand");
  const g = fakeEnv({ web: "deny", electron: "garbage" });
  assert.equal((await copyTextResult("x", g.deps)).method, "execCommand");
}

// 5. Browser (no electronAPI): web -> execCommand.
{
  const e = fakeEnv({ web: "deny", electron: "missing" });
  assert.equal((await copyTextResult("x", e.deps)).method, "execCommand");
  assert.deepEqual(e.calls, ["clipboard", "execCommand"]);
}

// 6. Everything fails or throws: resolves false, never rejects.
for (const combo of [
  { web: "deny", electron: "deny", exec: "deny" },
  { web: "throw", electron: "reject", exec: "throw" },
  { web: "missing", electron: "missing", exec: "missing" },
]) {
  const e = fakeEnv(combo);
  assert.equal(await copyText("x", e.deps), false, JSON.stringify(combo));
  assert.equal(e.body.children.length, 0);
}
assert.equal(await copyText("x", { navigator: undefined, window: undefined, document: undefined }), false);

// 7. Values: null -> "", numbers stringified, over the cap refused without touching anything.
{
  const e = fakeEnv();
  assert.equal(await copyText(null, e.deps), true);
  assert.equal(await copyText(42, e.deps), true);
  assert.deepEqual(e.written, [["clipboard", ""], ["clipboard", "42"]]);
  const big = fakeEnv();
  assert.equal(await copyText("a".repeat(COPY_TEXT_MAX_CHARS + 1), big.deps), false);
  assert.deepEqual(big.calls, []);
}

// 8. Source shape: no component writes the clipboard text itself.
const SKIP = new Set(["node_modules", "dist"]);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?|mjs)$/.test(name) && !/\.selftest\.|\.test\./.test(name)) out.push(p);
  }
  return out;
}
const offenders = [];
for (const file of walk(src)) {
  const rel = relative(front, file).split("\\").join("/");
  if (rel === "src/lib/copyText.js") continue;
  const text = readFileSync(file, "utf8");
  if (/clipboard\??\.writeText\b/.test(text)) offenders.push(`${rel}: clipboard.writeText`);
  if (/execCommand\(\s*["']copy["']/.test(text)) offenders.push(`${rel}: execCommand("copy")`);
  if (/async function copyText\s*\(/.test(text)) offenders.push(`${rel}: local copyText()`);
}
assert.deepEqual(offenders, [], "copy through src/lib/copyText.js only");

// 9. Desktop wiring: the bridge, the IPC handler and the permission handlers.
const preload = readFileSync(join(front, "electron/preload.cjs"), "utf8");
const adminPreload = readFileSync(join(front, "electron/adminPreload.cjs"), "utf8");
const main = readFileSync(join(front, "electron/main.cjs"), "utf8");
for (const [name, text] of [["preload.cjs", preload], ["adminPreload.cjs", adminPreload]]) {
  assert.match(text, /writeClipboardText:[^\n]*\n?[^\n]*ipcRenderer\.invoke\('clipboard:write-text'/, `${name} bridges clipboard:write-text`);
}
assert.match(main, /trustedHandle\('clipboard:write-text'/, "main handles clipboard:write-text behind the sender check");
assert.doesNotMatch(main, /callback\(MEDIA_PERMISSIONS\.includes\(permission\)\)/, "request handler is not the media-only list");
assert.match(main, /setPermissionRequestHandler\([^)]*\) => \{\s*callback\(appPermissionAllowed\(/, "request handler uses appPermissionAllowed");
assert.match(main, /setPermissionCheckHandler\([^)]*\) => \{\s*return appPermissionAllowed\(/, "check handler uses appPermissionAllowed");

console.log("copyText.selftest: ok");
