/**
 * Run: node frontend/src/lib/phoneOrientation.selftest.mjs
 * The iPhone app is portrait-only (the phone glass shell has no landscape
 * layout: rail, list and tab bar collided sideways) except while a call is
 * on screen. Wiring check across Swift, Info.plist and the call overlay.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

const delegate = read("../../ios/App/App/AppDelegate.swift");
assert.match(delegate, /supportedInterfaceOrientationsFor window/);
assert.match(delegate, /userInterfaceIdiom == \.pad \{ return \.all \}/, "iPad keeps every orientation (Split View)");
assert.match(delegate, /allowPhoneLandscape \? \.allButUpsideDown : \.portrait/);

const plugin = read("../../ios/App/App/DescallDisplayPlugin.swift");
assert.match(plugin, /CAPPluginMethod\(name: "setLandscapeAllowed"/);
assert.match(plugin, /@objc func setLandscapeAllowed/);

// Landscape must stay declared, or iOS refuses to rotate even during a call.
const plist = read("../../ios/App/App/Info.plist");
const phone = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] || "";
assert.match(phone, /UIInterfaceOrientationLandscapeLeft/);
assert.match(plist, /UISupportedInterfaceOrientations~ipad/);
assert.doesNotMatch(plist, /UIRequiresFullScreen/, "iPad multitasking stays on");

const display = read("./glassDisplay.js");
assert.match(display, /export function setPhoneLandscapeAllowed/);
const overlay = read("../components/CallOverlay.jsx");
assert.match(overlay, /setPhoneLandscapeAllowed\(true\)/);
assert.match(overlay, /return \(\) => setPhoneLandscapeAllowed\(false\)/);

console.log("phoneOrientation selftest OK");
