// Exact username / email lookups must escape LIKE wildcards. Unescaped, "_" matches any
// character: Google/Apple sign-in linked "john_doe@" to "john.doe@" (account takeover) and
// "/pay a_b" could pay "a.b" (security audit 28 Nov 2026). This guard fails on a bare
// .ilike("username", username) or .ilike("email", email) anywhere in the backend.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "test" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(c?js)$/.test(e.name) && !/selftest|\.test\./.test(e.name)) files.push(p);
  }
})(root);

const BARE = /\.ilike\(\s*"(username|email)"\s*,\s*(username|email|name|raw|value|s)\s*\)/g;
const bad = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(BARE)) {
    const line = src.slice(0, m.index).split("\n").length;
    bad.push(`${path.relative(root, f)}:${line}`);
  }
}
assert.deepEqual(bad, [], `unescaped exact ILIKE (wrap the value in escapeLike): ${bad.join(", ")}`);

const { escapeLike } = require("./usernamePolicy");
assert.equal(escapeLike("john_doe@outlook.com"), "john\\_doe@outlook.com");
assert.equal(escapeLike("50%"), "50\\%");
console.log(`ilikeExact.selftest: ok (${files.length} files)`);
