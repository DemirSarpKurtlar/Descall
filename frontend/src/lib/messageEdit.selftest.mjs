// Composer edit mode (iOS glass) and the form-accessory hide.
// Run: node src/lib/messageEdit.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  _resetMessageEditFeedback,
  cancelMessageEdit,
  resolveMessageEdited,
  resolveMessageEditFailed,
  trackMessageEdit,
} from "./messageEditFeedback.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

_resetMessageEditFeedback();
assert.equal(resolveMessageEdited("m1"), false);

let ok = 0;
let bad = 0;
trackMessageEdit("m1", { onSuccess: () => { ok += 1; }, onError: () => { bad += 1; } });
assert.equal(resolveMessageEdited("other"), false);
assert.equal(resolveMessageEdited("m1"), true);
assert.equal(ok, 1);
assert.equal(resolveMessageEdited("m1"), false);

trackMessageEdit("m2", { onSuccess: () => { ok += 1; }, onError: () => { bad += 1; } });
assert.equal(resolveMessageEditFailed("m2"), true);
assert.equal(bad, 1);
assert.equal(resolveMessageEditFailed("m2"), false);

trackMessageEdit("m3", { onSuccess: () => { ok += 1; }, onError: () => { bad += 1; } });
cancelMessageEdit("m3");
assert.equal(resolveMessageEdited("m3"), false);
assert.equal(ok, 1);
assert.equal(bad, 1);

const list = read("src/components/chat/MessageList.jsx");
assert.match(list, /editing && !glass \?/);
assert.match(list, /onStartEdit\?\.\(/);
assert.match(list, /className="msg-edit-box"/);
assert.match(list, /is-editing/);

const composer = read("src/components/chat/MessageComposer.jsx");
assert.match(composer, /composer-edit-bar/);
assert.match(composer, /t\("Edit message"\)/);
assert.match(composer, /editing \? <Check/);
assert.match(composer, /canSaveEdit/);
assert.match(composer, /replyStripTransition/);

const app = read("src/App.jsx");
assert.match(app, /dm:message:edited/);
assert.match(app, /group:message:edited/);
assert.match(app, /trackMessageEdit/);

const swift = read("ios/App/App/DescallBridgeViewController.swift");
assert.match(swift, /inputAccessoryView/);
assert.match(swift, /DescallFormAccessoryBar\.hide\(\)/);

const tr = read("src/i18n/locales/tr.js");
assert.match(tr, /"Edit message": "Mesajı düzenle"/);

const handlers = read("backend/socket/handlers.js");
assert.match(handlers, /code: "EDIT_FAILED"/);
assert.match(handlers, /dm:message:edited/);
assert.match(handlers, /group:message:edited/);

console.log("messageEdit.selftest ok");
