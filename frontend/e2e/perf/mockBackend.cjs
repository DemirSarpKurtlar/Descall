'use strict';

/**
 * Local mock API + Socket.IO for the jank / flicker benchmark (e2e/perf).
 * Serves a built dist/ on 127.0.0.1 with a heavy but synthetic account:
 * a 1000-message DM, 300 friends, 40 groups, 60 servers and one server with
 * 300 channels. No real user data, nothing leaves the machine.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require(require.resolve('socket.io', { paths: [path.join(__dirname, '../../backend/node_modules'), __dirname] }));

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = { id: uid(1), username: 'demir', displayName: 'Demir', display_name: 'Demir', birthDate: '2000-05-05', emailVerified: true, language: 'tr', blockedUsers: [], status: 'online' };
const NAMES = ['Ayşe', 'Mert', 'Zeynep', 'Can', 'Elif', 'Burak', 'Deniz', 'Ece', 'Emre', 'Selin', 'Kaan', 'İrem', 'Onur', 'Defne', 'Arda', 'Naz'];
const FRIENDS = Array.from({ length: 300 }, (_, i) => ({
  id: uid(100 + i), username: `kullanici${i}`, displayName: i === 0 ? 'Ayşe' : `${NAMES[i % NAMES.length]} ${i}`,
  status: i % 3 === 0 ? 'online' : i % 3 === 1 ? 'idle' : 'offline', avatarUrl: null, createdAt: '2025-02-22T10:00:00.000Z',
}));
FRIENDS.forEach((f) => { f.display_name = f.displayName; });
const PEER = FRIENDS[0];
const sender = (u) => ({ id: u.id, username: u.username, displayName: u.displayName, display_name: u.displayName, avatarUrl: null });
const LINES = [
  'Bu akşam oyun gecesine geliyor musun?', 'Tabii, saat kaçta?', "21:00'de, önce sesli kanalda toplanırız.", 'Tamam 👍',
  'Mert ve Zeynep de gelecek. Bu sefer takımları ben kurayım, geçen sefer çok dengesizdi açıkçası 😅', 'Süper!',
  'Geçen haftaki klibi gördün mü?', 'Gördüm, efsaneydi 😂', '**Önemli:** yarın sunucu bakımda, `22:00` itibarıyla 1 saat kapalı.', 'Olur, sen kur.',
];
let seq = 0;
const dm = (from, text, minAgo, i) => ({
  id: `p-m-${String(++seq).padStart(4, '0')}`, from: sender(from), to: { id: (from === ME ? PEER : ME).id }, text,
  mediaUrl: null, mediaType: null, timestamp: new Date(Date.now() - minAgo * 60000).toISOString(),
  deliveredAt: new Date(Date.now() - minAgo * 60000).toISOString(), readAt: new Date(Date.now() - minAgo * 60000).toISOString(),
  editHistory: [], reactions: i % 7 === 0 ? [{ emoji: '❤️', count: 2, users: [PEER.id, ME.id] }, { emoji: '😂', count: 1, users: [PEER.id] }] : [],
});
function makeMessages(n) {
  seq = 0;
  const out = [];
  for (let i = 0; i < n; i++) out.push(dm(i % 3 === 1 ? ME : PEER, LINES[i % LINES.length], n * 3 - i * 3, i));
  return out;
}
const SERVERS = Array.from({ length: 60 }, (_, i) => {
  const id = `s-perf-${i}`;
  const nCh = i === 0 ? 300 : 12;
  const channels = [];
  for (let c = 0; c < nCh; c++) {
    if (c % 15 === 0) channels.push({ id: `${id}-cat-${c}`, serverId: id, name: `Kategori ${c / 15 + 1}`, type: 'category', position: c, parentId: null });
    const parent = `${id}-cat-${c - (c % 15)}`;
    channels.push({ id: `${id}-ch-${c}`, serverId: id, name: c % 5 === 4 ? `ses-${c}` : `kanal-${c}`, type: c % 5 === 4 ? 'voice' : 'text', position: c, parentId: parent, topic: null, slowmodeSeconds: 0, nsfw: false });
  }
  return { id, name: i === 0 ? 'Büyük Sunucu' : `Sunucu ${i}`, iconUrl: null, ownerId: ME.id, isOwner: true, memberCount: 40 + i, listPosition: i, notificationLevel: 'all', channels, roles: [{ id: `${id}-everyone`, name: '@everyone', isEveryone: true, permissions: '0', position: 0 }], myPermissions: '8' };
});
const GROUPS = Array.from({ length: 40 }, (_, i) => ({ id: `g-perf-${i}`, name: `Grup ${i + 1}`, ownerId: ME.id, members: [sender(ME), sender(FRIENDS[i + 1]), sender(FRIENDS[i + 2])], memberIds: [ME.id, FRIENDS[i + 1].id, FRIENDS[i + 2].id], avatarUrl: null, createdAt: '2025-03-01T10:00:00.000Z', lastMessage: 'Görüşürüz', lastActivity: new Date(Date.now() - i * 3600000).toISOString() }));

const state = { messages: makeMessages(Number(process.env.DESCALL_PERF_MESSAGES || 1000)), sockets: new Set() };

function api(p, method = 'GET') {
  if (/\/auth\/me$/.test(p)) return { user: ME };
  if (/\/promo\/popup$/.test(p)) return { popup: null };
  if (/\/dm\/[^/]+\/messages$/.test(p)) return { withUserId: PEER.id, messages: state.messages, hasMore: false };
  if (/\/dm\/previews$/.test(p)) {
    const byPeer = {}; const act = {};
    FRIENDS.forEach((f, i) => { byPeer[f.id] = LINES[i % LINES.length]; act[f.id] = new Date(Date.now() - i * 600000).toISOString(); });
    return { dmPreviewsByPeer: byPeer, dmLastActivityByPeer: act, previews: {} };
  }
  if (/\/friends(\/list)?$/.test(p)) return { friends: FRIENDS };
  if (/\/api\/servers\/my$/.test(p)) return { servers: SERVERS, ownedCount: 10, maxOwned: 100 };
  let m = p.match(/\/api\/servers\/([^/]+)\/channels\/[^/]+\/messages$/);
  if (m) return { messages: [], hasMore: false };
  m = p.match(/\/api\/servers\/([^/]+)$/);
  if (m) { const s = SERVERS.find((x) => x.id === m[1]); if (s) return { server: s }; }
  if (/\/groups$/.test(p)) return { groups: GROUPS };
  if (/\/users\/[^/]+$/.test(p) || /profile/.test(p)) return { user: PEER, ...PEER };
  void method;
  const last = p.split('/').filter(Boolean).pop() || 'items';
  const out = { items: [], friends: [], requests: [], servers: [], groups: [], conversations: [], messages: [], notifications: [], prefs: {} };
  out[last] = Array.isArray(out[last]) ? out[last] : [];
  return out;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const API_RE = /^\/(api|auth|friends|groups|servers|calls|media|dm|reports|reactions|admin|health|maintenance|users|notifications|activity|analytics|store|shop|push|me|settings|blocks|presence)(\/|$)/;

function start({ dist, port = 5371 }) {
  const serve = (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const file = path.join(dist, decodeURIComponent(url.pathname));
    const accept = String(req.headers.accept || '');
    if (url.pathname !== '/' && file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }
    if (API_RE.test(url.pathname) && !accept.startsWith('text/html')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(api(url.pathname, req.method)));
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(dist, 'index.html')).pipe(res);
  };
  const server = http.createServer(serve);
  const io = new Server(server, { cors: { origin: '*' } });
  io.on('connection', (socket) => {
    state.sockets.add(socket);
    socket.on('disconnect', () => state.sockets.delete(socket));
    socket.emit('connected', { user: ME, message: 'ok' });
    socket.emit('friend:list', FRIENDS.map((f, i) => ({ ...f, lastMessage: LINES[i % LINES.length], lastActivity: new Date(Date.now() - i * 600000).toISOString() })));
    socket.emit('friend:requests', []);
    socket.emit('users:update', [sender(ME), ...FRIENDS.map(sender)].map((u, i) => ({ ...u, status: i % 3 ? 'online' : 'idle' })));
    socket.on('app:ping', (ack) => { if (typeof ack === 'function') ack(Date.now()); });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, io, port: server.address().port, close: () => { io.close(); server.close(); } })));
}

module.exports = { start, ME, PEER, FRIENDS, SERVERS, GROUPS, state };
