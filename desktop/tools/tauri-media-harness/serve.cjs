// HTTPS server for https://tauri.localhost (host-resolver maps it to 127.0.0.1): AudioWorklet
// module fetches do not go through Playwright's page.route, so the harness needs a real server.
const https = require("https");
const fs = require("fs");
const path = require("path");

module.exports = function serve({ root, html, csp, certDir, port = 443 }) {
  const server = https.createServer({ key: fs.readFileSync(path.join(certDir, "key.pem")), cert: fs.readFileSync(path.join(certDir, "cert.pem")) }, (req, res) => {
    const u = new URL(req.url, "https://tauri.localhost");
    if (u.pathname === "/" || u.pathname.endsWith(".html")) {
      res.writeHead(200, { "content-type": "text/html", "content-security-policy": csp });
      return res.end(html);
    }
    const f = path.join(root, path.normalize(u.pathname));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "content-type": f.endsWith(".wasm") ? "application/wasm" : "text/javascript" });
    res.end(fs.readFileSync(f));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
};
