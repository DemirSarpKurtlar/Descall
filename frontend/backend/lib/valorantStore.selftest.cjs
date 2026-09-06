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
  getSkinDetail,
  shapeSkinLevel,
  shapeSkinChroma,
  findSkinDef,
  findLevelInSkin,
  findChromaInSkin,
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
assert.ok(caps.endpoints.skinDetail.includes('/skins/:uuid'));
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

const levelRow = shapeSkinLevel({
  uuid: 'lvl-1',
  displayName: 'Level 1',
  displayIcon: 'https://media.example/level.png',
  streamedVideo: 'https://valorant.dyn.riotcdn.net/x/videos/example_level.mp4',
});
assert.strictEqual(levelRow.streamedVideo, 'https://valorant.dyn.riotcdn.net/x/videos/example_level.mp4');
assert.strictEqual(shapeSkinLevel({ displayName: 'no-uuid' }), null);
assert.strictEqual(
  shapeSkinChroma({
    uuid: 'chroma-1',
    displayName: 'Chroma',
    displayIcon: 'https://media.example/chroma.png',
    swatch: 'https://media.example/swatch.png',
    streamedVideo: null,
  }).streamedVideo,
  null
);

const skinCatalog = {
  'skin-1': {
    uuid: 'skin-1',
    displayName: 'Reaver Vandal',
    displayIcon: 'https://x',
    levels: [
      {
        uuid: 'lvl-1',
        displayName: 'Reaver Vandal',
        displayIcon: 'https://lvl',
        streamedVideo: 'https://valorant.dyn.riotcdn.net/x/videos/reaver_lvl.mp4',
      },
    ],
    chromas: [
      {
        uuid: 'chroma-1',
        displayName: 'Reaver Vandal Black',
        displayIcon: 'https://chroma',
        swatch: 'https://swatch',
        streamedVideo: 'https://valorant.dyn.riotcdn.net/x/videos/reaver_chroma.mp4',
      },
    ],
  },
};
assert.strictEqual(findSkinDef('lvl-1', skinCatalog).uuid, 'skin-1');
assert.strictEqual(findLevelInSkin(skinCatalog['skin-1'], 'lvl-1').uuid, 'lvl-1');
assert.strictEqual(findChromaInSkin(skinCatalog['skin-1'], 'chroma-1').uuid, 'chroma-1');

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
    skins: skinCatalog,
    weapons: { 'weapon-1': { displayName: 'Vandal' } },
    cards: { 'card-1': { displayName: 'Card', displayIcon: null } },
    titles: { 'title-1': { displayName: 'Title' } },
    sprays: { 'spray-1': { displayName: 'Spray', displayIcon: null } },
    buddies: { 'buddy-1': { displayName: 'Buddy' } },
  }
);
assert.strictEqual(loadout.guns[0].skinName, 'Reaver Vandal');
assert.strictEqual(
  loadout.guns[0].levelVideo,
  'https://valorant.dyn.riotcdn.net/x/videos/reaver_lvl.mp4'
);
assert.strictEqual(
  loadout.guns[0].chromaVideo,
  'https://valorant.dyn.riotcdn.net/x/videos/reaver_chroma.mp4'
);
assert.strictEqual(loadout.guns[0].level.uuid, 'lvl-1');
assert.strictEqual(loadout.guns[0].chroma.uuid, 'chroma-1');
assert.strictEqual(loadout.guns[0].levels.length, 1);
assert.strictEqual(loadout.guns[0].chromas.length, 1);
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

  // Catalog-only detail must work without RIOT_API_KEY (live network to valorant-api).
  let detailErr = null;
  try {
    await getSkinDetail('');
  } catch (err) {
    detailErr = err;
  }
  assert.ok(detailErr);
  assert.strictEqual(detailErr.code, 'SKIN_UUID_REQUIRED');

  const detail = await getSkinDetail('a67c2daa-4f4d-1af0-0ff4-6fafde471776');
  assert.strictEqual(detail.ok, true);
  assert.strictEqual(detail.catalogOnly, true);
  assert.ok(detail.skin);
  assert.ok(Array.isArray(detail.skin.levels));
  assert.ok(Array.isArray(detail.skin.chromas));
  assert.ok(detail.skin.levels.length > 0);
  const anyLevelVideo = detail.skin.levels.some((l) => l.streamedVideo);
  assert.ok(anyLevelVideo, 'expected real streamedVideo from valorant-api levels');
  for (const l of detail.skin.levels) {
    assert.ok(l.streamedVideo === null || String(l.streamedVideo).startsWith('http'));
  }
  for (const c of detail.skin.chromas) {
    assert.ok(c.streamedVideo === null || String(c.streamedVideo).startsWith('http'));
    assert.ok('swatch' in c);
  }

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
