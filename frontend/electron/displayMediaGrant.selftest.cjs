// 3.7.33 echo fix. Run: node frontend/electron/displayMediaGrant.selftest.cjs
const assert = require('assert');
const g = require('./displayMediaGrant.cjs');
g.setPendingDisplaySource('window:42:0', 1000);
assert.strictEqual(g.takePendingDisplaySource(2000), 'window:42:0');
assert.strictEqual(g.takePendingDisplaySource(2000), null, 'one-shot');
g.setPendingDisplaySource('screen:1:0', 0);
assert.strictEqual(g.takePendingDisplaySource(g.PENDING_TTL_MS + 1), null, 'stale pick expires');
const src = { id: 'screen:1:0' };
assert.deepStrictEqual(g.buildDisplayMediaGrant(src, { audioRequested: true }), { video: src, audio: 'loopback' });
assert.deepStrictEqual(g.buildDisplayMediaGrant(src, { audioRequested: false }), { video: src });
const main = require('fs').readFileSync(require('path').join(__dirname, 'main.cjs'), 'utf8');
assert(!/loopbackWithMute/.test(main.replace(/\/\/.*$/gm, '')), 'never mute the call for the sharer');
assert(/useSystemPicker:\s*false/.test(main), 'handler must run so the in-app pick is honoured');
const ver = require('./package.json').devDependencies?.electron || require('./package.json').dependencies?.electron;
assert(Number(String(ver).replace(/^\D*/, '').split('.')[0]) >= 43, 'Electron >= 43.4 maps restrictOwnAudio to loopbackWithoutChrome');
console.log('displayMediaGrant.selftest.cjs: ok');
