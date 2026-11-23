#!/usr/bin/env node
/**
 * Writes dist/.well-known/assetlinks.json (Digital Asset Links) at build time, from the
 * public SHA-256 fingerprints of the certificates that sign the Android app:
 *
 *   ANDROID_CERT_SHA256="AA:BB:...:FF,11:22:...:EE"   (PASSKEY_ANDROID_CERT_SHA256 is read too)
 *
 * List both the Play App Signing key (Play Console > Test and release > App integrity: the
 * key Google signs Play installs with) and the upload key (android-build.yml prints it, it signs
 * the sideloaded universal APK). The fingerprints are public (anyone can read them from an
 * APK); nothing secret goes in here. Set the same list on the backend as
 * PASSKEY_ANDROID_CERT_SHA256 so the server accepts the app's passkey origin.
 *
 * One statement for com.descall.app with two relations:
 *   delegate_permission/common.handle_all_urls  Android App Links (invite URLs, AndroidManifest.xml)
 *   delegate_permission/common.get_login_creds  passkeys / Credential Manager for rp id descall.com
 *
 * Without fingerprints nothing is written (a placeholder must never ship; the path stays a
 * 404 and the Android app hides passkeys because the server reports android: false).
 *   node scripts/write-assetlinks.mjs [--dist <dir>] [--print]
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "com.descall.app";
export const RELATIONS = ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"];
const FP_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function normalizeFingerprint(raw) {
  const hex = String(raw || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 64) return null;
  const fp = hex.match(/.{2}/g).join(":");
  return FP_RE.test(fp) ? fp : null;
}

export function fingerprintsFromEnv(env = process.env) {
  const raw = [env.ANDROID_CERT_SHA256, env.PASSKEY_ANDROID_CERT_SHA256].filter(Boolean).join(",");
  const parts = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const good = [];
  const bad = [];
  for (const p of parts) {
    const fp = normalizeFingerprint(p);
    if (fp) {
      if (!good.includes(fp)) good.push(fp);
    } else bad.push(p.slice(0, 12));
  }
  return { good, bad };
}

export function buildAssetLinks(fingerprints) {
  return [
    {
      relation: [...RELATIONS],
      target: { namespace: "android_app", package_name: PACKAGE_NAME, sha256_cert_fingerprints: [...fingerprints] },
    },
  ];
}

function main() {
  const args = process.argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  const distArg = args.indexOf("--dist");
  const dist = distArg >= 0 ? args[distArg + 1] : join(here, "..", "dist");
  const { good, bad } = fingerprintsFromEnv();
  if (bad.length) console.warn(`[assetlinks] ignored ${bad.length} value(s) that are not SHA-256 fingerprints`);
  if (!good.length) {
    console.log("[assetlinks] ANDROID_CERT_SHA256 not set: no assetlinks.json (Android passkeys and App Links stay off).");
    return;
  }
  const body = JSON.stringify(buildAssetLinks(good), null, 2) + "\n";
  if (args.includes("--print")) {
    process.stdout.write(body);
    return;
  }
  if (!existsSync(dist)) {
    console.error(`[assetlinks] ${dist} does not exist; run after vite build`);
    process.exit(1);
  }
  const out = join(dist, ".well-known", "assetlinks.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
  console.log(`[assetlinks] wrote ${out} with ${good.length} fingerprint(s)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
