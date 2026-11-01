'use strict';

/**
 * Electron runtime probe for the 3D world: serves the built dist/ over the same
 * descall:// scheme and hashed renderer CSP as electron/main.cjs, opens the app
 * document, then loads the engine bundle the way World3DView does
 * (descall://app/world3d/engine/engine.js), boots the room + one avatar and reports
 * CSP violations and errors.
 *   ELECTRON_BUILD=1 npm run build:prod
 *   xvfb-run -a npx electron e2e/world3d/electronProbe.cjs --no-sandbox
 * DESCALL_W3D_SWIFTSHADER=1 forces software WebGL on GPU-less machines (CI, containers).
 * Prints "[w3d-electron] OK {...}" and exits 0, or "[w3d-electron] FAIL ..." and exits 1.
 */
const { app, BrowserWindow, protocol, net } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { resolveDistFile } = require('../../electron/appProtocolPath.cjs');
const { buildElectronCsp } = require('../../electron/cspPolicy.cjs');

const root = path.join(__dirname, '..', '..', 'dist');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'descall-w3d-')));
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
if (process.env.DESCALL_W3D_SWIFTSHADER) { app.commandLine.appendSwitch('use-angle', 'swiftshader'); app.commandLine.appendSwitch('enable-unsafe-swiftshader'); }
protocol.registerSchemesAsPrivileged([{ scheme: 'descall', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const done = (ok, info) => {
  console.log(`[w3d-electron] ${ok ? 'OK' : 'FAIL'} ${JSON.stringify(info)}`);
  setTimeout(() => app.exit(ok ? 0 : 1), 100);
};
setTimeout(() => done(false, 'timeout'), 240000).unref();

const PROBE = `(async () => {
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective + ' ' + e.blockedURI));
  try {
    const url = new URL('world3d/engine/engine.js', window.location.origin + '/').href;
    const { WorldEngine } = await import(url);
    const c = document.createElement('canvas');
    c.style.cssText = 'position:fixed;inset:0;width:800px;height:450px;z-index:99999';
    document.body.appendChild(c);
    const eng = new WorldEngine(c, { selfId: 'me', quality: { id: 'low', pixelRatio: 0.5, bloom: true, ssao: false, dof: false, fxaa: true, msaa: 1, mirror: false } });
    await eng.init();
    eng.setMembers([{ id: 'me' }]);
    eng.manualStep(3);
    return { ok: true, origin: window.location.origin, meshes: eng.scene.meshes.length, avatars: eng.avatars.size, violations };
  } catch (err) {
    return { ok: false, error: String(err && err.stack || err), violations };
  }
})()`;

app.whenReady().then(() => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const csp = buildElectronCsp(html);
  protocol.handle('descall', (request) => {
    const url = new URL(request.url);
    const r = resolveDistFile(root, url.pathname, (p) => fs.existsSync(p));
    if (r.forbidden) return new Response('forbidden', { status: 403 });
    if (!/\.html?$/i.test(r.filePath)) return net.fetch(pathToFileURL(r.filePath).href);
    return net.fetch(pathToFileURL(r.filePath).href).then((res) => {
      const headers = new Headers(res.headers);
      headers.set('Content-Security-Policy', csp);
      headers.set('content-type', 'text/html; charset=utf-8');
      return new Response(res.body, { status: res.status, headers });
    });
  });
  const win = new BrowserWindow({ width: 1280, height: 800, show: true, webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(PROBE, true);
      done(result.ok && !result.violations.length, result);
    } catch (err) {
      done(false, String(err));
    }
  });
  win.loadURL('descall://app/index.html');
});
