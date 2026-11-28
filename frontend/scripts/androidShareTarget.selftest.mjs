// Android "Paylaş > Descall" wiring (no Gradle here; CI compiles it): the share target activity,
// the action receiver and the Direct Share <share-target> are declared, every DescallShare
// method the share page calls exists in the plugin, the job JSON keys the worker reads are the
// ones shareModel.createJob writes, and the notification strings exist in every language.
// Run: node scripts/androidShareTarget.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJob } from "../src/lib/share/shareModel.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const A = join(root, "android", "app", "src", "main");
const read = (...p) => readFileSync(join(...p), "utf8");
const manifest = read(A, "AndroidManifest.xml");
assert.match(manifest, /android:name="\.DescallShareActivity"[\s\S]*?android\.intent\.action\.SEND"[\s\S]*?android\.intent\.action\.SEND_MULTIPLE/, "share activity with SEND and SEND_MULTIPLE");
assert.match(manifest, /android:name="\.share\.ShareActionReceiver"\s+android:exported="false"/, "receiver is not exported");
const shortcuts = read(A, "res", "xml", "shortcuts.xml");
assert.match(shortcuts, /<share-target android:targetClass="com\.descall\.app\.DescallShareActivity">[\s\S]*com\.descall\.app\.category\.SHARE_TARGET/);

const java = (f) => read(A, "java", "com", "descall", "app", f);
const plugin = java("DescallSharePlugin.java");
const methods = new Set([...plugin.matchAll(/@PluginMethod\s+public void (\w+)\(/g)].map((m) => m[1]));
const host = read(root, "src", "lib", "share", "shareHost.js");
const used = new Set([...host.matchAll(/plugin\.(\w+)\(/g)].map((m) => m[1]).filter((m) => m !== "addListener"));
for (const m of used) assert.ok(methods.has(m), `DescallShare.${m} is a @PluginMethod`);
assert.match(java("DescallShareActivity.java"), /registerPlugin\(DescallSharePlugin\.class\)/);
// Shared streams: never file: and never our own providers (the FileProvider serves the cache
// dir); the rule itself is unit tested in src/test/.../share/ShareUrisTest.java.
assert.match(plugin, /ShareUris\.accepted\(u\.getScheme\(\), u\.getAuthority\(\), ownPackage\)/, "streams() filters with ShareUris.accepted");
assert.match(plugin, /streams\(in, ctx\.getPackageName\(\)\)/, "getPayload passes the app's own package");
assert.doesNotMatch(plugin, /if \("content"\.equals\(s\)\) safe\.add\(u\)/, "no scheme-only filter left");
assert.match(java("share/ShareShortcuts.java"), /CATEGORY = "com\.descall\.app\.category\.SHARE_TARGET"/);
assert.match(java("DescallShortcutsPlugin.java"), /setCategories\(com\.descall\.app\.share\.ShareShortcuts\.categories\(\)\)/, "DM shortcuts double as Direct Share targets");

// Keys the Java job reads / writes exist in the JS job shape.
const job = createJob({ items: [{ id: "a", mime: "image/jpeg", size: 1 }], targets: [{ conv: "dm:x", kind: "dm", name: "X" }] });
const jobJava = java("share/ShareJob.java") + java("share/ShareWorker.java");
const keys = new Set([...jobJava.matchAll(/opt(?:String|Int|Long|Boolean|JSONArray|JSONObject)\("(\w+)"/g)].map((m) => m[1]));
const known = new Set([...Object.keys(job), ...Object.keys(job.items[0]), ...Object.keys(job.targets[0]), "upload", "mediaType", "mimeType", "originalName", "size", "results", "messageId", "scheduledId", "reason", "path", "mime", "apiBase", "token", "state", "cancel", "hidden", "files", "payloadId", "username", "serverId", "job", "error", "code", "failed", "file"]);
for (const k of keys) assert.ok(known.has(k), `Java reads job key "${k}" that shareModel does not write`);

// Notification strings in every language the app ships.
const res = join(A, "res");
const dirs = readdirSync(res).filter((d) => /^values(-|$)/.test(d) && readdirSync(join(res, d)).includes("share_strings.xml"));
assert.deepEqual(dirs.sort(), ["values", "values-de", "values-es", "values-fr", "values-pt-rBR", "values-ru", "values-tr"]);
const notifier = java("share/ShareNotifier.java") + java("DescallShareActivity.java");
const en = read(res, "values", "share_strings.xml");
for (const m of notifier.matchAll(/R\.(string|plurals)\.(share_\w+)/g)) {
  assert.ok(new RegExp(`name="${m[2]}"`).test(en), `${m[2]} exists in values/share_strings.xml`);
}
console.log("androidShareTarget selftest: ok");
