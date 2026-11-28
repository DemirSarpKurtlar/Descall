/**
 * Run: node frontend/src/lib/passkeys/wiring.selftest.mjs
 * Passkeys on every platform depend on files outside the JS client: the domain association
 * files the OS checks (AASA for iOS, assetlinks.json for Android), the iOS entitlements and
 * Xcode project, the Android plugin registration and Gradle deps, the Tauri commands and shim,
 * the backend mount and the migration. A missing piece only shows on a device, so check it here.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildAssetLinks, fingerprintsFromEnv, normalizeFingerprint, RELATIONS, PACKAGE_NAME } from "../../../scripts/write-assetlinks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, "..", "..", "..");
const repo = join(front, "..");
const read = (p) => readFileSync(join(front, p), "utf8");
const readRepo = (p) => readFileSync(join(repo, p), "utf8");

// ---- iOS: AASA webcredentials + applinks intact, entitlements, project, plugin registration ----
{
  const aasa = JSON.parse(read("public/.well-known/apple-app-site-association"));
  assert.deepEqual(aasa.webcredentials, { apps: ["Q9R78TPNXS.com.descall.app"] }, "AASA lists the app for passkeys");
  assert.ok(aasa.applinks?.details?.[0]?.appIDs?.includes("Q9R78TPNXS.com.descall.app"), "applinks kept");
  assert.ok(aasa.applinks.details[0].components.length >= 10, "applinks components kept");
  for (const f of ["App.debug.entitlements", "App.release.entitlements"]) {
    const ent = read(`ios/App/App/${f}`);
    const domains = /<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(ent)?.[1] || "";
    assert.match(domains, /<string>applinks:descall\.com<\/string>/, `${f} applinks`);
    assert.match(domains, /<string>webcredentials:descall\.com<\/string>/, `${f} webcredentials`);
  }
  const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
  for (const file of ["DescallPasskeyPlugin.swift", "DescallPasskeyLogic.swift"]) {
    const ref = new RegExp(`([0-9A-F]{24}) /\\* ${file} \\*/ = \\{isa = PBXFileReference`).exec(pbx)?.[1];
    assert.ok(ref, `${file} has a file reference`);
    const build = new RegExp(`([0-9A-F]{24}) /\\* ${file} in Sources \\*/ = \\{isa = PBXBuildFile; fileRef = ${ref} `).exec(pbx)?.[1];
    assert.ok(build, `${file} has a build file`);
    const appSources = /504EC3001FED79650016851F \/\* Sources \*\/ = \{[\s\S]*?files = \(([\s\S]*?)\);/.exec(pbx)?.[1] || "";
    assert.ok(appSources.includes(build), `${file} compiles in the App target`);
    assert.ok(existsSync(join(front, "ios/App/App", file)), `${file} exists`);
  }
  assert.match(read("ios/App/App/DescallBridgeViewController.swift"), /registerPluginInstance\(DescallPasskeyPlugin\(\)\)/);
  const plugin = read("ios/App/App/DescallPasskeyPlugin.swift");
  assert.match(plugin, /jsName = "DescallPasskey"/);
  assert.match(plugin, /ASAuthorizationPlatformPublicKeyCredentialProvider/);
  assert.match(plugin, /#available\(iOS 16\.0, \*\)/, "iOS 16+ only");
  const ci = readRepo(".github/workflows/ios-build-check.yml");
  assert.match(ci, /DescallPasskeyLogic\.swift selftest\/passkey\/main\.swift/, "CI runs the Swift logic selftest");
  assert.ok(existsSync(join(front, "ios/selftest/passkey/main.swift")));
  // The JS side loads the plugin boxed: a Capacitor proxy returned from an async function is
  // adopted as a thenable and never settles (capacitorBridge.selftest.mjs).
  const client = read("src/lib/passkeys/index.js");
  assert.match(client, /return \{ plugin: registerPlugin\("DescallPasskey"\) \}/);
  assert.doesNotMatch(client, /return registerPlugin\(/);
  assert.doesNotMatch(client, /const plugin = await /, "plugin calls destructure { plugin }");
}

// ---- Android: plugin registered, Credential Manager deps, R8 rule, assetlinks at build ----------
{
  assert.match(read("android/app/src/main/java/com/descall/app/MainActivity.java"), /registerPlugin\(DescallPasskeyPlugin\.class\);/);
  const plugin = read("android/app/src/main/java/com/descall/app/DescallPasskeyPlugin.java");
  assert.match(plugin, /@CapacitorPlugin\(name = "DescallPasskey"\)/);
  assert.match(plugin, /Build\.VERSION_CODES\.P/, "Android 9+");
  assert.match(plugin, /"descall\.com"\.equals\(rpId\)/, "only rp id descall.com");
  const gradle = read("android/app/build.gradle");
  assert.match(gradle, /androidx\.credentials:credentials:\$androidxCredentialsVersion/);
  assert.match(gradle, /androidx\.credentials:credentials-play-services-auth:\$androidxCredentialsVersion/);
  assert.match(read("android/variables.gradle"), /androidxCredentialsVersion = '\d+\.\d+\.\d+'/);
  assert.match(read("android/app/proguard-rules.pro"), /-keep class androidx\.credentials\.playservices\.\*\*/);

  const fp = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
  assert.equal(normalizeFingerprint(fp.toLowerCase().replace(/:/g, "")), fp);
  const { good, bad } = fingerprintsFromEnv({ ANDROID_CERT_SHA256: `${fp}, REPLACE_ME`, PASSKEY_ANDROID_CERT_SHA256: fp });
  assert.deepEqual(good, [fp], "deduplicated");
  assert.equal(bad.length, 1, "placeholders never ship");
  const links = buildAssetLinks(good);
  assert.deepEqual(links[0].relation, RELATIONS);
  assert.ok(RELATIONS.includes("delegate_permission/common.get_login_creds"), "passkeys relation");
  assert.ok(RELATIONS.includes("delegate_permission/common.handle_all_urls"), "App Links relation kept");
  assert.equal(links[0].target.package_name, PACKAGE_NAME);
  assert.equal(PACKAGE_NAME, "com.descall.app");
  // The build step writes the file only with real fingerprints.
  const dist = mkdtempSync(join(tmpdir(), "assetlinks-"));
  try {
    const script = join(front, "scripts/write-assetlinks.mjs");
    execFileSync(process.execPath, [script, "--dist", dist], { env: { ...process.env, ANDROID_CERT_SHA256: "", PASSKEY_ANDROID_CERT_SHA256: "" } });
    assert.equal(existsSync(join(dist, ".well-known/assetlinks.json")), false, "no file without fingerprints");
    execFileSync(process.execPath, [script, "--dist", dist], { env: { ...process.env, ANDROID_CERT_SHA256: fp } });
    const written = JSON.parse(readFileSync(join(dist, ".well-known/assetlinks.json"), "utf8"));
    assert.deepEqual(written[0].target.sha256_cert_fingerprints, [fp]);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
  const pkg = JSON.parse(read("package.json"));
  for (const s of ["build", "build:prod"]) assert.match(pkg.scripts[s], /vite build && node scripts\/write-assetlinks\.mjs/, `${s} writes assetlinks.json`);
  const vercel = JSON.parse(read("vercel.json"));
  const h = vercel.headers.find((x) => x.source === "/.well-known/assetlinks.json");
  assert.ok(h?.headers.some((x) => x.key === "Content-Type" && x.value === "application/json"));
  const aasaH = vercel.headers.find((x) => x.source === "/.well-known/apple-app-site-association");
  assert.ok(aasaH?.headers.some((x) => x.key === "Content-Type" && x.value === "application/json"), "AASA served as JSON");
  assert.ok(vercel.rewrites.some((r) => r.source === "/passkey/desktop" && r.destination === "/index.html"), "handoff page reaches the SPA");
  assert.match(read("public/_worker.js"), /"\/passkey\/desktop"/);
  const android = readRepo(".github/workflows/android-build.yml");
  assert.match(android, /ANDROID_CERT_SHA256/, "CI points at the fingerprint variable");
  assert.match(readRepo(".github/workflows/vercel-deploy.yml"), /ANDROID_CERT_SHA256: \$\{\{ vars\.ANDROID_CERT_SHA256 \}\}/);
}

// ---- Windows: Tauri commands registered, shim exposes them, crate in the workspace --------------
{
  const main = readRepo("desktop/app/src-tauri/src/main.rs");
  for (const c of ["passkey_available", "passkey_create", "passkey_get", "passkey_cancel"]) {
    assert.match(main, new RegExp(`commands::passkey::${c},`), `${c} registered`);
  }
  const shim = readRepo("desktop/app/shim/electron-api-shim.js");
  for (const m of ["passkeyAvailable", "passkeyCreate", "passkeyGet", "passkeyCancel"]) assert.match(shim, new RegExp(`${m}:`), `shim ${m}`);
  const ws = readRepo("desktop/Cargo.toml");
  assert.match(ws, /"crates\/descall-passkey"/);
  assert.match(readRepo("desktop/app/src-tauri/Cargo.toml"), /descall-passkey = \{ path = "\.\.\/\.\.\/crates\/descall-passkey" \}/);
  const win = readRepo("desktop/crates/descall-passkey/src/win.rs");
  assert.match(win, /LoadLibraryExW\(windows_core::w!\("webauthn\.dll"\)/, "webauthn.dll is loaded at run time, not linked");
  assert.doesNotMatch(win, /WebAuthNAuthenticatorMakeCredential\(/, "no static import of the WebAuthn API");
}

// ---- Backend: mounted, migration, dependency ----------------------------------------------------
{
  assert.match(read("backend/server.js"), /app\.use\(\["\/api\/auth\/passkeys", "\/auth\/passkeys"\], require\("\.\/routes\/passkeys"\)\)/);
  const bpkg = JSON.parse(read("backend/package.json"));
  assert.match(bpkg.dependencies["@simplewebauthn/server"] || "", /^\^1[3-9]\./);
  const sql = readRepo("supabase/migrations/20261124p_passkeys.sql");
  for (const t of ["passkey_credentials", "passkey_challenges", "passkey_handoffs"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
  }
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b/i, "additive only");
}

// ---- Control center (draft A): "Ben degildim" page, history migration, UI entry points -----------
{
  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some((r) => r.source === "/passkey/report" && r.destination === "/index.html"), "report page reaches the SPA");
  assert.match(read("public/_worker.js"), /"\/passkey\/report"/);
  const main = read("src/main.jsx");
  assert.match(main, /passkey\\\/report/, "main.jsx boots the report page alone");
  assert.match(main, /PasskeyReportPage\.jsx/);
  const sql = readRepo("supabase/migrations/20261124q_passkey_center.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.passkey_events/);
  assert.match(sql, /ALTER TABLE public\.passkey_events ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS places jsonb/);
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b/i, "additive only");
  const panel = read("src/components/layout/UserPanel.jsx");
  assert.match(panel, /PasskeyEntry/, "Settings > Security shows the passkeys row");
  assert.match(panel, /PasskeyCenter/, "and opens the control center");
  const app = read("src/App.jsx");
  assert.match(app, /<PasskeySuggestCard/, "the post-sign-in suggestion is mounted");
  const auth = read("src/components/AuthView.jsx");
  assert.ok(auth.indexOf("<PasskeySignInButton") > auth.indexOf('className="auth-submit"'), "the passkey button sits under Giris");
}

console.log("passkeys wiring selftest OK");
