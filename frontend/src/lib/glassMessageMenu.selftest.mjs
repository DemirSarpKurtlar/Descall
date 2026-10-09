import assert from "node:assert/strict";
import { MESSAGE_MENU_LONG_PRESS_MS, messageMenuOpensOnTap } from "./glassMessageMenu.js";

assert.equal(messageMenuOpensOnTap(false), true);
assert.equal(messageMenuOpensOnTap(true), false);
assert.ok(MESSAGE_MENU_LONG_PRESS_MS >= 350 && MESSAGE_MENU_LONG_PRESS_MS <= 600);
console.log("glassMessageMenu.selftest ok");
