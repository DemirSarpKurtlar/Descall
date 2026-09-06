'use strict';
const assert = require('assert');

delete process.env.RIOT_API_KEY;

const {
  riotApiKeyConfigured,
  notConfiguredPayload,
  storeCapabilities,
  shapeWallet,
  shapeLoadout,
  applyLoadoutPatch,
  getWallet,
  getOwnedSkins,
  getLoadout,
  getStorefront,
  putLoadout,
  CURRENCY,
  ITEM_TYPE,
} = require('./valorantStore');

assert.strictEqual(riotApiKeyConfigured(), false);

const missing = notConfiguredPayload();
assert.strictEqual(missing.configured, false);
assert.deepStrictEqual(missing.envNeeded, ['RIOT_API_KEY']);
assert.strictEqual(missing.adim, 6);
assert.strictEqual(missing.code, 'RIOT_API_KEY_MISSING');
assert.strictEqual(missing.wallet, null);
assert.ok(Array.isArray(missing.skins));
assert.ok(Array.isArray(missing.offers));

const caps = storeCapabilities();
assert.strictEqual(caps.configured, false);
assert.deepStrictEqual(caps.envNeeded, ['RIOT_API_KEY']);
assert.strictEqual(caps.implemented, true);
assert.strictEqual(caps.features.wallet, true);
assert.strictEqual(caps.features.loadoutEquip, true);
assert.strictEqual(caps.features.dailyStore, true);
assert.ok(caps.endpoints.wallet.includes('/wallet'));
assert.ok(caps.endpoints.loadout.includes('/loadout'));
assert.ok(caps.clientHooks.includes('useValorantStore'));
assert.ok(caps.clientHooks.includes('useValorantLoadout'));

const wallet = shapeWallet({
  [CURRENCY.vp]: 1200,
  [CURRENCY.radianite]: 45,
  [CURRENCY.kingdom]: 10,
});
assert.strictEqual(wallet.vp, 1200);
assert.strictEqual(wallet.radianite, 45);
assert.strictEqual(wallet.kingdom, 10);

const loadout = shapeLoadout(
  {
    Subject: 'puuid-1',
    Version: 3,
    Incognito: false,
    Guns: [
      {
        ID: 'weapon-1',
        SkinID: 'skin-1',
        SkinLevelID: 'lvl-1',
        ChromaID: 'chroma-1',
        CharmID: 'buddy-1',
        Attachments: [],
      },
    ],
    Sprays: [{ EquipSlotID: 'slot-1', SprayID: 'spray-1', SprayLevelID: null }],
    Identity: {
      PlayerCardID: 'card-1',
      PlayerTitleID: 'title-1',
      AccountLevel: 42,
      PreferredLevelBorderID: null,
      HideAccountLevel: false,
    },
  },
  {
    skins: { 'skin-1': { displayName: 'Reaver Vandal', displayIcon: 'https://x' } },
    weapons: { 'weapon-1': { displayName: 'Vandal' } },
    cards: { 'card-1': { displayName: 'Card', displayIcon: null } },
    titles: { 'title-1': { displayName: 'Title' } },
    sprays: { 'spray-1': { displayName: 'Spray', displayIcon: null } },
    buddies: { 'buddy-1': { displayName: 'Buddy' } },
  }
);
assert.strictEqual(loadout.guns[0].skinName, 'Reaver Vandal');
assert.strictEqual(loadout.identity.cardName, 'Card');
assert.strictEqual(loadout.identity.titleName, 'Title');
assert.strictEqual(loadout.sprays[0].sprayName, 'Spray');

const patched = applyLoadoutPatch(
  {
    Subject: 'puuid-1',
    Version: 3,
    Guns: [
      {
        ID: 'weapon-1',
        SkinID: 'old-skin',
        SkinLevelID: 'lvl-old',
        ChromaID: 'chroma-old',
        Attachments: [],
      },
    ],
    Sprays: [],
    Identity: { PlayerCardID: 'old-card', PlayerTitleID: 'old-title', AccountLevel: 1 },
    Incognito: false,
  },
  {
    guns: [{ weaponId: 'weapon-1', skinId: 'new-skin', skinLevelId: 'lvl-new', chromaId: 'chroma-new' }],
    identity: { cardId: 'new-card', titleId: 'new-title' },
    sprays: [{ slotId: 'slot-a', sprayId: 'spray-a' }],
  }
);
assert.strictEqual(patched.Guns[0].SkinID, 'new-skin');
assert.strictEqual(patched.Identity.PlayerCardID, 'new-card');
assert.strictEqual(patched.Identity.PlayerTitleID, 'new-title');
assert.strictEqual(patched.Sprays[0].SprayID, 'spray-a');
assert.ok(ITEM_TYPE.skins);

(async () => {
  const tokens = {
    accessToken: 'fake',
    entitlementToken: 'fake',
    region: 'eu',
    puuid: 'puuid-test',
  };
  for (const fn of [getWallet, getOwnedSkins, getLoadout, getStorefront]) {
    const out = await fn(tokens);
    assert.strictEqual(out.configured, false, `${fn.name} missing-key`);
    assert.deepStrictEqual(out.envNeeded, ['RIOT_API_KEY']);
  }
  const putOut = await putLoadout({ ...tokens, patch: { identity: { cardId: 'x' } } });
  assert.strictEqual(putOut.configured, false);

  process.env.RIOT_API_KEY = 'test-key-not-real';
  assert.strictEqual(riotApiKeyConfigured(), true);
  const capsOn = storeCapabilities();
  assert.strictEqual(capsOn.configured, true);
  assert.deepStrictEqual(capsOn.envNeeded, []);

  delete process.env.RIOT_API_KEY;
  console.log('valorantStore.selftest.cjs: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
