import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyAppJwt, tokenFromProtocols, safeEqual } from "../src/jwt.js";

const secret = "test-secret";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function sign(claims, alg = "HS256", key = secret) {
  const h = b64u({ alg, typ: "JWT" });
  const p = b64u(claims);
  const s = createHmac("sha256", key).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
const now = 1_800_000_000;
assert.deepEqual(await verifyAppJwt(sign({ sub: "u1", sid: "s1", exp: now + 60 }), secret, now), { ok: true, uid: "u1", sid: "s1" });
assert.equal((await verifyAppJwt(sign({ sub: "u1", exp: now - 1 }), secret, now)).code, "expired");
assert.equal((await verifyAppJwt(sign({ sub: "u1", exp: now + 60 }, "HS256", "other"), secret, now)).code, "signature");
assert.equal((await verifyAppJwt(sign({ sub: "u1", exp: now + 60, pending2fa: true }), secret, now)).code, "pending2fa");
assert.equal((await verifyAppJwt(sign({ sub: "u1", exp: now + 60 }, "none"), secret, now)).code, "alg");
assert.equal((await verifyAppJwt("a.b", secret, now)).code, "malformed");
assert.equal((await verifyAppJwt("!!!.@@@.###", secret, now)).code, "malformed");
assert.equal(tokenFromProtocols("descall.v1, jwt.abc.def.ghi"), "abc.def.ghi");
assert.equal(tokenFromProtocols("jwt.abc"), null, "needs descall.v1");
assert.equal(tokenFromProtocols(""), null);
assert.ok(safeEqual("Bearer x", "Bearer x"));
assert.ok(!safeEqual("Bearer x", "Bearer y"));
assert.ok(!safeEqual("Bearer x", "Bearer xx"));
console.log("jwt.test.mjs: ok");
