import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNext } from "../lib/picker.mjs";
import { buildCaption, captionHash } from "../lib/caption.mjs";
import { makeScript, policy } from "./fixtures.mjs";

const mk = (id, theme) => makeScript({ id, theme, hook: { lines: [`Hook ${id}`] }, caption: `Caption ${id}` });
const lib = [mk("a1", "ses-kalitesi"), mk("a2", "ses-kalitesi"), mk("b1", "oyun"), mk("b2", "oyun"), mk("c1", "ipuclari")];
const post = (s, date) => ({ scriptId: s.id, theme: s.theme, date, mediaId: "m", captionHash: captionHash(buildCaption(s)), hook: s.hook.lines.join(" ") });
const NOW = new Date("2026-11-10T16:15:00Z"); // 19:15 Istanbul

test("with an empty log it takes the first script of the first theme", () => {
  const r = pickNext({ scripts: lib, posts: [], policy, now: NOW });
  assert.equal(r.script.id, "a1");
});

test("themes rotate: never-posted themes first, then the one that waited longest", () => {
  let posts = [];
  const order = [];
  for (let d = 1; d <= 5; d++) {
    const r = pickNext({ scripts: lib, posts, policy, now: new Date(`2026-11-0${d}T16:15:00Z`) });
    order.push(r.script.id);
    posts = [...posts, post(r.script, `2026-11-0${d}`)];
  }
  assert.deepEqual(order, ["a1", "b1", "c1", "a2", "b2"]);
  const r = pickNext({ scripts: lib, posts, policy, now: new Date("2026-11-06T16:15:00Z") });
  assert.equal(r.script, null);
  assert.match(r.reason, /exhausted/);
});

test("nothing posts twice: posted ids are never picked again", () => {
  const posts = [post(lib[0], "2026-11-01")];
  const r = pickNext({ scripts: [lib[0]], posts, policy, now: NOW });
  assert.equal(r.script, null);
});

test("one post per Istanbul day (dry runs may ignore it)", () => {
  const posts = [post(lib[0], "2026-11-10")];
  assert.match(pickNext({ scripts: lib, posts, policy, now: NOW }).reason, /already posted today/);
  assert.ok(pickNext({ scripts: lib, posts, policy, now: NOW, allowSameDay: true }).script);
  // 23:30 UTC on the 9th is already the 10th in Istanbul.
  assert.match(pickNext({ scripts: lib, posts, policy, now: new Date("2026-11-09T23:30:00Z") }).reason, /already posted today/);
});

test("a forced script_id is honoured unless it was posted or is unknown", () => {
  assert.equal(pickNext({ scripts: lib, posts: [], policy, now: NOW, forcedId: "c1" }).script.id, "c1");
  assert.match(pickNext({ scripts: lib, posts: [], policy, now: NOW, forcedId: "zz" }).reason, /not in the valid library/);
  assert.match(pickNext({ scripts: lib, posts: [post(lib[4], "2026-11-01")], policy, now: NOW, forcedId: "c1" }).reason, /already posted/);
});

test("captions already on the Instagram account are skipped", () => {
  const r = pickNext({ scripts: lib, posts: [], policy, now: NOW, recentCaptions: [buildCaption(lib[0])] });
  assert.equal(r.script.id, "a2");
});
