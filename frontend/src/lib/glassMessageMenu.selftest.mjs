import assert from "node:assert/strict";
import {
  MESSAGE_MENU_LONG_PRESS_MS,
  MESSAGE_MENU_OPEN_GUARD_MS,
  messageMenuOpensOnTap,
  openingPressShouldSwallow,
} from "./glassMessageMenu.js";

assert.equal(messageMenuOpensOnTap(false), true);
assert.equal(messageMenuOpensOnTap(true), false);
assert.ok(MESSAGE_MENU_LONG_PRESS_MS >= 350 && MESSAGE_MENU_LONG_PRESS_MS <= 600);
assert.equal(MESSAGE_MENU_OPEN_GUARD_MS, 400);
assert.equal(openingPressShouldSwallow(1000, 1000), true);
assert.equal(openingPressShouldSwallow(1000, 1399), true);
assert.equal(openingPressShouldSwallow(1000, 1400), false);
assert.equal(openingPressShouldSwallow(1000, 999), false);
console.log("glassMessageMenu.selftest ok");
