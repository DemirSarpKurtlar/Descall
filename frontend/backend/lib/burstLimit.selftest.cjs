// burstLimit: a per-IP burst cap answers 429 with a JSON body once the limit is used up.
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { burstLimit } = require('./burstLimit');

(async () => {
  const app = express();
  const mw = burstLimit({ name: 'test', limit: 3 });
  assert.equal(mw.descallBurstLimit, 'test', 'marked for hand-driven router tests');
  app.get('/x', mw, (req, res) => res.json({ ok: true }));
  const server = http.createServer(app).listen(0);
  const port = server.address().port;
  const get = () => new Promise((resolve, reject) => {
    http.get({ port, path: '/x' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
  for (let i = 0; i < 3; i++) assert.equal((await get()).status, 200, `request ${i + 1} passes`);
  const blocked = await get();
  assert.equal(blocked.status, 429, '4th request in the window is limited');
  assert.equal(blocked.body.code, 'RATE_LIMITED');
  assert.equal(blocked.body.limiter, 'test');
  server.close();
  console.log('burstLimit selftest: ok');
})().catch((e) => { console.error(e); process.exit(1); });
