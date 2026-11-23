'use strict';
// node electron/turnstileFrames.selftest.cjs
// The Electron window keeps its forced app CSP everywhere except Turnstile's frames
// (turnstileFrames.cjs), and the app CSP lets the bridge page be framed (cspPolicy.cjs).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { keepsOwnCsp } = require('./turnstileFrames.cjs');
const { buildElectronCsp, FRAME } = require('./cspPolicy.cjs');

const sub = (url) => ({ resourceType: 'subFrame', url });

assert.equal(keepsOwnCsp(sub('https://des-call.onrender.com/api/turnstile/frame?v=1')), true, 'bridge page');
assert.equal(keepsOwnCsp(sub('https://api.descall.com/api/turnstile/frame')), true, 'bridge page on the edge host');
assert.equal(keepsOwnCsp(sub('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/x')), true, 'challenge frame');
assert.equal(keepsOwnCsp(sub('https://des-call.onrender.com/api/other')), false, 'other API pages keep the app policy');
assert.equal(keepsOwnCsp(sub('http://des-call.onrender.com/api/turnstile/frame')), false, 'plain http never');
assert.equal(keepsOwnCsp(sub('https://evil.example/api/turnstile/frame')), false, 'unknown host');
assert.equal(keepsOwnCsp({ resourceType: 'mainFrame', url: 'https://challenges.cloudflare.com/' }), false, 'never the main frame');
assert.equal(keepsOwnCsp({ resourceType: 'script', url: 'https://challenges.cloudflare.com/turnstile/v0/api.js' }), false, 'only documents');
assert.equal(keepsOwnCsp(sub('descall://app/index.html')), false, 'app documents keep the app policy');
assert.equal(keepsOwnCsp(null), false);
assert.equal(keepsOwnCsp(sub('not a url')), false);

const csp = buildElectronCsp('<script>1</script>');
assert.ok(csp.includes(FRAME.trim()), 'frame-src in the app policy');
assert.match(FRAME, /frame-src 'self' https:\/\/des-call\.onrender\.com https:\/\/api\.descall\.com https:\/\/challenges\.cloudflare\.com;/);

const main = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
assert.ok(/if \(keepsTurnstileCsp\(details\)\) return callback\(\{\}\);\n\s+const isAppDocument/.test(main), 'header hook skips Turnstile frames first');

const tauri = JSON.parse(fs.readFileSync(path.join(__dirname, '../../desktop/app/src-tauri/tauri.conf.json'), 'utf8'));
assert.equal(tauri.app.security.csp['frame-src'], FRAME.replace(/^frame-src /, '').replace(/; $/, ''), 'Tauri frames the same hosts');

console.log('turnstileFrames.selftest.cjs: ok');
