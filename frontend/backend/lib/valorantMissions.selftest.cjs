'use strict';
const assert = require('assert');

delete process.env.RIOT_API_KEY;

const {
  riotApiKeyConfigured,
  notConfiguredPayload,
  missionsCapabilities,
  shapeMission,
  shapeContract,
  pickBattlePass,
  getMissionsBundle,
} = require('./valorantMissions');

assert.strictEqual(riotApiKeyConfigured(), false);

const missing = notConfiguredPayload();
assert.strictEqual(missing.configured, false);
assert.deepStrictEqual(missing.envNeeded, ['RIOT_API_KEY']);
assert.strictEqual(missing.adim, 5);
assert.ok(Array.isArray(missing.missions));
assert.strictEqual(missing.battlePass, null);
assert.strictEqual(missing.code, 'RIOT_API_KEY_MISSING');

const caps = missionsCapabilities();
assert.strictEqual(caps.configured, false);
assert.deepStrictEqual(caps.envNeeded, ['RIOT_API_KEY']);
assert.strictEqual(caps.implemented, true);
assert.strictEqual(caps.features.weeklyMissions, true);
assert.strictEqual(caps.features.battlePass, true);
assert.strictEqual(caps.clientHook, 'useValorantMissions');
assert.ok(caps.endpoints.missions.includes('/missions'));

(async () => {
  // Missing-key path: no crash even with tokens/puuid present
  const out = await getMissionsBundle({
    accessToken: 'fake',
    entitlementToken: 'fake',
    region: 'eu',
    puuid: 'puuid-test',
  });
  assert.strictEqual(out.configured, false);
  assert.deepStrictEqual(out.envNeeded, ['RIOT_API_KEY']);
  assert.ok(!out.ok);

  const mission = shapeMission({
    ID: 'm1',
    Complete: false,
    ExpirationTime: '2026-09-10T00:00:00Z',
    Objectives: { o1: 3, o2: 1 },
  });
  assert.strictEqual(mission.id, 'm1');
  assert.strictEqual(mission.complete, false);
  assert.strictEqual(mission.objectiveProgress, 4);

  const defs = {
    'bp-1': {
      uuid: 'bp-1',
      displayName: 'Episode X Act Y',
      kind: 'battlepass',
      relationType: 'Season',
    },
    'ag-1': {
      uuid: 'ag-1',
      displayName: 'Jett Gear',
      kind: 'agent',
      relationType: 'Agent',
    },
  };
  const bp = pickBattlePass(
    [
      {
        ContractDefinitionID: 'bp-1',
        ProgressionLevelReached: 12,
        ProgressionTowardsNextLevel: 4000,
        ContractProgression: { TotalProgressionEarned: 90000 },
      },
      {
        ContractDefinitionID: 'ag-1',
        ProgressionLevelReached: 3,
        ProgressionTowardsNextLevel: 1000,
        ContractProgression: { TotalProgressionEarned: 50000 },
      },
    ],
    defs
  );
  assert.strictEqual(bp.kind, 'battlepass');
  assert.strictEqual(bp.level, 12);
  assert.strictEqual(bp.displayName, 'Episode X Act Y');

  const agent = shapeContract(
    {
      ContractDefinitionID: 'ag-1',
      ProgressionLevelReached: 3,
      ProgressionTowardsNextLevel: 1000,
      ContractProgression: { TotalProgressionEarned: 50000 },
    },
    defs
  );
  assert.strictEqual(agent.kind, 'agent');
  assert.strictEqual(agent.displayName, 'Jett Gear');

  process.env.RIOT_API_KEY = 'test-key-not-real';
  assert.strictEqual(riotApiKeyConfigured(), true);
  const capsOn = missionsCapabilities();
  assert.strictEqual(capsOn.configured, true);
  assert.deepStrictEqual(capsOn.envNeeded, []);

  delete process.env.RIOT_API_KEY;
  console.log('valorantMissions.selftest.cjs: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
