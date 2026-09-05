'use strict';

/**
 * Riot Client local lockfile auth (Electron / Windows desktop).
 * Never reads or stores the user's Riot password — only the ephemeral
 * local-client lockfile secret that Riot Client writes while running.
 *
 * Tokens stay on-device via Electron safeStorage (see IPC handlers).
 * Adım 4: local /chat/v4 friends + presences + friendrequests (lockfile).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { ipcMain, safeStorage } = require('electron');

const STORE_KEY = 'descall.valorant.session.v1';

const insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

function lockfileCandidates() {
  const home = os.homedir();
  const localAppData =
    process.env.LOCALAPPDATA ||
    (process.platform === 'win32' ? path.join(home, 'AppData', 'Local') : null);
  const candidates = [];
  if (localAppData) {
    candidates.push(
      path.join(localAppData, 'Riot Games', 'Riot Client', 'Config', 'lockfile')
    );
  }
  // Linux / Wine / rare installs
  candidates.push(
    path.join(home, '.local', 'share', 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
    path.join(home, 'Riot Games', 'Riot Client', 'Config', 'lockfile')
  );
  return candidates;
}

function readLockfile() {
  for (const file of lockfileCandidates()) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, 'utf8').trim();
      // name:pid:port:password:protocol
      const parts = raw.split(':');
      if (parts.length < 5) continue;
      const [, pid, port, password, protocol] = parts;
      const portNum = Number(port);
      if (!portNum || !password) continue;
      return {
        pid: Number(pid) || null,
        port: portNum,
        password,
        protocol: (protocol || 'https').toLowerCase(),
        path: file,
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

function localRequest(lock, method, urlPath, bodyObj) {
  const auth = Buffer.from(`riot:${lock.password}`).toString('base64');
  const proto = lock.protocol === 'http' ? require('http') : https;
  const payload =
    bodyObj === undefined || bodyObj === null ? null : JSON.stringify(bodyObj);
  const opts = {
    hostname: '127.0.0.1',
    port: lock.port,
    path: urlPath,
    method: method || 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      ...(payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {}),
    },
    timeout: 8000,
  };
  if (proto === https) opts.agent = insecureAgent;

  return new Promise((resolve, reject) => {
    const req = proto.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { raw: text };
        }
        resolve({ status: res.statusCode || 0, body });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Riot Client local API timed out'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchEntitlements(lock) {
  const { status, body } = await localRequest(lock, 'GET', '/entitlements/v1/token');
  if (status === 404 || status === 401 || status === 403) {
    const err = new Error(
      'Riot Client is running but no Valorant session was found. Open Valorant (or stay signed in on Riot Client) and try again.'
    );
    err.code = 'NO_SESSION';
    throw err;
  }
  if (status < 200 || status >= 300 || !body) {
    const err = new Error(`Local entitlements failed (${status})`);
    err.code = 'ENTITLEMENTS_FAILED';
    throw err;
  }
  const accessToken = body.accessToken || body.access_token || null;
  const entitlementToken = body.token || body.entitlements_token || null;
  const subject = body.subject || body.sub || null;
  if (!accessToken || !entitlementToken) {
    const err = new Error('Local entitlements response missing tokens');
    err.code = 'ENTITLEMENTS_INCOMPLETE';
    throw err;
  }
  return { accessToken, entitlementToken, subject };
}

async function fetchAlias(lock) {
  try {
    const { status, body } = await localRequest(lock, 'GET', '/player-account/aliases/v1/active');
    if (status >= 200 && status < 300 && body) {
      const gameName = body.game_name || body.gameName || body.Name || null;
      const tagLine = body.tag_line || body.tagLine || body.TagLine || null;
      if (gameName && tagLine) return { gameName, tagLine };
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function fetchRegionHint(lock) {
  const paths = [
    '/riotclient/region-locale',
    '/riot-client-auth/v1/userinfo',
    '/player-affinity/product/v1/token',
  ];
  for (const p of paths) {
    try {
      const { status, body } = await localRequest(lock, 'GET', p);
      if (status < 200 || status >= 300 || !body) continue;
      const region =
        body.region ||
        body.affinity ||
        body?.token?.affinity ||
        body?.dat?.res ||
        null;
      if (typeof region === 'string' && region.length >= 2) {
        return String(region).toLowerCase();
      }
    } catch {
      /* next */
    }
  }
  return null;
}

function normalizeRegion(raw) {
  const r = String(raw || '').toLowerCase();
  if (!r) return 'eu';
  if (['eu', 'na', 'ap', 'kr', 'latam', 'br', 'pbe'].includes(r)) return r;
  if (r === 'tr' || r === 'euw' || r === 'eune' || r === 'europe') return 'eu';
  if (r === 'latam' || r.startsWith('la')) return 'latam';
  if (r === 'br' || r === 'brazil') return 'br';
  if (r === 'kr' || r === 'korea') return 'kr';
  if (r === 'ap' || r === 'asia' || r === 'apac') return 'ap';
  if (r === 'na' || r === 'americas') return 'na';
  return 'eu';
}

function canUseSafeStorage() {
  try {
    return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

function encodeSession(session) {
  const json = JSON.stringify(session);
  if (canUseSafeStorage()) {
    return {
      enc: 'safeStorage',
      payload: safeStorage.encryptString(json).toString('base64'),
    };
  }
  // Fallback when OS secure store unavailable (rare). Still local-only.
  return {
    enc: 'base64',
    payload: Buffer.from(json, 'utf8').toString('base64'),
  };
}

function decodeSession(stored) {
  if (!stored || !stored.payload) return null;
  try {
    let json;
    if (stored.enc === 'safeStorage' && canUseSafeStorage()) {
      json = safeStorage.decryptString(Buffer.from(stored.payload, 'base64'));
    } else if (stored.enc === 'base64') {
      json = Buffer.from(stored.payload, 'base64').toString('utf8');
    } else {
      return null;
    }
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** In-memory + encrypted disk via electron-store-less simple file next to userData */
function sessionFilePath(app) {
  return path.join(app.getPath('userData'), 'valorant-session.bin.json');
}

function saveSessionToDisk(app, session) {
  const wrapped = encodeSession(session);
  fs.writeFileSync(sessionFilePath(app), JSON.stringify(wrapped), 'utf8');
}

function loadSessionFromDisk(app) {
  try {
    const file = sessionFilePath(app);
    if (!fs.existsSync(file)) return null;
    const wrapped = JSON.parse(fs.readFileSync(file, 'utf8'));
    return decodeSession(wrapped);
  } catch {
    return null;
  }
}

function clearSessionDisk(app) {
  try {
    const file = sessionFilePath(app);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
}

function publicSessionView(session) {
  if (!session) return null;
  return {
    linked: true,
    linkMethod: session.linkMethod || 'local_client',
    gameName: session.gameName,
    tagLine: session.tagLine,
    riotId:
      session.gameName && session.tagLine
        ? `${session.gameName}#${session.tagLine}`
        : null,
    region: session.region || 'eu',
    puuid: session.puuid || null,
    expiresAt: session.expiresAt || null,
    secureStore: canUseSafeStorage() ? 'safeStorage' : 'local-fallback',
    // Tokens intentionally omitted from public view
  };
}

async function connectFromLockfile() {
  const lock = readLockfile();
  if (!lock) {
    const err = new Error(
      'Riot Client lockfile not found. Start the Riot Client (and Valorant) on this PC, then try again.'
    );
    err.code = 'NO_LOCKFILE';
    throw err;
  }

  const entitlements = await fetchEntitlements(lock);
  const alias = await fetchAlias(lock);
  const regionHint = await fetchRegionHint(lock);

  const session = {
    linkMethod: 'local_client',
    accessToken: entitlements.accessToken,
    entitlementToken: entitlements.entitlementToken,
    puuid: entitlements.subject || null,
    gameName: alias?.gameName || null,
    tagLine: alias?.tagLine || null,
    region: normalizeRegion(regionHint),
    connectedAt: new Date().toISOString(),
    expiresAt: null,
  };

  return { session, lockPath: lock.path, port: lock.port };
}

const friendsShape = require('./valorantFriendsShape');

function requireLock() {
  const lock = readLockfile();
  if (!lock) {
    const err = new Error(
      'Riot Client lockfile not found. Start Riot Client (and Valorant) on this PC, then try again.'
    );
    err.code = 'NO_LOCKFILE';
    throw err;
  }
  return lock;
}

function localHttpError(status, body, fallback) {
  const err = new Error(
    (body && (body.errorCode || body.message || body.error)) ||
      fallback ||
      `Riot local chat request failed (${status})`
  );
  err.code = status === 401 || status === 403 ? 'LOCAL_UNAUTHORIZED' : 'LOCAL_CHAT_FAILED';
  err.status = status;
  return err;
}

async function fetchLocalFriendsBundle() {
  const lock = requireLock();
  const [friendsRes, presenceRes, requestsRes] = await Promise.all([
    localRequest(lock, 'GET', '/chat/v4/friends'),
    localRequest(lock, 'GET', '/chat/v4/presences'),
    localRequest(lock, 'GET', '/chat/v4/friendrequests'),
  ]);

  if (friendsRes.status < 200 || friendsRes.status >= 300) {
    throw localHttpError(friendsRes.status, friendsRes.body, 'Failed to load Riot friends');
  }
  if (presenceRes.status < 200 || presenceRes.status >= 300) {
    throw localHttpError(presenceRes.status, presenceRes.body, 'Failed to load Riot presence');
  }

  const friendsRaw = Array.isArray(friendsRes.body?.friends) ? friendsRes.body.friends : [];
  const presencesRaw = Array.isArray(presenceRes.body?.presences)
    ? presenceRes.body.presences
    : [];
  const requestsRaw =
    requestsRes.status >= 200 && requestsRes.status < 300 && Array.isArray(requestsRes.body?.requests)
      ? requestsRes.body.requests
      : [];

  return {
    friendsRaw,
    presencesRaw,
    requestsRaw,
    lockPort: lock.port,
  };
}

async function sendLocalFriendRequest(gameName, tagLine) {
  const lock = requireLock();
  const { status, body } = await localRequest(lock, 'POST', '/chat/v4/friendrequests', {
    game_name: String(gameName || '').trim(),
    game_tag: String(tagLine || '').trim(),
  });
  if (status < 200 || status >= 300) {
    throw localHttpError(status, body, 'Failed to send friend request');
  }
  return body;
}

async function removeLocalFriendRequest(puuid) {
  const lock = requireLock();
  const { status, body } = await localRequest(lock, 'DELETE', '/chat/v4/friendrequests', {
    puuid: String(puuid || '').trim(),
  });
  if (status < 200 || status >= 300) {
    throw localHttpError(status, body, 'Failed to remove friend request');
  }
  return body;
}

/** Best-effort accept — Riot may still require in-client confirm on some builds. */
async function acceptLocalFriendRequest(puuid) {
  const lock = requireLock();
  const { status, body } = await localRequest(lock, 'PUT', '/chat/v4/friendrequests', {
    puuid: String(puuid || '').trim(),
  });
  if (status < 200 || status >= 300) {
    throw localHttpError(status, body, 'Failed to accept friend request (try in Riot Client)');
  }
  return body;
}

function registerRiotLocalAuthIPC(app) {
  ipcMain.handle('valorant:local-status', async () => {
    const lock = readLockfile();
    const session = loadSessionFromDisk(app);
    return {
      isElectron: true,
      lockfilePresent: Boolean(lock),
      safeStorageAvailable: canUseSafeStorage(),
      session: publicSessionView(session),
      hasTokens: Boolean(session?.accessToken && session?.entitlementToken),
    };
  });

  ipcMain.handle('valorant:local-connect', async () => {
    try {
      const { session } = await connectFromLockfile();
      saveSessionToDisk(app, session);
      return {
        ok: true,
        session: publicSessionView(session),
        tokens: {
          accessToken: session.accessToken,
          entitlementToken: session.entitlementToken,
        },
      };
    } catch (err) {
      return {
        ok: false,
        code: err.code || 'CONNECT_FAILED',
        error: err.message || 'Failed to connect via Riot Client',
      };
    }
  });

  ipcMain.handle('valorant:local-get-tokens', async () => {
    const session = loadSessionFromDisk(app);
    if (!session?.accessToken || !session?.entitlementToken) {
      return { ok: false, error: 'No local Valorant session' };
    }
    return {
      ok: true,
      tokens: {
        accessToken: session.accessToken,
        entitlementToken: session.entitlementToken,
      },
      session: publicSessionView(session),
    };
  });

  ipcMain.handle('valorant:local-save-session', async (_evt, patch = {}) => {
    const prev = loadSessionFromDisk(app) || {};
    // Never accept password fields
    if (patch.password || patch.riotPassword) {
      return { ok: false, error: 'Passwords are not accepted' };
    }
    const next = {
      ...prev,
      ...patch,
      linkMethod: patch.linkMethod || prev.linkMethod || 'local_client',
    };
    saveSessionToDisk(app, next);
    return { ok: true, session: publicSessionView(next) };
  });

  ipcMain.handle('valorant:local-disconnect', async () => {
    clearSessionDisk(app);
    return { ok: true };
  });

  // ── Adım 4: friends + presence + friend requests (local chat API) ──
  ipcMain.handle('valorant:local-friends', async () => {
    try {
      const session = loadSessionFromDisk(app);
      const bundle = await fetchLocalFriendsBundle();
      const merged = friendsShape.mergeFriendsAndPresences({
        friends: bundle.friendsRaw,
        presences: bundle.presencesRaw,
        selfPuuid: session?.puuid || null,
      });
      const requests = friendsShape.shapeFriendRequests(bundle.requestsRaw);
      return {
        ok: true,
        source: 'local_chat',
        ...merged,
        requests: requests.requests,
        inbound: requests.inbound,
        outbound: requests.outbound,
      };
    } catch (err) {
      return {
        ok: false,
        code: err.code || 'FRIENDS_FAILED',
        error: err.message || 'Failed to load friends',
        friends: [],
        counts: { total: 0, online: 0, inGame: 0, offline: 0 },
        requests: [],
        inbound: [],
        outbound: [],
      };
    }
  });

  ipcMain.handle('valorant:local-friend-request-send', async (_evt, payload = {}) => {
    try {
      if (payload.password || payload.riotPassword) {
        return { ok: false, error: 'Passwords are not accepted' };
      }
      let gameName = String(payload.gameName || '').trim();
      let tagLine = String(payload.tagLine || '').trim();
      if ((!gameName || !tagLine) && payload.riotId) {
        const parts = String(payload.riotId).split('#');
        gameName = (parts[0] || '').trim();
        tagLine = (parts[1] || '').trim();
      }
      if (!gameName || !tagLine) {
        return { ok: false, error: 'gameName and tagLine (or riotId Name#TAG) required' };
      }
      await sendLocalFriendRequest(gameName, tagLine);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        code: err.code || 'FRIEND_REQUEST_FAILED',
        error: err.message || 'Failed to send friend request',
      };
    }
  });

  ipcMain.handle('valorant:local-friend-request-remove', async (_evt, payload = {}) => {
    try {
      const puuid = String(payload.puuid || '').trim();
      if (!puuid) return { ok: false, error: 'puuid required' };
      await removeLocalFriendRequest(puuid);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        code: err.code || 'FRIEND_REQUEST_FAILED',
        error: err.message || 'Failed to remove friend request',
      };
    }
  });

  ipcMain.handle('valorant:local-friend-request-accept', async (_evt, payload = {}) => {
    try {
      const puuid = String(payload.puuid || '').trim();
      if (!puuid) return { ok: false, error: 'puuid required' };
      await acceptLocalFriendRequest(puuid);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        code: err.code || 'FRIEND_REQUEST_FAILED',
        error: err.message || 'Failed to accept friend request',
      };
    }
  });
}

module.exports = {
  registerRiotLocalAuthIPC,
  readLockfile,
  connectFromLockfile,
  publicSessionView,
  fetchLocalFriendsBundle,
  sendLocalFriendRequest,
  removeLocalFriendRequest,
  acceptLocalFriendRequest,
};
