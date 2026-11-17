// Failed API responses reach the UI in the viewer's language (polish i18n-a11y-01):
// the fetch wrappers build their Error with httpError(), so `setError(err.message)`
// call sites never show the server's raw English.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { loadI18nCatalogs } = await import("../i18n/index.js");
const { setRuntimeLocale } = await import("../i18n/runtime.js");
await loadI18nCatalogs("tr");
setRuntimeLocale("tr");
const { httpError, serverErrorText } = await import("./httpError.js");

const e = httpError({ error: "User not found." }, 404);
assert.equal(e.message, "Kullanıcı bulunamadı.");
assert.equal(e.status, 404);
assert.equal(e.serverText, "User not found.");

// Templated server errors use errorKey / errorVars.
const tpl = serverErrorText({ error: "x", errorKey: "Server name must be {min}–{max} characters.", errorVars: { min: 2, max: 100 } });
assert.ok(/2/.test(tpl) && /100/.test(tpl) && !/must be/.test(tpl), `templated error translated: ${tpl}`);

// `message` bodies and empty bodies.
assert.equal(serverErrorText({ message: "Internal server error." }), "Sunucu hatası oluştu.");
assert.equal(httpError({}, 500).message, "Bir şeyler ters gitti.");
assert.equal(httpError(null, 502).message, "Bir şeyler ters gitti.");

setRuntimeLocale("en");
assert.equal(httpError({ error: "User not found." }, 404).message, "User not found.");

// Every fetch wrapper goes through it.
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
for (const f of ["./authedHttp.js", "./servers.js", "./directory.js", "./groups.js"]) {
  const src = read(f);
  assert.ok(src.includes("httpError("), `${f} builds errors with httpError()`);
  assert.ok(!/new Error\((data|body)\?\.error/.test(src), `${f} has no raw server-text Error`);
}
// Socket friend errors are translated where they are shown inline.
assert.ok(read("../components/layout/ServerSidebar.jsx").includes('serverMessage(payload, "message") || t("Friend action failed.")'));
assert.ok(read("../App.jsx").includes('serverMessage(payload, "message") || t("Friend action failed.")'));

console.log("httpError.selftest: ok");
