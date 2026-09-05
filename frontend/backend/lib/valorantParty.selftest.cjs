'use strict';
const assert = require('assert');
const {
  tierName,
  queueLabel,
  shardForRegion,
  glzBase,
} = require('./valorantParty');

assert.strictEqual(tierName(0), 'Unranked');
assert.strictEqual(tierName(3), 'Iron 1');
assert.strictEqual(tierName(27), 'Radiant');
assert.strictEqual(queueLabel('competitive'), 'Competitive');
assert.strictEqual(queueLabel('swiftplay'), 'Swiftplay');
assert.strictEqual(shardForRegion('eu'), 'eu');
assert.strictEqual(shardForRegion('latam'), 'na');
assert.strictEqual(shardForRegion('br'), 'na');
assert.ok(glzBase('eu').includes('glz-eu-1.eu.a.pvp.net'));
assert.ok(glzBase('na').includes('glz-na-1.na.a.pvp.net'));
console.log('valorantParty.selftest.cjs: ok');
