import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAppDate,
  istanbulDayKey,
  istanbulHour,
  formatTimeAgo,
  formatAppDateTime,
  formatAppDate,
} from "./datetime.js";

function t(key, vars = {}) {
  return key.replace("{count}", String(vars.count ?? ""));
}

test("naive Postgres timestamps are UTC, not local wall-clock", () => {
  const d = parseAppDate("2026-08-25T22:11:47.629");
  assert.ok(d);
  assert.equal(d.toISOString(), "2026-08-25T22:11:47.629Z");
});

test("space-separated naive timestamps are also UTC", () => {
  const d = parseAppDate("2026-08-25 22:11:47.629");
  assert.ok(d);
  assert.equal(d.toISOString(), "2026-08-25T22:11:47.629Z");
});

test("explicit Z timestamps stay UTC", () => {
  const d = parseAppDate("2026-08-25T22:11:47.629Z");
  assert.equal(d.toISOString(), "2026-08-25T22:11:47.629Z");
});

test("22:11 UTC is the next calendar day in Istanbul", () => {
  assert.equal(istanbulDayKey("2026-08-25T22:11:47.629"), "2026-08-26");
  assert.equal(istanbulHour("2026-08-25T22:11:47.629"), 1);
});

test("absolute time is shown in Europe/Istanbul", () => {
  const shown = formatAppDateTime("2026-08-25T22:11:47.629", "tr");
  assert.match(shown, /26\.08\.2026/);
  assert.match(shown, /01:11:47/);
});

test("date-only format uses Istanbul calendar day", () => {
  const shown = formatAppDate("2026-08-25T22:11:47.629", "tr");
  assert.match(shown, /26\.08\.2026/);
});

test("relative time vs a few minutes later is minutes, not hours", () => {
  const now = new Date("2026-08-25T22:16:00.000Z");
  const ago = formatTimeAgo("2026-08-25T22:11:47.629", t, now, "tr");
  assert.equal(ago, "4m ago");
});
