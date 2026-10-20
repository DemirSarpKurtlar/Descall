'use strict';
const assert = require('assert');
const { normalizeActivityType } = require('./activityKind');
assert.equal(normalizeActivityType('Discord', 'game'), 'app');
assert.equal(normalizeActivityType('Using Discord', 'game'), 'app');
assert.equal(normalizeActivityType('Steam', 'game'), 'app');
assert.equal(normalizeActivityType('Counter-Strike 2', 'game'), 'game');
assert.equal(normalizeActivityType('Discord', 'communication'), 'communication');
console.log('activityKind.selftest.cjs: ok');
