import assert from "node:assert/strict";
import {
  MESSAGE_MENU_LONG_PRESS_MS,
  messageMenuOpensOnTap,
  pressToActivate,
} from "./glassMessageMenu.js";

assert.equal(messageMenuOpensOnTap(false), true);
assert.equal(messageMenuOpensOnTap(true), false);
assert.ok(MESSAGE_MENU_LONG_PRESS_MS >= 350 && MESSAGE_MENU_LONG_PRESS_MS <= 600);

function click() {
  return {
    defaulted: false,
    stopped: false,
    preventDefault() { this.defaulted = true; },
    stopPropagation() { this.stopped = true; },
  };
}

const ran = [];
const row = pressToActivate(() => ran.push("edit"));
const leaked = click();
row.onClick(leaked);
assert.equal(ran.length, 0);
assert.equal(leaked.defaulted, true);
assert.equal(leaked.stopped, true);

row.onPointerDown({ button: 0 });
row.onClick(click());
assert.deepEqual(ran, ["edit"]);

row.onClick(click());
assert.equal(ran.length, 1);

const right = pressToActivate(() => ran.push("right"));
right.onPointerDown({ button: 2 });
right.onClick(click());
assert.equal(ran.length, 1);

console.log("glassMessageMenu.selftest ok");
