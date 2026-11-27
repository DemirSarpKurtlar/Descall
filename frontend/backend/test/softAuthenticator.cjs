"use strict";

/**
 * A software WebAuthn authenticator (ES256, attestation "none") for the passkey selftests.
 * It produces the same RegistrationResponseJSON / AuthenticationResponseJSON a browser,
 * Android Credential Manager, iOS ASAuthorization or the Windows webauthn.dll path send,
 * so the real @simplewebauthn/server verification runs on it.
 */

const crypto = require("crypto");

// ---- minimal CBOR encoder (maps, ints, text, bytes, arrays) -------------------------------
function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}
function cbor(v) {
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") {
    const s = Buffer.from(v, "utf8");
    return Buffer.concat([head(3, s.length), s]);
  }
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  if (v instanceof Map) {
    const parts = [head(5, v.size)];
    for (const [k, val] of v) parts.push(cbor(k), cbor(val));
    return Buffer.concat(parts);
  }
  if (v && typeof v === "object") return cbor(new Map(Object.entries(v)));
  throw new Error(`cbor: unsupported ${typeof v}`);
}

const b64u = (b) => Buffer.from(b).toString("base64url");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest();

const FLAG = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40 };

function createSoftAuthenticator({ rpId = "descall.com", aaguid = "fbfc3007-154e-4ecc-8c0b-6e020557d7bd" } = {}) {
  const keys = new Map(); // credentialId -> { privateKey, userHandle, counter }

  function cose(publicKey) {
    const jwk = publicKey.export({ format: "jwk" });
    return cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]));
  }

  function authData({ flags, counter, attested }) {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(counter >>> 0);
    return Buffer.concat([sha256(Buffer.from(rpId)), Buffer.from([flags]), c, ...(attested ? [attested] : [])]);
  }

  /**
   * @param {object} options PublicKeyCredentialCreationOptionsJSON from the server
   * @param {object} o { origin, uv = true, backup = true, counter = 0, rpIdOverride }
   */
  function create(options, o = {}) {
    const { origin = "https://descall.com", uv = true, backup = true, counter = 0, type = "webauthn.create" } = o;
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const credId = crypto.randomBytes(32);
    const clientDataJSON = Buffer.from(JSON.stringify({ type, challenge: options.challenge, origin, crossOrigin: false }));
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(credId.length);
    const attested = Buffer.concat([Buffer.from(aaguid.replace(/-/g, ""), "hex"), idLen, credId, cose(publicKey)]);
    const flags = FLAG.UP | FLAG.AT | (uv ? FLAG.UV : 0) | (backup ? FLAG.BE | FLAG.BS : 0);
    const ad = o.rpIdOverride
      ? Buffer.concat([sha256(Buffer.from(o.rpIdOverride)), Buffer.from([flags]), Buffer.alloc(4), attested])
      : authData({ flags, counter, attested });
    const attestationObject = cbor(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", ad]]));
    const id = b64u(credId);
    keys.set(id, { privateKey, userHandle: options.user?.id, counter, backup });
    return {
      id,
      rawId: id,
      type: "public-key",
      response: {
        clientDataJSON: b64u(clientDataJSON),
        attestationObject: b64u(attestationObject),
        transports: ["internal", "hybrid"],
      },
      clientExtensionResults: { credProps: { rk: true } },
      authenticatorAttachment: "platform",
    };
  }

  /**
   * @param {object} options PublicKeyCredentialRequestOptionsJSON
   * @param {object} o { credentialId, origin, uv = true, counter (explicit), userHandle (override) }
   */
  function get(options, o = {}) {
    const id = o.credentialId || [...keys.keys()][0];
    const k = keys.get(id);
    if (!k) throw new Error("soft authenticator: unknown credential");
    const { origin = "https://descall.com", uv = true } = o;
    if (o.counter !== undefined) k.counter = o.counter;
    else if (k.counter > 0) k.counter += 1;
    const flags = FLAG.UP | (uv ? FLAG.UV : 0) | (k.backup ? FLAG.BE | FLAG.BS : 0);
    const ad = authData({ flags, counter: k.counter });
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin, crossOrigin: false }));
    const signature = crypto.sign("sha256", Buffer.concat([ad, sha256(clientDataJSON)]), k.privateKey);
    const userHandle = o.userHandle === undefined ? k.userHandle : o.userHandle;
    return {
      id,
      rawId: id,
      type: "public-key",
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(ad),
        signature: b64u(signature),
        ...(userHandle ? { userHandle } : {}),
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
  }

  return { create, get, keys };
}

module.exports = { createSoftAuthenticator, cbor };
