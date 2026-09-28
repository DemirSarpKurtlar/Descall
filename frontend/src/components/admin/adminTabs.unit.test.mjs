import test from "node:test";
import assert from "node:assert/strict";
import { visibleAdminTabs } from "./adminTabs.js";

const tabs = [
  { id: "overview" },
  { id: "voice" },
  { id: "system" },
  { id: "audit" },
];

test("voice recordings sit at the end only for the account named admin", () => {
  const shown = visibleAdminTabs(tabs, "admin");
  assert.deepEqual(shown.map((tab) => tab.id), ["overview", "system", "audit", "voice"]);
});

test("an admin-role account with any other username does not see voice recordings", () => {
  for (const username of ["Admin", "moderator", "yonetici", "demir", ""]) {
    const shown = visibleAdminTabs(tabs, username);
    assert.deepEqual(shown.map((tab) => tab.id), ["overview", "system", "audit"]);
  }
});
