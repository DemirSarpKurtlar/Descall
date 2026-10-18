#!/usr/bin/env node
/**
 * Scale plan S3: creates the ES256 (P-256) signing key for app JWTs, LOCALLY.
 *   node infra/cloudflare/gen-es256-key.mjs ./descall-jwt-es256.pem
 * Writes the private key (mode 600) to the given file and prints ONLY the public JWKS.
 * Then: paste the file content into Render env JWT_ES256_PRIVATE_KEY (dashboard, secret),
 * wait one deploy, check GET /api/jwks.json, set the Worker var JWT_JWKS to that JSON,
 * and only then set JWT_SIGN_ALG=ES256 on Render. Delete the local file afterwards.
 */
import crypto from "node:crypto";
import fs from "node:fs";

const out = process.argv[2];
if (!out) {
  console.error("usage: node infra/cloudflare/gen-es256-key.mjs <private-key-output.pem>");
  process.exit(2);
}
if (fs.existsSync(out)) {
  console.error(`refusing to overwrite ${out}`);
  process.exit(2);
}
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
fs.writeFileSync(out, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
const jwk = publicKey.export({ format: "jwk" });
const kid = crypto.createHash("sha256").update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest("base64url");
console.log(`private key written to ${out} (mode 600, never commit it)`);
console.log("public JWKS (safe to share):");
console.log(JSON.stringify({ keys: [{ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, kid, alg: "ES256", use: "sig" }] }));
