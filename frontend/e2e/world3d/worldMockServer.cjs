'use strict';

/**
 * Local mock backend for the 3D world harness / evidence run.
 * Runs the REAL /world namespace (backend/socket/worldHandlers.js) on a local
 * Socket.IO server with fake auth (token = user id) and a fake live voice call,
 * plus bot members that sit, cheer, walk and chat over the same protocol.
 *   node e2e/world3d/worldMockServer.cjs [port] [scenario]
 * scenario: hero (draft scene-3: three cheering on the sofa, one on the second sofa,
 * one walking) | walk (bots idle around the rug) | perf (7 bots = 8 avatars with the
 * harness user: sitting + emotes, guitar, two walkers, a runner, and one member who
 * leaves and joins again every few seconds; chat every 3 s) | none
 */

const http = require('http');
const path = require('path');
const { Server } = require(require.resolve('socket.io', { paths: [path.join(__dirname, '../../backend/node_modules'), __dirname] }));
const { io: ioc } = require(require.resolve('socket.io-client', { paths: [path.join(__dirname, '../../node_modules')] }));
const { registerWorldNamespace } = require('../../backend/socket/worldHandlers');

const PORT = Number(process.argv[2] || process.env.WORLD_MOCK_PORT || 4791);
const SCENARIO = process.argv[3] || 'hero';
const SELF = process.argv[4] || ''; // the harness user: no bot for that id
const NAMES = { demir: 'Demir', ayse: 'Ayşe', mert: 'Mert', zeynep: 'Zeynep', can: 'Can', elif: 'Elif', burak: 'Burak', selin: 'Selin' };
// Seats sorted by node name in the room GLB: 0 beanbag, 1-2 second sofa, 3-5 main sofa.
const SEAT = { beanbag: 0, sofa2a: 1, sofa2b: 2, sofaL: 3, sofaM: 4, sofaR: 5 };
const STATE = { idle: 0, walk: 1, run: 2, sitDown: 3, sit: 4, standUp: 5, emote: 6 };
const EMOTE = { none: 0, wave: 1, dance: 2, clap: 3, laugh: 4, jump: 5, cheer: 6, guitar: 7 };

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
  if (id === SELF) return { c: null, stop() {} };
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
    // Babylon world space: x = -blenderX, z = -blenderY. Seated bots snap onto their seat.
    bots.push(bot('ayse', () => ({ x: 1.7, z: 5.8, yaw: Math.PI, state: STATE.sit, seat: SEAT.sofaL, emote: EMOTE.cheer, emoteEvery: 2.6 })));
    bots.push(bot('mert', () => ({ x: 2.5, z: 5.8, yaw: Math.PI, state: STATE.sit, seat: SEAT.sofaM, emote: EMOTE.clap, emoteEvery: 3.0 })));
    bots.push(bot('zeynep', () => ({ x: 3.4, z: 5.8, yaw: Math.PI, state: STATE.sit, seat: SEAT.sofaR, emote: EMOTE.cheer, emoteEvery: 2.6 })));
    bots.push(bot('can', () => ({ x: -4.7, z: -1.6, yaw: 0, state: STATE.sit, seat: SEAT.sofa2a, emote: EMOTE.guitar, emoteEvery: 100000 })));
    bots.push(bot('elif', (t) => {
      // walking (about 0.6 m/s)
      // a small loop in the back right, between the corner plant and the TV console
      const w = t * 1.2;
      const x = -5.55 + Math.cos(w) * 0.4;
      const z = -4.75 + Math.sin(w) * 0.6;
      const dx = -Math.sin(w) * 0.4;
      const dz = Math.cos(w) * 0.6;
      return { x, z, yaw: Math.atan2(dx, dz), state: STATE.walk };
    }));
  } else if (SCENARIO === 'lineup') {
    // character sheet: everyone in a row facing the camera (compare with scene-5.jpg)
    ['ayse', 'mert', 'zeynep', 'can', 'elif'].forEach((id, i) => {
      const x = -4.85 + (i + (i >= 2 ? 1 : 0)) * 0.68;
      bots.push(bot(id, () => ({ x, z: -3.3, yaw: 0, state: STATE.idle })));
    });
  } else if (SCENARIO === 'perf') {
    // 8 avatars with the harness user, every kind of update the client has to absorb
    bots.push(bot('ayse', () => ({ x: 1.7, z: 5.8, yaw: Math.PI, state: STATE.sit, seat: SEAT.sofaL, emote: EMOTE.cheer, emoteEvery: 2.6 })));
    bots.push(bot('mert', () => ({ x: 2.5, z: 5.8, yaw: Math.PI, state: STATE.sit, seat: SEAT.sofaM, emote: EMOTE.clap, emoteEvery: 3.0 })));
    bots.push(bot('zeynep', (t) => ({ x: -3.2 + Math.cos(t * 0.9) * 1.1, z: -3.4 + Math.sin(t * 0.9) * 0.8, yaw: Math.atan2(-Math.sin(t * 0.9), Math.cos(t * 0.9)), state: STATE.walk })));
    bots.push(bot('can', () => ({ x: -4.7, z: -1.6, yaw: 0, state: STATE.sit, seat: SEAT.sofa2a, emote: EMOTE.guitar, emoteEvery: 100000 })));
    bots.push(bot('elif', (t) => {
      const w = t * 1.2;
      return { x: -5.55 + Math.cos(w) * 0.4, z: -4.75 + Math.sin(w) * 0.6, yaw: Math.atan2(-Math.sin(w) * 0.4, Math.cos(w) * 0.6), state: STATE.walk };
    }));
    bots.push(bot('burak', (t) => {
      // runs back and forth across the rug
      const k = (Math.sin(t * 0.8) + 1) / 2;
      const dir = Math.cos(t * 0.8) >= 0 ? 1 : -1;
      return { x: -1.0 - k * 3.0, z: -2.2, yaw: dir > 0 ? -Math.PI / 2 : Math.PI / 2, state: STATE.run };
    }));
    // selin leaves and joins again: join / leave hitches on every client
    const churn = () => {
      const b = bot('selin', (t) => ({ x: -2.6, z: -4.4, yaw: 0, state: t > 1 ? STATE.emote : STATE.idle, emote: t > 1 ? EMOTE.wave : 0, emoteEvery: 3 }));
      bots.push(b);
      setTimeout(() => { b.stop(); bots.splice(bots.indexOf(b), 1); setTimeout(churn, 3000); }, 6000);
    };
    churn();
    setInterval(() => bots[0]?.c?.emit('world:chat', { text: `perf ${Date.now() % 1000}` }), 3000);
  } else {
    let k = 0;
    for (const id of ['ayse', 'mert', 'zeynep', 'can', 'elif']) {
      const a = (k += 1) * 1.2;
      bots.push(bot(id, (t) => ({ x: -3.2 + Math.cos(a) * 1.8, z: -3.6 + Math.sin(a) * 1.4, yaw: a + Math.PI, state: STATE.idle, emote: t > 2 && k % 2 ? EMOTE.wave : 0, emoteEvery: 4 })));
    }
  }
  // the draft's chat lines, repeated so a client that joins later still sees them
  const say = () => {
    bots[2]?.c?.emit('world:chat', { text: 'gol gol gol' });
    setTimeout(() => bots[3]?.c?.emit('world:chat', { text: 'bir şarkı daha?' }), 700);
  };
  setTimeout(say, 2500);
  setInterval(say, 12000);
});

process.on('SIGTERM', () => { bots.forEach((b) => b.stop()); io.close(); server.close(); process.exit(0); });
process.on('SIGINT', () => { bots.forEach((b) => b.stop()); io.close(); server.close(); process.exit(0); });
