// node workers/realtime/test/jwtEs256.test.mjs (no dependencies; tokens minted with node:crypto)
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyAppJwtEs256, verifyEdgeJwt, jwtAlg } from "../src/jwt.js";

const b64u = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
const jwt = {
  sign(claims, key, { algorithm, keyid, expiresIn } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const body = { iat: now, ...claims };
    if (expiresIn === "1h") body.exp = now + 3600;
    const head = b64u({ alg: algorithm, typ: "JWT", ...(keyid ? { kid: keyid } : {}) });
    const input = `${head}.${b64u(body)}`;
    const sig =
      algorithm === "ES256"
        ? crypto.sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" })
        : crypto.createHmac("sha256", key).update(input).digest();
    return `${input}.${sig.toString("base64url")}`;
  },
};
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const kid = "k1";
const jwks = JSON.stringify({ keys: [{ ...pub, kid, alg: "ES256", use: "sig" }] });
const good = jwt.sign({ sub: "u1", sid: "s" }, privateKey, { algorithm: "ES256", keyid: kid, expiresIn: "1h" });
assert.equal(jwtAlg(good), "ES256");
assert.deepEqual(await verifyAppJwtEs256(good, jwks), { ok: true, uid: "u1", sid: "s" });
const other = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
const forged = jwt.sign({ sub: "u1" }, other, { algorithm: "ES256", keyid: kid, expiresIn: "1h" });
assert.equal((await verifyAppJwtEs256(forged, jwks)).code, "signature");
const unknownKid = jwt.sign({ sub: "u1" }, privateKey, { algorithm: "ES256", keyid: "zz", expiresIn: "1h" });
assert.equal((await verifyAppJwtEs256(unknownKid, jwks)).code, "kid");
const expired = jwt.sign({ sub: "u1", exp: Math.floor(Date.now() / 1000) - 5 }, privateKey, { algorithm: "ES256", keyid: kid });
assert.equal((await verifyAppJwtEs256(expired, jwks)).code, "expired");
const pending = jwt.sign({ sub: "u1", pending2fa: true }, privateKey, { algorithm: "ES256", keyid: kid, expiresIn: "1h" });
assert.equal((await verifyAppJwtEs256(pending, jwks)).code, "pending2fa");
// verifyEdgeJwt routing
assert.equal((await verifyEdgeJwt(good, { JWT_JWKS: jwks })).uid, "u1");
assert.deepEqual(await verifyEdgeJwt(good, {}), { ok: true, uid: "" }, "no JWKS: skip, Render checks");
const hs = jwt.sign({ sub: "u9" }, "sek", { algorithm: "HS256", expiresIn: "1h" });
assert.equal((await verifyEdgeJwt(hs, { JWT_SECRET: "sek" })).uid, "u9");
assert.equal((await verifyEdgeJwt(hs, { JWT_SECRET: "nope" })).code, "signature");
assert.equal((await verifyEdgeJwt("a.b.c", {})).code, "alg");
console.log("jwtEs256.test.mjs: ok");
