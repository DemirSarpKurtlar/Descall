'use strict';

/**
 * Production CSP probe for the 3D world: serves the built dist/ with the exact web
 * Content-Security-Policy from public/_headers, loads the engine bundle the same
 * way World3DView does (import of /world3d/engine/engine.js) on a test page, boots
 * the room + one avatar and reports CSP violations and errors.
 *   node e2e/world3d/cspProbe.cjs   (after npm run build:prod)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const dist = path.join(__dirname, '..', '..', 'dist');
const headers = fs.readFileSync(path.join(__dirname, '..', '..', 'public', '_headers'), 'utf8');
const csp = (headers.match(/Content-Security-Policy:\s*(.+)/) || [])[1];
if (!csp) throw new Error('no CSP in public/_headers');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp' };
const probeHtml = '<!doctype html><html><body style="margin:0;background:#000"><canvas id="c" style="width:800px;height:450px"></canvas><script type="module" src="/__w3d_probe.js"></script></body></html>';
const probeJs = `
const report = (k, v) => { window.__probe = window.__probe || {}; window.__probe[k] = v; };
document.addEventListener('securitypolicyviolation', (e) => {
  const list = (window.__probe && window.__probe.violations) || [];
  list.push(e.violatedDirective + ' ' + e.blockedURI);
  report('violations', list);
});
try {
  const { WorldEngine } = await import(location.origin + '/world3d/engine/engine.js');
  const eng = new WorldEngine(document.getElementById('c'), { selfId: 'me', quality: { id: 'low', pixelRatio: 0.5, bloom: true, ssao: false, dof: false, fxaa: true, msaa: 1, mirror: false } });
  await eng.init();
  eng.setMembers([{ id: 'me' }]);
  eng.manualStep(3);
  report('ok', { meshes: eng.scene.meshes.length, avatars: eng.avatars.size });
} catch (err) {
  report('error', String(err && err.stack || err));
}
`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (body, type) => {
    res.writeHead(200, { 'content-type': type, 'content-security-policy': csp });
    res.end(body);
  };
  if (url.pathname === '/__w3d_probe.html') return send(probeHtml, 'text/html');
  if (url.pathname === '/__w3d_probe.js') return send(probeJs, 'text/javascript');
  const file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('404');
  }
  return send(fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/__w3d_probe.html`);
  await page.waitForFunction(() => window.__probe && (window.__probe.ok || window.__probe.error), null, { timeout: 180000 });
  const probe = await page.evaluate(() => window.__probe);
  console.log(JSON.stringify({ probe, consoleErrors: logs.slice(0, 5) }, null, 2));
  await browser.close();
  server.close();
  process.exit(probe.ok && !(probe.violations || []).length ? 0 : 1);
});
