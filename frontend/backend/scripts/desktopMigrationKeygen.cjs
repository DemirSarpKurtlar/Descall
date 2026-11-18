#!/usr/bin/env node
"use strict";

/**
 * Make the Ed25519 key pair that signs the desktop migration plan.
 *
 *   node backend/scripts/desktopMigrationKeygen.cjs
 *
 * Prints:
 *   - DESKTOP_MIGRATION_PLAN_KEY=<base64 PKCS#8>  -> Render environment variable ONLY
 *     (never commit it, never paste it into chat or an issue);
 *   - the public key (base64 SPKI)                -> electron/migrationBridgeConfig.cjs
 *     PLAN_PUBLIC_KEYS, shipped inside the bridge release.
 * Keep a second pair offline: the bridge accepts a list, so the key can be rotated by
 * shipping the next public key one release ahead.
 */

const crypto = require("crypto");

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const spkiDer = publicKey.export({ format: "der", type: "spki" });
const keyId = crypto.createHash("sha256").update(spkiDer).digest("hex").slice(0, 16);

console.log("# Server secret (Render env var, never committed):");
console.log(`DESKTOP_MIGRATION_PLAN_KEY=${pkcs8}`);
console.log("");
console.log(`# Public key for electron/migrationBridgeConfig.cjs PLAN_PUBLIC_KEYS (key id ${keyId}):`);
console.log(spkiDer.toString("base64"));
