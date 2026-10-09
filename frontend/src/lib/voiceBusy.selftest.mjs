/**
 * Voice-busy derivation for the Electron update deferral.
 * Run: node frontend/src/lib/voiceBusy.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveVoiceBusy,
  getVoiceBusy,
  publishVoiceBusy,
  resetVoiceBusyForTests,
  subscribeVoiceBusy,
} from "./voiceBusy.js";

const root = dirname(fileURLToPath(import.meta.url));

assert.equal(deriveVoiceBusy(), false);
assert.equal(deriveVoiceBusy({}), false);
assert.equal(deriveVoiceBusy({ call: { mode: null } }), false);
assert.equal(deriveVoiceBusy({ call: { mode: "incoming" } }), true);
assert.equal(deriveVoiceBusy({ call: { mode: "outgoing" } }), true);
assert.equal(deriveVoiceBusy({ call: { mode: "active" } }), true);
assert.equal(deriveVoiceBusy({ groupCall: { isInCall: true } }), true);
assert.equal(deriveVoiceBusy({ groupCall: { incomingCall: { groupId: "g1" } } }), true);
assert.equal(deriveVoiceBusy({ groupCall: { isInCall: false, incomingCall: null } }), false);
assert.equal(deriveVoiceBusy({ serverVoice: { isInVoice: true } }), true);
assert.equal(deriveVoiceBusy({ serverVoice: { connecting: true } }), true);
assert.equal(deriveVoiceBusy({ serverVoice: { isInVoice: false, connecting: false } }), false);
assert.equal(
  deriveVoiceBusy({
    call: { mode: null },
    groupCall: { isInCall: false, incomingCall: null },
    serverVoice: { isInVoice: true, connecting: false },
  }),
  true
);

resetVoiceBusyForTests();
assert.equal(getVoiceBusy(), false);
const seen = [];
const off = subscribeVoiceBusy((busy) => seen.push(busy));
assert.equal(publishVoiceBusy(false), false);
assert.equal(publishVoiceBusy(true), true);
assert.equal(getVoiceBusy(), true);
assert.equal(publishVoiceBusy(true), false);
assert.deepEqual(seen, [true]);
off();
publishVoiceBusy(false);
assert.deepEqual(seen, [true]);
resetVoiceBusyForTests();

const hook = readFileSync(join(root, "../hooks/useElectronVoiceBusy.js"), "utf8");
assert.match(hook, /electronAPI\?\.isElectron/, "voice-busy IPC must be Electron-only");
assert.match(hook, /setVoiceBusy/, "hook must report busy through the preload bridge");
assert.match(hook, /beforeunload/, "reload/quit must clear busy");
assert.doesNotMatch(hook, /require\(['"]electron['"]\)/, "renderer hook must not import electron");

const app = readFileSync(join(root, "../App.jsx"), "utf8");
assert.match(app, /useElectronVoiceBusy\(\{ call, groupCall, serverVoice \}\)/, "App must publish DM, group, and server voice");

const preload = readFileSync(join(root, "../../electron/preload.cjs"), "utf8");
assert.match(preload, /voice:set-busy/, "preload must expose voice-busy");
assert.match(preload, /confirmRestartApp/, "preload must expose confirmed restart");
assert.match(preload, /update:confirm-restart/, "preload must deliver the mid-call confirm prompt");

const toast = readFileSync(join(root, "../components/ElectronUpdateToast.jsx"), "utf8");
assert.match(toast, /updateToast\.confirmTitle/, "restart-during-call uses i18n");
assert.match(toast, /updateToast\.confirmRestart/, "confirm button is translated");
assert.match(toast, /confirmRestartApp/, "confirm must call the explicit restart IPC");
assert.match(toast, /electronAPI\?\.onUpdateDownloading/, "toast stays inert without Electron");
assert.doesNotMatch(toast, /window\.confirm/, "mid-call restart must not use window.confirm");

console.log("voiceBusy.selftest.mjs: ok");
