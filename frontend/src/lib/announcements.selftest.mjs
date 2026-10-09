import assert from "node:assert/strict";
import { normalizeAnnouncement, normalizeAnnouncements } from "./announcements.js";

const snake = normalizeAnnouncement({
  id: "1",
  title: "Geri bildirim",
  content: "Yazın",
  created_at: "2026-09-25T13:49:28.776Z",
  author: "admin",
});
assert.equal(snake.createdAt, "2026-09-25T13:49:28.776Z");
assert.equal(snake.title, "Geri bildirim");

const camel = normalizeAnnouncement({ id: "2", title: "A", createdAt: "2026-01-01T00:00:00.000Z" });
assert.equal(camel.createdAt, "2026-01-01T00:00:00.000Z");

const rows = normalizeAnnouncements({
  announcements: [
    { id: "a", title: "One", created_at: "2026-08-01T00:00:00.000Z" },
    null,
    { id: "b", title: "Two", createdAt: "2026-08-02T00:00:00.000Z" },
  ],
});
assert.equal(rows.length, 2);
assert.equal(rows[0].createdAt, "2026-08-01T00:00:00.000Z");
assert.equal(rows[1].createdAt, "2026-08-02T00:00:00.000Z");
assert.deepEqual(normalizeAnnouncements({}), []);
assert.deepEqual(normalizeAnnouncements(null), []);

console.log("announcements.selftest: ok");
