"use strict";

const assert = require("assert");
const { isAllowedOrigin } = require("./corsOrigins");

process.env.ALLOW_ALL_ORIGINS = "true";
const reloaded = require("./corsOrigins");

const allow = [
  "",
  undefined,
  "https://descall.com",
  "https://www.descall.com",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "https://localhost:5173",
  "descall://app",
  "descall://localhost",
  "Descall://localhost",
  "capacitor://localhost",
  "ionic://localhost",
];
const deny = [
  "null",
  "https://evil.example",
  "descall://evil.example",
  "capacitor://evil.example",
  "https://descall.com.evil.example",
  "http://localhost.evil.example",
  "https://notdescall.com",
  "http://descall.com",
  "*",
];

for (const origin of allow) {
  assert.equal(isAllowedOrigin(origin), true, `expected allow ${origin}`);
  assert.equal(reloaded.isAllowedOrigin(origin), true, `reload allow ${origin}`);
}
for (const origin of deny) {
  assert.equal(isAllowedOrigin(origin), false, `expected deny ${origin}`);
  assert.equal(reloaded.isAllowedOrigin(origin), false, `ALLOW_ALL_ORIGINS must not allow ${origin}`);
}

const server = require("fs").readFileSync(require("path").join(__dirname, "..", "server.js"), "utf8");
assert.equal(server.includes("ALLOW_ALL_ORIGINS"), false, "server.js must not consult ALLOW_ALL_ORIGINS");
assert.ok(server.includes("credentials: false"), "CORS credentials stay false");

console.log("corsOrigins.selftest ok");
