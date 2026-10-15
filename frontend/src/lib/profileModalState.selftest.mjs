// Opening a profile must not paint the previous person's record.
// Run: node src/lib/profileModalState.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptProfilePayload,
  friendStateFor,
  memberSinceIso,
  ownedList,
  seedProfile,
  visibleProfile,
} from "./profileModalState.js";

const here = dirname(fileURLToPath(import.meta.url));
const modal = readFileSync(join(here, "../components/social/UserProfileModal.jsx"), "utf8");
const list = readFileSync(join(here, "../components/chat/MessageList.jsx"), "utf8");
const chat = readFileSync(join(here, "../components/layout/ChatPanel.jsx"), "utf8");
const call = readFileSync(join(here, "../components/CallOverlay.jsx"), "utf8");
const css = readFileSync(join(here, "../styles/base.css"), "utf8");

const previous = {
  id: "user-a",
  username: "admin",
  displayName: "admin",
  avatarUrl: "https://cdn.example/a.png",
  createdAt: "2020-01-01T00:00:00.000Z",
  bannerUrl: "https://cdn.example/banner-a.png",
};
const seed = seedProfile({
  userId: "user-b",
  username: "demirr",
  displayName: "demirr",
  avatarUrl: "https://cdn.example/b.png",
});

const shown = visibleProfile(previous, "user-b", seed);
assert.equal(shown.id, "user-b");
assert.equal(shown.username, "demirr");
assert.equal(shown.avatarUrl, "https://cdn.example/b.png");
assert.equal(shown.bannerUrl, undefined);
assert.equal(memberSinceIso("user-b", [previous, seed]), null);

const withDate = seedProfile({
  userId: "user-b",
  username: "demirr",
  createdAt: "2026-04-19T00:00:00.000Z",
});
assert.equal(memberSinceIso("user-b", [previous, withDate]), "2026-04-19T00:00:00.000Z");

const fetched = acceptProfilePayload("user-b", {
  id: "user-b",
  username: "demirr",
  created_at: "2026-04-19T00:00:00.000Z",
});
assert.equal(visibleProfile(fetched, "user-b", seed).username, "demirr");
assert.equal(memberSinceIso("user-b", [fetched, previous]), "2026-04-19T00:00:00.000Z");
assert.equal(acceptProfilePayload("user-b", previous), null);
assert.equal(acceptProfilePayload("user-b", { username: "demirr" })?.id, "user-b");

assert.equal(
  friendStateFor("user-b", [{ id: "user-a" }], { userId: "user-a", state: "friend" }),
  "none",
);
assert.equal(
  friendStateFor("user-b", [{ id: "user-b" }], { userId: "user-a", state: "none" }),
  "friend",
);
assert.equal(ownedList("user-a", "user-b", [{ id: "x" }]).length, 0);

assert.match(modal, /key=\{active\.userId \|\| "closed"\}/);
assert.match(modal, /new AbortController\(\)/);
assert.match(modal, /acceptProfilePayload/);
assert.match(modal, /visibleProfile/);
assert.match(modal, /friendStateFor/);
assert.match(modal, /profile-glass-skeleton/);
assert.match(modal, /signal: ctrl\.signal/);

for (const source of [list, chat]) {
  assert.match(source, /<UserProfileModal/);
  assert.match(source, /displayName=/);
}
assert.match(call, /<UserProfileModal/);
assert.match(call, /displayName=/);

const skeleton = css.slice(css.indexOf(".profile-glass-skeleton {"));
assert.match(skeleton, /backdrop-filter:\s*blur\(12px\) saturate\(160%\)/);
assert.match(skeleton, /prefers-reduced-transparency:\s*reduce/);
assert.match(skeleton, /html\.a11y-solid \.profile-glass-skeleton/);
assert.match(skeleton, /prefers-reduced-motion:\s*reduce/);

console.log("profileModalState.selftest ok");
