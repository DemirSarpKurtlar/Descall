/**
 * siteNestedText.js: the marketing site resolves the passkey button's dotted keys
 * ("passkey.login.button.passkey") in all seven languages instead of showing the raw key.
 * node src/site/siteNestedText.selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { isNestedKey, nestedLookup, preloadNested, onNestedCatalog, resetNestedCatalogs } from "./siteNestedText.js";

const LOCALES = ["en", "tr", "de", "es", "fr", "pt-BR", "ru"];
const STYLES = ["passkey", "face", "finger", "hello"];

assert.equal(isNestedKey("passkey.login.button.passkey"), true);
assert.equal(isNestedKey("Sign in"), false, "English phrases are not nested keys");
assert.equal(isNestedKey("passkey"), false);
assert.equal(isNestedKey("other.namespace.key"), false, "only the namespaces this module serves");
assert.equal(nestedLookup("Sign in", "tr"), undefined);

// Before the namespace arrives: "" (never the raw key), and the load starts by itself.
resetNestedCatalogs();
const heard = [];
const off = onNestedCatalog((id, ns) => heard.push(`${ns}:${id}`));
assert.equal(nestedLookup("passkey.login.button.passkey", "tr"), "", "loading: empty, not the raw key");
await preloadNested("passkey", "tr");
assert.ok(heard.includes("passkey:tr") && heard.includes("passkey:en"), `listeners hear the loads (${heard.join(", ")})`);
assert.equal(nestedLookup("passkey.login.button.passkey", "tr"), "Passkey ile giriş yap");
off();

for (const id of LOCALES) {
  await preloadNested("passkey", id);
  for (const style of STYLES) {
    const key = `passkey.login.button.${style}`;
    const text = nestedLookup(key, id);
    assert.ok(typeof text === "string" && text.trim() && !text.startsWith("passkey."), `${id} ${key}: ${text}`);
  }
  for (const key of ["passkey.login.note", "passkey.signIn.busy", "passkey.state.retry"]) {
    const text = nestedLookup(key, id);
    assert.ok(text && !text.startsWith("passkey."), `${id} ${key}: ${text}`);
  }
}
assert.equal(nestedLookup("passkey.login.button.passkey", "en"), "Sign in with a passkey");
// A key no catalog has: undefined (the provider then shows the key, as for any other miss).
assert.equal(nestedLookup("passkey.login.button.nope", "tr"), undefined);

// The site provider and the sign-in modal use it (the button reads t(`passkey.login.button.${style}`)).
const provider = fs.readFileSync(new URL("./MarketingLocaleProvider.jsx", import.meta.url), "utf8");
assert.match(provider, /isNestedKey\(k\)/, "provider: dotted keys go through siteNestedText");
assert.match(provider, /onNestedCatalog\(/, "provider: re-renders when a namespace arrives");
const modal = fs.readFileSync(new URL("./MarketingAuthModal.jsx", import.meta.url), "utf8");
assert.match(modal, /preloadNested\("passkey", locale\)/, "modal: preloads the passkey words");
const button = fs.readFileSync(new URL("../components/passkeys/PasskeySignInButton.jsx", import.meta.url), "utf8");
assert.match(button, /t\(`passkey\.login\.button\.\$\{style\}`\)/, "button label key unchanged");

console.log("siteNestedText.selftest: ok");
