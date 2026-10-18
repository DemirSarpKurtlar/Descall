"use strict";
// node frontend/backend/config/jwt.selftest.cjs
const assert = require("assert");
const crypto = require("crypto");
process.env.JWT_SECRET = "selftest-secret";
delete process.env.JWT_ES256_PRIVATE_KEY;
delete process.env.JWT_SIGN_ALG;
const jwt = require("jsonwebtoken");
const mod = require("./jwt");

// HS256 only (production today): unchanged behaviour.
const hs = mod.signToken({ id: "u1", username: "a", sid: "s1" });
assert.strictEqual(JSON.parse(Buffer.from(hs.split(".")[0], "base64url")).alg, "HS256");
assert.strictEqual(mod.verifyToken(hs).sub, "u1");
assert.deepStrictEqual(mod.publicJwks(), { keys: [] });
assert.strictEqual(mod.signAlg(), "HS256");

// alg confusion: "none" and an ES256 header without a key are rejected.
const none = jwt.sign({ sub: "u1" }, null, { algorithm: "none" });
assert.throws(() => mod.verifyToken(none));
const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const foreign = jwt.sign({ sub: "u1" }, privateKey, { algorithm: "ES256", expiresIn: "1h" });
assert.throws(() => mod.verifyToken(foreign), /invalid algorithm/);

// Key configured, still signing HS256: verify accepts both.
process.env.JWT_ES256_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).replace(/\n/g, "\\n");
mod._reloadEs256ForTests();
assert.strictEqual(mod.signAlg(), "HS256");
assert.strictEqual(mod.verifyToken(foreign).sub, "u1");
assert.strictEqual(mod.verifyToken(hs).sub, "u1");
const jwks = mod.publicJwks();
assert.strictEqual(jwks.keys.length, 1);
assert.strictEqual(jwks.keys[0].alg, "ES256");
assert.ok(!("d" in jwks.keys[0]), "private part never published");

// Flip to ES256.
process.env.JWT_SIGN_ALG = "ES256";
const es = mod.signToken({ id: "u2", username: "b", sid: "s2" });
const head = JSON.parse(Buffer.from(es.split(".")[0], "base64url"));
assert.strictEqual(head.alg, "ES256");
assert.strictEqual(head.kid, jwks.keys[0].kid);
assert.strictEqual(mod.verifyToken(es).sub, "u2");
assert.strictEqual(mod.verifyToken(hs).sub, "u1", "old HS256 tokens keep working");
// HS256 token signed with the public key as HMAC secret (classic confusion) fails.
const pubPem = crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" });
const confused = jwt.sign({ sub: "evil" }, pubPem, { algorithm: "HS256" });
assert.throws(() => mod.verifyToken(confused));
const pending = mod.signPending2faToken({ id: "u2", username: "b" });
assert.strictEqual(mod.verifyToken(pending).pending2fa, true);
// The Cloudflare edge verifies backend ES256 tokens with only /api/jwks.json.
const path = require("path");
import(require("url").pathToFileURL(path.join(__dirname, "../../../workers/realtime/src/jwt.js")).href).then(async (edge) => {
  const r = await edge.verifyEdgeJwt(es, { JWT_JWKS: JSON.stringify(mod.publicJwks()) });
  assert.deepStrictEqual(r, { ok: true, uid: "u2", sid: "s2" });
  console.log("jwt.selftest.cjs: ok");
}).catch((e) => { console.error(e); process.exit(1); });
