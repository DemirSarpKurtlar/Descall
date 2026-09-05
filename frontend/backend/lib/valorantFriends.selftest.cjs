'use strict';
const assert = require('assert');
const {
  decodePrivatePresence,
  presenceStatus,
  mergeFriendsAndPresences,
  shapeFriendRequests,
} = require('./valorantFriends');

// Flat private presence
const flat = Buffer.from(
  JSON.stringify({
    isValid: true,
    sessionLoopState: 'INGAME',
    queueId: 'competitive',
    partySize: 3,
    maxPartySize: 5,
    competitiveTier: 15,
    isIdle: false,
    partyOwnerMatchScoreAllyTeam: 7,
    partyOwnerMatchScoreEnemyTeam: 5,
  }),
  'utf8'
).toString('base64');

const decodedFlat = decodePrivatePresence(flat);
assert.strictEqual(decodedFlat.sessionLoopState, 'INGAME');
assert.strictEqual(decodedFlat.queueId, 'competitive');
assert.strictEqual(decodedFlat.rankTier, 'Platinum 1');
assert.deepStrictEqual(decodedFlat.score, { ally: 7, enemy: 5 });

// Nested (2025+) private presence
const nested = Buffer.from(
  JSON.stringify({
    isValid: true,
    matchPresenceData: { sessionLoopState: 'MENUS', matchMap: '' },
    partyPresenceData: {
      queueId: 'unrated',
      partySize: 2,
      maxPartySize: 5,
      partyState: 'MATCHMAKING',
      partyAccessibility: 'OPEN',
    },
    playerPresenceData: { competitiveTier: 8, accountLevel: 42, isIdle: false },
  }),
  'utf8'
).toString('base64');

const decodedNested = decodePrivatePresence(nested);
assert.strictEqual(decodedNested.sessionLoopState, 'MENUS');
assert.strictEqual(decodedNested.queueId, 'unrated');
assert.strictEqual(decodedNested.partyState, 'MATCHMAKING');

const statusQueue = presenceStatus(
  { product: 'valorant', state: 'chat', puuid: 'a' },
  decodedNested
);
assert.strictEqual(statusQueue, 'queue');

const statusIngame = presenceStatus(
  { product: 'valorant', state: 'dnd', puuid: 'b' },
  decodedFlat
);
assert.strictEqual(statusIngame, 'ingame');

const merged = mergeFriendsAndPresences({
  selfPuuid: 'self',
  friends: [
    { puuid: 'f1', game_name: 'Alice', game_tag: 'EU', note: '' },
    { puuid: 'f2', game_name: 'Bob', game_tag: 'NA', note: '' },
    { puuid: 'self', game_name: 'Me', game_tag: 'TR', note: '' },
  ],
  presences: [
    {
      puuid: 'f1',
      game_name: 'Alice',
      game_tag: 'EU',
      product: 'valorant',
      state: 'chat',
      private: flat,
    },
    {
      puuid: 'self',
      game_name: 'Me',
      game_tag: 'TR',
      product: 'valorant',
      state: 'chat',
      private: nested,
    },
  ],
});

assert.strictEqual(merged.friends.length, 2);
assert.strictEqual(merged.friends[0].puuid, 'f1');
assert.strictEqual(merged.friends[0].status, 'ingame');
assert.strictEqual(merged.friends[0].inGame, true);
assert.strictEqual(merged.friends[1].status, 'offline');
assert.strictEqual(merged.counts.online, 1);
assert.strictEqual(merged.counts.inGame, 1);

const reqs = shapeFriendRequests([
  {
    puuid: 'r1',
    game_name: 'Eve',
    game_tag: 'ONE',
    subscription: 'pending_in',
  },
  {
    puuid: 'r2',
    game_name: 'Dan',
    game_tag: 'TWO',
    subscription: 'pending_out',
  },
]);
assert.strictEqual(reqs.inbound.length, 1);
assert.strictEqual(reqs.outbound.length, 1);
assert.strictEqual(reqs.inbound[0].riotId, 'Eve#ONE');

console.log('valorantFriends.selftest.cjs: ok');
