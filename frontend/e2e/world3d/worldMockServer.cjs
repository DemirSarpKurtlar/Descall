'use strict';

/**
 * Local mock backend for the 3D world harness / evidence run.
 * Runs the REAL /world namespace (backend/socket/worldHandlers.js) on a local
 * Socket.IO server with fake auth (token = user id) and a fake live voice call,
 * plus bot members that sit, cheer, walk and chat over the same protocol.
 *   node e2e/world3d/worldMockServer.cjs [port] [scenario]
 * scenario: hero (draft scene-3: three cheering on the sofa, one on the second sofa,
 * one walking) | walk (bots idle around the rug) | none
 */

const http = require('http');
const path = require('path');
const { Server } = require(require.resolve('socket.io', { paths: [path.join(__dirname, '../../backend/node_modules'), __dirname] }));
const { io: ioc } = require(require.resolve('socket.io-client', { paths: [path.join(__dirname, '../../node_modules')] }));
const { registerWorldNamespace } = require('../../backend/socket/worldHandlers');

const PORT = Number(process.argv[2] || process.env.WORLD_MOCK_PORT || 4791);
const SCENARIO = process.argv[3] || 'hero';
const NAMES = { demir: 'Demir', ayse: 'Ayşe', mert: 'Mert', zeynep: 'Zeynep', can: 'Can', elif: 'Elif' };
// Seats sorted by node name in the room GLB: 0 beanbag, 1-2 second sofa, 3-5 main sofa.
const SEAT = { beanbag: 0, sofa2a: 1, sofa2b: 2, sofaL: 3, sofaM: 4, sofaR: 5 };
const STATE = { idle: 0, walk: 1, run: 2, sitDown: 3, sit: 4, standUp: 5, emote: 6 };
const EMOTE = { none: 0, wave: 1, dance: 2, clap: 3, laugh: 4, jump: 5, cheer: 6 };

const participants = new Map(Object.keys(NAMES).map((id) => [id, {}]));
const sharedState = { activeGroupCalls: new Map(), activeServerVoiceCalls: new Map([['c1', { participants }]]) };

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('descall world mock');
});
const io = new Server(server, { cors: { origin: '*' } });
registerWorldNamespace(io, {
  sharedState,
  authMiddleware(socket, next) {
    const id = String(socket.handshake.auth?.token || '');
    if (!NAMES[id]) return next(new Error('Authentication failed'));
    socket.user = { id, username: id };
    next();
  },
  loadAdminRow: async (id) => ({ id, username: id, is_admin: true }),
  profileOf: (id) => ({ id, username: id, displayName: NAMES[id] || id, avatarUrl: null }),
});

function bot(id, plan) {
  const c = ioc(`http://127.0.0.1:${PORT}/world`, { auth: { token: id, app: 'web' }, transports: ['websocket'], forceNew: true });
  let t0 = Date.now();
  c.on('connect', () => {
    c.emit('world:join', { kind: 'voice', id: 'c1' }, (res) => {
      if (!res?.ok) console.error('bot join failed', id, res);
      t0 = Date.now();
    });
  });
  const timer = setInterval(() => {
    const t = (Date.now() - t0) / 1000;
    const s = plan(t);
    // a new emoteSeq every `emoteEvery` seconds replays the emote on every client
    const emoteSeq = s.emote ? (1 + Math.floor(t / (s.emoteEvery || 999))) & 255 : 0;
    c.emit('world:snap', [s.x, 0, s.z, s.yaw, s.state, s.emote || 0, emoteSeq, s.seat ?? -1]);
  }, 100);
  return { c, stop: () => { clearInterval(timer); c.close(); } };
}

const bots = [];
server.listen(PORT, '127.0.0.1', () => {
  console.log(`world mock on http://127.0.0.1:${PORT} scenario=${SCENARIO}`);
  if (SCENARIO === 'none') return;
  if (SCENARIO === 'hero') {
    // positions only matter until the client snaps seated avatars onto the seat
    bots.push(bot('ayse', () => ({ x: 1.7, z: 5.8, yaw: Math.PI, state: STATE.sit, seat: SEAT.sofaL, emote: EMOTE.cheer, emoteEvery: 3.6 })));
    bots.push(bot('mert', () => ({ x: 2.5, z: 5.8, yaw: Math.PI, state: STATE.sit, seat: SEAT.sofaM, emote: EMOTE.clap, emoteEvery: 3.0 })));
    bots.push(bot('zeynep', () => ({ x: 3.4, z: 5.8, yaw: Math.PI, state: STATE.sit, seat: SEAT.sofaR, emote: EMOTE.cheer, emoteEvery: 3.6 })));
    bots.push(bot('can', () => ({ x: 4.6, z: 1.3, yaw: 0, state: STATE.sit, seat: SEAT.sofa2a })));
    bots.push(bot('elif', (t) => {
      // walk an ellipse around the rug, 1.3 m/s
      const w = t * 0.42;
      const x = 3.2 + Math.cos(w) * 2.0;
      const z = 3.4 + Math.sin(w) * 1.55;
      const dx = -Math.sin(w) * 2.0;
      const dz = Math.cos(w) * 1.55;
      return { x, z, yaw: Math.atan2(dx, dz), state: STATE.walk };
    }));
  } else {
    let k = 0;
    for (const id of ['ayse', 'mert', 'zeynep', 'can', 'elif']) {
      const a = (k += 1) * 1.2;
      bots.push(bot(id, (t) => ({ x: 3 + Math.cos(a) * 1.8, z: 3 + Math.sin(a) * 1.4, yaw: a + Math.PI, state: STATE.idle, emote: t > 2 && k % 2 ? EMOTE.wave : 0, emoteEvery: 4 })));
    }
  }
  setTimeout(() => {
    bots[2]?.c.emit('world:chat', { text: 'gol gol gol' });
  }, 2500);
  setTimeout(() => {
    bots[3]?.c.emit('world:chat', { text: 'bir şarkı daha?' });
  }, 3200);
});

process.on('SIGTERM', () => { bots.forEach((b) => b.stop()); io.close(); server.close(); process.exit(0); });
process.on('SIGINT', () => { bots.forEach((b) => b.stop()); io.close(); server.close(); process.exit(0); });
