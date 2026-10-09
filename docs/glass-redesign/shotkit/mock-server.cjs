const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const D = require("./data.cjs");
const DIST = process.env.DIST || require("path").join(__dirname, "../../../frontend/dist");
const LOG = "/tmp/mock-req.log";
fs.writeFileSync(LOG, "");
const log = (s) => fs.appendFileSync(LOG, s + "\n");
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
const routes = require("./routes.cjs");
app.use((req,res,next)=>{ if (req.method === "GET" && String(req.headers.accept || "").startsWith("text/html") && !/^\/(auth|api)\//.test(req.path)) { return res.sendFile(require("path").join(DIST, "index.html")); } next(); });
routes(app, D, log);
// Unknown API → empty JSON (logged)
app.use((req, res, next) => {
  const p = req.path;
  const isApi = /^\/(api|auth|friends|groups|servers|calls|lfg|riot|valorant|media|dm|reports|reactions|admin|socket\.io|health)/.test(p);
  if (!isApi) return next();
  if (req.method === 'GET' && String(req.headers.accept || '').startsWith('text/html')) return next();
  log(`MISS ${req.method} ${req.originalUrl}`);
  res.json({});
});
app.use(express.static(DIST, { index: false }));
app.get("*", (req, res) => res.sendFile(path.join(DIST, "index.html")));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
require("./sockets.cjs")(io, D, log);
const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => console.log("mock on :" + PORT));
