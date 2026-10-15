import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatCallWhen } from "./callHistoryCache.js";

function opts(now, extra = {}) {
  return {
    locale: "tr-TR",
    todayLabel: "Bugün",
    yesterdayLabel: "Dün",
    now,
    ...extra,
  };
}

function deviceClock(date, locale = "tr-TR") {
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value || "";
  const minute = parts.find((p) => p.type === "minute")?.value || "";
  return `${(hour === "24" ? "00" : hour).padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

test("today, yesterday, and older calls use 24-hour local wall time", () => {
  const now = new Date(2026, 9, 15, 18, 0, 0);
  const today = new Date(2026, 9, 15, 16, 5, 0);
  assert.equal(formatCallWhen(today.toISOString(), opts(now)), "Bugün 16:05");
  const yesterday = new Date(2026, 9, 14, 9, 12, 0);
  assert.equal(formatCallWhen(yesterday.toISOString(), opts(now)), "Dün 09:12");
  const older = new Date(2026, 9, 12, 16, 5, 0);
  assert.equal(formatCallWhen(older.toISOString(), opts(now)), "12 Eki 16:05");
});

test("english locale keeps the same 24-hour clock with a local month", () => {
  const now = new Date(2026, 9, 15, 18, 0, 0);
  const older = new Date(2026, 9, 12, 16, 5, 0);
  assert.equal(
    formatCallWhen(older.toISOString(), opts(now, {
      locale: "en",
      todayLabel: "Today",
      yesterdayLabel: "Yesterday",
    })),
    "12 Oct 16:05"
  );
});

test("clock follows the device zone, not a fixed zone", () => {
  const iso = "2026-10-15T13:05:00.000Z";
  const when = new Date(iso);
  const label = formatCallWhen(iso, opts(when));
  assert.equal(label, `Bugün ${deviceClock(when)}`);

  const istanbul = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(when);
  const ih = (istanbul.find((p) => p.type === "hour")?.value || "").padStart(2, "0");
  const im = (istanbul.find((p) => p.type === "minute")?.value || "").padStart(2, "0");
  if (deviceClock(when) !== `${ih}:${im}`) {
    assert.equal(label.includes(`${ih}:${im}`), false);
  }
});

test("naive UTC timestamps match an explicit Z instant", () => {
  const z = "2026-10-15T13:05:00.000Z";
  const now = new Date(z);
  assert.equal(formatCallWhen("2026-10-15T13:05:00", opts(now)), formatCallWhen(z, opts(now)));
});

test("empty and invalid values stay blank", () => {
  assert.equal(formatCallWhen("", opts(new Date())), "");
  assert.equal(formatCallWhen("not-a-date", opts(new Date())), "");
});

test("formatter source does not pin a time zone", () => {
  const src = readFileSync(new URL("./callHistoryCache.js", import.meta.url), "utf8");
  assert.equal(/timeZone\s*:/.test(src), false);
  assert.equal(src.includes("Europe/Istanbul"), false);
  assert.equal(src.includes("hour12: false"), true);
  assert.equal(src.includes('hourCycle: "h23"'), true);
});
