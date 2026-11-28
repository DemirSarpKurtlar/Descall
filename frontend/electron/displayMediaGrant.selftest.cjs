// Screen-share echo fix (3.7.33, reworked 4.2.1). Run: node frontend/electron/displayMediaGrant.selftest.cjs
const assert = require('assert');
const g = require('./displayMediaGrant.cjs');

// The pick serves every getDisplayMedia retry of the same share, then expires.
g.setPendingDisplaySource('window:42:0', 1000);
assert.strictEqual(g.takePendingDisplaySource(2000), 'window:42:0');
assert.strictEqual(g.takePendingDisplaySource(3000), 'window:42:0', 'constraint retries keep the chosen window');
g.setPendingDisplaySource('screen:2:0', 4000);
assert.strictEqual(g.takePendingDisplaySource(4001), 'screen:2:0', 'a new pick replaces the old one');
g.setPendingDisplaySource('screen:1:0', 0);
assert.strictEqual(g.takePendingDisplaySource(g.PENDING_TTL_MS + 1), null, 'stale pick expires');
assert.strictEqual(g.takePendingDisplaySource(0), null, 'and stays gone');
g.setPendingDisplaySource('screen:1:0', 0);
g.clearPendingDisplaySource();
assert.strictEqual(g.takePendingDisplaySource(1), null);

// Windows build parsing.
assert.strictEqual(g.windowsBuild('10.0.19045'), 19045);
assert.strictEqual(g.windowsBuild('10.0.22631'), 22631);
assert.strictEqual(g.windowsBuild('6.1.7601'), 0);
assert.strictEqual(g.windowsBuild(''), 0);

// Policy: Windows 10 2004+ and Windows 11 leave Descall out; older Windows and
// Linux cannot, so they share video only.
const pol = (platform, release) => g.systemAudioPolicy({ platform, release });
assert.strictEqual(pol('win32', '10.0.19045'), 'exclude-self', 'Windows 10 22H2 (the 4.1.x echo case)');
assert.strictEqual(pol('win32', '10.0.19041'), 'exclude-self', 'Windows 10 2004');
assert.strictEqual(pol('win32', '10.0.22631'), 'exclude-self', 'Windows 11');
assert.strictEqual(pol('win32', '10.0.18363'), 'off', 'Windows 10 1909 has no process loopback');
assert.strictEqual(pol('win32', ''), 'off', 'unknown Windows build: no audio rather than echo');
assert.strictEqual(pol('darwin', '23.2.0'), 'exclude-self');
assert.strictEqual(pol('linux', '6.8.0'), 'off', 'Linux loopback is the whole mix');

// Grants: never plain 'loopback' (whole system mix on Windows 10) or 'loopbackWithMute'.
const src = { id: 'screen:1:0' };
const withAudio = g.buildDisplayMediaGrant(src, { audioRequested: true }, 'exclude-self');
assert.deepStrictEqual(withAudio, { video: src, audio: { id: 'loopbackWithoutChrome', name: 'System audio' } });
assert.notStrictEqual(withAudio.audio, 'loopback');
assert.deepStrictEqual(g.buildDisplayMediaGrant(src, { audioRequested: true }), withAudio, 'default policy excludes Descall');
assert.deepStrictEqual(g.buildDisplayMediaGrant(src, { audioRequested: true }, 'off'), { video: src }, 'cannot exclude: video only');
assert.deepStrictEqual(g.buildDisplayMediaGrant(src, { audioRequested: false }, 'exclude-self'), { video: src });

// main.cjs wiring.
const main = require('fs').readFileSync(require('path').join(__dirname, 'main.cjs'), 'utf8');
const code = main.replace(/\/\/.*$/gm, '');
assert(!/loopbackWithMute/.test(code), 'never mute the call for the sharer');
assert(!/audio:\s*['"]loopback['"]/.test(code), 'never grant the whole-system loopback');
assert(/useSystemPicker:\s*false/.test(main), 'handler must run so the in-app pick is honoured');
assert(/buildDisplayMediaGrant\(chosen, request, policy\)/.test(code), 'grant uses the OS policy');
assert(/systemAudioPolicy\(\{ platform: process\.platform, release: require\('os'\)\.release\(\) \}\)/.test(code), 'policy reads the real OS build');
assert(/audio: systemAudioPolicy/.test(code), 'select-source tells the renderer when system audio is off');

// Electron must honour the explicit { id, name } device (shell/browser/electron_browser_context.cc
// DisplayMediaDeviceChosen, present since Electron 43).
const ver = require('./package.json').devDependencies?.electron || require('./package.json').dependencies?.electron;
assert(Number(String(ver).replace(/^\D*/, '').split('.')[0]) >= 43, 'Electron >= 43');
console.log('displayMediaGrant.selftest.cjs: ok');
