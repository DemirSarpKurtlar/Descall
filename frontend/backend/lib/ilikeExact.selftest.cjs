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

// Templated patterns ("${q}%", "%${q}%") on user and server names: every interpolation
// must be escaped. Stripping "_" instead is wrong too: "john_doe" became "johndoe" and an
// admin access ban by username could land on another account.
const TEMPLATED = /\.ilike\(\s*"(username|email|display_name|name)"\s*,\s*`([^`]*)`\s*\)/g;
const STRIPPED = /\.ilike\(\s*"(username|email|display_name|name)"\s*,[^\n]*\.replace\(\/\[[^\]]*_[^\]]*\]\/g,\s*""\)/g;
const escaped = (expr) => /^(escapeLike|escLike)\(/.test(expr.trim()) || /\\\\\$&|\\\\\$\{c\}/.test(expr);
const loose = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const at = (i) => `${path.relative(root, f)}:${src.slice(0, i).split("\n").length}`;
  for (const m of src.matchAll(TEMPLATED)) {
    const parts = [...m[2].matchAll(/\$\{([^}]*(?:\([^)]*\))*[^}]*)\}/g)].map((x) => x[1]);
    if (parts.some((e) => !escaped(e))) loose.push(at(m.index));
  }
  for (const m of src.matchAll(STRIPPED)) loose.push(`${at(m.index)} (strips "_")`);
}
assert.deepEqual(loose, [], `unescaped templated ILIKE (use escapeLike): ${loose.join(", ")}`);

const { escapeLike } = require("./usernamePolicy");
assert.equal(escapeLike("john_doe@outlook.com"), "john\\_doe@outlook.com");
assert.equal(escapeLike("50%"), "50\\%");
console.log(`ilikeExact.selftest: ok (${files.length} files)`);
